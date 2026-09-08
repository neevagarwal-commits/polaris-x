import os
import numpy as np
import torch
import xarray as xr

from train_convlstm import SeaIceConvLSTM


# ============================================================
# POLARIS-X AI SEA-ICE FORECAST ENGINE
# ============================================================

MODEL_PATH = r".\models\sea_ice_convlstm.pt"

TRAINING_DATASET = (
    r".\data\ai_training\antarctic_peninsula_2025.nc"
)

PROCESSED_DATA_DIR = (
    r".\data\ai_training\processed_v2"
)

OUTPUT_DIR = (
    r".\data\ai_training\forecast"
)

OUTPUT_FILE = (
    "convlstm_forecast.nc"
)

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)

INPUT_DAYS = 7

DOWNSAMPLE = 2


# ============================================================
# LOAD TRAINED MODEL
# ============================================================

print(
    "Loading POLARIS-X ConvLSTM..."
)

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

print(
    "ConvLSTM loaded successfully."
)


# ============================================================
# LOAD TEST SEQUENCE
# ============================================================

def load_input_sequence():

    X_test_path = os.path.join(
        PROCESSED_DATA_DIR,
        "X_test.npy"
    )

    X_test = np.load(
        X_test_path
    )

    print(
        "\nLoaded test sequences:",
        X_test.shape
    )

    # --------------------------------------------------------
    # Take first test sequence
    #
    # Original:
    #
    # (7, 2, 75, 125)
    # --------------------------------------------------------

    sequence = X_test[0]

    # --------------------------------------------------------
    # IMPORTANT
    #
    # The processed_v2 dataset is already:
    #
    # (7, 2, 75, 125)
    #
    # We therefore apply the SAME spatial reduction used
    # during training.
    #
    # Result:
    #
    # (7, 2, 38, 63)
    # --------------------------------------------------------

    sequence = sequence[
        :,
        :,
        ::DOWNSAMPLE,
        ::DOWNSAMPLE
    ]

    print(
        "Model input sequence:",
        sequence.shape
    )

    return sequence.astype(
        np.float32
    )


# ============================================================
# GET MODEL GRID COORDINATES
# ============================================================

def get_model_coordinates():

    print(
        "\nReading geographic coordinates..."
    )

    ds = xr.open_dataset(
        TRAINING_DATASET
    )

    original_latitude = ds[
        "latitude"
    ].values

    original_longitude = ds[
        "longitude"
    ].values

    ds.close()

    # --------------------------------------------------------
    # The model operates on:
    #
    # 75 × 125
    #
    # and the training script downsamples this to:
    #
    # 38 × 63
    #
    # Therefore we take every second coordinate.
    #
    # But because 150 / 2 = 75 and 250 / 2 = 125,
    # the original source grid must first be mapped to
    # the 75 × 125 processed grid.
    # --------------------------------------------------------

    processed_latitude = original_latitude[
        ::2
    ]

    processed_longitude = original_longitude[
        ::2
    ]

    # --------------------------------------------------------
    # Now apply the SECOND reduction used by training.
    #
    # 75 × 125
    #
    # →
    #
    # 38 × 63
    # --------------------------------------------------------

    model_latitude = processed_latitude[
        ::DOWNSAMPLE
    ]

    model_longitude = processed_longitude[
        ::DOWNSAMPLE
    ]

    # --------------------------------------------------------
    # Safety check
    # --------------------------------------------------------

    print(
        "Model latitude points:",
        len(model_latitude)
    )

    print(
        "Model longitude points:",
        len(model_longitude)
    )

    print(
        "Latitude range:",
        float(model_latitude.min()),
        "→",
        float(model_latitude.max())
    )

    print(
        "Longitude range:",
        float(model_longitude.min()),
        "→",
        float(model_longitude.max())
    )

    return (
        model_latitude,
        model_longitude
    )


# ============================================================
# GENERATE FORECAST
# ============================================================

def generate_forecast():

    sequence = load_input_sequence()

    # --------------------------------------------------------
    # Add batch dimension
    #
    # (7, 2, 38, 63)
    #
    # →
    #
    # (1, 7, 2, 38, 63)
    # --------------------------------------------------------

    input_tensor = (
        torch.from_numpy(
            sequence
        )
        .unsqueeze(0)
        .to(DEVICE)
    )

    print(
        "\nRunning ConvLSTM inference..."
    )

    with torch.no_grad():

        prediction = model(
            input_tensor
        )

    prediction = (
        prediction
        .cpu()
        .numpy()[0]
    )

    # --------------------------------------------------------
    # Clip to physical range
    #
    # 0 = no ice
    # 1 = 100% ice
    # --------------------------------------------------------

    prediction = np.clip(
        prediction,
        0.0,
        1.0
    )

    # --------------------------------------------------------
    # Convert normalized concentration to %
    # --------------------------------------------------------

    prediction_percent = (
        prediction * 100.0
    )

    print(
        "Forecast generated:",
        prediction_percent.shape
    )

    return prediction_percent


