/**
 * GameSessionRepository.js
 * SQLite repository for game_sessions table.
 * Source of truth for all patient gameplay metrics offline.
 */

import { dbQuery, dbRun } from '../db';
import { v4 as uuidv4 } from '../../utils/uuid';

export class GameSessionRepository {
  /**
   * Inserts a new game session locally with all required metrics.
   * Client generates a UUID to ensure idempotency.
   */
  async insertSession(session) {
    const id = session.id || uuidv4();
    const now = new Date().toISOString();

    const sql = `
      INSERT OR REPLACE INTO game_sessions (
        id, patient_id, game_type, difficulty_before, difficulty_after,
        accuracy, completion_rate, wrong_answer_rate, average_response_time,
        retry_count, recent_performance_trend, model_action, model_confidence,
        decision_reason, patient_message, passed, extra_json,
        created_at, updated_at, server_version, sync_status, sync_attempts, last_sync_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      id,
      session.patient_id || 'active_patient',
      session.game_type,
      Number(session.difficulty_before) || 1,
      Number(session.difficulty_after) || 1,
      Number(session.accuracy) || 0.0,
      Number(session.completion_rate) != null ? Number(session.completion_rate) : 1.0,
      Number(session.wrong_answer_rate) || 0.0,
      Number(session.average_response_time) || 0.0,
      Number(session.retry_count) || 0,
      Number(session.recent_performance_trend) || 0.0,
      session.model_action || 'KEEP_DIFFICULTY',
      Number(session.model_confidence) || 1.0,
      session.decision_reason || '',
      session.patient_message || '',
      session.passed ? 1 : 0,
      session.extra ? (typeof session.extra === 'string' ? session.extra : JSON.stringify(session.extra)) : null,
      session.created_at || session.timestamp || now,
      now,
      session.server_version || 0,
      session.sync_status || 'pending',
      session.sync_attempts || 0,
      session.last_sync_error || null
    ];

    await dbRun(sql, values);

    return {
      ...session,
      id,
      created_at: session.created_at || now,
      updated_at: now,
      sync_status: session.sync_status || 'pending',
      server_version: session.server_version || 0
    };
  }

  async getSessionById(id) {
    const rows = await dbQuery('SELECT * FROM game_sessions WHERE id = ?', [id]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  async listSessions(filter = {}) {
    let sql = 'SELECT * FROM game_sessions WHERE 1=1';
    const values = [];

    if (filter.patient_id) {
      sql += ' AND patient_id = ?';
      values.push(filter.patient_id);
    }
    if (filter.game_type) {
      sql += ' AND game_type = ?';
      values.push(filter.game_type);
    }
    if (filter.sync_status) {
      sql += ' AND sync_status = ?';
      values.push(filter.sync_status);
    }

    sql += ' ORDER BY created_at DESC';

    if (filter.limit) {
      sql += ' LIMIT ?';
      values.push(Number(filter.limit));
    }

    return await dbQuery(sql, values);
  }

  async getRecentSessions(patientId, gameType, limit = 10) {
    return await this.listSessions({
      patient_id: patientId,
      game_type: gameType,
      limit
    });
  }

  async countCompletedSessions(patientId, gameType) {
    let sql = 'SELECT COUNT(*) as count FROM game_sessions WHERE completion_rate >= 0.5';
    const values = [];

    if (patientId) {
      sql += ' AND patient_id = ?';
      values.push(patientId);
    }
    if (gameType) {
      sql += ' AND game_type = ?';
      values.push(gameType);
    }

    const rows = await dbQuery(sql, values);
    return rows && rows.length > 0 ? Number(rows[0].count) : 0;
  }

  async markSynced(id, serverVersion = 1) {
    const now = new Date().toISOString();
    return await dbRun(
      `UPDATE game_sessions 
       SET sync_status = 'synced', server_version = ?, updated_at = ?, last_sync_error = NULL 
       WHERE id = ?`,
      [serverVersion, now, id]
    );
  }

  async recordSyncFailure(id, errorMessage) {
    const now = new Date().toISOString();
    return await dbRun(
      `UPDATE game_sessions 
       SET sync_status = 'failed', sync_attempts = sync_attempts + 1, last_sync_error = ?, updated_at = ?
       WHERE id = ?`,
      [errorMessage, now, id]
    );
  }
}

export const gameSessionRepository = new GameSessionRepository();
export default gameSessionRepository;
