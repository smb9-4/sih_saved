/**
 * gameRepository.js
 * Offline-first repository interface for persisting all 15 game session metrics
 * and caregiver adaptive settings.
 * 
 * Supports clean abstraction so SQLite / Room database can be swapped in seamlessly later.
 */

const KEY_METRICS = 'memoryCareOfflineMetrics';
const KEY_CAREGIVER_MAX = 'memoryCareCaregiverMaxDifficulty';
const APP_VERSION = '1.0.0-adaptive';

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => {},
  };
}

function readJson(key, fallback) {
  try {
    const raw = getStorage().getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    getStorage().setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('gameRepository: error writing to local storage', err);
  }
}

function generateId() {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const gameRepository = {
  /**
   * Persists a gameplay session with all 15 required offline metrics.
   */
  async saveGameSession(sessionData) {
    const records = readJson(KEY_METRICS, []);

    const record = {
      id: generateId(),
      patient_id: sessionData.patient_id || 'default_patient',
      game_type: sessionData.game_type || 'pattern_matching',
      difficulty_before: Number(sessionData.difficulty_before) || 1,
      difficulty_after: Number(sessionData.difficulty_after) || 1,
      accuracy: Number(sessionData.accuracy) || 0.0,
      average_response_time: Number(sessionData.average_response_time) || 0.0,
      completion_rate: Number(sessionData.completion_rate) != null ? Number(sessionData.completion_rate) : 1.0,
      wrong_answer_rate: Number(sessionData.wrong_answer_rate) || 0.0,
      retry_count: Number(sessionData.retry_count) || 0,
      recent_performance_trend: Number(sessionData.recent_performance_trend) || 0.0,
      model_action: sessionData.model_action || 'KEEP_DIFFICULTY',
      model_confidence: Number(sessionData.model_confidence) || 1.0,
      decision_reason: sessionData.decision_reason || '',
      patient_message: sessionData.patient_message || '',
      timestamp: sessionData.timestamp || new Date().toISOString(),
      app_version: sessionData.app_version || APP_VERSION,
      sync_status: sessionData.sync_status || 'offline_saved',
      extra: sessionData.extra || null,
    };

    records.push(record);
    writeJson(KEY_METRICS, records);
    return record;
  },

  /**
   * Retrieves all session records for a given game type and/or patient.
   */
  async listSessions(filter = {}) {
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
    const records = await this.listSessions({ game_type: gameType });
    return records.slice(-limit);
  },

  /**
   * Counts the number of completed sessions for a given game type.
   */
  async countCompletedSessions(gameType) {
    const records = await this.listSessions({ game_type: gameType });
    return records.filter((r) => r.completion_rate >= 0.5).length;
  },

  /**
   * Gets the caregiver-configured maximum difficulty for a game.
   */
  async getCaregiverMaxDifficulty(gameType) {
    const config = readJson(KEY_CAREGIVER_MAX, {});
    return config[gameType] != null ? Number(config[gameType]) : 4;
  },

  /**
   * Sets the caregiver-configured maximum difficulty for a game.
   */
  async setCaregiverMaxDifficulty(gameType, maxLevel) {
    const config = readJson(KEY_CAREGIVER_MAX, {});
    config[gameType] = Math.max(1, Math.min(4, Number(maxLevel) || 4));
    writeJson(KEY_CAREGIVER_MAX, config);
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
