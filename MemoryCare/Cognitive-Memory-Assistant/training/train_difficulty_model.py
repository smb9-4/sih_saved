"""
train_difficulty_model.py
Trains an MLP Difficulty Predictor and converts it to fully INT8-quantized TensorFlow Lite.

Prints required metrics:
- Accuracy
- Precision
- Recall
- F1-score
- Confusion matrix
- Model file size
- Input tensor shape
- Output tensor shape
- Quantization type

Exports:
- models/difficulty_predictor_int8.tflite
- models/feature_config.json
"""

import os
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, precision_recall_fscore_support

# Suppress noisy TF logs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

def main():
    import tensorflow as tf
    
    print(f"TensorFlow Version: {tf.__version__}")
    
    # 1. Load dataset
    base_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(base_dir)
    data_path = os.path.join(base_dir, "synthetic_gameplay_dataset.csv")
    
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Dataset not found at {data_path}. Run generate_dataset.py first.")
        
    df = pd.read_csv(data_path)
    
    feature_cols = [
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
        "game_type_story"
    ]
    
    X = df[feature_cols].values.astype(np.float32)
    y = df["label"].values.astype(np.int32)
    
    # Train / Val / Test split (70% train, 15% val, 15% test)
    X_train, X_temp, y_train, y_temp = train_test_split(X, y, test_size=0.30, random_state=42, stratify=y)
    X_val, X_test, y_val, y_test = train_test_split(X_temp, y_temp, test_size=0.50, random_state=42, stratify=y_temp)
    
    print(f"Training samples: {len(X_train)}, Validation: {len(X_val)}, Test: {len(X_test)}")
    print(f"Input features count: {X.shape[1]}")
    
    # 2. Build small MLP architecture
    inputs = tf.keras.Input(shape=(11,), name="gameplay_features")
    x = tf.keras.layers.Dense(64, activation="relu", name="dense_64")(inputs)
    x = tf.keras.layers.Dense(32, activation="relu", name="dense_32")(x)
    outputs = tf.keras.layers.Dense(3, activation="softmax", name="action_probs")(x)
    
    model = tf.keras.Model(inputs=inputs, outputs=outputs, name="dementia_difficulty_mlp")
    
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.002),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"]
    )
    
    model.summary()
    
    # 3. Train
    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True)
    ]
    
    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=30,
        batch_size=32,
        callbacks=callbacks,
        verbose=1
    )
    
    # 4. Evaluate on Test Set
    y_pred_probs = model.predict(X_test)
    y_pred = np.argmax(y_pred_probs, axis=1)
    
    acc = accuracy_score(y_test, y_pred)
    prec, rec, f1, _ = precision_recall_fscore_support(y_test, y_pred, average="weighted")
    cm = confusion_matrix(y_test, y_pred)
    
    print("\n" + "="*50)
    print("MODEL EVALUATION RESULTS ON TEST SET")
    print("="*50)
    print(f"Accuracy:  {acc:.4f} ({acc*100:.2f}%)")
    print(f"Precision: {prec:.4f}")
    print(f"Recall:    {rec:.4f}")
    print(f"F1-score:  {f1:.4f}")
    print("\nConfusion Matrix:")
    print("                Pred Decre(0)  Pred Keep(1)  Pred Incre(2)")
    print(f"True Decre(0):    {cm[0][0]:<14} {cm[0][1]:<13} {cm[0][2]}")
    print(f"True Keep(1):     {cm[1][0]:<14} {cm[1][1]:<13} {cm[1][2]}")
    print(f"True Incre(2):    {cm[2][0]:<14} {cm[2][1]:<13} {cm[2][2]}")
    print("\nDetailed Classification Report:")
    print(classification_report(y_test, y_pred, target_names=["DECREASE_DIFFICULTY", "KEEP_DIFFICULTY", "INCREASE_DIFFICULTY"]))
    
    # 5. INT8 Quantization with Representative Dataset
    def representative_dataset_gen():
        for i in range(min(500, len(X_train))):
            sample = X_train[i:i+1].astype(np.float32)
            yield [sample]
            
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.representative_dataset = representative_dataset_gen
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    converter.inference_input_type = tf.int8
    converter.inference_output_type = tf.int8
    
    tflite_int8_model = converter.convert()
    
    # 6. Save models
    models_dir = os.path.join(project_root, "models")
    os.makedirs(models_dir, exist_ok=True)
    tflite_path = os.path.join(models_dir, "difficulty_predictor_int8.tflite")
    
    with open(tflite_path, "wb") as f:
        f.write(tflite_int8_model)
        
    tflite_size_bytes = len(tflite_int8_model)
    tflite_size_kb = tflite_size_bytes / 1024.0
    
    # Extract tensor details via TFLite Interpreter
    interpreter = tf.lite.Interpreter(model_content=tflite_int8_model)
    interpreter.allocate_tensors()
    
    input_details = interpreter.get_input_details()[0]
    output_details = interpreter.get_output_details()[0]
    
    in_scale, in_zero_point = input_details["quantization"]
    out_scale, out_zero_point = output_details["quantization"]
    
    print("\n" + "="*50)
    print("TFLITE INT8 QUANTIZATION DETAILS")
    print("="*50)
    print(f"Model File Path:      {tflite_path}")
    print(f"Model File Size:      {tflite_size_bytes} bytes ({tflite_size_kb:.2f} KB)")
    print(f"Input Tensor Shape:   {input_details['shape']}")
    print(f"Input Data Type:      {input_details['dtype']}")
    print(f"Input Scale:          {in_scale}")
    print(f"Input Zero Point:     {in_zero_point}")
    print(f"Output Tensor Shape:  {output_details['shape']}")
    print(f"Output Data Type:     {output_details['dtype']}")
    print(f"Output Scale:         {out_scale}")
    print(f"Output Zero Point:    {out_zero_point}")
    print(f"Quantization Type:    Fully INT8 (Weights & Activations)")
    print("="*50)
    
    # Extract weights for the lightweight in-app TS/JS forward pass
    dense1_w, dense1_b = model.layers[1].get_weights()
    dense2_w, dense2_b = model.layers[2].get_weights()
    dense3_w, dense3_b = model.layers[3].get_weights()
    
    feature_config = {
        "model_name": "Dementia_Difficulty_Predictor_MLP_INT8",
        "architecture": "MLP (11 -> Dense 64 ReLU -> Dense 32 ReLU -> Dense 3 Softmax)",
        "quantization_type": "INT8 fully quantized",
        "model_file": "models/difficulty_predictor_int8.tflite",
        "model_size_bytes": tflite_size_bytes,
        "input_tensor_shape": list(map(int, input_details['shape'])),
        "output_tensor_shape": list(map(int, output_details['shape'])),
        "input_quantization": {
            "scale": float(in_scale),
            "zero_point": int(in_zero_point)
        },
        "output_quantization": {
            "scale": float(out_scale),
            "zero_point": int(out_zero_point)
        },
        "label_mapping": {
            "0": "DECREASE_DIFFICULTY",
            "1": "KEEP_DIFFICULTY",
            "2": "INCREASE_DIFFICULTY"
        },
        "game_type_encoding": {
            "0": "Find the Match (pattern_matching) -> [1, 0, 0, 0]",
            "1": "Shape Sort (shape_sort) -> [0, 1, 0, 0]",
            "2": "Face & Name (face_name_recall) -> [0, 0, 1, 0]",
            "3": "Remember My Story (remember_my_story) -> [0, 0, 0, 1]"
        },
        "feature_order": feature_cols,
        "features": {
            "accuracy": {
                "description": "Ratio of correct actions to total attempts",
                "min": 0.0,
                "max": 1.0,
                "normalization": "clamped to [0.0, 1.0]"
            },
            "average_response_time": {
                "description": "Normalized average response time in seconds/ms",
                "min": 0.0,
                "max": 1.0,
                "normalization": "min(1.0, raw_response_ms / 30000.0)"
            },
            "completion_rate": {
                "description": "Proportion of target objectives reached",
                "min": 0.0,
                "max": 1.0,
                "normalization": "clamped to [0.0, 1.0]"
            },
            "wrong_answer_rate": {
                "description": "Ratio of mistakes to total attempts",
                "min": 0.0,
                "max": 1.0,
                "normalization": "clamped to [0.0, 1.0]"
            },
            "current_difficulty": {
                "description": "Current difficulty level normalized",
                "min": 0.0,
                "max": 1.0,
                "normalization": "(current_level - 1) / (max_level - 1)"
            },
            "recent_performance_trend": {
                "description": "Slope/delta of accuracy across past 3 sessions",
                "min": -1.0,
                "max": 1.0,
                "normalization": "clamped to [-1.0, 1.0]"
            },
            "retry_count": {
                "description": "Number of retries in current session",
                "min": 0.0,
                "max": 1.0,
                "normalization": "min(1.0, retries / 5.0)"
            },
            "game_type_match": {"min": 0.0, "max": 1.0, "normalization": "one-hot"},
            "game_type_shape": {"min": 0.0, "max": 1.0, "normalization": "one-hot"},
            "game_type_face": {"min": 0.0, "max": 1.0, "normalization": "one-hot"},
            "game_type_story": {"min": 0.0, "max": 1.0, "normalization": "one-hot"}
        },
        "weights": {
            "dense1": {
                "weights": np.round(dense1_w, 6).tolist(),
                "biases": np.round(dense1_b, 6).tolist()
            },
            "dense2": {
                "weights": np.round(dense2_w, 6).tolist(),
                "biases": np.round(dense2_b, 6).tolist()
            },
            "dense3": {
                "weights": np.round(dense3_w, 6).tolist(),
                "biases": np.round(dense3_b, 6).tolist()
            }
        }
    }
    
    config_path = os.path.join(models_dir, "feature_config.json")
    with open(config_path, "w") as f:
        json.dump(feature_config, f, indent=2)
        
    print(f"Saved feature config and weights to {config_path}")

if __name__ == "__main__":
    main()
