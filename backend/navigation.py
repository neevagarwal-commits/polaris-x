from fastapi import APIRouter, Query
import xarray as xr
import numpy as np
import pandas as pd
import heapq
import math
from pathlib import Path


router = APIRouter(
    prefix="/api/navigation",
    tags=["Navigation"],
)


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

SEA_ICE_DIR = BASE_DIR / "data" / "sea_ice_l4"
ICEBERG_FILE = BASE_DIR / "data" / "icebergs.csv"


# ============================================================
# CONFIGURATION
# ============================================================

GRID_STEP = 1.0

ICE_WEIGHT = 8.0
ICEBERG_WEIGHT = 12.0

HIGH_RISK_THRESHOLD = 0.85

ICEBERG_DANGER_RADIUS_KM = 150.0


# ============================================================
# GEOGRAPHIC HELPERS
# ============================================================

def haversine_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:

    earth_radius = 6371.0

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        +
        math.cos(lat1_rad)
        * math.cos(lat2_rad)
        * math.sin(dlon / 2) ** 2
    )

    return (
        earth_radius
        * 2
        * math.atan2(
            math.sqrt(a),
            math.sqrt(1 - a),
        )
    )


def normalize_longitude(lon: float) -> float:

    while lon > 180:
        lon -= 360

    while lon < -180:
        lon += 360

    return lon


# ============================================================
# LOAD LATEST SEA-ICE DATA
# ============================================================

def find_latest_sea_ice_file():

    files = list(
        SEA_ICE_DIR.glob("*.nc")
    )

    if not files:
        return None

    return sorted(files)[-1]


def load_sea_ice_grid():

    dataset_path = find_latest_sea_ice_file()

    if dataset_path is None:
        raise FileNotFoundError(
            "No Antarctic L4 sea-ice NetCDF file found."
        )

    ds = xr.open_dataset(
        dataset_path
    )

    ice = ds["ice_conc"].isel(
        time=0
    ).values.astype(float)

    latitudes = ds["latitude"].values.astype(float)
    longitudes = ds["longitude"].values.astype(float)

    ds.close()

    return (
        dataset_path,
        latitudes,
        longitudes,
        ice,
    )


# ============================================================
# BUILD 1-DEGREE RISK GRID
# ============================================================

def build_risk_grid():

    (
        dataset_path,
        latitudes,
        longitudes,
        ice,
    ) = load_sea_ice_grid()

    iceberg_positions = load_icebergs()

    grid = {}

    # --------------------------------------------------------
    # Sample every 1 degree.
    # --------------------------------------------------------

    lat_indices = np.arange(
        0,
        len(latitudes),
        max(
            1,
            int(
                round(
                    GRID_STEP
                    /
                    abs(
                        latitudes[1]
                        - latitudes[0]
                    )
                )
            )
        ),
    )

    lon_indices = np.arange(
        0,
        len(longitudes),
        max(
            1,
            int(
                round(
                    GRID_STEP
                    /
                    abs(
                        longitudes[1]
                        - longitudes[0]
                    )
                )
            ),
        ),
    )

    for lat_index in lat_indices:

        latitude = float(
            latitudes[lat_index]
        )

        if latitude > -45:
            continue

        for lon_index in lon_indices:

            longitude = float(
                longitudes[lon_index]
            )

            value = float(
                ice[
                    lat_index,
                    lon_index
                ]
            )

            # ------------------------------------------------
            # Missing L4 values are treated as high uncertainty
            # rather than automatically being called safe.
            # ------------------------------------------------

            if not np.isfinite(value):

                sea_ice_risk = 1.0

            else:

                sea_ice_risk = max(
                    0.0,
                    min(
                        1.0,
                        value / 100.0,
                    ),
                )

            iceberg_risk = iceberg_risk_at(
                latitude,
                longitude,
                iceberg_positions,
            )

            total_risk = min(
                1.0,
                (
                    0.65 * sea_ice_risk
                    +
                    0.35 * iceberg_risk
                ),
            )

            key = grid_key(
                latitude,
                longitude,
            )

            grid[key] = {
                "latitude": latitude,
                "longitude": longitude,
                "sea_ice_risk": sea_ice_risk,
                "iceberg_risk": iceberg_risk,
                "total_risk": total_risk,
            }

    return (
        dataset_path,
        grid,
    )


# ============================================================
# GRID KEY
# ============================================================

def grid_key(
    latitude: float,
    longitude: float,
):

    lat = round(
        latitude
        /
        GRID_STEP
    ) * GRID_STEP

    lon = round(
        longitude
        /
        GRID_STEP
    ) * GRID_STEP

    lon = normalize_longitude(
        lon
    )

    return (
        round(lat, 2),
        round(lon, 2),
    )


