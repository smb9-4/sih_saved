import { clampLevel, MAX_LEVEL, PASS_ACCURACY, evaluateAdaptiveML } from './adaptive';
import { gameRepository } from './gameRepository';

export const GAME_TYPES = {
  pattern_matching: 'pattern_matching',
  shape_sort: 'shape_sort',
  face_name_recall: 'face_name_recall',
  remember_my_story: 'remember_my_story',
};

const KEY_PROGRESS = 'memoryCareProgress';
const KEY_RESULTS = 'memoryCareResults';
const KEY_BREATHING = 'memoryCareBreathing';
const KEY_FAMILY = 'memoryCareFamily';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function listGameResults() {
  return Promise.resolve(read(KEY_RESULTS, []));
}

export function saveGameResult(record) {
  const results = read(KEY_RESULTS, []);
  results.push({
    ...record,
    id: cryptoRandomId(),
    timestamp: new Date().toISOString(),
  });
  write(KEY_RESULTS, results);
  return Promise.resolve();
}

export function saveBreathingSession({ cyclesCompleted, totalTimeSeconds }) {
  const sessions = read(KEY_BREATHING, []);
  sessions.push({
    id: cryptoRandomId(),
    activityType: 'breathing_exercise',
    cyclesCompleted,
    totalTimeSeconds,
    timestamp: new Date().toISOString(),
  });
  write(KEY_BREATHING, sessions);
  return Promise.resolve();
}

export function listBreathingSessions() {
  return Promise.resolve(read(KEY_BREATHING, []));
}

