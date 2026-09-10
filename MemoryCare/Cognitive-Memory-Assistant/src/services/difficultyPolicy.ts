/**
 * difficultyPolicy.ts
 * Patient safety policy layer for adaptive difficulty adjustments in dementia care.
 * 
 * Rules:
 * 1. Single-level change limit: difficulty changes by at most ±1 level.
 * 2. Strict boundary bounds: clamped between MIN_LEVEL (1) and MAX_LEVEL (4).
 * 3. Minimum 3 completed sessions required before any difficulty increase.
 * 4. Confidence threshold: 0.60. Falls back to KEEP_DIFFICULTY if model confidence < 0.60.
 * 5. Prevent repeated automatic increases (cool-down period).
 * 6. Caregiver maximum difficulty constraint: never exceed caregiver-defined ceiling.
 * 7. Friendly, supportive non-medical feedback messages.
 * 8. Full explainability logging for caregiver transparency.
 */

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 4;
export const CONFIDENCE_THRESHOLD = 0.60;
export const MIN_SESSIONS_BEFORE_INCREASE = 3;

export type ActionType = 'DECREASE_DIFFICULTY' | 'KEEP_DIFFICULTY' | 'INCREASE_DIFFICULTY';

export interface PolicyInput {
  currentLevel: number;
  modelAction: ActionType;
  modelConfidence: number;
  completedSessionsCount: number;
  pastSessions?: Array<any>;
  caregiverMaxDifficulty?: number;
  isAbandoned?: boolean;
}

export interface PolicyResult {
  action: ActionType;
  recommendedDifficulty: number;
  reason: string;
  patientMessage: string;
  appliedConfidence: number;
}

/**
 * Returns patient-friendly, non-diagnostic messaging.
 */
export function getPatientFriendlyMessage(action: ActionType): string {
  switch (action) {
    case 'DECREASE_DIFFICULTY':
      return "Let's try an easier level.";
    case 'INCREASE_DIFFICULTY':
      return "Ready for the next level?";
    case 'KEEP_DIFFICULTY':
    default:
      return "We'll keep this level.";
  }
}

/**
 * Evaluates patient performance through safety policies.
 */