# ============================================================
# ICEBERG DATA
# ============================================================

def load_icebergs():

    if not ICEBERG_FILE.exists():

        return []

    dataframe = pd.read_csv(
        ICEBERG_FILE
    )

    icebergs = []

    for _, row in dataframe.iterrows():

        try:

            latitude = float(
                row["Latitude"]
            )

            longitude = float(
                row["Longitude"]
            )

            icebergs.append(
                {
                    "id": str(
                        row["Iceberg"]
                    ),
                    "latitude": latitude,
                    "longitude": longitude,
                }
            )

        except Exception:

            continue

    return icebergs


# ============================================================
# ICEBERG RISK
# ============================================================

def iceberg_risk_at(
    latitude,
    longitude,
    icebergs,
):

    maximum_risk = 0.0

    for iceberg in icebergs:

        distance = haversine_km(
            latitude,
            longitude,
            iceberg["latitude"],
            iceberg["longitude"],
        )

        if (
            distance
            >= ICEBERG_DANGER_RADIUS_KM
        ):
            continue

        # 150 km -> 0 risk
        # 0 km -> 1 risk

        risk = max(
            0.0,
            1.0
            -
            (
                distance
                /
                ICEBERG_DANGER_RADIUS_KM
            ),
        )

        maximum_risk = max(
            maximum_risk,
            risk,
        )

    return maximum_risk


# ============================================================
# NEIGHBOURS
# ============================================================

def get_neighbors(
    node,
):

    lat, lon = node

    candidates = [

        (
            lat + GRID_STEP,
            lon,
        ),

        (
            lat - GRID_STEP,
            lon,
        ),

        (
            lat,
            lon + GRID_STEP,
        ),

        (
            lat,
            lon - GRID_STEP,
        ),

        (
            lat + GRID_STEP,
            lon + GRID_STEP,
        ),

        (
            lat + GRID_STEP,
            lon - GRID_STEP,
        ),

        (
            lat - GRID_STEP,
            lon + GRID_STEP,
        ),

        (
            lat - GRID_STEP,
            lon - GRID_STEP,
        ),
    ]

    result = []

    for candidate_lat, candidate_lon in candidates:

        if candidate_lat < -85:
            continue

        if candidate_lat > -45:
            continue

        candidate_lon = normalize_longitude(
            candidate_lon
        )

        result.append(
            grid_key(
                candidate_lat,
                candidate_lon,
            )
        )

    return result


# ============================================================
# A* HEURISTIC
# ============================================================

def heuristic(
    current,
    goal,
):

    return haversine_km(
        current[0],
        current[1],
        goal[0],
        goal[1],
    )


# ============================================================
# A* NAVIGATION
# ============================================================

def astar(
    grid,
    start,
    goal,
):

    start_node = grid_key(
        start[0],
        start[1],
    )

    goal_node = grid_key(
        goal[0],
        goal[1],
    )

    # --------------------------------------------------------
    # Make sure start/goal exist.
    # --------------------------------------------------------

    if start_node not in grid:
        raise ValueError(
            f"Start position {start_node} "
            "is outside the navigation grid."
        )

    if goal_node not in grid:
        raise ValueError(
            f"Destination {goal_node} "
            "is outside the navigation grid."
        )

    open_set = []

    heapq.heappush(
        open_set,
        (
            0.0,
            start_node,
        ),
    )

    came_from = {}

    cost_so_far = {
        start_node: 0.0
    }

    visited = set()

    while open_set:

        _, current = heapq.heappop(
            open_set
        )

        if current in visited:
            continue

        visited.add(current)

        if current == goal_node:

            return reconstruct_path(
                came_from,
                current,
            )

        for neighbor in get_neighbors(
            current
        ):

            if neighbor not in grid:
                continue

            cell = grid[
                neighbor
            ]

            distance = haversine_km(
                current[0],
                current[1],
                neighbor[0],
                neighbor[1],
            )

            risk = cell[
                "total_risk"
            ]

            # ------------------------------------------------
            # Navigation cost
            #
            # Distance is always considered.
            # Risk dramatically increases cost.
            # ------------------------------------------------

            risk_penalty = (
                1.0
                +
                ICE_WEIGHT
                * risk
            )

            if (
                cell[
                    "iceberg_risk"
                ]
                >= 0.9
            ):
                risk_penalty += (
                    ICEBERG_WEIGHT
                )

            movement_cost = (
                distance
                *
                risk_penalty
            )

            new_cost = (
                cost_so_far[current]
                +
                movement_cost
            )

            if (
                neighbor not in cost_so_far
                or
                new_cost
                <
                cost_so_far[neighbor]
            ):

                cost_so_far[
                    neighbor
                ] = new_cost

                priority = (
                    new_cost
                    +
                    heuristic(
                        neighbor,
                        goal_node,
                    )
                )

                heapq.heappush(
                    open_set,
                    (
                        priority,
                        neighbor,
                    ),
                )

                came_from[
                    neighbor
                ] = current

    return None


