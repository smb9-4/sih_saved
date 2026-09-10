/**
 * ProgressService.js
 * Aggregates patient progress from the local SQLite database.
 * Executes the atomic offline game flow:
 * 1. Save game session to SQLite
 * 2. Update difficulty stats in SQLite
 * 3. Enqueue to sync_queue
 * 4. Trigger background sync if online (non-blocking)
 */

import { v4 as uuidv4 } from '../utils/uuid';
import gameSessionRepository from '../database/repositories/GameSessionRepository';
import difficultyStatsRepository from '../database/repositories/DifficultyStatsRepository';
import syncQueueRepository from '../database/repositories/SyncQueueRepository';
import syncService from './SyncService';
import networkService from './NetworkService';
import { ENTITY_TYPES, SYNC_OPERATIONS } from '../types/sync';

export class ProgressService {
  /**
   * Records a game session adhering strictly to the 8-step offline-first flow:
   * 1. Metrics & model already computed
   * 2. Transactionally save session + difficulty stats + sync queue
   * 3. Trigger sync only if online without blocking
   */
  async recordGameSession(sessionData) {
    const sessionId = sessionData.id || uuidv4();
    const patientId = sessionData.patient_id || 'active_patient';
    const now = new Date().toISOString();
    const gameType = sessionData.game_type;
    const playedLevel = Number(sessionData.difficulty_before) || 1;
    const nextLevel = Number(sessionData.difficulty_after) || playedLevel;
    const accuracy = Number(sessionData.accuracy) || 0;
    const passed = sessionData.passed || accuracy >= 0.6;
    const reward = passed ? 1.0 : (accuracy > 0.3 ? 0.5 : 0.0);

    const sessionRecord = {
      id: sessionId,
      patient_id: patientId,
      game_type: gameType,
      difficulty_before: playedLevel,
      difficulty_after: nextLevel,
      accuracy: accuracy,
      completion_rate: Number(sessionData.completion_rate) != null ? Number(sessionData.completion_rate) : (passed ? 1.0 : 0.5),
      wrong_answer_rate: Number(sessionData.wrong_answer_rate) || 0.0,
      average_response_time: Number(sessionData.average_response_time) || 0.0,
      retry_count: Number(sessionData.retry_count) || 0,
      recent_performance_trend: Number(sessionData.recent_performance_trend) || 0.0,
      model_action: sessionData.model_action || 'KEEP_DIFFICULTY',
      model_confidence: Number(sessionData.model_confidence) || 1.0,
      decision_reason: sessionData.decision_reason || '',
      patient_message: sessionData.patient_message || '',
      passed: passed ? 1 : 0,
      extra_json: sessionData.extra ? JSON.stringify(sessionData.extra) : null,
      created_at: sessionData.created_at || sessionData.timestamp || now,
      updated_at: now,
      server_version: 0,
      sync_status: 'pending',
      sync_attempts: 0,
      last_sync_error: null
    };

    // Step 4, 5, 6: Store session, difficulty stats, and sync queue
    // 1. Insert session
    await gameSessionRepository.insertSession(sessionRecord);

    // 2. Update difficulty stats
    await difficultyStatsRepository.recordAttempt(patientId, gameType, playedLevel, reward);

    // 3. Enqueue to sync queue
    await syncQueueRepository.enqueue(
      ENTITY_TYPES.GAME_SESSION,
      sessionId,
      SYNC_OPERATIONS.UPSERT,
      sessionRecord
    );

    // Also queue difficulty stats update
    const statsEntityId = `${patientId}:${gameType}:${playedLevel}`;
    const statItem = await difficultyStatsRepository.getStat(patientId, gameType, playedLevel);
    if (statItem) {
      await syncQueueRepository.enqueue(
        ENTITY_TYPES.DIFFICULTY_STATS,
        statsEntityId,
        SYNC_OPERATIONS.UPSERT,
        statItem
      );
    }

    // Step 8: Trigger synchronization asynchronously in background ONLY if online.
    // Never awaits or blocks gameplay.
    if (networkService.isOnline) {
      setTimeout(() => {
        syncService.syncNow().catch((err) => {
          console.warn('[ProgressService] Background sync post-game error (non-fatal):', err.message);
        });
      }, 200);
    }

    return sessionRecord;
  }

  /**
   * Retrieves overview analytics directly from local SQLite database.
   */
  async getPatientOverview(patientId) {
    const sessions = await gameSessionRepository.listSessions({ patient_id: patientId });
    const stats = await difficultyStatsRepository.getAllStatsForPatient(patientId);

    const gamesPlayed = sessions.length;
    const avgAccuracy = gamesPlayed
      ? sessions.reduce((sum, s) => sum + (Number(s.accuracy) || 0), 0) / gamesPlayed
      : 0;
    const avgResponseTime = gamesPlayed
      ? sessions.reduce((sum, s) => sum + (Number(s.average_response_time) || 0), 0) / gamesPlayed
      : 0;

    const lastSession = sessions.length > 0 ? sessions[0] : null;
    const lastActivityTime = lastSession ? lastSession.created_at : null;

    // Per-game stats
    const gameBreakdown = {};
    for (const s of sessions) {
      if (!gameBreakdown[s.game_type]) {
        gameBreakdown[s.game_type] = {
          game_type: s.game_type,
          sessionsCount: 0,
          passedCount: 0,
          avgAccuracy: 0,
          totalAccuracy: 0,
          lastLevel: 1,
        };
      }
      const b = gameBreakdown[s.game_type];
      b.sessionsCount += 1;
      if (s.passed) b.passedCount += 1;
      b.totalAccuracy += Number(s.accuracy) || 0;
      b.lastLevel = Math.max(b.lastLevel, Number(s.difficulty_after) || 1);
    }

    Object.values(gameBreakdown).forEach((b) => {
      b.avgAccuracy = b.sessionsCount > 0 ? b.totalAccuracy / b.sessionsCount : 0;
    });

    return {
      gamesPlayed,
      avgAccuracy,
      avgResponseTime,
      lastActivityTime,
      gameBreakdown,
      recentSessions: sessions.slice(0, 10),
      difficultyStats: stats,
    };
  }
}

export const progressService = new ProgressService();
export default progressService;
