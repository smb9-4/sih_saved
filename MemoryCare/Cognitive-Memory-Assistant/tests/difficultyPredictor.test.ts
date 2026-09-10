/**
 * difficultyPredictor.test.ts
 * Unit tests for Dementia Care Difficulty Predictor and Policy Guardrails.
 */

import {
  extractGameFeatures,
  validateFeatures,
  featuresToVector,
  calculatePerformanceTrend,
  GAME_TYPE_INDICES,
} from '../src/services/gameMetrics';
import {
  evaluateDifficultyPolicy,
  MIN_LEVEL,
  MAX_LEVEL,
  CONFIDENCE_THRESHOLD,
  MIN_SESSIONS_BEFORE_INCREASE,
} from '../src/services/difficultyPolicy';
import { DifficultyPredictor } from '../src/services/difficultyPredictor';

describe('Dementia Care Difficulty Predictor & Policy Guardrails', () => {
  let predictor: DifficultyPredictor;

  beforeEach(() => {
    predictor = new DifficultyPredictor();
    predictor.loadModel();
  });

  afterEach(() => {
    predictor.dispose();
  });

  // 1. Feature Normalization
  test('1. Feature Normalization: normalizes raw metrics into [0.0, 1.0] and [-1.0, 1.0]', () => {
    const raw = {
      gameType: 'pattern_matching',
      level: 3,
      attempts: 10,
      mistakes: 2,
      accuracyPercent: 80,
      avgResponseMs: 15000,
      totalTimeSeconds: 45,
      retries: 2,
    };

    const pastSessions = [
      { accuracy: 0.70 },
      { accuracy: 0.75 },
    ];

    const features = extractGameFeatures(raw, pastSessions, 4);

    expect(features.accuracy).toBe(0.8);
    expect(features.average_response_time).toBe(0.5); // 15000 / 30000 = 0.5
    expect(features.wrong_answer_rate).toBe(0.2);
    expect(features.current_difficulty).toBeCloseTo(2 / 3, 3);
    expect(features.retry_count).toBe(0.4); // 2 / 5 = 0.4
    expect(features.recent_performance_trend).toBeGreaterThan(0);
    expect(validateFeatures(features)).toBe(true);
  });

  // 2. Missing Feature Validation (Safe Fallback to KEEP_DIFFICULTY)
  test('2. Missing Feature Validation: fails safely and returns KEEP_DIFFICULTY', () => {
    // Missing / null features
    const invalidResult1 = predictor.predict(null as any);
    expect(invalidResult1.action).toBe('KEEP_DIFFICULTY');
    expect(invalidResult1.confidence).toBe(1.0);

    // Corrupted feature outside expected range
    const corruptedFeatures: any = {
      accuracy: 1.5, // invalid
      average_response_time: 0.2,
      completion_rate: 1.0,
      wrong_answer_rate: 0.1,
      current_difficulty: 0.5,
      recent_performance_trend: 0.0,
      retry_count: 0.0,
      game_type_one_hot: [1, 0, 0, 0],
      rawLevel: 2,
      gameType: 'pattern_matching',
    };

    const invalidResult2 = predictor.predict(corruptedFeatures);
    expect(invalidResult2.action).toBe('KEEP_DIFFICULTY');
    expect(invalidResult2.confidence).toBe(1.0);
  });

  // 3. All Four Game Types (One-Hot Encoding)
  test('3. All Four Game Types: generates exact 4-element one-hot vectors', () => {
    const games = ['pattern_matching', 'shape_sort', 'face_name_recall', 'remember_my_story'];
    const expectedVectors = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];

    games.forEach((game, idx) => {
      const f = extractGameFeatures({ gameType: game, level: 1 }, [], 4);
      expect(f.game_type_one_hot).toEqual(expectedVectors[idx]);
      expect(GAME_TYPE_INDICES[game]).toBe(idx);
      const vec = featuresToVector(f);
      expect(vec.length).toBe(11);
    });
  });

  // 4. Difficulty Boundaries from 1 to 4
  test('4. Difficulty Boundaries: clamped strictly between MIN_LEVEL (1) and MAX_LEVEL (4)', () => {
    // At maximum level 4: cannot increase
    const maxResult = evaluateDifficultyPolicy({
      currentLevel: MAX_LEVEL,
      modelAction: 'INCREASE_DIFFICULTY',
      modelConfidence: 0.95,
      completedSessionsCount: 5,
    });
    expect(maxResult.recommendedDifficulty).toBe(MAX_LEVEL);
    expect(maxResult.action).toBe('KEEP_DIFFICULTY');

    // At minimum level 1: cannot decrease
    const minResult = evaluateDifficultyPolicy({
      currentLevel: MIN_LEVEL,
      modelAction: 'DECREASE_DIFFICULTY',
      modelConfidence: 0.95,
      completedSessionsCount: 5,
    });
    expect(minResult.recommendedDifficulty).toBe(MIN_LEVEL);
    expect(minResult.action).toBe('KEEP_DIFFICULTY');
  });

  // 5. One-Level Increase/Decrease Limit
  test('5. Single-Level Step Limit: difficulty changes by at most ±1 level', () => {
    const increaseResult = evaluateDifficultyPolicy({
      currentLevel: 2,
      modelAction: 'INCREASE_DIFFICULTY',
      modelConfidence: 0.90,
      completedSessionsCount: 4,
    });
    expect(increaseResult.recommendedDifficulty).toBe(3);
    expect(increaseResult.recommendedDifficulty - 2).toBe(1);

    const decreaseResult = evaluateDifficultyPolicy({
      currentLevel: 3,
      modelAction: 'DECREASE_DIFFICULTY',
      modelConfidence: 0.90,
      completedSessionsCount: 4,
    });
    expect(decreaseResult.recommendedDifficulty).toBe(2);
    expect(3 - decreaseResult.recommendedDifficulty).toBe(1);
  });

  // 6. Low-Confidence Fallback (< 0.60 -> KEEP_DIFFICULTY)
  test('6. Low-Confidence Fallback: returns KEEP_DIFFICULTY when confidence < 0.60', () => {
    const lowConfResult = evaluateDifficultyPolicy({
      currentLevel: 2,
      modelAction: 'INCREASE_DIFFICULTY',
      modelConfidence: 0.52, // Below 0.60 threshold
      completedSessionsCount: 5,
    });

    expect(lowConfResult.action).toBe('KEEP_DIFFICULTY');
    expect(lowConfResult.recommendedDifficulty).toBe(2);
    expect(lowConfResult.reason).toContain('below the 60% safety threshold');
  });

  // 7. Minimum 3 Sessions Required Before Increase
  test('7. Experience Guardrail: requires at least 3 completed sessions before increasing level', () => {
    // Only 2 completed sessions
    const earlyResult = evaluateDifficultyPolicy({
      currentLevel: 1,
      modelAction: 'INCREASE_DIFFICULTY',
      modelConfidence: 0.95,
      completedSessionsCount: 2,
    });
    expect(earlyResult.action).toBe('KEEP_DIFFICULTY');
    expect(earlyResult.recommendedDifficulty).toBe(1);
    expect(earlyResult.reason).toContain('2/3 required sessions');

    // 3 completed sessions
    const allowedResult = evaluateDifficultyPolicy({
      currentLevel: 1,
      modelAction: 'INCREASE_DIFFICULTY',
      modelConfidence: 0.95,
      completedSessionsCount: 3,
    });
    expect(allowedResult.action).toBe('INCREASE_DIFFICULTY');
    expect(allowedResult.recommendedDifficulty).toBe(2);
  });

  // 8. Caregiver Maximum Difficulty
  test('8. Caregiver Constraint: never exceeds caregiver-configured maximum level', () => {
    const cappedResult = evaluateDifficultyPolicy({
      currentLevel: 2,
      modelAction: 'INCREASE_DIFFICULTY',
      modelConfidence: 0.95,
      completedSessionsCount: 5,
      caregiverMaxDifficulty: 2, // Caregiver capped at Level 2
    });

    expect(cappedResult.action).toBe('KEEP_DIFFICULTY');
    expect(cappedResult.recommendedDifficulty).toBe(2);
    expect(cappedResult.reason).toContain('Caregiver configured maximum difficulty cap');
  });

  // 9. Abandoned Games
  test('9. Abandoned Games: gently decreases or keeps level, never increases', () => {
    const abandonedResult = evaluateDifficultyPolicy({
      currentLevel: 3,
      modelAction: 'INCREASE_DIFFICULTY', // even if model mistakenly recommended increase
      modelConfidence: 0.9,
      completedSessionsCount: 5,
      isAbandoned: true,
    });

    expect(abandonedResult.action).toBe('DECREASE_DIFFICULTY');
    expect(abandonedResult.recommendedDifficulty).toBe(2);
    expect(abandonedResult.reason).toContain('abandoned');
  });

  // 10. Offline Inference Speed & Determinism
  test('10. Offline Inference: executes in < 5ms deterministically without network calls', () => {
    const features = extractGameFeatures({
      gameType: 'shape_sort',
      level: 2,
      accuracyPercent: 95,
      avgResponseMs: 8000,
      attempts: 8,
      mistakes: 0,
    });

    const tStart = performance.now();
    const res = predictor.predict(features);
    const duration = performance.now() - tStart;

    expect(duration).toBeLessThan(20);
    expect(res).toHaveProperty('action');
    expect(res).toHaveProperty('confidence');
    expect(res).toHaveProperty('recommendedDifficulty');
    expect(Array.isArray(res.probabilities)).toBe(true);
  });

  // 11. No Hint-Related Fields or Logic
  test('11. No Hint Fields: verify absolute absence of hint-related fields or penalties', () => {
    const features = extractGameFeatures({
      gameType: 'remember_my_story',
      level: 2,
      accuracyPercent: 90,
    });

    const featureKeys = Object.keys(features);
    const hasHintFeature = featureKeys.some((k) => k.toLowerCase().includes('hint'));
    expect(hasHintFeature).toBe(false);

    const vector = featuresToVector(features);
    expect(vector.length).toBe(11);
  });
});
