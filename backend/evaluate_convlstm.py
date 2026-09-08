import os
import numpy as np
import torch
import matplotlib.pyplot as plt
from train_convlstm import SeaIceConvLSTM


# ============================================================
# POLARIS-X CONVLSTM EVALUATION
# ============================================================

DATA_DIR = r".\data\ai_training\processed_v2"

MODEL_PATH = r".\models\sea_ice_convlstm.pt"

OUTPUT_DIR = r".\data\ai_training\evaluation_convlstm"

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)


# ============================================================
# CREATE OUTPUT DIRECTORY
# ============================================================

os.makedirs(
    OUTPUT_DIR,
    exist_ok=True
)


# ============================================================
# LOAD TEST DATA
# ============================================================

print("========================================")
print(" POLARIS-X CONVLSTM EVALUATION")
print("========================================")

print("\nLoading test dataset...")

X_test = np.load(
    os.path.join(
        DATA_DIR,
        "X_test.npy"
    )
)

y_test = np.load(
    os.path.join(
        DATA_DIR,
        "y_test.npy"
    )
)

mask_test = np.load(
    os.path.join(
        DATA_DIR,
        "mask_test.npy"
    )
)


print(
    "Original X_test:",
    X_test.shape
)

print(
    "Original y_test:",
    y_test.shape
)


# ============================================================
# APPLY SAME DOWNSAMPLING USED DURING TRAINING
# ============================================================

X_test = X_test[
    :,
    :,
    :,
    ::2,
    ::2
]

y_test = y_test[
    :,
    ::2,
    ::2
]

mask_test = mask_test[
    :,
    ::2,
    ::2
]


print(
    "Reduced X_test:",
    X_test.shape
)

print(
    "Reduced y_test:",
    y_test.shape
)


# ============================================================
# LOAD MODEL
# ============================================================

print("\nLoading trained ConvLSTM model...")

model = SeaIceConvLSTM().to(
    DEVICE
)

model.load_state_dict(
    torch.load(
        MODEL_PATH,
        map_location=DEVICE
    )
)

model.eval()

print("Model loaded successfully.")

print(
    "Device:",
    DEVICE
)


# ============================================================
# CONVERT TEST DATA TO TORCH
# ============================================================

X_tensor = torch.from_numpy(
    X_test
).float().to(DEVICE)


# ============================================================
# RUN PREDICTION
# ============================================================

print("\nRunning predictions...")

with torch.no_grad():

    predictions = model(
        X_tensor
    )

predictions = predictions.cpu().numpy()


print(
    "Prediction shape:",
    predictions.shape
)


# ============================================================
# MASK INVALID VALUES
# ============================================================

predictions = np.clip(
    predictions,
    0.0,
    1.0
)

y_test = np.clip(
    y_test,
    0.0,
    1.0
)


# ============================================================
# CALCULATE METRICS
# ============================================================

valid = mask_test > 0

absolute_error = np.abs(
    predictions - y_test
)

squared_error = (
    predictions - y_test
) ** 2


mae = (
    absolute_error[valid].mean()
)

rmse = np.sqrt(
    squared_error[valid].mean()
)


print("\n========================================")
print(" FINAL TEST METRICS")
print("========================================")

print(
    f"MAE  : {mae:.6f}"
)

print(
    f"RMSE : {rmse:.6f}"
)

print(
    f"MAE %: {mae * 100:.2f}%"
)

print(
    f"RMSE %: {rmse * 100:.2f}%"
)


# ============================================================
# SELECT A TEST SAMPLE
# ============================================================

sample_index = 0

actual = y_test[
    sample_index
]

prediction = predictions[
    sample_index
]

error = np.abs(
    actual - prediction
)


# ============================================================
# CONVERT TO PERCENTAGE
# ============================================================

actual_percent = actual * 100

prediction_percent = prediction * 100

error_percent = error * 100


# ============================================================
# SAVE ACTUAL MAP
# ============================================================

plt.figure(
    figsize=(10, 6)
)

plt.imshow(
    actual_percent,
    origin="lower",
    vmin=0,
    vmax=100
)

plt.colorbar(
    label="Sea Ice Concentration (%)"
)

plt.title(
    "POLARIS-X — Actual Sea Ice Concentration"
)

plt.xlabel(
    "Longitude Grid"
)

plt.ylabel(
    "Latitude Grid"
)

plt.tight_layout()

actual_path = os.path.join(
    OUTPUT_DIR,
    "actual_convlstm.png"
)

plt.savefig(
    actual_path,
    dpi=150
)

plt.close()


# ============================================================
# SAVE PREDICTION MAP
# ============================================================

plt.figure(
    figsize=(10, 6)
)

plt.imshow(
    prediction_percent,
    origin="lower",
    vmin=0,
    vmax=100
)

plt.colorbar(
    label="Predicted Sea Ice Concentration (%)"
)

plt.title(
    "POLARIS-X — ConvLSTM Sea Ice Prediction"
)

plt.xlabel(
    "Longitude Grid"
)

plt.ylabel(
    "Latitude Grid"
)

plt.tight_layout()

prediction_path = os.path.join(
    OUTPUT_DIR,
    "prediction_convlstm.png"
)

plt.savefig(
    prediction_path,
    dpi=150
)

plt.close()


# ============================================================
# SAVE ERROR MAP
# ============================================================

plt.figure(
    figsize=(10, 6)
)

plt.imshow(
    error_percent,
    origin="lower",
    vmin=0,
    vmax=max(
        10,
        np.percentile(
            error_percent,
            95
        )
    )
)

plt.colorbar(
    label="Absolute Error (%)"
)

plt.title(
    "POLARIS-X — ConvLSTM Prediction Error"
)

plt.xlabel(
    "Longitude Grid"
)

plt.ylabel(
    "Latitude Grid"
)

plt.tight_layout()

error_path = os.path.join(
    OUTPUT_DIR,
    "error_convlstm.png"
)

plt.savefig(
    error_path,
    dpi=150
)

plt.close()


# ============================================================
# SAVE NUMERICAL PREDICTION
# ============================================================

prediction_npy_path = os.path.join(
    OUTPUT_DIR,
    "predictions.npy"
)

np.save(
    prediction_npy_path,
    predictions
)


# ============================================================
# FINAL OUTPUT
# ============================================================

print("\n========================================")
print(" EVALUATION COMPLETE")
print("========================================")

print("\nFiles created:")

print(
    actual_path
)

print(
    prediction_path
)

print(
    error_path
)

print(
    prediction_npy_path
)

print("\nPOLARIS-X ConvLSTM evaluation finished.")