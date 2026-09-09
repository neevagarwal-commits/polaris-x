from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from risk import router as risk_router
from navigation import router as navigation_router
from layers import router as layers_router
import csv
import os

from sea_ice import router as sea_ice_router


# ============================================================
# POLARIS-X BACKEND
# ============================================================

app = FastAPI(title="POLARIS-X API")


# ============================================================
# CORS
# ============================================================

# Allow the Next.js frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATA FILE
# ============================================================

DATA_FILE = os.path.join(
    os.path.dirname(__file__),
    "data",
    "icebergs.csv"
)


# ============================================================
# SEA-ICE ROUTER
# ============================================================

app.include_router(sea_ice_router)
app.include_router(risk_router)
app.include_router(navigation_router)
app.include_router(layers_router)

# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():
    return {
        "system": "POLARIS-X",
        "status": "online"
    }


# ============================================================
# GET ALL ICEBERGS
# ============================================================

@app.get("/api/icebergs")
def get_icebergs():

    if not os.path.exists(DATA_FILE):
        return {
            "status": "error",
            "message": "Iceberg data file not found",
            "icebergs": []
        }

    icebergs = []

    with open(
        DATA_FILE,
        "r",
        encoding="utf-8-sig"
    ) as file:

        reader = csv.DictReader(file)

        for row in reader:
            icebergs.append(row)

    return {
        "status": "success",
        "count": len(icebergs),
        "icebergs": icebergs
    }


# ============================================================
# ICEBERG TRAJECTORY PREDICTION
# ============================================================

@app.get("/api/icebergs/{iceberg_id}/trajectory")
def get_iceberg_trajectory(iceberg_id: str):

    # --------------------------------------------------------
    # Check whether data file exists
    # --------------------------------------------------------

    if not os.path.exists(DATA_FILE):
        return {
            "status": "error",
            "message": "Iceberg data file not found"
        }

    # --------------------------------------------------------
    # Find requested iceberg
    # --------------------------------------------------------

    selected = None

    with open(
        DATA_FILE,
        "r",
        encoding="utf-8-sig"
    ) as file:

        reader = csv.DictReader(file)

        for row in reader:

            if (
                row["Iceberg"].strip().upper()
                == iceberg_id.strip().upper()
            ):
                selected = row
                break

    # --------------------------------------------------------
    # Iceberg not found
    # --------------------------------------------------------

    if selected is None:
        return {
            "status": "error",
            "message": f"Iceberg {iceberg_id} not found"
        }

    # --------------------------------------------------------
    # Read current position
    # --------------------------------------------------------

    try:

        latitude = float(
            selected["Latitude"]
        )

        longitude = float(
            selected["Longitude"]
        )

    except (ValueError, TypeError):

        return {
            "status": "error",
            "message": "Invalid latitude or longitude in iceberg data"
        }

    # ========================================================
    # POLARIS-X PHYSICS BASELINE
    # ========================================================
    #
    # IMPORTANT:
    #
    # This is currently a prototype drift model.
    #
    # We are NOT claiming this is a scientifically validated
    # iceberg forecast yet.
    #
    # Later we will replace this simple drift with:
    #
    #   Ocean Current
    #        +
    #   Wind
    #        +
    #   Sea Ice
    #        +
    #   Wave Conditions
    #        +
    #   ML Residual
    #
    # ========================================================

    # Approximate displacement every 6 hours.
    #
    # These values are ONLY for the prototype trajectory
    # visualization.

    drift_lat_per_6h = 0.015
    drift_lon_per_6h = 0.030

    # Forecast horizon

    forecast_hours = [
        0,
        6,
        12,
        24,
        48,
        72
    ]

    trajectory = []

    # --------------------------------------------------------
    # Generate predicted positions
    # --------------------------------------------------------

    for hour in forecast_hours:

        # Number of six-hour intervals

        steps = hour / 6

        # Predicted latitude

        predicted_latitude = (
            latitude
            + drift_lat_per_6h * steps
        )

        # Predicted longitude

        predicted_longitude = (
            longitude
            + drift_lon_per_6h * steps
        )

        trajectory.append({

            "hour": hour,

            "latitude": round(
                predicted_latitude,
                6
            ),

            "longitude": round(
                predicted_longitude,
                6
            )

        })

    # ========================================================
    # RETURN PREDICTION
    # ========================================================

    return {

        "status": "success",

        "iceberg": selected["Iceberg"],

        "model": "physics_baseline",

        "description": (
            "Prototype iceberg drift model. "
            "Real environmental forcing will be integrated "
            "in later versions."
        ),

        "forecast_hours": forecast_hours,

        "trajectory": trajectory

    }