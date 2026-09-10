/**
 * gameMetrics.ts
 * Feature extraction, normalization, and validation for the Dementia Difficulty Predictor.
 * 
 * Total input tensor dimension: 11 float features
 * 1. accuracy: [0.0, 1.0]
 * 2. average_response_time: [0.0, 1.0] (raw response ms / 30000)
 * 3. completion_rate: [0.0, 1.0]
 * 4. wrong_answer_rate: [0.0, 1.0] (mistakes / max(1, attempts))
 * 5. current_difficulty: [0.0, 1.0] ((level - 1) / (maxLevel - 1))
 * 6. recent_performance_trend: [-1.0, 1.0] (delta of accuracy over past sessions)
 * 7. retry_count: [0.0, 1.0] (retries / 5.0)
 * 8-11. game_type_one_hot: 4 binary values for
 *        [pattern_matching, shape_sort, face_name_recall, remember_my_story]
 */

export const GAME_TYPE_INDICES: Record<string, number> = {
  pattern_matching: 0,
  shape_sort: 1,
  face_name_recall: 2,
  remember_my_story: 3,
};

export const GAME_TYPE_KEYS: string[] = [
  'pattern_matching',
  'shape_sort',
  'face_name_recall',
  'remember_my_story',
];

export interface RawGameMetrics {
  gameType: string;
  level: number;
  attempts?: number;
  mistakes?: number;
  accuracyPercent?: number | string;
  avgResponseMs?: number;
  totalTimeSeconds?: number;
  completed?: boolean;
  abandoned?: boolean;
  retries?: number;
  extra?: Record<string, any>;
}

export interface NormalizedGameFeatures {
  accuracy: number;
  average_response_time: number;
  completion_rate: number;
  wrong_answer_rate: number;
  current_difficulty: number;
  recent_performance_trend: number;
  retry_count: number;
  game_type_one_hot: [number, number, number, number];
  rawLevel: number;
  gameType: string;
}

/**
 * Calculates recent performance trend (-1.0 to 1.0) based on accuracy delta across past sessions.
 */
export function calculatePerformanceTrend(currentAccuracy: number, pastSessions: Array<{ accuracy?: number | string; accuracy_percent?: number | string }>): number {
  if (!pastSessions || pastSessions.length === 0) return 0.0;
  
  const recent = pastSessions.slice(-3);
  const pastAccuracies = recent.map((s) => {
    const v = s.accuracy != null ? Number(s.accuracy) : Number(s.accuracy_percent);
    // If stored as 0-100, convert to 0-1
    return v > 1.0 ? v / 100.0 : Math.max(0.0, Math.min(1.0, v || 0));
  });

  const avgPast = pastAccuracies.reduce((a, b) => a + b, 0) / pastAccuracies.length;
  const delta = currentAccuracy - avgPast;
  return Math.max(-1.0, Math.min(1.0, Math.round(delta * 1000) / 1000));
}

/**
 * Normalizes and extracts features from raw game session metrics.
 */
export function extractGameFeatures(
  raw: RawGameMetrics,
  pastSessions: Array<any> = [],
  maxLevel: number = 4
): NormalizedGameFeatures {
  const gameType = raw.gameType || 'pattern_matching';
  const rawLevel = Math.max(1, Math.min(maxLevel, Number(raw.level) || 1));

  // 1. Accuracy [0.0, 1.0]
  let accuracy = 0.0;
  if (raw.accuracyPercent != null) {
    const acc = Number(raw.accuracyPercent);
    accuracy = acc > 1.0 ? acc / 100.0 : acc;
  } else if (raw.attempts && raw.attempts > 0) {
    const correct = Math.max(0, (raw.attempts || 0) - (raw.mistakes || 0));
    accuracy = correct / raw.attempts;
  }
  accuracy = Math.max(0.0, Math.min(1.0, accuracy || 0));

  // 2. Average response time [0.0, 1.0] (scaled up to 30s)
  const avgMs = Number(raw.avgResponseMs) || 0;
  const avgResponseTime = Math.max(0.0, Math.min(1.0, avgMs / 30000.0));

  // 3. Completion rate [0.0, 1.0]
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

  // 4. Wrong answer rate [0.0, 1.0]
  const attempts = Math.max(0, Number(raw.attempts) || 0);
  const mistakes = Math.max(0, Number(raw.mistakes) || 0);
  let wrongAnswerRate = 0.0;
  if (attempts > 0) {
    wrongAnswerRate = Math.min(1.0, mistakes / attempts);
  } else if (mistakes > 0) {
    wrongAnswerRate = 1.0;
  }
  wrongAnswerRate = Math.max(0.0, Math.min(1.0, wrongAnswerRate));

  // 5. Current difficulty [0.0, 1.0]
  const denom = Math.max(1, maxLevel - 1);
  const currentDifficulty = Math.max(0.0, Math.min(1.0, (rawLevel - 1) / denom));

  // 6. Recent performance trend [-1.0, 1.0]
  const trend = calculatePerformanceTrend(accuracy, pastSessions);

  // 7. Retry count [0.0, 1.0]
  const retries = Math.max(0, Number(raw.retries) || 0);
  const retryCount = Math.max(0.0, Math.min(1.0, retries / 5.0));

  // 8-11. Game type one-hot
  const gameIndex = GAME_TYPE_INDICES[gameType] != null ? GAME_TYPE_INDICES[gameType] : 0;
  const oneHot: [number, number, number, number] = [0, 0, 0, 0];
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

/**
 * Validates normalized feature bounds.
 * Returns true if all features are finite numbers within expected ranges.
 */
export function validateFeatures(features: NormalizedGameFeatures): boolean {
  if (!features) return false;

  const in01 = (v: number) => Number.isFinite(v) && v >= 0.0 && v <= 1.0;
  const inMinus1To1 = (v: number) => Number.isFinite(v) && v >= -1.0 && v <= 1.0;

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

/**
 * Converts NormalizedGameFeatures to the flat 11-element float array expected by the model.
 */
export function featuresToVector(f: NormalizedGameFeatures): number[] {
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