# ============================================================
# RECONSTRUCT PATH
# ============================================================

def reconstruct_path(
    came_from,
    current,
):

    path = [
        current
    ]

    while current in came_from:

        current = came_from[
            current
        ]

        path.append(
            current
        )

    path.reverse()

    return path


# ============================================================
# ROUTE STATISTICS
# ============================================================

def calculate_route_statistics(
    path,
    grid,
):

    if not path:

        return {
            "distance_km": 0,
            "average_risk": 0,
            "maximum_risk": 0,
            "high_risk_cells": 0,
        }

    total_distance = 0.0

    risks = []

    high_risk_cells = 0

    for index in range(
        len(path)
    ):

        node = path[index]

        if node in grid:

            risk = grid[
                node
            ][
                "total_risk"
            ]

            risks.append(
                risk
            )

            if (
                risk
                >= HIGH_RISK_THRESHOLD
            ):
                high_risk_cells += 1

        if index == 0:
            continue

        previous = path[
            index - 1
        ]

        total_distance += (
            haversine_km(
                previous[0],
                previous[1],
                node[0],
                node[1],
            )
        )

    average_risk = (
        sum(risks)
        /
        len(risks)
        if risks
        else 0.0
    )

    maximum_risk = (
        max(risks)
        if risks
        else 0.0
    )

    return {
        "distance_km": round(
            total_distance,
            2,
        ),
        "average_risk": round(
            average_risk,
            4,
        ),
        "maximum_risk": round(
            maximum_risk,
            4,
        ),
        "high_risk_cells": (
            high_risk_cells
        ),
    }


# ============================================================
# ROUTE CONVERSION
# ============================================================

def path_to_route(
    path,
    grid,
):

    route = []

    for index, node in enumerate(
        path
    ):

        cell = grid.get(
            node
        )

        if cell is None:
            continue

        route.append(
            {
                "sequence": index,

                "latitude":
                    cell[
                        "latitude"
                    ],

                "longitude":
                    cell[
                        "longitude"
                    ],

                "sea_ice_risk":
                    round(
                        cell[
                            "sea_ice_risk"
                        ],
                        4,
                    ),

                "iceberg_risk":
                    round(
                        cell[
                            "iceberg_risk"
                        ],
                        4,
                    ),

                "total_risk":
                    round(
                        cell[
                            "total_risk"
                        ],
                        4,
                    ),
            }
        )

    return route


# ============================================================
# API
# ============================================================

@router.get("/plan")
def plan_navigation(
    start_lat: float = Query(
        -60.0,
        description="Starting latitude",
    ),

    start_lon: float = Query(
        -70.0,
        description="Starting longitude",
    ),

    destination_lat: float = Query(
        -65.0,
        description="Destination latitude",
    ),

    destination_lon: float = Query(
        -30.0,
        description="Destination longitude",
    ),
):

    try:

        if not (
            -85
            <= start_lat
            <= -45
        ):
            return {
                "status": "error",
                "message":
                    "Start latitude must be between -85 and -45.",
            }

        if not (
            -85
            <= destination_lat
            <= -45
        ):
            return {
                "status": "error",
                "message":
                    "Destination latitude must be between -85 and -45.",
            }

        (
            dataset_path,
            grid,
        ) = build_risk_grid()

        start = (
            start_lat,
            start_lon,
        )

        goal = (
            destination_lat,
            destination_lon,
        )

        path = astar(
            grid,
            start,
            goal,
        )

        if not path:

            return {
                "status": "no_route",
                "message":
                    "A* could not find a route.",
            }

        route = path_to_route(
            path,
            grid,
        )

        statistics = (
            calculate_route_statistics(
                path,
                grid,
            )
        )

        return {
            "status": "success",

            "engine":
                "POLARIS-X A* Navigation Engine",

            "risk_dataset":
                dataset_path.name,

            "grid_resolution_degrees":
                GRID_STEP,

            "start": {
                "latitude":
                    start_lat,

                "longitude":
                    start_lon,
            },

            "destination": {
                "latitude":
                    destination_lat,

                "longitude":
                    destination_lon,
            },

            "statistics":
                statistics,

            "route":
                route,
        }

    except Exception as exc:

        return {
            "status": "error",
            "message": str(exc),
        }