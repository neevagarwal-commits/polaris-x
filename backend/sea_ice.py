from fastapi import APIRouter
from fastapi.responses import FileResponse

import xarray as xr
import numpy as np

from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt


router = APIRouter(
    prefix="/api/sea-ice",
    tags=["Sea Ice"],
)


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

L4_DATA_DIR = BASE_DIR / "data" / "sea_ice_l4"
L3_DATA_DIR = BASE_DIR / "data" / "sea_ice"

FORECAST_DIR = BASE_DIR / "data" / "ai_training" / "forecast"

IMAGE_PATH = L4_DATA_DIR / "sea_ice_l4_latest.png"

FORECAST_PATH = FORECAST_DIR / "convlstm_forecast.nc"
FORECAST_IMAGE_PATH = FORECAST_DIR / "convlstm_forecast.png"


# ============================================================
# DATASET FINDERS
# ============================================================

def find_l4_dataset():

    files = sorted(
        L4_DATA_DIR.glob("*.nc"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    if not files:
        return None

    return files[0]


def find_l3_dataset():

    files = sorted(
        L3_DATA_DIR.glob("*.nc"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    if not files:
        return None

    return files[0]


def find_dataset():

    l4 = find_l4_dataset()

    if l4:
        return l4

    return find_l3_dataset()


# ============================================================
# VARIABLE FINDER
# ============================================================

def find_variable(ds):

    candidates = [
        "ice_conc",
        "ice_concentration",
        "siconc",
        "sea_ice_concentration",
        "sic",
    ]

    for name in candidates:

        if name in ds.data_vars:
            return name

    raise ValueError(
        f"Sea-ice concentration variable not found. "
        f"Available variables: {list(ds.data_vars)}"
    )


# ============================================================
# COORDINATE FINDER
# ============================================================

def find_coordinate(ds, candidates):

    for name in candidates:

        if name in ds.coords:
            return name

        if name in ds.variables:
            return name

    raise ValueError(
        f"Coordinate not found. Tried: {candidates}"
    )


# ============================================================
# GENERATE OBSERVED SEA-ICE IMAGE
# ============================================================

def generate_sea_ice_image(dataset_path):

    ds = xr.open_dataset(dataset_path)

    try:

        variable_name = find_variable(ds)

        lat_name = find_coordinate(
            ds,
            [
                "latitude",
                "lat",
                "nav_lat",
            ],
        )

        lon_name = find_coordinate(
            ds,
            [
                "longitude",
                "lon",
                "nav_lon",
            ],
        )

        data = ds[variable_name]

        # Remove time dimension if present
        if "time" in data.dims:
            data = data.isel(time=0)

        values = np.asarray(data.values, dtype=np.float32)

        latitude = np.asarray(
            ds[lat_name].values,
            dtype=np.float32,
        )

        longitude = np.asarray(
            ds[lon_name].values,
            dtype=np.float32,
        )

        # Handle 1D coordinates
        if latitude.ndim == 1 and longitude.ndim == 1:

            longitude, latitude = np.meshgrid(
                longitude,
                latitude,
            )

        if values.ndim != 2:

            raise ValueError(
                f"Expected 2D sea-ice data, got {values.shape}"
            )

        # Convert 0-1 to percentage if necessary
        finite_values = values[np.isfinite(values)]

        if finite_values.size > 0:

            maximum = float(np.nanmax(finite_values))

            if maximum <= 1.5:
                values = values * 100.0

        values = np.clip(values, 0, 100)

        # Invalid values
        valid_mask = np.isfinite(values)

        values = np.where(
            valid_mask,
            values,
            np.nan,
        )

        # Antarctica focus
        antarctic_mask = latitude <= -45

        values = np.where(
            antarctic_mask,
            values,
            np.nan,
        )

        # Downsample for browser performance
        max_dimension = 1600

        height, width = values.shape

        scale = max(
            height / max_dimension,
            width / max_dimension,
            1,
        )

        if scale > 1:

            step = int(np.ceil(scale))

            values = values[::step, ::step]
            latitude = latitude[::step, ::step]
            longitude = longitude[::step, ::step]

        # ----------------------------------------------------
        # IMAGE
        # ----------------------------------------------------

        fig = plt.figure(
            figsize=(16, 8),
            dpi=150,
        )

        ax = fig.add_axes(
            [0, 0, 1, 1]
        )

        masked = np.ma.masked_invalid(values)

        ax.imshow(
            masked,
            cmap="Blues",
            vmin=0,
            vmax=100,
            origin="upper",
            extent=[
                float(np.nanmin(longitude)),
                float(np.nanmax(longitude)),
                float(np.nanmin(latitude)),
                float(np.nanmax(latitude)),
            ],
            interpolation="nearest",
        )

        ax.set_axis_off()

        IMAGE_PATH.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        fig.savefig(
            IMAGE_PATH,
            transparent=True,
            bbox_inches="tight",
            pad_inches=0,
        )

        plt.close(fig)

    finally:

        ds.close()


# ============================================================
# OBSERVED SEA-ICE METADATA
# ============================================================

@router.get("")
def get_sea_ice():

    dataset_path = find_dataset()

    if dataset_path is None:

        return {
            "status": "error",
            "message": "No sea-ice dataset found.",
        }

    ds = xr.open_dataset(dataset_path)

    try:

        variable_name = find_variable(ds)

        data = ds[variable_name]

        if "time" in data.dims:
            data = data.isel(time=0)

        values = np.asarray(
            data.values,
            dtype=np.float32,
        )

        finite = values[np.isfinite(values)]

        if finite.size == 0:

            return {
                "status": "error",
                "message": "No valid sea-ice values found.",
            }

        minimum = float(np.nanmin(finite))
        maximum = float(np.nanmax(finite))
        mean = float(np.nanmean(finite))

        if maximum <= 1.5:

            minimum *= 100
            maximum *= 100
            mean *= 100

        dataset_type = (
            "L4"
            if dataset_path.parent.name == "sea_ice_l4"
            else "L3"
        )

        return {
            "status": "success",
            "source_file": dataset_path.name,
            "dataset_type": dataset_type,
            "variable": variable_name,
            "min": float(minimum),
            "max": float(maximum),
            "mean": float(mean),
        }

    finally:

        ds.close()


# ============================================================
# OBSERVED SEA-ICE IMAGE
# ============================================================

@router.get("/image")
def get_sea_ice_image():

    dataset_path = find_dataset()

    if dataset_path is None:

        return {
            "status": "error",
            "message": "No sea-ice dataset found.",
        }

    should_generate = not IMAGE_PATH.exists()

    if IMAGE_PATH.exists():

        if dataset_path.stat().st_mtime > IMAGE_PATH.stat().st_mtime:

            should_generate = True

    if should_generate:

        generate_sea_ice_image(dataset_path)

    return FileResponse(
        IMAGE_PATH,
        media_type="image/png",
    )


# ============================================================
# AI FORECAST METADATA
# ============================================================

@router.get("/forecast")
def get_sea_ice_forecast():

    if not FORECAST_PATH.exists():

        return {
            "status": "error",
            "message": "ConvLSTM forecast file not found.",
            "expected_file": str(FORECAST_PATH),
        }

    ds = xr.open_dataset(FORECAST_PATH)

    try:

        if "sea_ice_forecast" not in ds:

            return {
                "status": "error",
                "message": (
                    "Variable 'sea_ice_forecast' "
                    "not found in forecast dataset."
                ),
            }

        data = ds["sea_ice_forecast"]

        values = np.asarray(
            data.values,
            dtype=np.float32,
        )

        finite = values[np.isfinite(values)]

        if finite.size == 0:

            return {
                "status": "error",
                "message": "Forecast contains no valid values.",
            }

        latitude = np.asarray(
            ds["latitude"].values,
            dtype=np.float32,
        )

        longitude = np.asarray(
            ds["longitude"].values,
            dtype=np.float32,
        )

        return {
            "status": "success",
            "type": "AI_FORECAST",
            "source_file": FORECAST_PATH.name,
            "variable": "sea_ice_forecast",
            "model": "ConvLSTM",

            # Explicit Python values.
            # IMPORTANT:
            # Do not return numpy.int64 / numpy.float32.
            "input_days": int(
                ds.attrs.get("input_days", 7)
            ),

            "training_region": str(
                ds.attrs.get(
                    "training_region",
                    "Antarctic Peninsula",
                )
            ),

            "shape": [
                int(values.shape[0]),
                int(values.shape[1]),
            ],

            "latitude": {
                "min": float(np.min(latitude)),
                "max": float(np.max(latitude)),
                "points": int(latitude.size),
            },

            "longitude": {
                "min": float(np.min(longitude)),
                "max": float(np.max(longitude)),
                "points": int(longitude.size),
            },

            "forecast": {
                "min": float(np.min(finite)),
                "max": float(np.max(finite)),
                "mean": float(np.mean(finite)),
            },

            "note": str(
                ds.attrs.get(
                    "note",
                    "Prototype decision-support forecast.",
                )
            ),
        }

    finally:

        ds.close()


# ============================================================
# GENERATE AI FORECAST IMAGE
# ============================================================

def generate_forecast_image():

    if not FORECAST_PATH.exists():

        raise FileNotFoundError(
            f"Forecast file not found: {FORECAST_PATH}"
        )

    ds = xr.open_dataset(FORECAST_PATH)

    try:

        if "sea_ice_forecast" not in ds:

            raise ValueError(
                "Variable 'sea_ice_forecast' not found."
            )

        values = np.asarray(
            ds["sea_ice_forecast"].values,
            dtype=np.float32,
        )

        latitude = np.asarray(
            ds["latitude"].values,
            dtype=np.float32,
        )

        longitude = np.asarray(
            ds["longitude"].values,
            dtype=np.float32,
        )

        values = np.clip(
            values,
            0,
            100,
        )

        # ----------------------------------------------------
        # TRANSPARENT LOW-ICE BACKGROUND
        # ----------------------------------------------------

        masked = np.ma.masked_where(
            ~np.isfinite(values) | (values < 10),
            values,
        )

        # ----------------------------------------------------
        # IMAGE
        # ----------------------------------------------------

        fig = plt.figure(
            figsize=(12, 7),
            dpi=180,
        )

        ax = fig.add_axes(
            [0, 0, 1, 1]
        )

        ax.imshow(
            masked,
            cmap="turbo",
            vmin=10,
            vmax=100,
            origin="upper",
            extent=[
                float(np.min(longitude)),
                float(np.max(longitude)),
                float(np.min(latitude)),
                float(np.max(latitude)),
            ],
            interpolation="nearest",
        )

        ax.set_axis_off()

        FORECAST_IMAGE_PATH.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        fig.savefig(
            FORECAST_IMAGE_PATH,
            transparent=True,
            bbox_inches="tight",
            pad_inches=0,
        )

        plt.close(fig)

    finally:

        ds.close()


# ============================================================
# AI FORECAST IMAGE
# ============================================================

@router.get("/forecast/image")
def get_sea_ice_forecast_image():

    if not FORECAST_PATH.exists():

        return {
            "status": "error",
            "message": "ConvLSTM forecast file not found.",
        }

    should_generate = not FORECAST_IMAGE_PATH.exists()

    if FORECAST_IMAGE_PATH.exists():

        if (
            FORECAST_PATH.stat().st_mtime
            > FORECAST_IMAGE_PATH.stat().st_mtime
        ):

            should_generate = True

    if should_generate:

        generate_forecast_image()

    return FileResponse(
        FORECAST_IMAGE_PATH,
        media_type="image/png",
    )