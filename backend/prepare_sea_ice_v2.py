import os
import numpy as np
import xarray as xr


# ============================================================
# POLARIS-X SEA ICE DATA PREPROCESSOR V2
#
# Channel 0 = Sea Ice Concentration
# Channel 1 = Valid Observation Mask
#
# 7 DAYS INPUT -> 1 DAY TARGET
# ============================================================

INPUT_FILE = r".\data\ai_training\antarctic_peninsula_2025.nc"
OUTPUT_DIR = r".\data\ai_training\processed_v2"

INPUT_DAYS = 7
DOWNSAMPLE_FACTOR = 2


def main():

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    print("========================================")
    print(" POLARIS-X SEA ICE PREPROCESSOR V2")
    print("========================================")

    # --------------------------------------------------------
    # LOAD
    # --------------------------------------------------------

    print("\nLoading dataset...")

    ds = xr.open_dataset(INPUT_FILE)

    if "ice_conc" not in ds:

        raise ValueError(
            "ice_conc variable not found."
        )

    ice = ds["ice_conc"]

    print("Original shape:")
    print(ice.shape)

    # --------------------------------------------------------
    # CONVERT TO NUMPY
    # --------------------------------------------------------

    raw = ice.values.astype(np.float32)

    # Valid concentration:
    # 0 <= concentration <= 100

    valid = (
        np.isfinite(raw)
        & (raw >= 0)
        & (raw <= 100)
    )

    print("\nOriginal valid-data percentage:")

    print(
        f"{valid.mean() * 100:.2f}%"
    )

    # --------------------------------------------------------
    # NORMALIZE
    # --------------------------------------------------------

    concentration = np.zeros_like(
        raw,
        dtype=np.float32
    )

    concentration[valid] = (
        raw[valid] / 100.0
    )

    # --------------------------------------------------------
    # VALID MASK
    # --------------------------------------------------------

    mask = valid.astype(
        np.float32
    )

    # --------------------------------------------------------
    # DOWNSAMPLE
    # --------------------------------------------------------

    print("\nDownsampling...")

    concentration = concentration[
        :,
        ::DOWNSAMPLE_FACTOR,
        ::DOWNSAMPLE_FACTOR
    ]

    mask = mask[
        :,
        ::DOWNSAMPLE_FACTOR,
        ::DOWNSAMPLE_FACTOR
    ]

    print(
        "Concentration shape:",
        concentration.shape
    )

    print(
        "Mask shape:",
        mask.shape
    )

    print(
        "Valid-data percentage after downsampling:",
        f"{mask.mean() * 100:.2f}%"
    )

    # --------------------------------------------------------
    # CREATE 7-DAY SEQUENCES
    # --------------------------------------------------------

    X = []
    y = []
    y_mask = []

    total_days = concentration.shape[0]

    print("\nCreating temporal sequences...")

    for i in range(
        total_days - INPUT_DAYS
    ):

        # Seven days of concentration
        ice_sequence = concentration[
            i:i + INPUT_DAYS
        ]

        # Seven days of masks
        mask_sequence = mask[
            i:i + INPUT_DAYS
        ]

        # Combine into channels
        #
        # Shape:
        # 7 × 2 × H × W

        sequence = np.stack(
            [
                ice_sequence,
                mask_sequence
            ],
            axis=1
        )

        target = concentration[
            i + INPUT_DAYS
        ]

        target_mask = mask[
            i + INPUT_DAYS
        ]

        X.append(sequence)

        y.append(target)

        y_mask.append(target_mask)

    X = np.asarray(
        X,
        dtype=np.float32
    )

    y = np.asarray(
        y,
        dtype=np.float32
    )

    y_mask = np.asarray(
        y_mask,
        dtype=np.float32
    )

    print("\nCreated dataset:")

    print(
        "X:",
        X.shape
    )

    print(
        "y:",
        y.shape
    )

    print(
        "y_mask:",
        y_mask.shape
    )

    # --------------------------------------------------------
    # CHRONOLOGICAL SPLIT
    # --------------------------------------------------------

    total_samples = len(X)

    train_end = int(
        total_samples * 0.70
    )

    val_end = int(
        total_samples * 0.85
    )

    X_train = X[:train_end]

    y_train = y[:train_end]

    mask_train = y_mask[:train_end]

    X_val = X[
        train_end:val_end
    ]

    y_val = y[
        train_end:val_end
    ]

    mask_val = y_mask[
        train_end:val_end
    ]

    X_test = X[
        val_end:
    ]

    y_test = y[
        val_end:
    ]

    mask_test = y_mask[
        val_end:
    ]

    # --------------------------------------------------------
    # SAVE
    # --------------------------------------------------------

    print("\nSaving processed datasets...")

    np.save(
        os.path.join(
            OUTPUT_DIR,
            "X_train.npy"
        ),
        X_train
    )

    np.save(
        os.path.join(
            OUTPUT_DIR,
            "y_train.npy"
        ),
        y_train
    )

    np.save(
        os.path.join(
            OUTPUT_DIR,
            "mask_train.npy"
        ),
        mask_train
    )

    np.save(
        os.path.join(
            OUTPUT_DIR,
            "X_val.npy"
        ),
        X_val
    )

    np.save(
        os.path.join(
            OUTPUT_DIR,
            "y_val.npy"
        ),
        y_val
    )

    np.save(
        os.path.join(
            OUTPUT_DIR,
            "mask_val.npy"
        ),
        mask_val
    )

    np.save(
        os.path.join(
            OUTPUT_DIR,
            "X_test.npy"
        ),
        X_test
    )

    np.save(
        os.path.join(
            OUTPUT_DIR,
            "y_test.npy"
        ),
        y_test
    )

    np.save(
        os.path.join(
            OUTPUT_DIR,
            "mask_test.npy"
        ),
        mask_test
    )

    # --------------------------------------------------------
    # SUMMARY
    # --------------------------------------------------------

    print("\n========================================")
    print(" V2 PREPROCESSING COMPLETE")
    print("========================================")

    print(
        "\nTraining:",
        X_train.shape,
        y_train.shape
    )

    print(
        "Validation:",
        X_val.shape,
        y_val.shape
    )

    print(
        "Testing:",
        X_test.shape,
        y_test.shape
    )

    print("\nInput channels:")

    print(
        "Channel 0 = Sea Ice Concentration"
    )

    print(
        "Channel 1 = Valid Observation Mask"
    )

    print("\nSaved to:")

    print(OUTPUT_DIR)


if __name__ == "__main__":

    main()