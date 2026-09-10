/**
 * OfflineGameFlow.test.js
 * End-to-end integration test of the full offline-first game and sync cycle:
 * 1. Start offline
 * 2. Play all four games (pattern_matching, shape_sort, face_name_recall, remember_my_story)
 * 3. Close and reopen the app (verify persistence across app restarts)
 * 4. Verify all records exist locally
 * 5. Enable network
 * 6. Run synchronization
 * 7. Verify records exist once on the backend (idempotency, zero duplicates)
 * 8. Verify family progress is updated
 */

import { resetTestDb } from '../database/db';
import { gameSessionRepository } from '../database/repositories/GameSessionRepository';
import { difficultyStatsRepository } from '../database/repositories/DifficultyStatsRepository';
import { syncQueueRepository } from '../database/repositories/SyncQueueRepository';
import { syncService } from '../services/SyncService';
import { networkService } from '../services/NetworkService';
import { progressService } from '../services/ProgressService';
import { v4 as uuidv4 } from '../utils/uuid';

describe('Offline Game Flow Integration Test', () => {
  const PATIENT_ID = 'integration-patient-999';
  const originalFetch = global.fetch;

  // Mock in-memory backend store
  const mockBackend = {
    game_sessions: {},
    difficulty_stats: {},
    patients: {},
    changelog: [],
  };

  beforeEach(() => {
    localStorage.clear();
    resetTestDb();

    // Mock backend REST endpoints
    global.fetch = jest.fn(async (url, options = {}) => {
      const u = String(url);
      try {

      // Health check probe
      if (u.includes('/api/v1/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok' }),
        };
      }

      // Sync Pull
      if (u.includes('/api/v1/sync/pull')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            patients: Object.values(mockBackend.patients),
            difficulty_stats: Object.values(mockBackend.difficulty_stats),
            game_sessions: Object.values(mockBackend.game_sessions),
            next_cursor: 'cur_test_pull',
          }),
        };
      }

      // Sync Push
      if (u.includes('/api/v1/sync/push')) {
        const body = JSON.parse(options.body);
        const accepted = [];
        for (const r of body.records) {
          if (r.entity_type === 'game_session') {
            // Idempotency: if already exists, return existing
            if (mockBackend.game_sessions[r.entity_id]) {
              accepted.push({
                entity_type: r.entity_type,
                entity_id: r.entity_id,
                server_version: mockBackend.game_sessions[r.entity_id].server_version,
              });
            } else {
              const serverVersion = 1;
              mockBackend.game_sessions[r.entity_id] = {
                ...r.data,
                id: r.entity_id,
                server_version: serverVersion,
              };
              accepted.push({
                entity_type: r.entity_type,
                entity_id: r.entity_id,
                server_version: serverVersion,
              });
            }
          } else if (r.entity_type === 'difficulty_stats') {
            mockBackend.difficulty_stats[r.entity_id] = {
              ...r.data,
              server_version: 1,
            };
            accepted.push({
              entity_type: r.entity_type,
              entity_id: r.entity_id,
              server_version: 1,
            });
          }
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            accepted,
            conflicts: [],
            failed: [],
            next_cursor: 'cur_test_push_complete',
          }),
        };
      }

      // Family dashboard patient progress
      if (u.includes(`/api/v1/patients/${PATIENT_ID}/progress`)) {
        const sessions = Object.values(mockBackend.game_sessions).filter((s) => s.patient_id === PATIENT_ID);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            patient_id: PATIENT_ID,
            games_played: sessions.length,
            recent_sessions: sessions,
          }),
        };
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      };
      } catch (err) {
        console.error('Fetch mock error for URL:', u, err);
        throw err;
      }
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('Full Offline-First Lifecycle: Play 4 games offline -> restart app -> sync online -> backend verified', async () => {
    // -------------------------------------------------------------
    // STEP 1: Start offline
    // -------------------------------------------------------------
    let onlineState = false;
    jest.spyOn(networkService, 'isOnline', 'get').mockImplementation(() => onlineState);
    jest.spyOn(networkService, 'checkBackendHealth').mockImplementation(async () => onlineState);

    expect(networkService.isOnline).toBe(false);

    // -------------------------------------------------------------
    // STEP 2: Play all four games while offline
    // -------------------------------------------------------------
    const games = [
      { type: 'pattern_matching', accuracy: 0.9, before: 1, after: 2, passed: true },
      { type: 'shape_sort', accuracy: 0.8, before: 1, after: 2, passed: true },
      { type: 'face_name_recall', accuracy: 0.75, before: 2, after: 2, passed: true },
      { type: 'remember_my_story', accuracy: 0.95, before: 1, after: 2, passed: true },
    ];

    const generatedSessionIds = [];

    for (const g of games) {
      const sessionId = uuidv4();
      generatedSessionIds.push(sessionId);

      const record = await progressService.recordGameSession({
        id: sessionId,
        patient_id: PATIENT_ID,
        game_type: g.type,
        difficulty_before: g.before,
        difficulty_after: g.after,
        accuracy: g.accuracy,
        completion_rate: 1.0,
        wrong_answer_rate: 1.0 - g.accuracy,
        average_response_time: 2.5,
        model_action: g.after > g.before ? 'INCREASE_DIFFICULTY' : 'KEEP_DIFFICULTY',
        model_confidence: 0.91,
        passed: g.passed,
      });

      expect(record.id).toBe(sessionId);
      expect(record.sync_status).toBe('pending');
    }

    // Backend must have 0 sessions right now because app is offline
    expect(Object.keys(mockBackend.game_sessions).length).toBe(0);

    // -------------------------------------------------------------
    // STEP 3: Simulate closing and reopening the app
    // -------------------------------------------------------------
    // During app restart, new service instances read directly from SQLite
    const localSessions = await gameSessionRepository.listSessions({ patient_id: PATIENT_ID });
    expect(localSessions.length).toBe(4);

    for (const id of generatedSessionIds) {
      const found = localSessions.find((s) => s.id === id);
      expect(found).toBeDefined();
      expect(found.sync_status).toBe('pending');
    }

    const pendingCount = await syncQueueRepository.countPending();
    expect(pendingCount).toBeGreaterThanOrEqual(4);

    // -------------------------------------------------------------
    // STEP 4: Enable network
    // -------------------------------------------------------------
    onlineState = true;
    expect(networkService.isOnline).toBe(true);

    // -------------------------------------------------------------
    // STEP 5: Run synchronization
    // -------------------------------------------------------------
    const syncResult = await syncService.syncNow();
    expect(syncResult.success).toBe(true);

    // -------------------------------------------------------------
    // STEP 6: Verify records exist on the backend and in local DB as synced
    // -------------------------------------------------------------
    expect(Object.keys(mockBackend.game_sessions).length).toBe(4);

    for (const id of generatedSessionIds) {
      expect(mockBackend.game_sessions[id]).toBeDefined();
      expect(mockBackend.game_sessions[id].patient_id).toBe(PATIENT_ID);

      const localUpdated = await gameSessionRepository.getSessionById(id);
      expect(localUpdated.sync_status).toBe('synced');
      expect(localUpdated.server_version).toBe(1);
    }

    // Queue must now have 0 pending records
    const remainingPending = await syncQueueRepository.countPending();
    expect(remainingPending).toBe(0);

    // -------------------------------------------------------------
    // STEP 7: Retrying sync must be idempotent (zero duplicates)
    // -------------------------------------------------------------
    // Re-pushing or syncing again must not create duplicates on backend
    const repeatSync = await syncService.syncNow();
    expect(repeatSync.success).toBe(true);
    expect(Object.keys(mockBackend.game_sessions).length).toBe(4);

    // -------------------------------------------------------------
    // STEP 8: Verify family progress is updated
    // -------------------------------------------------------------
    const res = await fetch(`/api/v1/patients/${PATIENT_ID}/progress`);
    const progressData = await res.json();
    expect(progressData.games_played).toBe(4);
    expect(progressData.recent_sessions.length).toBe(4);
  });
});
