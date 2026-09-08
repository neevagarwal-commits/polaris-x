import os
import numpy as np
import xarray as xr

INPUT_FILE = r".\data\ai_training\antarctic_peninsula_2025.nc"
OUTPUT_DIR = r".\data\ai_training\processed"

INPUT_DAYS = 7
TARGET_DAYS = 1


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("========================================")
    print(" POLARIS-X SEA ICE DATA PREPROCESSOR")
    print("========================================")

    print("\nLoading dataset...")
    ds = xr.open_dataset(INPUT_FILE)

    print(ds)

    if "ice_conc" not in ds:
        raise ValueError("ice_conc variable was not found.")

    ice = ds["ice_conc"]

    print("\nOriginal shape:")
    print(ice.shape)

    print("\nCleaning data...")

    # Convert percentage to 0-1
    ice = ice / 100.0

    # Replace invalid values with NaN
    ice = ice.where((ice >= 0) & (ice <= 1))

    # Fill missing spatial values using nearest valid value
    ice = ice.interpolate_na(
        dim="latitude",
        method="nearest",
        fill_value="extrapolate"
    )

    ice = ice.interpolate_na(
        dim="longitude",
        method="nearest",
        fill_value="extrapolate"
    )

    data = ice.values.astype(np.float32)

    # Replace anything still invalid
    data = np.nan_to_num(
        data,
        nan=0.0,
        posinf=1.0,
        neginf=0.0
    )

    print("\nCleaned data shape:")
    print(data.shape)

    print("\nData range:")
    print("Minimum:", data.min())
    print("Maximum:", data.max())
    print("Mean:", data.mean())

    # -------------------------------------------------
    # CREATE TEMPORAL SEQUENCES
    #
    # 7 previous days -> next day
    # -------------------------------------------------

    X = []
    y = []

    total_days = data.shape[0]

    print("\nCreating training sequences...")

    for i in range(total_days - INPUT_DAYS - TARGET_DAYS + 1):

        input_sequence = data[
            i:i + INPUT_DAYS
        ]

        target = data[
            i + INPUT_DAYS
        ]

        X.append(input_sequence)
        y.append(target)

    X = np.array(X, dtype=np.float32)
    y = np.array(y, dtype=np.float32)

    print("\nTraining data created.")

    print("X shape:", X.shape)
    print("y shape:", y.shape)

    # -------------------------------------------------
    # CHRONOLOGICAL TRAIN / VALIDATION / TEST SPLIT
    # -------------------------------------------------

    n = len(X)

    train_end = int(n * 0.70)
    val_end = int(n * 0.85)

    X_train = X[:train_end]
    y_train = y[:train_end]

    X_val = X[train_end:val_end]
    y_val = y[train_end:val_end]

    X_test = X[val_end:]
    y_test = y[val_end:]

    print("\n========================================")
    print(" DATASET SPLIT")
    print("========================================")

    print("Training:", X_train.shape, y_train.shape)
    print("Validation:", X_val.shape, y_val.shape)
    print("Testing:", X_test.shape, y_test.shape)

    # -------------------------------------------------
    # SAVE
    # -------------------------------------------------

    np.save(
        os.path.join(OUTPUT_DIR, "X_train.npy"),
        X_train
    )

    np.save(
        os.path.join(OUTPUT_DIR, "y_train.npy"),
        y_train
    )

    np.save(
        os.path.join(OUTPUT_DIR, "X_val.npy"),
        X_val
    )

    np.save(
        os.path.join(OUTPUT_DIR, "y_val.npy"),
        y_val
    )

    np.save(
        os.path.join(OUTPUT_DIR, "X_test.npy"),
        X_test
    )

    np.save(
        os.path.join(OUTPUT_DIR, "y_test.npy"),
        y_test
    )

    print("\n========================================")
    print(" PREPROCESSING COMPLETE")
    print("========================================")

    print("\nFiles saved to:")
    print(OUTPUT_DIR)

    print("\nThe AI will learn:")
    print("7 days of sea ice")
    print("        ↓")
    print("   MODEL")
    print("        ↓")
    print("next day's sea ice")


if __name__ == "__main__":
    main()