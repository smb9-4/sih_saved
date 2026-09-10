/**
 * sync.js
 * Types, constants, and retry schedules for offline-first synchronization.
 */

export const ENTITY_TYPES = {
  GAME_SESSION: 'game_session',
  DIFFICULTY_STATS: 'difficulty_stats',
  PATIENT: 'patient',
};

export const SYNC_STATUS = {
  OFFLINE: 'offline',
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  FAILED: 'failed',
};

export const SYNC_OPERATIONS = {
  UPSERT: 'upsert',
  DELETE: 'delete',
};

/**
 * Exponential backoff schedule as specified:
 * Attempt 1 -> immediately (0s)
 * Attempt 2 -> after 5 seconds
 * Attempt 3 -> after 30 seconds
 * Attempt 4 -> after 2 minutes (120s)
 * Attempt 5 -> after 10 minutes (600s)
 */
export const RETRY_DELAYS_MS = [
  0,          // 1st retry: 0s (immediate)
  5 * 1000,   // 2nd retry: 5s
  30 * 1000,  // 3rd retry: 30s
  120 * 1000, // 4th retry: 2m
  600 * 1000, // 5th retry: 10m
];

export function getNextRetryDelayMs(attemptNumber) {
  const index = Math.max(0, Math.min(attemptNumber, RETRY_DELAYS_MS.length - 1));
  return RETRY_DELAYS_MS[index];
}

/**
 * Standard game type identifiers:
 * FIND_MATCH (pattern_matching)
 * SHAPE_SORT (shape_sort)
 * FACE_NAME (face_name_recall)
 * REMEMBER_MY_STORY (remember_my_story)
 */
export const GAME_TYPE_ALIASES = {
  FIND_MATCH: 'pattern_matching',
  SHAPE_SORT: 'shape_sort',
  FACE_NAME: 'face_name_recall',
  REMEMBER_MY_STORY: 'remember_my_story',
  pattern_matching: 'FIND_MATCH',
  shape_sort: 'SHAPE_SORT',
  face_name_recall: 'FACE_NAME',
  remember_my_story: 'REMEMBER_MY_STORY',
};