function cryptoRandomId() {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getProgressMap() {
  return read(KEY_PROGRESS, {});
}

export function getProgress(gameType) {
  const progress = getProgressMap()[gameType];
  return Promise.resolve(progress || null);
}

export function getPlayLevel(gameType) {
  const progress = getProgressMap()[gameType];
  if (!progress) return Promise.resolve(1);
  if (progress.manualLevelOverride != null) {
    return Promise.resolve(clampLevel(progress.manualLevelOverride));
  }
  return Promise.resolve(clampLevel(progress.currentLevel));
}

function ensureLevels(progress, fallbackLevel) {
  const levels = {};
  for (let n = 1; n <= MAX_LEVEL; n += 1) {
    const existing = progress && progress.levels && progress.levels[n];
    levels[n] = existing && typeof existing === 'object'
      ? { ...existing }
      : { unlocked: false, passed: false, best_accuracy: null };
  }
  const historical = progress ? clampLevel(progress.currentLevel) : clampLevel(fallbackLevel);
  for (let n = 1; n <= historical; n += 1) {
    levels[n].unlocked = true;
    if (n < historical) levels[n].passed = true;
  }
  levels[1].unlocked = true;
  return levels;
}

export function getLevelState(gameType) {
  const progress = getProgressMap()[gameType];
  const levels = ensureLevels(progress, 1);
  return Promise.resolve(
    Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((n) => levels[n])
  );
}

export async function applyAdaptiveAndSave(gameType, metrics) {
  const progressMap = getProgressMap();
  const before = progressMap[gameType] || null;

  const playedLevel = clampLevel(metrics.level);
  const accuracy = Number(metrics.accuracyPercent) || 0;
  const passed = accuracy >= PASS_ACCURACY;

  // Retrieve contextual session data for ML model and policy guardrails
  const pastSessions = await gameRepository.getRecentSessions(gameType, 10);
  const caregiverMax = await gameRepository.getCaregiverMaxDifficulty(gameType);
  const completedCount = await gameRepository.countCompletedSessions(gameType);

  // Evaluate ML prediction with safety policies
  const mlResult = await evaluateAdaptiveML({
    gameType,
    metrics,
    pastSessions,
    caregiverMaxDifficulty: caregiverMax,
    completedSessionsCount: completedCount,
    isAbandoned: Boolean(metrics.abandoned),
  });

  const levels = ensureLevels(before, playedLevel);
  const prev = levels[playedLevel] || { passed: false, best_accuracy: null };
  levels[playedLevel].unlocked = true;
  levels[playedLevel].passed = passed || Boolean(prev.passed);
  levels[playedLevel].best_accuracy = Math.max(
    Number(prev.best_accuracy) || 0,
    Math.min(100, Math.round(accuracy * 10) / 10)
  );

  const storedLevel = clampLevel(mlResult.nextPlayLevel);
  if (storedLevel > playedLevel && storedLevel <= MAX_LEVEL) {
    levels[storedLevel].unlocked = true;
  }

  write(KEY_PROGRESS, {
    ...progressMap,
    [gameType]: {
      currentLevel: storedLevel,
      manualLevelOverride: before && before.manualLevelOverride != null ? before.manualLevelOverride : null,
      levels,
    },
  });

  // Persist all 15 required metrics to the local offline repository
  await gameRepository.saveGameSession({
    patient_id: 'active_patient',
    game_type: gameType,
    difficulty_before: playedLevel,
    difficulty_after: storedLevel,
    accuracy: mlResult.features ? mlResult.features.accuracy : accuracy / 100.0,
    average_response_time: mlResult.features ? mlResult.features.average_response_time : (Number(metrics.avgResponseMs) || 0) / 30000.0,
    completion_rate: mlResult.features ? mlResult.features.completion_rate : (passed ? 1.0 : 0.5),
    wrong_answer_rate: mlResult.features ? mlResult.features.wrong_answer_rate : 0.0,
    retry_count: mlResult.features ? mlResult.features.retry_count : (Number(metrics.retries) || 0),
    recent_performance_trend: mlResult.features ? mlResult.features.recent_performance_trend : 0.0,
    model_action: mlResult.action,
    model_confidence: mlResult.confidence,
    decision_reason: mlResult.reason,
    patient_message: mlResult.patientMessage,
    timestamp: new Date().toISOString(),
    app_version: '1.0.0-adaptive',
    sync_status: 'offline_saved',
    extra: metrics.extra || null,
  });

  // Also maintain backward-compatible game results
  await saveGameResult({
    gameType,
    game: gameType,
    level: playedLevel,
    passed,
    attempts: metrics.attempts,
    mistakes: metrics.mistakes,
    accuracy_percent: String(metrics.accuracyPercent),
    avg_response_ms: metrics.avgResponseMs,
    total_time_seconds: metrics.totalTimeSeconds,
    extra: metrics.extra || null,
    model_action: mlResult.action,
    model_confidence: mlResult.confidence,
    decision_reason: mlResult.reason,
    patient_message: mlResult.patientMessage,
  });

  return {
    nextPlayLevel: storedLevel,
    passed,
    action: mlResult.action,
    confidence: mlResult.confidence,
    reason: mlResult.reason,
    patientMessage: mlResult.patientMessage,
  };
}


const DEMO_FAMILY = [
  { name: 'Meena', relationshipKey: 'daughter', hue: '#D85A30' },
  { name: 'Rajesh', relationshipKey: 'son', hue: '#C0432E' },
  { name: 'Lata', relationshipKey: 'sister', hue: '#8A4A32' },
  { name: 'Suresh', relationshipKey: 'neighbor', hue: '#3B3B3F' },
  { name: 'Anita', relationshipKey: 'nurse', hue: '#E28364' },
  { name: 'Priya', relationshipKey: 'granddaughter', hue: '#B85C38' },
  { name: 'Ravi', relationshipKey: 'grandson', hue: '#9C5A2C' },
  { name: 'Kamal', relationshipKey: 'doctor', hue: '#59595D' },
];

function placeholderPhoto(name, hue) {
  const letter = (name || '?').slice(0, 1).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="${hue}" width="400" height="400"/><text x="200" y="245" text-anchor="middle" font-size="180" fill="#FDF6EC" font-family="system-ui,sans-serif">${letter}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function seedFamilyIfEmpty() {
  const family = read(KEY_FAMILY, null);
  if (family && family.length > 0) return;
  const seeded = DEMO_FAMILY.map((person, index) => ({
    id: `demo-${index}`,
    name: person.name,
    relationshipKey: person.relationshipKey,
    photoDataUrl: placeholderPhoto(person.name, person.hue),
  }));
  write(KEY_FAMILY, seeded);
}

export function listFamilyMembers() {
  seedFamilyIfEmpty();
  return Promise.resolve(read(KEY_FAMILY, []));
}