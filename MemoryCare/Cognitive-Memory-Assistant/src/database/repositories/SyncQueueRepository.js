/**
 * SyncQueueRepository.js
 * SQLite repository for sync_queue table.
 * Queues local operations (game_session, difficulty_stats, patient) for atomic, idempotent sync to backend.
 */

import { dbQuery, dbRun } from '../db';
import { v4 as uuidv4 } from '../../utils/uuid';

export class SyncQueueRepository {
  async enqueue(entityType, entityId, operation, payload) {
    const now = new Date().toISOString();
    const payloadJson = typeof payload === 'string' ? payload : JSON.stringify(payload);

    const existing = await dbQuery(
      `SELECT id, attempts FROM sync_queue WHERE entity_type = ? AND entity_id = ? AND operation = ?`,
      [entityType, entityId, operation]
    );

    if (existing && existing.length > 0) {
      await dbRun(
        `UPDATE sync_queue SET 
          payload_json = ?,
          updated_at = ?,
          status = 'pending',
          next_retry_at = NULL,
          last_error = NULL
        WHERE id = ?`,
        [payloadJson, now, existing[0].id]
      );
      return existing[0].id;
    } else {
      const id = uuidv4();
      await dbRun(
        `INSERT INTO sync_queue (
          id, entity_type, entity_id, operation, payload_json,
          created_at, updated_at, attempts, next_retry_at, status, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, 'pending', NULL)`,
        [id, entityType, entityId, operation, payloadJson, now, now]
      );
      return id;
    }
  }

  async getPendingBatch(limit = 25) {
    const now = new Date().toISOString();
    const rows = await dbQuery(
      `SELECT * FROM sync_queue 
       WHERE status IN ('pending', 'failed') 
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY created_at ASC 
       LIMIT ?`,
      [now, limit]
    );
    return rows || [];
  }

  async markSuccess(id) {
    // Once pushed and acknowledged by server, remove from queue
    return await dbRun('DELETE FROM sync_queue WHERE id = ?', [id]);
  }

  async markFailed(id, attempts, nextRetryAt, errorMsg) {
    const now = new Date().toISOString();
    return await dbRun(
      `UPDATE sync_queue 
       SET status = 'failed', attempts = ?, next_retry_at = ?, last_error = ?, updated_at = ? 
       WHERE id = ?`,
      [attempts, nextRetryAt, errorMsg || 'Sync failed', now, id]
    );
  }

  async countPending() {
    const rows = await dbQuery("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'");
    return rows && rows.length > 0 ? Number(rows[0].count) : 0;
  }

  async countFailed() {
    const rows = await dbQuery("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'");
    return rows && rows.length > 0 ? Number(rows[0].count) : 0;
  }

  async resetFailedToPending() {
    const now = new Date().toISOString();
    return await dbRun(
      `UPDATE sync_queue 
       SET status = 'pending', next_retry_at = NULL, attempts = 0, updated_at = ? 
       WHERE status = 'failed'`,
      [now]
    );
  }

  async getAllQueueItems() {
    return await dbQuery('SELECT * FROM sync_queue ORDER BY created_at ASC');
  }

  async clearQueue() {
    return await dbRun('DELETE FROM sync_queue');
  }
}

export const syncQueueRepository = new SyncQueueRepository();
export default syncQueueRepository;