# ============================================================
# CREATE GEOREFERENCED DATASET
# ============================================================

def create_forecast_dataset(
    prediction,
    latitude,
    longitude
):

    # --------------------------------------------------------
    # Expected geographic dimensions
    # --------------------------------------------------------

    expected_shape = (
        len(latitude),
        len(longitude)
    )

    print(
        "\nChecking geographic alignment..."
    )

    print(
        "Prediction shape:",
        prediction.shape
    )

    print(
        "Coordinate grid:",
        expected_shape
    )

    # --------------------------------------------------------
    # HARD SAFETY CHECK
    # --------------------------------------------------------

    if prediction.shape != expected_shape:

        raise ValueError(
            "\nGEOGRAPHIC GRID MISMATCH\n"
            f"Prediction: {prediction.shape}\n"
            f"Coordinates: {expected_shape}"
        )

    # --------------------------------------------------------
    # Create xarray dataset
    # --------------------------------------------------------

    dataset = xr.Dataset(

        {

            "sea_ice_forecast": (

                [
                    "latitude",
                    "longitude"
                ],

                prediction

            )

        },

        coords={

            "latitude": latitude,

            "longitude": longitude

        }

    )

    # ========================================================
    # VARIABLE METADATA
    # ========================================================

    dataset[
        "sea_ice_forecast"
    ].attrs = {

        "standard_name":
            "sea_ice_area_fraction",

        "units":
            "%",

        "long_name":
            "POLARIS-X ConvLSTM next-day sea-ice concentration forecast",

        "model":
            "POLARIS-X ConvLSTM",

        "input_sequence_days":
            INPUT_DAYS,

        "training_region":
            "Antarctic Peninsula",

        "forecast_type":
            "Next-day sea-ice concentration forecast"

    }

    # ========================================================
    # DATASET METADATA
    # ========================================================

    dataset.attrs = {

        "title":
            "POLARIS-X Antarctic Sea-Ice Forecast",

        "description":
            "AI-generated next-day Antarctic sea-ice concentration forecast using a ConvLSTM model.",

        "system":
            "POLARIS-X",

        "model":
            "ConvLSTM",

        "input_days":
            INPUT_DAYS,

        "training_region":
            "Antarctic Peninsula",

        "spatial_resolution":
            "Reduced model grid derived from 0.1 degree source grid",

        "note":
            "Prototype decision-support forecast. Not certified for operational navigation."

    }

    return dataset


# ============================================================
# SAVE FORECAST
# ============================================================

def save_forecast():

    # --------------------------------------------------------
    # Generate AI prediction
    # --------------------------------------------------------

    prediction = generate_forecast()

    # --------------------------------------------------------
    # Get EXACT matching geographic coordinates
    # --------------------------------------------------------

    (
        latitude,
        longitude
    ) = get_model_coordinates()

    # --------------------------------------------------------
    # Create georeferenced dataset
    # --------------------------------------------------------

    dataset = create_forecast_dataset(
        prediction,
        latitude,
        longitude
    )

    # --------------------------------------------------------
    # Create output directory
    # --------------------------------------------------------

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    output_path = os.path.join(
        OUTPUT_DIR,
        OUTPUT_FILE
    )

    # --------------------------------------------------------
    # Save NetCDF
    # --------------------------------------------------------

    dataset.to_netcdf(
        output_path
    )

    # ========================================================
    # FINAL SUMMARY
    # ========================================================

    print(
        "\n========================================"
    )

    print(
        " POLARIS-X AI FORECAST GENERATED"
    )

    print(
        "========================================"
    )

    print(
        "Forecast shape:",
        prediction.shape
    )

    print(
        "Latitude points:",
        len(latitude)
    )

    print(
        "Longitude points:",
        len(longitude)
    )

    print(
        "Latitude:",
        f"{latitude.min():.2f}° → "
        f"{latitude.max():.2f}°"
    )

    print(
        "Longitude:",
        f"{longitude.min():.2f}° → "
        f"{longitude.max():.2f}°"
    )

    print(
        "Minimum:",
        f"{prediction.min():.2f}%"
    )

    print(
        "Maximum:",
        f"{prediction.max():.2f}%"
    )

    print(
        "Mean:",
        f"{prediction.mean():.2f}%"
    )

    print(
        "\nSaved to:"
    )

    print(
        output_path
    )


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    save_forecast()