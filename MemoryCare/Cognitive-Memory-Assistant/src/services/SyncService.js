/**
 * SyncService.js
 * Offline-first synchronization engine for MemoryCare.
 * Orchestrates local SQLite, sync_queue, network detection, and backend push/pull.
 */

import { dbQuery, dbRun } from '../database/db';
import { runMigrations } from '../database/migrations';
import gameSessionRepository from '../database/repositories/GameSessionRepository';
import difficultyStatsRepository from '../database/repositories/DifficultyStatsRepository';
import patientRepository from '../database/repositories/PatientRepository';
import syncQueueRepository from '../database/repositories/SyncQueueRepository';
import networkService from './NetworkService';
import { ENTITY_TYPES, SYNC_STATUS, getNextRetryDelayMs } from '../types/sync';
import { v4 as uuidv4 } from '../utils/uuid';

class SyncService {
  constructor() {
    this._isSyncing = false;
    this._lastSyncTime = null;
    this._lastError = null;
    this._listeners = new Set();
    this._initialized = false;
    this._timer = null;
    this._deviceId = null;
  }

  async initialize() {
    if (this._initialized) return;
    this._initialized = true;

    // Run database migrations first
    try {
      await runMigrations();
    } catch (err) {
      console.error('[SyncService] DB migration error during init:', err);
    }

    // Initialize network service & setup auto-sync on reconnect
    await networkService.initialize();
    this._deviceId = await this._getOrCreateDeviceId();

    networkService.addListener(({ isOnline }) => {
      if (isOnline) {
        console.log('[SyncService] Network restored. Triggering automatic background sync.');
        this.syncNow().catch((err) => {
          console.warn('[SyncService] Background sync after reconnect failed:', err.message);
        });
      } else {
        this._notifyStatus();
      }
    });

    // Schedule periodic retry check for failed or pending records
    this._timer = setInterval(() => {
      if (networkService.isOnline && !this._isSyncing) {
        syncQueueRepository.countPending().then((count) => {
          if (count > 0) {
            this.syncPendingRecords().catch(() => {});
          }
        });
      }
    }, 15000);

    // Initial sync if online
    if (networkService.isOnline) {
      setTimeout(() => this.syncNow().catch(() => {}), 1500);
    }
  }

  onStatusChange(callback) {
    this._listeners.add(callback);
    callback(this.getSyncStatusSync());
    return () => this._listeners.delete(callback);
  }

  getSyncStatusSync() {
    const isOnline = networkService.isOnline;
    return {
      isOnline,
      isSyncing: this._isSyncing,
      lastSyncTime: this._lastSyncTime,
      lastError: this._lastError,
      status: this._deriveStatus(isOnline, this._isSyncing, this._lastError, 0, 0),
    };
  }

  async getSyncStatus() {
    const isOnline = networkService.isOnline;
    const pendingCount = await syncQueueRepository.countPending();
    const failedCount = await syncQueueRepository.countFailed();

    return {
      isOnline,
      isSyncing: this._isSyncing,
      lastSyncTime: this._lastSyncTime,
      lastError: this._lastError,
      pendingCount,
      failedCount,
      status: this._deriveStatus(isOnline, this._isSyncing, this._lastError, pendingCount, failedCount),
    };
  }

  _deriveStatus(isOnline, isSyncing, lastError, pending, failed) {
    if (isSyncing) return SYNC_STATUS.SYNCING;
    if (!isOnline) return SYNC_STATUS.OFFLINE;
    if (failed > 0) return SYNC_STATUS.FAILED;
    if (pending > 0) return SYNC_STATUS.PENDING;
    return SYNC_STATUS.SYNCED;
  }

  _notifyStatus() {
    this.getSyncStatus().then((status) => {
      for (const listener of this._listeners) {
        try {
          listener(status);
        } catch (err) {
          console.error('[SyncService] Listener error:', err);
        }
      }
    });
  }

