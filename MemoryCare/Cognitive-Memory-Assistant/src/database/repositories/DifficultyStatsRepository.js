/**
 * DifficultyStatsRepository.js
 * SQLite repository for difficulty_stats table.
 * Tracks per-patient, per-game difficulty performance metrics offline.
 */

import { dbQuery, dbRun } from '../db';

export class DifficultyStatsRepository {
  async recordAttempt(patientId, gameType, difficultyLevel, reward = 0) {
    const level = Number(difficultyLevel) || 1;
    const now = new Date().toISOString();

    const existing = await this.getStat(patientId, gameType, level);

    if (existing) {
      const attempts = (Number(existing.attempts) || 0) + 1;
      const totalReward = (Number(existing.total_reward) || 0) + (Number(reward) || 0);

      await dbRun(
        `UPDATE difficulty_stats 
         SET attempts = ?, total_reward = ?, updated_at = ?, sync_status = 'pending'
         WHERE patient_id = ? AND game_type = ? AND difficulty_level = ?`,
        [attempts, totalReward, now, patientId, gameType, level]
      );

      return {
        patient_id: patientId,
        game_type: gameType,
        difficulty_level: level,
        attempts,
        total_reward: totalReward,
        updated_at: now,
        server_version: existing.server_version || 0,
        sync_status: 'pending'
      };
    } else {
      const attempts = 1;
      const totalReward = Number(reward) || 0;

      await dbRun(
        `INSERT INTO difficulty_stats (
           patient_id, game_type, difficulty_level, attempts, total_reward, updated_at, server_version, sync_status
         ) VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')`,
        [patientId, gameType, level, attempts, totalReward, now]
      );

      return {
        patient_id: patientId,
        game_type: gameType,
        difficulty_level: level,
        attempts,
        total_reward: totalReward,
        updated_at: now,
        server_version: 0,
        sync_status: 'pending'
      };
    }
  }

  async getStat(patientId, gameType, level) {
    const rows = await dbQuery(
      `SELECT * FROM difficulty_stats 
       WHERE patient_id = ? AND game_type = ? AND difficulty_level = ?`,
      [patientId, gameType, Number(level)]
    );
    return rows && rows.length > 0 ? rows[0] : null;
  }

  async getAllStatsForGame(patientId, gameType) {
    return await dbQuery(
      `SELECT * FROM difficulty_stats 
       WHERE patient_id = ? AND game_type = ? ORDER BY difficulty_level ASC`,
      [patientId, gameType]
    );
  }

  async getAllStatsForPatient(patientId) {
    return await dbQuery(
      `SELECT * FROM difficulty_stats WHERE patient_id = ? ORDER BY game_type, difficulty_level ASC`,
      [patientId]
    );
  }

  async markSynced(patientId, gameType, level, serverVersion = 1) {
    const now = new Date().toISOString();
    return await dbRun(
      `UPDATE difficulty_stats 
       SET sync_status = 'synced', server_version = ?, updated_at = ?
       WHERE patient_id = ? AND game_type = ? AND difficulty_level = ?`,
      [serverVersion, now, patientId, gameType, Number(level)]
    );
  }

  async mergeServerStat(serverStat) {
    const now = new Date().toISOString();
    const existing = await this.getStat(serverStat.patient_id, serverStat.game_type, serverStat.difficulty_level);

    if (existing) {
      // Safe merge: take max counters so retries never regress, and avoid double counting
      const mergedAttempts = Math.max(Number(existing.attempts) || 0, Number(serverStat.attempts) || 0);
      const mergedReward = Math.max(Number(existing.total_reward) || 0, Number(serverStat.total_reward) || 0);
      const serverVersion = Math.max(Number(existing.server_version) || 0, Number(serverStat.server_version) || 1);

      await dbRun(
        `UPDATE difficulty_stats 
         SET attempts = ?, total_reward = ?, server_version = ?, sync_status = 'synced', updated_at = ?
         WHERE patient_id = ? AND game_type = ? AND difficulty_level = ?`,
        [mergedAttempts, mergedReward, serverVersion, now, serverStat.patient_id, serverStat.game_type, serverStat.difficulty_level]
      );
    } else {
      await dbRun(
        `INSERT INTO difficulty_stats (
           patient_id, game_type, difficulty_level, attempts, total_reward, updated_at, server_version, sync_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')`,
        [
          serverStat.patient_id,
          serverStat.game_type,
          serverStat.difficulty_level,
          Number(serverStat.attempts) || 0,
          Number(serverStat.total_reward) || 0,
          serverStat.updated_at || now,
          Number(serverStat.server_version) || 1
        ]
      );
    }
  }
}

export const difficultyStatsRepository = new DifficultyStatsRepository();
export default difficultyStatsRepository;