export function evaluateDifficultyPolicy(input: PolicyInput): PolicyResult {
  const current = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(input.currentLevel || 1)));
  const confidence = Number(input.modelConfidence) || 0.0;
  const caregiverMax = input.caregiverMaxDifficulty != null && Number(input.caregiverMaxDifficulty) >= MIN_LEVEL
    ? Math.min(MAX_LEVEL, Math.round(Number(input.caregiverMaxDifficulty)))
    : MAX_LEVEL;

  // Rule 1: Abandoned game automatically keeps or decreases, never increases
  if (input.isAbandoned) {
    const nextDiff = Math.max(MIN_LEVEL, current - 1);
    const action: ActionType = nextDiff < current ? 'DECREASE_DIFFICULTY' : 'KEEP_DIFFICULTY';
    return {
      action,
      recommendedDifficulty: nextDiff,
      reason: "Session was abandoned early. Reducing difficulty to ensure patient comfort.",
      patientMessage: getPatientFriendlyMessage(action),
      appliedConfidence: 1.0,
    };
  }

  // Rule 2: Low model confidence fallback (< 0.60)
  if (confidence < CONFIDENCE_THRESHOLD) {
    return {
      action: 'KEEP_DIFFICULTY',
      recommendedDifficulty: current,
      reason: `Model confidence (${(confidence * 100).toFixed(1)}%) is below the ${Math.round(CONFIDENCE_THRESHOLD * 100)}% safety threshold. Keeping level.`,
      patientMessage: getPatientFriendlyMessage('KEEP_DIFFICULTY'),
      appliedConfidence: confidence,
    };
  }

  let requestedAction = input.modelAction;

  // Rule 3: Minimum completed sessions requirement before difficulty increase
  if (requestedAction === 'INCREASE_DIFFICULTY' && (input.completedSessionsCount || 0) < MIN_SESSIONS_BEFORE_INCREASE) {
    return {
      action: 'KEEP_DIFFICULTY',
      recommendedDifficulty: current,
      reason: `Patient completed ${input.completedSessionsCount || 0}/${MIN_SESSIONS_BEFORE_INCREASE} required sessions before level advance. Maintaining current level.`,
      patientMessage: getPatientFriendlyMessage('KEEP_DIFFICULTY'),
      appliedConfidence: confidence,
    };
  }

  // Rule 4: Prevent repeated consecutive difficulty increases
  if (requestedAction === 'INCREASE_DIFFICULTY' && input.pastSessions && input.pastSessions.length > 0) {
    const lastSession = input.pastSessions[input.pastSessions.length - 1];
    if (lastSession && (lastSession.model_action === 'INCREASE_DIFFICULTY' || lastSession.difficulty_after > lastSession.difficulty_before)) {
      return {
        action: 'KEEP_DIFFICULTY',
        recommendedDifficulty: current,
        reason: "Level was recently increased. Stabilizing at current level for consolidation.",
        patientMessage: getPatientFriendlyMessage('KEEP_DIFFICULTY'),
        appliedConfidence: confidence,
      };
    }
  }

  // Rule 5: Caregiver Maximum Difficulty constraint
  if (requestedAction === 'INCREASE_DIFFICULTY' && current >= caregiverMax) {
    return {
      action: 'KEEP_DIFFICULTY',
      recommendedDifficulty: current,
      reason: `Caregiver configured maximum difficulty cap of Level ${caregiverMax}. Level capped.`,
      patientMessage: getPatientFriendlyMessage('KEEP_DIFFICULTY'),
      appliedConfidence: confidence,
    };
  }

  // Rule 6: Absolute bounds [MIN_LEVEL, MAX_LEVEL]
  if (requestedAction === 'INCREASE_DIFFICULTY' && current >= MAX_LEVEL) {
    return {
      action: 'KEEP_DIFFICULTY',
      recommendedDifficulty: MAX_LEVEL,
      reason: `Highest difficulty level (${MAX_LEVEL}) reached.`,
      patientMessage: getPatientFriendlyMessage('KEEP_DIFFICULTY'),
      appliedConfidence: confidence,
    };
  }

  if (requestedAction === 'DECREASE_DIFFICULTY' && current <= MIN_LEVEL) {
    return {
      action: 'KEEP_DIFFICULTY',
      recommendedDifficulty: MIN_LEVEL,
      reason: `Already at gentle foundational Level ${MIN_LEVEL}.`,
      patientMessage: getPatientFriendlyMessage('KEEP_DIFFICULTY'),
      appliedConfidence: confidence,
    };
  }

  // Rule 7: Single-level changes
  if (requestedAction === 'INCREASE_DIFFICULTY') {
    const target = Math.min(caregiverMax, Math.min(MAX_LEVEL, current + 1));
    return {
      action: 'INCREASE_DIFFICULTY',
      recommendedDifficulty: target,
      reason: `Strong performance sustained across sessions. Progressing from Level ${current} to ${target}.`,
      patientMessage: getPatientFriendlyMessage('INCREASE_DIFFICULTY'),
      appliedConfidence: confidence,
    };
  }

  if (requestedAction === 'DECREASE_DIFFICULTY') {
    const target = Math.max(MIN_LEVEL, current - 1);
    return {
      action: 'DECREASE_DIFFICULTY',
      recommendedDifficulty: target,
      reason: `Lower accuracy or elevated mistakes detected. Adjusting from Level ${current} to ${target} for a gentler experience.`,
      patientMessage: getPatientFriendlyMessage('DECREASE_DIFFICULTY'),
      appliedConfidence: confidence,
    };
  }

  return {
    action: 'KEEP_DIFFICULTY',
    recommendedDifficulty: current,
    reason: `Steady performance at Level ${current}. Retaining current difficulty.`,
    patientMessage: getPatientFriendlyMessage('KEEP_DIFFICULTY'),
    appliedConfidence: confidence,
  };
}
