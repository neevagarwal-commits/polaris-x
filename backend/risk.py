from fastapi import APIRouter
from fastapi.responses import FileResponse
import xarray as xr
import numpy as np
from pathlib import Path
import csv
import math

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap


router = APIRouter(
    prefix="/api/navigation",
    tags=["Navigation"]
)


# ==========================================================
# PATHS
# ==========================================================

BASE_DIR = Path(__file__).resolve().parent

SEA_ICE_DIR = (
    BASE_DIR /
    "data" /
    "sea_ice_l4"
)

ICEBERG_FILE = (
    BASE_DIR /
    "data" /
    "icebergs.csv"
)

IMAGE_PATH = (
    BASE_DIR /
    "data" /
    "sea_ice_l4" /
    "navigation_risk_latest.png"
)


# ==========================================================
# CONFIGURATION
# ==========================================================

GRID_LAT_STEP = 1.0
GRID_LON_STEP = 1.0

MIN_LAT = -75.0
MAX_LAT = -55.0

MIN_LON = -180.0
MAX_LON = 180.0


# ==========================================================
# FIND LATEST SEA-ICE DATASET
# ==========================================================

def find_latest_sea_ice_file():

    files = list(
        SEA_ICE_DIR.glob("*.nc")
    )

    if not files:
        return None

    return sorted(files)[-1]


# ==========================================================
# LOAD ICEBERGS
# ==========================================================

def load_icebergs():

    if not ICEBERG_FILE.exists():
        return []

    icebergs = []

    try:

        with open(
            ICEBERG_FILE,
            "r",
            encoding="utf-8-sig"
        ) as file:

            reader = csv.DictReader(file)

            for row in reader:

                try:

                    latitude = float(
                        row["Latitude"]
                    )

                    longitude = float(
                        row["Longitude"]
                    )

                    icebergs.append(
                        {
                            "id": row["Iceberg"],
                            "latitude": latitude,
                            "longitude": longitude,
                        }
                    )

                except (
                    ValueError,
                    KeyError
                ):
                    continue

    except Exception as exc:

        print(
            "POLARIS-X: Failed to load iceberg data:",
            exc
        )

        return []

    return icebergs


# ==========================================================
# HAVERSINE DISTANCE
# ==========================================================

def distance_km(
    lat1,
    lon1,
    lat2,
    lon2
):

    earth_radius = 6371.0

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    delta_lat = math.radians(
        lat2 - lat1
    )

    delta_lon = math.radians(
        lon2 - lon1
    )

    a = (
        math.sin(delta_lat / 2) ** 2
        +
        math.cos(lat1_rad)
        *
        math.cos(lat2_rad)
        *
        math.sin(delta_lon / 2) ** 2
    )

    c = 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a)
    )

    return earth_radius * c


# ==========================================================
# ICEBERG RISK
# ==========================================================

def calculate_iceberg_risk(
    latitude,
    longitude,
    icebergs
):

    if not icebergs:
        return 0.0

    highest_risk = 0.0

    for iceberg in icebergs:

        distance = distance_km(
            latitude,
            longitude,
            iceberg["latitude"],
            iceberg["longitude"]
        )

        if distance <= 25:

            risk = 1.0

        elif distance <= 100:

            risk = (
                1.0
                -
                (
                    distance - 25
                )
                /
                75
            )

        elif distance <= 200:

            risk = 0.35 * (
                1.0
                -
                (
                    distance - 100
                )
                /
                100
            )

        else:

            risk = 0.0

        highest_risk = max(
            highest_risk,
            risk
        )

    return float(
        np.clip(
            highest_risk,
            0.0,
            1.0
        )
    )


# ==========================================================
# SEA-ICE RISK
# ==========================================================

def calculate_sea_ice_risk(
    concentration
):

    if not np.isfinite(
        concentration
    ):

        return 0.0

    concentration = float(
        np.clip(
            concentration,
            0,
            100
        )
    )

    if concentration <= 10:

        risk = concentration / 100

    elif concentration <= 40:

        risk = (
            0.10
            +
            (
                concentration - 10
            )
            /
            30
            *
            0.30
        )

    elif concentration <= 70:

        risk = (
            0.40
            +
            (
                concentration - 40
            )
            /
            30
            *
            0.30
        )

    else:

        risk = (
            0.70
            +
            (
                concentration - 70
            )
            /
            30
            *
            0.30
        )

    return float(
        np.clip(
            risk,
            0.0,
            1.0
        )
    )


# ==========================================================
# BUILD NAVIGATION GRID
# ==========================================================

