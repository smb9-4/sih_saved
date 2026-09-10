# Dementia Care Game Difficulty Predictor (INT8 MLP)

## Overview
This directory contains the custom INT8-quantized Multi-Layer Perceptron (MLP) difficulty prediction model for the offline-first Capacitor Android application (`MemoryCare`).

The model monitors gameplay performance across four cognitive games and predicts one of three difficulty adaptation actions:
- `DECREASE_DIFFICULTY` (0)
- `KEEP_DIFFICULTY` (1)
- `INCREASE_DIFFICULTY` (2)

## Medical & Diagnostic Disclaimer
> **IMPORTANT**: This model is strictly an adaptive user-experience optimization system designed to reduce cognitive frustration and sustain engagement. It **DOES NOT** diagnose dementia, measure disease progression, provide medical treatment, or replace clinical evaluation. All decisions are governed by transparent caregiver policies.

---

## Model Architecture
- **Type**: Multi-Layer Perceptron (Fully Connected Neural Network)
- **Input Dimension**: 11 normalized values (7 performance features + 4 one-hot game encoding)
- **Hidden Layer 1**: Dense(64, activation='relu')
- **Hidden Layer 2**: Dense(32, activation='relu')
- **Output Layer**: Dense(3, activation='softmax')
- **Quantization**: Full integer INT8 quantization (weights and activations) via TensorFlow Lite / LiteRT
- **Target Size**: Under 50 KB (well within the 1–5 MB ceiling)
- **Execution**: 100% offline on-device execution via Capacitor WebView forward-pass engine and Android LiteRT asset sync.

---

## Input Features & Normalization

| Index | Feature Name | Description | Range | Normalization Formula |
|:---:|:---|:---|:---:|:---|
| 0 | `accuracy` | Ratio of correct actions to total attempts | `[0.0, 1.0]` | Clamped to `[0.0, 1.0]` |
| 1 | `average_response_time` | Average reaction time per interaction | `[0.0, 1.0]` | `min(1.0, raw_ms / 30000)` |
| 2 | `completion_rate` | Fraction of game goals achieved | `[0.0, 1.0]` | `completed / total_targets` |
| 3 | `wrong_answer_rate` | Ratio of mistakes to total attempts | `[0.0, 1.0]` | `mistakes / max(1, attempts)` |
| 4 | `current_difficulty` | Active difficulty level | `[0.0, 1.0]` | `(level - 1) / (max_level - 1)` |
| 5 | `recent_performance_trend` | Accuracy delta over last 3 sessions | `[-1.0, 1.0]` | Clamped delta in `[-1.0, 1.0]` |
| 6 | `retry_count` | Retries in current session | `[0.0, 1.0]` | `min(1.0, retries / 5.0)` |
| 7 | `game_type_match` | Find the Match (Pattern Matching) | `{0.0, 1.0}` | One-hot `[1, 0, 0, 0]` |
| 8 | `game_type_shape` | Shape Sort | `{0.0, 1.0}` | One-hot `[0, 1, 0, 0]` |
| 9 | `game_type_face` | Face & Name Recall | `{0.0, 1.0}` | One-hot `[0, 0, 1, 0]` |
| 10 | `game_type_story` | Remember My Story | `{0.0, 1.0}` | One-hot `[0, 0, 0, 1]` |

---

## Output Actions & Class Labels

| Class ID | Action Name | Meaning | Friendly Patient Message |
|:---:|:---|:---|:---|
| `0` | `DECREASE_DIFFICULTY` | Switch to an easier level | *"Let's try an easier level."* |
| `1` | `KEEP_DIFFICULTY` | Maintain current difficulty level | *"We'll keep this level."* |
| `2` | `INCREASE_DIFFICULTY` | Progress to the next difficulty level | *"Ready for the next level?"* |

---

## Safety & Policy Guardrails
1. **Single-Level Limit**: Difficulty changes by at most $\pm 1$ level at a time.
2. **Confidence Threshold**: If model confidence is $< 0.60$, the system defaults to `KEEP_DIFFICULTY`.
3. **Session Experience Requirement**: Requires at least 3 completed sessions at a level before any automatic increase.
4. **Caregiver Maximum Cap**: Caregivers can set a maximum difficulty ceiling per game; the model will never exceed this ceiling.
5. **No Hints**: In strict adherence to dementia cognitive stimulation protocols, no hints, hint buttons, or hint penalties exist in the games or the model.
6. **Transparent Explainability**: All difficulty changes and reasons are logged locally and viewable in the Caregiver Dashboard.
