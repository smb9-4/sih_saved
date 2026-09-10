/**
 * gameRepository.js
 * Offline-first repository interface backed by local SQLite database.
 * Preserves seamless backward compatibility with existing components.
 */

import gameSessionRepository from '../database/repositories/GameSessionRepository';
import patientRepository from '../database/repositories/PatientRepository';
import progressService from './ProgressService';

const KEY_METRICS = 'memoryCareOfflineMetrics';
const KEY_CAREGIVER_MAX = 'memoryCareCaregiverMaxDifficulty';
const APP_VERSION = '1.0.0-adaptive';

function getActivePatientId() {
  if (typeof localStorage !== 'undefined') {
    try {
      const p = JSON.parse(localStorage.getItem('patientData') || '{}');
      return p.patient_id || p.id || 'active_patient';
    } catch {
      return 'active_patient';
    }
  }
  return 'active_patient';
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('gameRepository: error writing to local storage', err);
  }
}

export const gameRepository = {
  /**
   * Persists a gameplay session with all required offline metrics to SQLite
   * and enqueues it for idempotent backend sync.
   */
  async saveGameSession(sessionData) {
    const patientId = sessionData.patient_id || getActivePatientId();
    const dataWithPatient = {
      ...sessionData,
      patient_id: patientId,
      app_version: sessionData.app_version || APP_VERSION,
    };

    // 1. Save to SQLite + sync queue via ProgressService
    let record;
    try {
      record = await progressService.recordGameSession(dataWithPatient);
    } catch (err) {
      console.warn('[gameRepository] SQLite save failed, falling back to repository direct:', err);
      record = await gameSessionRepository.insertSession(dataWithPatient);
    }

    // 2. Also update localStorage cache for fast synchronous legacy reads
    try {
      const records = readJson(KEY_METRICS, []);
      records.push(record);
      writeJson(KEY_METRICS, records);
    } catch (_) {}

    return record;
  },

  /**
   * Retrieves all session records for a given game type and/or patient.
   */
  async listSessions(filter = {}) {
    const patientId = filter.patient_id || getActivePatientId();
    try {
      const rows = await gameSessionRepository.listSessions({
        ...filter,
        patient_id: patientId,
      });
      if (rows && rows.length > 0) return rows;
    } catch (err) {
      console.warn('[gameRepository] SQLite list error:', err);
    }

    // Fallback to localStorage if SQLite is empty / initializing
    const records = readJson(KEY_METRICS, []);
    return records.filter((r) => {
      if (filter.game_type && r.game_type !== filter.game_type) return false;
      if (filter.patient_id && r.patient_id !== filter.patient_id) return false;
      return true;
    });
  },

  /**
   * Retrieves the latest N sessions for a given game type.
   */
  async getRecentSessions(gameType, limit = 10) {
    const patientId = getActivePatientId();
    try {
      const rows = await gameSessionRepository.getRecentSessions(patientId, gameType, limit);
      if (rows && rows.length > 0) return rows;
    } catch (err) {
      console.warn('[gameRepository] SQLite getRecentSessions error:', err);
    }

    const records = await this.listSessions({ game_type: gameType });
    return records.slice(-limit);
  },

  /**
   * Counts the number of completed sessions for a given game type.
   */
  async countCompletedSessions(gameType) {
    const patientId = getActivePatientId();
    try {
      return await gameSessionRepository.countCompletedSessions(patientId, gameType);
    } catch (err) {
      console.warn('[gameRepository] SQLite countCompletedSessions error:', err);
    }

    const records = await this.listSessions({ game_type: gameType });
    return records.filter((r) => r.completion_rate >= 0.5).length;
  },

  /**
   * Gets caregiver maximum difficulty setting.
   */
  async getCaregiverMaxDifficulty(gameType) {
    const config = readJson(KEY_CAREGIVER_MAX, {});
    return config[gameType] != null ? Number(config[gameType]) : 4;
  },

  /**
   * Sets caregiver maximum difficulty setting.
   */
  async setCaregiverMaxDifficulty(gameType, maxLevel) {
    const config = readJson(KEY_CAREGIVER_MAX, {});
    config[gameType] = Math.max(1, Math.min(4, Number(maxLevel) || 4));
    writeJson(KEY_CAREGIVER_MAX, config);

    // Also update patient record in SQLite if exists
    try {
      const patientId = getActivePatientId();
      await patientRepository.updateCaregiverMaxDifficulty(patientId, config[gameType]);
    } catch (_) {}

    return config[gameType];
  },

  /**
   * Gets all caregiver maximum difficulty settings.
   */
  async getAllCaregiverMaxDifficulties() {
    return readJson(KEY_CAREGIVER_MAX, {
      pattern_matching: 4,
      shape_sort: 4,
      face_name_recall: 4,
      remember_my_story: 4,
    });
  },
};

export default gameRepository;