def build_risk_grid():

    dataset_path = (
        find_latest_sea_ice_file()
    )

    if dataset_path is None:

        raise FileNotFoundError(
            "No Antarctic L4 sea-ice dataset found."
        )

    print(
        "POLARIS-X: Loading risk dataset:",
        dataset_path.name
    )

    ds = xr.open_dataset(
        dataset_path
    )

    variable = "ice_conc"

    if variable not in ds:

        ds.close()

        raise ValueError(
            "ice_conc variable not found."
        )

    ice = ds[
        variable
    ].isel(time=0)

    source_lat = ds[
        "latitude"
    ].values

    source_lon = ds[
        "longitude"
    ].values

    source_ice = ice.values

    ds.close()

    icebergs = load_icebergs()

    print(
        f"POLARIS-X: Loaded {len(icebergs)} tracked icebergs."
    )

    latitudes = np.arange(
        MIN_LAT,
        MAX_LAT + GRID_LAT_STEP,
        GRID_LAT_STEP
    )

    longitudes = np.arange(
        MIN_LON,
        MAX_LON,
        GRID_LON_STEP
    )

    results = []

    for latitude in latitudes:

        lat_index = int(
            np.abs(
                source_lat - latitude
            ).argmin()
        )

        for longitude in longitudes:

            lon_index = int(
                np.abs(
                    source_lon - longitude
                ).argmin()
            )

            concentration = float(
                source_ice[
                    lat_index,
                    lon_index
                ]
            )

            if not np.isfinite(
                concentration
            ):

                concentration = 0.0

            sea_ice_risk = (
                calculate_sea_ice_risk(
                    concentration
                )
            )

            iceberg_risk = (
                calculate_iceberg_risk(
                    latitude,
                    longitude,
                    icebergs
                )
            )

            total_risk = (
                0.70 * sea_ice_risk
                +
                0.30 * iceberg_risk
            )

            total_risk = float(
                np.clip(
                    total_risk,
                    0.0,
                    1.0
                )
            )

            results.append(
                {
                    "latitude": round(
                        float(latitude),
                        2
                    ),

                    "longitude": round(
                        float(longitude),
                        2
                    ),

                    "sea_ice_concentration":
                        round(
                            concentration,
                            2
                        ),

                    "sea_ice_risk":
                        round(
                            sea_ice_risk,
                            4
                        ),

                    "iceberg_risk":
                        round(
                            iceberg_risk,
                            4
                        ),

                    "total_risk":
                        round(
                            total_risk,
                            4
                        ),
                }
            )

    return results


# ==========================================================
# GENERATE RISK HEATMAP IMAGE
# ==========================================================

def generate_risk_image():

    print(
        "POLARIS-X: Generating navigation risk heatmap..."
    )

    grid = build_risk_grid()

    latitudes = np.arange(
        MIN_LAT,
        MAX_LAT + GRID_LAT_STEP,
        GRID_LAT_STEP
    )

    longitudes = np.arange(
        MIN_LON,
        MAX_LON,
        GRID_LON_STEP
    )

    risk_array = np.zeros(
        (
            len(latitudes),
            len(longitudes)
        ),
        dtype=float
    )

    # ------------------------------------------------------
    # Convert grid list into raster.
    # ------------------------------------------------------

    for item in grid:

        lat_index = int(
            round(
                (
                    item["latitude"]
                    -
                    MIN_LAT
                )
                /
                GRID_LAT_STEP
            )
        )

        lon_index = int(
            round(
                (
                    item["longitude"]
                    -
                    MIN_LON
                )
                /
                GRID_LON_STEP
            )
        )

        if (
            0 <= lat_index < len(latitudes)
            and
            0 <= lon_index < len(longitudes)
        ):

            risk_array[
                lat_index,
                lon_index
            ] = item["total_risk"]

    # ------------------------------------------------------
    # Transparent background for very low risk.
    # ------------------------------------------------------

    rgba = np.zeros(
        (
            risk_array.shape[0],
            risk_array.shape[1],
            4
        ),
        dtype=float
    )

    # Green -> Yellow -> Orange -> Red.
    cmap = LinearSegmentedColormap.from_list(
        "polaris_risk",
        [
            "#00ff88",
            "#a3e635",
            "#facc15",
            "#fb923c",
            "#ef4444",
        ]
    )

    colors = cmap(
        np.clip(
            risk_array,
            0.0,
            1.0
        )
    )

    rgba[:, :, :3] = colors[:, :, :3]

    # ------------------------------------------------------
    # Alpha based on risk.
    # ------------------------------------------------------

    alpha = np.where(
        risk_array < 0.10,
        0.0,
        np.where(
            risk_array < 0.30,
            0.18,
            np.where(
                risk_array < 0.50,
                0.30,
                np.where(
                    risk_array < 0.70,
                    0.48,
                    0.68
                )
            )
        )
    )

    rgba[:, :, 3] = alpha

    # ------------------------------------------------------
    # Flip vertically.
    #
    # Cesium expects the top of the image to represent
    # the northern side of the rectangle.
    # ------------------------------------------------------

    rgba = np.flipud(
        rgba
    )

    IMAGE_PATH.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    plt.imsave(
        IMAGE_PATH,
        rgba
    )

    print(
        "POLARIS-X: Risk heatmap created:",
        IMAGE_PATH
    )

    return IMAGE_PATH


# ==========================================================
# RISK JSON API
# ==========================================================

@router.get("/risk")
def get_navigation_risk():

    try:

        grid = build_risk_grid()

        risks = [
            item["total_risk"]
            for item in grid
        ]

        return {

            "status": "success",

            "dataset":
                "Antarctic L4 Sea Ice + USNIC Icebergs",

            "grid_resolution_degrees":
                GRID_LAT_STEP,

            "grid": grid,

            "statistics": {

                "cell_count":
                    len(grid),

                "minimum_risk":
                    round(
                        float(
                            min(risks)
                        ),
                        4
                    ),

                "maximum_risk":
                    round(
                        float(
                            max(risks)
                        ),
                        4
                    ),

                "mean_risk":
                    round(
                        float(
                            np.mean(risks)
                        ),
                        4
                    ),
            },

            "risk_model": {

                "sea_ice_weight":
                    0.70,

                "iceberg_weight":
                    0.30,

                "description":
                    "Prototype environmental navigation risk model."
            },
        }

    except Exception as exc:

        return {

            "status": "error",

            "message": str(exc),
        }


# ==========================================================
# RISK HEATMAP IMAGE API
# ==========================================================

@router.get("/risk/image")
def get_navigation_risk_image():

    try:

        if not IMAGE_PATH.exists():

            generate_risk_image()

        return FileResponse(
            IMAGE_PATH,
            media_type="image/png",
            headers={
                "Cache-Control":
                    "no-cache, no-store, must-revalidate"
            }
        )

    except Exception as exc:

        return {

            "status": "error",

            "message": str(exc),
        }