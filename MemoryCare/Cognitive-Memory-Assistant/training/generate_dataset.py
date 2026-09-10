"""
generate_dataset.py
Generates a synthetic gameplay performance dataset for training the 
INT8 Dementia Care Difficulty Predictor MLP model.

Rules:
- 0 = DECREASE_DIFFICULTY
- 1 = KEEP_DIFFICULTY
- 2 = INCREASE_DIFFICULTY

Features (11 values total):
1. accuracy: [0.0, 1.0]
2. average_response_time: [0.0, 1.0] (normalized, 0s to 30s)
3. completion_rate: [0.0, 1.0]
4. wrong_answer_rate: [0.0, 1.0]
5. current_difficulty: [0.0, 1.0] (scaled from level 1 to 4)
6. recent_performance_trend: [-1.0, 1.0]
7. retry_count: [0.0, 1.0] (normalized, 0 to 5 retries)
8-11. game_type_one_hot: 4 binary values for
     [pattern_matching, shape_sort, face_name_recall, remember_my_story]
"""

import csv
import os
import random
import numpy as np

def determine_action(accuracy, completion_rate, wrong_answer_rate, retry_count, avg_response_time, trend):
    """
    Deterministic rule-based labeling aligned with dementia care principles:
    - High accuracy (>=0.85) + high completion (>=0.85) + low errors (<=0.15) -> INCREASE (2)
    - Low accuracy (<0.60) OR low completion (<0.60) OR high errors (>=0.35) OR high retries (>=0.40) -> DECREASE (0)
    - Moderate performance (accuracy 0.60-0.84, completion >=0.60) -> KEEP (1)
    - Response speed alone NEVER increases difficulty.
    - Many errors prevent difficulty increase regardless of speed or accuracy.
    """
    # Check decrease triggers first
    if accuracy < 0.60 or completion_rate < 0.60 or wrong_answer_rate >= 0.35 or retry_count >= 0.40:
        return 0  # DECREASE_DIFFICULTY

    # Check increase triggers: high accuracy, high completion, low wrong answers
    if accuracy >= 0.85 and completion_rate >= 0.85 and wrong_answer_rate <= 0.15:
        # Avoid increasing if patient struggled or has negative trend
        if trend < -0.30:
            return 1  # KEEP
        return 2  # INCREASE_DIFFICULTY

    # Otherwise KEEP
    return 1  # KEEP_DIFFICULTY

def generate_samples(num_samples=10000, seed=42):
    random.seed(seed)
    np.random.seed(seed)
    
    samples = []
    
    for _ in range(num_samples):
        # Choose a target profile to ensure balanced classes
        profile = random.choices(['increase', 'keep', 'decrease'], weights=[0.33, 0.34, 0.33])[0]
        
        game_type = random.randint(0, 3)
        # One-hot encoding for game_type
        one_hot = [0.0, 0.0, 0.0, 0.0]
        one_hot[game_type] = 1.0
        
        # Difficulty from 1 to 4, normalized: (level - 1) / 3.0
        raw_level = random.randint(1, 4)
        current_difficulty = round((raw_level - 1) / 3.0, 4)
        
        if profile == 'increase':
            accuracy = round(random.uniform(0.85, 1.0), 4)
            completion_rate = round(random.uniform(0.85, 1.0), 4)
            wrong_answer_rate = round(random.uniform(0.0, 0.15), 4)
            retry_count = round(random.uniform(0.0, 0.20), 4)
            avg_response_time = round(random.uniform(0.10, 0.70), 4)
            trend = round(random.uniform(-0.10, 0.80), 4)
        elif profile == 'decrease':
            # Sub-reasons for decrease
            reason = random.choice(['low_accuracy', 'low_completion', 'high_errors', 'high_retries'])
            if reason == 'low_accuracy':
                accuracy = round(random.uniform(0.10, 0.58), 4)
                completion_rate = round(random.uniform(0.30, 0.90), 4)
                wrong_answer_rate = round(random.uniform(0.20, 0.80), 4)
            elif reason == 'low_completion':
                accuracy = round(random.uniform(0.30, 0.75), 4)
                completion_rate = round(random.uniform(0.10, 0.55), 4)
                wrong_answer_rate = round(random.uniform(0.15, 0.60), 4)
            elif reason == 'high_errors':
                accuracy = round(random.uniform(0.20, 0.65), 4)
                completion_rate = round(random.uniform(0.50, 0.90), 4)
                wrong_answer_rate = round(random.uniform(0.36, 0.85), 4)
            else:  # high retries
                accuracy = round(random.uniform(0.30, 0.70), 4)
                completion_rate = round(random.uniform(0.40, 0.80), 4)
                wrong_answer_rate = round(random.uniform(0.20, 0.50), 4)
            retry_count = round(random.uniform(0.40, 1.0) if reason == 'high_retries' else random.uniform(0.0, 0.6), 4)
            avg_response_time = round(random.uniform(0.30, 0.95), 4)
            trend = round(random.uniform(-0.90, 0.20), 4)
        else:  # 'keep'
            accuracy = round(random.uniform(0.60, 0.84), 4)
            completion_rate = round(random.uniform(0.60, 0.95), 4)
            wrong_answer_rate = round(random.uniform(0.10, 0.32), 4)
            retry_count = round(random.uniform(0.0, 0.35), 4)
            avg_response_time = round(random.uniform(0.20, 0.80), 4)
            trend = round(random.uniform(-0.30, 0.40), 4)

        label = determine_action(accuracy, completion_rate, wrong_answer_rate, retry_count, avg_response_time, trend)
        
        row = [
            accuracy,
            avg_response_time,
            completion_rate,
            wrong_answer_rate,
            current_difficulty,
            trend,
            retry_count,
            one_hot[0],
            one_hot[1],
            one_hot[2],
            one_hot[3],
            label
        ]
        samples.append(row)
        
    return samples

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "synthetic_gameplay_dataset.csv")
    
    headers = [
        "accuracy",
        "average_response_time",
        "completion_rate",
        "wrong_answer_rate",
        "current_difficulty",
        "recent_performance_trend",
        "retry_count",
        "game_type_match",
        "game_type_shape",
        "game_type_face",
        "game_type_story",
        "label"
    ]
    
    samples = generate_samples(12000)
    
    with open(output_path, mode="w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(samples)
        
    counts = [0, 0, 0]
    for s in samples:
        counts[s[-1]] += 1
        
    print(f"Generated {len(samples)} samples to {output_path}")
    print(f"Class distribution: DECREASE={counts[0]}, KEEP={counts[1]}, INCREASE={counts[2]}")

if __name__ == "__main__":
    main()
