/**
 * gameMetrics.js
 * Feature extraction, normalization, and validation for the Dementia Difficulty Predictor.
 * Total input tensor dimension: 11 float features
 */

export const GAME_TYPE_INDICES = {
  pattern_matching: 0,
  shape_sort: 1,
  face_name_recall: 2,
  remember_my_story: 3,
};

export const GAME_TYPE_KEYS = [
  'pattern_matching',
  'shape_sort',
  'face_name_recall',
  'remember_my_story',
];

export function calculatePerformanceTrend(currentAccuracy, pastSessions) {
  if (!pastSessions || pastSessions.length === 0) return 0.0;

  const recent = pastSessions.slice(-3);
  const pastAccuracies = recent.map((s) => {
    const v = s.accuracy != null ? Number(s.accuracy) : Number(s.accuracy_percent);
    return v > 1.0 ? v / 100.0 : Math.max(0.0, Math.min(1.0, v || 0));
  });

  const avgPast = pastAccuracies.reduce((a, b) => a + b, 0) / pastAccuracies.length;
  const delta = currentAccuracy - avgPast;
  return Math.max(-1.0, Math.min(1.0, Math.round(delta * 1000) / 1000));
}

export function extractGameFeatures(raw, pastSessions = [], maxLevel = 4) {
  const gameType = raw.gameType || 'pattern_matching';
  const rawLevel = Math.max(1, Math.min(maxLevel, Number(raw.level) || 1));

  let accuracy = 0.0;
  if (raw.accuracyPercent != null) {
    const acc = Number(raw.accuracyPercent);
    accuracy = acc > 1.0 ? acc / 100.0 : acc;
  } else if (raw.attempts && raw.attempts > 0) {
    const correct = Math.max(0, (raw.attempts || 0) - (raw.mistakes || 0));
    accuracy = correct / raw.attempts;
  }
  accuracy = Math.max(0.0, Math.min(1.0, accuracy || 0));

  const avgMs = Number(raw.avgResponseMs) || 0;
  const avgResponseTime = Math.max(0.0, Math.min(1.0, avgMs / 30000.0));

  let completionRate = 1.0;
  if (raw.abandoned) {
    completionRate = 0.0;
  } else if (raw.completed === false) {
    completionRate = 0.5;
  }
  if (raw.extra && raw.extra.targets && raw.extra.found != null) {
    completionRate = raw.extra.targets > 0 ? Math.min(1.0, raw.extra.found / raw.extra.targets) : 1.0;
  }
  completionRate = Math.max(0.0, Math.min(1.0, completionRate));

  const attempts = Math.max(0, Number(raw.attempts) || 0);
  const mistakes = Math.max(0, Number(raw.mistakes) || 0);
  let wrongAnswerRate = 0.0;
  if (attempts > 0) {
    wrongAnswerRate = Math.min(1.0, mistakes / attempts);
  } else if (mistakes > 0) {
    wrongAnswerRate = 1.0;
  }
  wrongAnswerRate = Math.max(0.0, Math.min(1.0, wrongAnswerRate));

  const denom = Math.max(1, maxLevel - 1);
  const currentDifficulty = Math.max(0.0, Math.min(1.0, (rawLevel - 1) / denom));

  const trend = calculatePerformanceTrend(accuracy, pastSessions);

  const retries = Math.max(0, Number(raw.retries) || 0);
  const retryCount = Math.max(0.0, Math.min(1.0, retries / 5.0));

  const gameIndex = GAME_TYPE_INDICES[gameType] != null ? GAME_TYPE_INDICES[gameType] : 0;
  const oneHot = [0, 0, 0, 0];
  oneHot[gameIndex] = 1;

  return {
    accuracy: Math.round(accuracy * 10000) / 10000,
    average_response_time: Math.round(avgResponseTime * 10000) / 10000,
    completion_rate: Math.round(completionRate * 10000) / 10000,
    wrong_answer_rate: Math.round(wrongAnswerRate * 10000) / 10000,
    current_difficulty: Math.round(currentDifficulty * 10000) / 10000,
    recent_performance_trend: Math.round(trend * 10000) / 10000,
    retry_count: Math.round(retryCount * 10000) / 10000,
    game_type_one_hot: oneHot,
    rawLevel,
    gameType,
  };
}

export function validateFeatures(features) {
  if (!features) return false;

  const in01 = (v) => Number.isFinite(v) && v >= 0.0 && v <= 1.0;
  const inMinus1To1 = (v) => Number.isFinite(v) && v >= -1.0 && v <= 1.0;

  if (!in01(features.accuracy)) return false;
  if (!in01(features.average_response_time)) return false;
  if (!in01(features.completion_rate)) return false;
  if (!in01(features.wrong_answer_rate)) return false;
  if (!in01(features.current_difficulty)) return false;
  if (!inMinus1To1(features.recent_performance_trend)) return false;
  if (!in01(features.retry_count)) return false;

  if (!Array.isArray(features.game_type_one_hot) || features.game_type_one_hot.length !== 4) {
    return false;
  }
  const sum = features.game_type_one_hot.reduce((a, b) => a + b, 0);
  if (sum !== 1) return false;

  return true;
}

export function featuresToVector(f) {
  return [
    f.accuracy,
    f.average_response_time,
    f.completion_rate,
    f.wrong_answer_rate,
    f.current_difficulty,
    f.recent_performance_trend,
    f.retry_count,
    f.game_type_one_hot[0],
    f.game_type_one_hot[1],
    f.game_type_one_hot[2],
    f.game_type_one_hot[3],
  ];
}
