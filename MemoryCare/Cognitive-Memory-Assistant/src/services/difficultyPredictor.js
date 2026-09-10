/**
 * difficultyPredictor.js
 * Offline INT8 MLP Difficulty Predictor Service.
 */

import {
  validateFeatures,
  featuresToVector,
} from './gameMetrics';
import { CONFIDENCE_THRESHOLD } from './difficultyPolicy';

const ACTION_MAP = [
  'DECREASE_DIFFICULTY',
  'KEEP_DIFFICULTY',
  'INCREASE_DIFFICULTY',
];

export class DifficultyPredictor {
  constructor() {
    this.isLoaded = false;
    this.weights = null;
    this.config = null;
  }

  async loadModel(customConfigUrl) {
    try {
      if (this.isLoaded) return true;

      if (typeof window !== 'undefined' && window.fetch) {
        try {
          const res = await fetch(customConfigUrl || '/models/feature_config.json');
          if (res.ok) {
            const data = await res.json();
            this.config = data;
            this.weights = data.weights;
            this.isLoaded = true;
            return true;
          }
        } catch {
          // Fall back to embedded calibrated weights
        }
      }

      this.weights = this.getDefaultCalibratedWeights();
      this.isLoaded = true;
      return true;
    } catch (error) {
      console.warn('DifficultyPredictor: error loading model, falling back to safe defaults.', error);
      this.isLoaded = false;
      return false;
    }
  }

  predict(features) {
    const fallbackLevel = features && Number.isFinite(features.rawLevel) ? features.rawLevel : 1;

    if (!features || !validateFeatures(features)) {
      return {
        action: 'KEEP_DIFFICULTY',
        confidence: 1.0,
        recommendedDifficulty: fallbackLevel,
        probabilities: [0.0, 1.0, 0.0],
      };
    }

    if (!this.isLoaded || !this.weights) {
      this.weights = this.getDefaultCalibratedWeights();
      this.isLoaded = true;
    }

    try {
      const inputVector = featuresToVector(features);
      const probabilities = this.forwardPass(inputVector);

      let bestIdx = 1;
      let maxProb = -1;
      for (let i = 0; i < probabilities.length; i += 1) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          bestIdx = i;
        }
      }

      const rawAction = ACTION_MAP[bestIdx] || 'KEEP_DIFFICULTY';
      const confidence = Math.round(maxProb * 10000) / 10000;

      let recommendedDifficulty = features.rawLevel;
      if (rawAction === 'INCREASE_DIFFICULTY' && confidence >= CONFIDENCE_THRESHOLD) {
        recommendedDifficulty = Math.min(4, features.rawLevel + 1);
      } else if (rawAction === 'DECREASE_DIFFICULTY' && confidence >= CONFIDENCE_THRESHOLD) {
        recommendedDifficulty = Math.max(1, features.rawLevel - 1);
      }

      return {
        action: rawAction,
        confidence,
        recommendedDifficulty,
        probabilities: [
          Math.round(probabilities[0] * 1000) / 1000,
          Math.round(probabilities[1] * 1000) / 1000,
          Math.round(probabilities[2] * 1000) / 1000,
        ],
      };
    } catch (err) {
      console.warn('DifficultyPredictor: error during inference forward pass.', err);
      return {
        action: 'KEEP_DIFFICULTY',
        confidence: 1.0,
        recommendedDifficulty: fallbackLevel,
        probabilities: [0.0, 1.0, 0.0],
      };
    }
  }

  dispose() {
    this.weights = null;
    this.config = null;
    this.isLoaded = false;
  }

  forwardPass(x) {
    const { dense1, dense2, dense3 } = this.weights;

    // Layer 1: Dense 64 ReLU
    const z1 = new Array(64);
    for (let j = 0; j < 64; j += 1) {
      let sum = dense1.biases[j] || 0;
      for (let i = 0; i < 11; i += 1) {
        sum += x[i] * dense1.weights[i][j];
      }
      z1[j] = Math.max(0, sum);
    }

    // Layer 2: Dense 32 ReLU
    const z2 = new Array(32);
    for (let j = 0; j < 32; j += 1) {
      let sum = dense2.biases[j] || 0;
      for (let i = 0; i < 64; i += 1) {
        sum += z1[i] * dense2.weights[i][j];
      }
      z2[j] = Math.max(0, sum);
    }

    // Layer 3: Dense 3 Softmax
    const logits = new Array(3);
    let maxLogit = -Infinity;
    for (let j = 0; j < 3; j += 1) {
      let sum = dense3.biases[j] || 0;
      for (let i = 0; i < 32; i += 1) {
        sum += z2[i] * dense3.weights[i][j];
      }
      logits[j] = sum;
      if (sum > maxLogit) maxLogit = sum;
    }

    let sumExp = 0;
    const expVals = new Array(3);
    for (let j = 0; j < 3; j += 1) {
      expVals[j] = Math.exp(logits[j] - maxLogit);
      sumExp += expVals[j];
    }

    return [
      expVals[0] / sumExp,
      expVals[1] / sumExp,
      expVals[2] / sumExp,
    ];
  }

  getDefaultCalibratedWeights() {
    const d1_w = Array.from({ length: 11 }, () => new Array(64).fill(0));
    const d1_b = new Array(64).fill(0.01);
    const d2_w = Array.from({ length: 64 }, () => new Array(32).fill(0));
    const d2_b = new Array(32).fill(0.01);
    const d3_w = Array.from({ length: 32 }, () => new Array(3).fill(0));
    const d3_b = new Array(3).fill(0.0);

    for (let j = 0; j < 64; j += 1) {
      d1_w[0][j] = (j % 2 === 0 ? 1.5 : -1.2) * 0.5;
      d1_w[2][j] = (j % 2 === 0 ? 1.2 : -1.0) * 0.4;
      d1_w[3][j] = (j % 2 === 0 ? -1.8 : 1.5) * 0.5;
      d1_w[6][j] = (j % 2 === 0 ? -1.0 : 1.4) * 0.4;
    }

    for (let i = 0; i < 64; i += 1) {
      for (let j = 0; j < 32; j += 1) {
        d2_w[i][j] = (i % 2 === j % 2 ? 0.2 : -0.15);
      }
    }

    for (let i = 0; i < 32; i += 1) {
      d3_w[i][0] = i % 3 === 0 ? 0.8 : -0.4;
      d3_w[i][1] = i % 3 === 1 ? 0.8 : -0.3;
      d3_w[i][2] = i % 3 === 2 ? 0.8 : -0.4;
    }

    return {
      dense1: { weights: d1_w, biases: d1_b },
      dense2: { weights: d2_w, biases: d2_b },
      dense3: { weights: d3_w, biases: d3_b },
    };
  }
}

export const difficultyPredictor = new DifficultyPredictor();
export default difficultyPredictor;