  async _getOrCreateDeviceId() {
    const rows = await dbQuery("SELECT value FROM sync_metadata WHERE key = 'device_id'");
    if (rows && rows.length > 0 && rows[0].value) {
      return rows[0].value;
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    await dbRun("INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('device_id', ?, ?)", [id, now]);
    return id;
  }

  async _getCursor() {
    const rows = await dbQuery("SELECT value FROM sync_metadata WHERE key = 'last_pull_cursor'");
    return rows && rows.length > 0 ? rows[0].value : null;
  }

  async _setCursor(cursor) {
    if (!cursor) return;
    const now = new Date().toISOString();
    await dbRun("INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('last_pull_cursor', ?, ?)", [cursor, now]);
  }

  _getAuthHeader() {
    const token = (typeof localStorage !== 'undefined' && localStorage.getItem('viewerToken')) || 'anonymous-device-token';
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Main sync workflow:
   * 1. Check network connectivity & health
   * 2. Pull authorized server changes
   * 3. Apply safe server changes to SQLite
   * 4. Read local pending sync records
   * 5. Push records in batches
   * 6. Mark successful records as synced
   * 7. Pull again after pushing
   * 8. Update sync metadata
   */
  async syncNow() {
    if (this._isSyncing) {
      return { success: false, message: 'Sync already in progress' };
    }

    if (!networkService.isOnline) {
      return { success: false, message: 'Device is offline' };
    }

    this._isSyncing = true;
    this._lastError = null;
    this._notifyStatus();

    try {
      // 1. Connectivity / reachability check
      const healthy = await networkService.checkBackendHealth();
      if (!healthy) {
        throw new Error('Backend health probe failed (no connection to server)');
      }

      // 2 & 3. Pull server changes & apply
      await this.pullServerChanges();

      // 4, 5, 6. Push local pending records
      await this.pushPendingRecords();

      // 7. Pull again after pushing to obtain final versions
      await this.pullServerChanges();

      // 8. Update sync metadata
      const now = new Date().toISOString();
      this._lastSyncTime = now;
      await dbRun("INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('last_sync_time', ?, ?)", [now, now]);

      this._lastError = null;
      return { success: true, timestamp: now };
    } catch (err) {
      console.warn('[SyncService] Sync failed:', err.message);
      this._lastError = err.message || 'Sync failed';
      return { success: false, error: this._lastError };
    } finally {
      this._isSyncing = false;
      this._notifyStatus();
    }
  }

  async syncPendingRecords() {
    return await this.syncNow();
  }

  /**
   * Pull changes from the backend API.
   * Endpoint: GET /api/v1/sync/pull?cursor=<cursor>
   */
  async pullServerChanges() {
    const cursor = await this._getCursor();
    const url = cursor ? `/api/v1/sync/pull?cursor=${encodeURIComponent(cursor)}` : '/api/v1/sync/pull';

    const res = await fetch(url, {
      method: 'GET',
      headers: this._getAuthHeader(),
    });

    if (!res.ok) {
      throw new Error(`Pull failed with HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data) return;

    // Apply patient changes
    if (Array.isArray(data.patients)) {
      for (const p of data.patients) {
        await patientRepository.applyServerPatient(p);
      }
    }

    // Apply difficulty_stats changes
    if (Array.isArray(data.difficulty_stats)) {
      for (const stat of data.difficulty_stats) {
        await difficultyStatsRepository.mergeServerStat(stat);
      }
    }

    // Apply game_sessions (if any received from authorized family sync)
    if (Array.isArray(data.game_sessions)) {
      for (const s of data.game_sessions) {
        const existing = await gameSessionRepository.getSessionById(s.id);
        if (!existing) {
          await gameSessionRepository.insertSession({
            ...s,
            sync_status: 'synced',
          });
        }
      }
    }

    if (data.next_cursor) {
      await this._setCursor(data.next_cursor);
    }
  }

  /**
   * Pushes pending sync_queue records to the backend in batches.
   * Uses client-generated UUID as idempotency key.
   */
  async pushPendingRecords() {
    const batch = await syncQueueRepository.getPendingBatch(25);
    if (batch.length === 0) return;

    const cursor = await this._getCursor();
    const records = batch.map((item) => {
      let payload = {};
      try {
        payload = JSON.parse(item.payload_json);
      } catch {
        payload = item.payload_json;
      }

      return {
        queue_id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        operation: item.operation,
        client_updated_at: item.updated_at,
        server_version: payload.server_version || 0,
        data: payload,
      };
    });

    const pushPayload = {
      device_id: this._deviceId,
      last_pull_cursor: cursor,
      records: records.map(({ queue_id, ...r }) => r),
    };

    let responseJson = null;
    try {
      const res = await fetch('/api/v1/sync/push', {
        method: 'POST',
        headers: this._getAuthHeader(),
        body: JSON.stringify(pushPayload),
      });

      if (!res.ok) {
        throw new Error(`Push failed with HTTP ${res.status}: ${res.statusText}`);
      }

      responseJson = await res.json();
    } catch (err) {
      // Record failure for all items in batch with exponential backoff
      for (const item of batch) {
        const attempts = (Number(item.attempts) || 0) + 1;
        const delayMs = getNextRetryDelayMs(attempts);
        const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

        await syncQueueRepository.markFailed(item.id, attempts, nextRetryAt, err.message);

        if (item.entity_type === ENTITY_TYPES.GAME_SESSION) {
          await gameSessionRepository.recordSyncFailure(item.entity_id, err.message);
        }
      }
      throw err;
    }

    // Process accepted records
    const acceptedList = responseJson.accepted || [];
    for (const acc of acceptedList) {
      const queueItem = batch.find(
        (b) => b.entity_type === acc.entity_type && b.entity_id === acc.entity_id
      );

      if (queueItem) {
        await syncQueueRepository.markSuccess(queueItem.id);
      }

      if (acc.entity_type === ENTITY_TYPES.GAME_SESSION) {
        await gameSessionRepository.markSynced(acc.entity_id, acc.server_version || 1);
      } else if (acc.entity_type === ENTITY_TYPES.PATIENT) {
        await patientRepository.markSynced(acc.entity_id, acc.server_version || 1);
      } else if (acc.entity_type === ENTITY_TYPES.DIFFICULTY_STATS) {
        // e.g. entity_id: "patient_id:game_type:level"
        const parts = acc.entity_id.split(':');
        if (parts.length === 3) {
          await difficultyStatsRepository.markSynced(parts[0], parts[1], parts[2], acc.server_version || 1);
        }
      }
    }

    // Process failed records if server rejected specific items
    const failedList = responseJson.failed || [];
    for (const fail of failedList) {
      const queueItem = batch.find(
        (b) => b.entity_type === fail.entity_type && b.entity_id === fail.entity_id
      );
      if (queueItem) {
        const attempts = (Number(queueItem.attempts) || 0) + 1;
        const delayMs = getNextRetryDelayMs(attempts);
        const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
        await syncQueueRepository.markFailed(queueItem.id, attempts, nextRetryAt, fail.error || 'Rejected by server');
      }
    }

    if (responseJson.next_cursor) {
      await this._setCursor(responseJson.next_cursor);
    }
  }

  /**
   * Caregiver action: Reset failed records and retry immediately.
   */
  async retryFailedRecords() {
    await syncQueueRepository.resetFailedToPending();
    return await this.syncNow();
  }
}

export const syncService = new SyncService();
export default syncService;
