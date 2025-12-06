#!/usr/bin/env python3
"""
Generate realistic ridership data for King County Metro transit prototype.

Creates a SQLite database with daily ridership data that supports:
- Multiple aggregation levels (system, route, stop, segment, trip)
- Filtering by date range, day of week, and time period
- All metrics: boardings, alightings, activity, load

Output: ridership.db (SQLite database)
"""

import sqlite3
import json
import random
import math
from datetime import datetime, timedelta, date
from collections import defaultdict
from typing import Dict, List, Tuple, Any, Optional
import os

# === CONFIGURATION ===

# Generate only September 2025 (30 days) for smaller database
GENERATE_START = date(2025, 9, 1)
GENERATE_END = date(2025, 9, 30)

# Time periods (matching your platform UI)
TIME_PERIODS = {
    "early_am": (0, 6),       # 12:00 AM - 5:59 AM
    "am_peak": (6, 9),        # 6:00 AM - 8:59 AM
    "midday": (9, 15),        # 9:00 AM - 2:59 PM
    "pm_peak": (15, 19),      # 3:00 PM - 6:59 PM
    "evening": (19, 22),      # 7:00 PM - 9:59 PM
    "night": (22, 24),        # 10:00 PM - 11:59 PM
}

# Service patterns (which service_id runs on which days)
# In reality, this comes from calendar.txt, but we'll approximate
SERVICE_PATTERNS = {
    "weekday": [0, 1, 2, 3, 4],   # Mon-Fri
    "saturday": [5],
    "sunday": [6],
}

# Route configuration with realistic base ridership
ROUTE_CONFIG = {
    "100001": {"name": "1", "base_daily": 3500, "type": "local"},
    "100275": {"name": "8", "base_daily": 4500, "type": "frequent"},
    "100002": {"name": "10", "base_daily": 2800, "type": "local"},
    "100009": {"name": "11", "base_daily": 3200, "type": "local"},
    "100028": {"name": "13", "base_daily": 2500, "type": "local"},
    "100039": {"name": "14", "base_daily": 3000, "type": "local"},
    "102574": {"name": "40", "base_daily": 8500, "type": "frequent"},
    "100224": {"name": "44", "base_daily": 5500, "type": "frequent"},
    "100252": {"name": "62", "base_daily": 6000, "type": "frequent"},
    "100264": {"name": "70", "base_daily": 4000, "type": "frequent"},
}

# Seasons (matching your platform UI - based on equinox/solstice dates)
# Winter: Sep 21 - Mar 20, Spring: Mar 21 - Jun 21, Summer: Jun 22 - Sep 18, Fall: Sep 19+
def get_season(current_date: date) -> str:
    """Get season name for a date."""
    month, day = current_date.month, current_date.day

    # Spring: Mar 21 - Jun 21
    if (month == 3 and day >= 21) or month in [4, 5] or (month == 6 and day <= 21):
        return "spring"
    # Summer: Jun 22 - Sep 18
    elif (month == 6 and day >= 22) or month in [7, 8] or (month == 9 and day <= 18):
        return "summer"
    # Fall: Sep 19 - Dec 20
    elif (month == 9 and day >= 19) or month in [10, 11] or (month == 12 and day <= 20):
        return "fall"
    # Winter: Dec 21 - Mar 20
    else:
        return "winter"

# Holidays and special dates (reduced ridership)
HOLIDAYS = {
    # 2024
    date(2024, 12, 24): 0.4,   # Christmas Eve
    date(2024, 12, 25): 0.2,   # Christmas Day
    date(2024, 12, 26): 0.5,   # Day after Christmas
    date(2024, 12, 31): 0.5,   # New Year's Eve
    # 2025
    date(2025, 1, 1): 0.25,    # New Year's Day
    date(2025, 1, 20): 0.7,    # MLK Day
    date(2025, 2, 17): 0.7,    # Presidents Day
    date(2025, 5, 26): 0.6,    # Memorial Day
    date(2025, 7, 4): 0.3,     # Independence Day
    date(2025, 9, 1): 0.6,     # Labor Day
    date(2025, 11, 27): 0.35,  # Thanksgiving
    date(2025, 11, 28): 0.5,   # Day after Thanksgiving
}

# ============================================================================
# DEMO-WORTHY SEASONAL PATTERNS
# These create interesting stories for showing the platform's power:
#
# Route 40: Major crowding increase in Fall (new Amazon campus, back to school)
# Route 44: U-District route - dramatic summer drop, Fall overcrowding
# Route 62: Steady growth throughout year, PM peak gets progressively worse
# Route 8: Capitol Hill gentrification - crowding increases each season
# Route 70: Eastlake/SLU growth - noticeable Spring-to-Fall increase
# ============================================================================

ROUTE_SEASONAL_PATTERNS = {
    # Route 40 (Ballard-Fremont-Downtown): Big Fall increase - "new development story"
    "102574": {
        "winter": {"base": 1.0, "load": 1.0},
        "spring": {"base": 1.05, "load": 1.1},
        "summer": {"base": 0.85, "load": 0.9},
        "fall": {"base": 1.25, "load": 1.4},  # Significant crowding increase!
    },
    # Route 44 (Ballard-U District): Dramatic summer drop, Fall overcrowding
    "100224": {
        "winter": {"base": 1.0, "load": 1.0},
        "spring": {"base": 1.1, "load": 1.15},
        "summer": {"base": 0.65, "load": 0.7},   # UW students gone
        "fall": {"base": 1.3, "load": 1.5},      # Back to school crush!
    },
    # Route 62 (Fremont-Roosevelt-U District): Progressive PM peak crowding
    "100252": {
        "winter": {"base": 1.0, "load": 1.0},
        "spring": {"base": 1.08, "load": 1.15},
        "summer": {"base": 0.88, "load": 0.95},
        "fall": {"base": 1.15, "load": 1.35},    # PM segments get packed
    },
    # Route 8 (Capitol Hill-MLK): Steady growth - gentrification story
    "100275": {
        "winter": {"base": 1.0, "load": 1.0},
        "spring": {"base": 1.1, "load": 1.12},
        "summer": {"base": 1.05, "load": 1.08},  # Less summer drop (neighborhood route)
        "fall": {"base": 1.2, "load": 1.25},
    },
    # Route 70 (Eastlake-SLU-Downtown): Tech campus growth
    "100264": {
        "winter": {"base": 1.0, "load": 1.0},
        "spring": {"base": 1.15, "load": 1.2},   # Spring hiring season
        "summer": {"base": 1.0, "load": 1.05},
        "fall": {"base": 1.25, "load": 1.35},    # Return to office push
    },
    # Route 1 (Kinnear-Downtown): Stable local route
    "100001": {
        "winter": {"base": 1.0, "load": 1.0},
        "spring": {"base": 1.02, "load": 1.0},
        "summer": {"base": 0.9, "load": 0.92},
        "fall": {"base": 1.05, "load": 1.08},
    },
    # Route 10 (Capitol Hill-Downtown): Moderate seasonal variation
    "100002": {
        "winter": {"base": 1.0, "load": 1.0},
        "spring": {"base": 1.05, "load": 1.05},
        "summer": {"base": 0.85, "load": 0.88},
        "fall": {"base": 1.1, "load": 1.15},
    },
    # Route 11 (Madison Park-Downtown): Residential, less variation
    "100009": {
        "winter": {"base": 1.0, "load": 1.0},
        "spring": {"base": 1.0, "load": 1.02},
        "summer": {"base": 0.88, "load": 0.9},
        "fall": {"base": 1.05, "load": 1.08},
    },
    # Route 13 (Seattle Pacific-Downtown): School-influenced
    "100028": {
        "winter": {"base": 1.0, "load": 1.0},
        "spring": {"base": 1.05, "load": 1.05},
        "summer": {"base": 0.7, "load": 0.75},   # Big summer drop (SPU)
        "fall": {"base": 1.15, "load": 1.2},
    },
    # Route 14 (Mt Baker-Downtown): Stable commuter route
    "100039": {
        "winter": {"base": 1.0, "load": 1.0},
        "spring": {"base": 1.03, "load": 1.05},
        "summer": {"base": 0.92, "load": 0.95},
        "fall": {"base": 1.08, "load": 1.12},
    },
}

def get_seasonal_multiplier(current_date: date, route_id: str = None) -> Tuple[float, float]:
    """
    Get ridership and load multipliers based on season and route.

    Returns (ridership_multiplier, load_multiplier)

    Different routes have different seasonal patterns to create
    interesting demo stories about crowding changes.
    """
    # Check for specific holidays first
    if current_date in HOLIDAYS:
        holiday_mult = HOLIDAYS[current_date]
        return (holiday_mult, holiday_mult)

    season = get_season(current_date)

    # Get route-specific pattern or use default
    if route_id and route_id in ROUTE_SEASONAL_PATTERNS:
        pattern = ROUTE_SEASONAL_PATTERNS[route_id][season]
        base_mult = pattern["base"] * random.uniform(0.95, 1.05)
        load_mult = pattern["load"] * random.uniform(0.95, 1.05)
    else:
        # Default seasonal pattern
        default_patterns = {
            "winter": (1.0, 1.0),
            "spring": (1.05, 1.08),
            "summer": (0.85, 0.9),
            "fall": (1.1, 1.15),
        }
        base, load = default_patterns[season]
        base_mult = base * random.uniform(0.95, 1.05)
        load_mult = load * random.uniform(0.95, 1.05)

    return (base_mult, load_mult)


# Location-based multipliers
DOWNTOWN_BOUNDS = {"min_lat": 47.598, "max_lat": 47.615, "min_lon": -122.345, "max_lon": -122.325}
CAPITOL_HILL_BOUNDS = {"min_lat": 47.615, "max_lat": 47.630, "min_lon": -122.330, "max_lon": -122.310}
UDISTRICT_BOUNDS = {"min_lat": 47.655, "max_lat": 47.670, "min_lon": -122.320, "max_lon": -122.300}


# === DATABASE SCHEMA ===

SCHEMA = """
-- Core tables for ridership data

-- Daily ridership at the trip level
CREATE TABLE IF NOT EXISTS trip_ridership (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,                    -- YYYY-MM-DD
    day_of_week INTEGER NOT NULL,          -- 0=Mon, 6=Sun
    trip_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    direction_id TEXT NOT NULL,
    start_time TEXT NOT NULL,              -- HH:MM:SS
    time_period TEXT NOT NULL,             -- early_morning, am_peak, etc.
    total_boardings INTEGER NOT NULL,
    total_alightings INTEGER NOT NULL,
    max_load INTEGER NOT NULL,
    UNIQUE(date, trip_id)
);

-- Daily ridership at the stop level (per trip)
CREATE TABLE IF NOT EXISTS stop_ridership (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    trip_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    stop_id TEXT NOT NULL,
    stop_sequence INTEGER NOT NULL,
    boardings INTEGER NOT NULL,
    alightings INTEGER NOT NULL,
    load_after INTEGER NOT NULL,           -- passengers on board after this stop
    UNIQUE(date, trip_id, stop_id)
);

-- Static stop information (denormalized for convenience)
CREATE TABLE IF NOT EXISTS stops (
    stop_id TEXT PRIMARY KEY,
    stop_name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL
);

-- Static route information
CREATE TABLE IF NOT EXISTS routes (
    route_id TEXT PRIMARY KEY,
    route_name TEXT NOT NULL,
    route_type TEXT NOT NULL               -- local, frequent, etc.
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_trip_ridership_date ON trip_ridership(date);
CREATE INDEX IF NOT EXISTS idx_trip_ridership_route ON trip_ridership(route_id);
CREATE INDEX IF NOT EXISTS idx_trip_ridership_dow ON trip_ridership(day_of_week);
CREATE INDEX IF NOT EXISTS idx_trip_ridership_period ON trip_ridership(time_period);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_date ON stop_ridership(date);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_route ON stop_ridership(route_id);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_stop ON stop_ridership(stop_id);

-- Precomputed daily aggregates for faster queries
CREATE TABLE IF NOT EXISTS daily_route_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    route_id TEXT NOT NULL,
    trip_count INTEGER NOT NULL,
    total_boardings INTEGER NOT NULL,
    total_alightings INTEGER NOT NULL,
    avg_load REAL NOT NULL,
    max_load INTEGER NOT NULL,
    UNIQUE(date, route_id)
);

CREATE TABLE IF NOT EXISTS daily_system_summary (
    date TEXT PRIMARY KEY,
    day_of_week INTEGER NOT NULL,
    route_count INTEGER NOT NULL,
    trip_count INTEGER NOT NULL,
    total_boardings INTEGER NOT NULL,
    total_alightings INTEGER NOT NULL,
    avg_load REAL NOT NULL,
    max_load INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_route_summary_date ON daily_route_summary(date);
CREATE INDEX IF NOT EXISTS idx_daily_route_summary_dow ON daily_route_summary(day_of_week);
"""


# === HELPER FUNCTIONS ===

def parse_time(time_str: str) -> Tuple[int, int, int]:
    """Parse GTFS time string to hours, minutes, seconds."""
    parts = time_str.split(":")
    return int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0


def time_to_hour(time_str: str) -> int:
    """Convert time string to hour (handles >24:00)."""
    hours, _, _ = parse_time(time_str)
    return hours % 24


def get_time_period(time_str: str) -> str:
    """Get time period name for a given time."""
    hour = time_to_hour(time_str)
    for period, (start, end) in TIME_PERIODS.items():
        if start <= hour < end:
            return period
    return "night"


def get_time_multiplier(time_str: str, direction_id: str) -> float:
    """Get ridership multiplier based on time and direction."""
    hour = time_to_hour(time_str)
    is_inbound = direction_id == "1"

    if 6 <= hour < 9:  # AM Peak (6am - 9am)
        base = 2.2
        direction_bonus = 0.8 if is_inbound else -0.4
    elif 9 <= hour < 15:  # Midday (9am - 3pm)
        base = 0.9
        direction_bonus = 0.1
    elif 15 <= hour < 19:  # PM Peak (3pm - 7pm)
        base = 2.0
        direction_bonus = 0.7 if not is_inbound else -0.3
    elif 19 <= hour < 22:  # Evening (7pm - 10pm)
        base = 0.6
        direction_bonus = 0.0
    elif 22 <= hour or hour < 6:  # Night (10pm - 12am) + Early AM (12am - 6am)
        base = 0.15
        direction_bonus = 0.0
    else:  # Fallback
        base = 0.4
        direction_bonus = 0.0

    return max(0.1, base + direction_bonus)


def get_day_multiplier(day_of_week: int) -> float:
    """Get ridership multiplier based on day of week."""
    if day_of_week < 5:  # Weekday
        if day_of_week in [1, 2, 3]:  # Tue-Thu
            return random.uniform(1.0, 1.05)
        return random.uniform(0.92, 0.98)  # Mon, Fri
    elif day_of_week == 5:  # Saturday
        return random.uniform(0.55, 0.65)
    else:  # Sunday
        return random.uniform(0.38, 0.45)


def get_stop_importance(lat: float, lon: float) -> float:
    """Get stop importance multiplier based on location."""
    if (DOWNTOWN_BOUNDS["min_lat"] <= lat <= DOWNTOWN_BOUNDS["max_lat"] and
        DOWNTOWN_BOUNDS["min_lon"] <= lon <= DOWNTOWN_BOUNDS["max_lon"]):
        return random.uniform(3.0, 8.0)

    if (CAPITOL_HILL_BOUNDS["min_lat"] <= lat <= CAPITOL_HILL_BOUNDS["max_lat"] and
        CAPITOL_HILL_BOUNDS["min_lon"] <= lon <= CAPITOL_HILL_BOUNDS["max_lon"]):
        return random.uniform(1.5, 3.0)

    if (UDISTRICT_BOUNDS["min_lat"] <= lat <= UDISTRICT_BOUNDS["max_lat"] and
        UDISTRICT_BOUNDS["min_lon"] <= lon <= UDISTRICT_BOUNDS["max_lon"]):
        return random.uniform(1.8, 3.5)

    return random.uniform(0.3, 1.2)


def generate_stop_ridership(
    stops: List[Dict],
    trip_total: int,
    direction_id: str,
    time_str: str,
    load_mult: float = 1.0
) -> Tuple[List[Dict], int]:
    """
    Generate boardings/alightings/load for each stop on a trip.

    Args:
        stops: List of stop dictionaries
        trip_total: Total expected boardings for the trip
        direction_id: "0" for outbound, "1" for inbound
        time_str: Trip start time
        load_mult: Seasonal load multiplier (>1 = higher loads due to slower alighting)

    Returns (stop_data_list, max_load).
    """
    n_stops = len(stops)
    if n_stops == 0:
        return [], 0

    # Calculate importance weights
    weights = [get_stop_importance(s.get("lat", 0), s.get("lon", 0)) for s in stops]
    total_weight = sum(weights) or 1
    weights = [w / total_weight for w in weights]

    # Boarding/alighting distribution based on time and direction
    hour = time_to_hour(time_str)
    is_am_peak = 6 <= hour < 9
    is_pm_peak = 15 <= hour < 19  # Updated to match new PM peak (3-7pm)

    if (direction_id == "1" and is_am_peak) or (direction_id == "0" and is_pm_peak):
        boarding_curve = [max(0, 1.0 - (i / n_stops) ** 0.7) for i in range(n_stops)]
        alighting_curve = [(i / n_stops) ** 1.5 for i in range(n_stops)]
    elif (direction_id == "0" and is_am_peak) or (direction_id == "1" and is_pm_peak):
        boarding_curve = [max(0, 0.6 - (i / n_stops) ** 0.5) for i in range(n_stops)]
        alighting_curve = [(i / n_stops) ** 1.2 for i in range(n_stops)]
    else:
        boarding_curve = [1.0 - abs(i / n_stops - 0.4) for i in range(n_stops)]
        alighting_curve = [abs(i / n_stops - 0.3) for i in range(n_stops)]

    boarding_weights = [w * b for w, b in zip(weights, boarding_curve)]
    alighting_weights = [w * a for w, a in zip(weights, alighting_curve)]

    total_bw = sum(boarding_weights) or 1
    total_aw = sum(alighting_weights) or 1
    boarding_weights = [bw / total_bw for bw in boarding_weights]
    alighting_weights = [aw / total_aw for aw in alighting_weights]

    # Generate counts
    total_boardings = int(trip_total * random.uniform(0.9, 1.1))

    boardings = []
    remaining = total_boardings
    for i, weight in enumerate(boarding_weights[:-1]):
        count = int(remaining * weight * random.uniform(0.7, 1.3))
        count = max(0, min(count, remaining))
        boardings.append(count)
        remaining -= count
    boardings.append(max(0, remaining))

    if boardings[0] == 0 and total_boardings > 0:
        boardings[0] = max(1, int(total_boardings * 0.1))
    if n_stops > 1:
        boardings[-1] = 0

    # Calculate alightings - load_mult affects how quickly people alight
    # Higher load_mult = slower alighting = higher loads (crowding)
    alightings = []
    current_load = 0
    max_load = 0

    # Adjust alighting rate based on load multiplier
    # load_mult > 1 means slower alighting (more crowded)
    alight_rate_factor = 1.0 / load_mult  # Higher load_mult = lower alight rate

    for i in range(n_stops):
        current_load += boardings[i]
        max_load = max(max_load, current_load)

        if i == n_stops - 1:
            alightings.append(current_load)
            current_load = 0
        elif i == 0:
            alightings.append(0)
        else:
            # Reduce alighting when load_mult is high (creates crowding)
            target = int(sum(boardings) * alighting_weights[i] * alight_rate_factor * random.uniform(0.6, 1.4))
            actual = min(target, int(current_load * 0.8 * alight_rate_factor))
            actual = max(0, actual)
            alightings.append(actual)
            current_load -= actual

    # Build result
    result = []
    running_load = 0

    for i, stop in enumerate(stops):
        running_load += boardings[i] - alightings[i]
        running_load = max(0, running_load)

        result.append({
            "stop_id": stop["id"],
            "stop_sequence": i + 1,
            "boardings": boardings[i],
            "alightings": alightings[i],
            "load_after": running_load
        })

    return result, max_load


# === DATA LOADING ===

def load_gtfs_data(
    route_trips_path: str,
    trip_stop_times_path: str,
    target_routes: List[str]
) -> Tuple[Dict, Dict, Dict]:
    """Load GTFS-derived data files."""
    print(f"Loading {route_trips_path}...")
    with open(route_trips_path, 'r', encoding='utf-8') as f:
        all_route_trips = json.load(f)

    print(f"Loading {trip_stop_times_path}...")
    with open(trip_stop_times_path, 'r', encoding='utf-8') as f:
        all_trip_stop_times = json.load(f)

    # Filter to target routes
    route_trips = {k: v for k, v in all_route_trips.items() if k in target_routes}

    # Get trip IDs for target routes
    target_trip_ids = set()
    for trips in route_trips.values():
        for trip in trips:
            target_trip_ids.add(trip["trip_id"])

    trip_stop_times = {k: v for k, v in all_trip_stop_times.items() if k in target_trip_ids}

    # Extract unique stops
    stops_info = {}
    for trip_id, stops in trip_stop_times.items():
        for stop in stops:
            if stop["id"] not in stops_info:
                stops_info[stop["id"]] = {
                    "stop_name": stop["n"],
                    "lat": stop["lat"],
                    "lon": stop["lon"]
                }

    print(f"  Loaded {len(route_trips)} routes, {len(trip_stop_times)} trips, {len(stops_info)} stops")

    return route_trips, trip_stop_times, stops_info


# === DATABASE OPERATIONS ===

def create_database(db_path: str) -> sqlite3.Connection:
    """Create database and schema."""
    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def insert_static_data(
    conn: sqlite3.Connection,
    stops_info: Dict,
    route_config: Dict
):
    """Insert static stop and route information."""
    cursor = conn.cursor()

    # Insert stops
    for stop_id, info in stops_info.items():
        cursor.execute(
            "INSERT OR REPLACE INTO stops (stop_id, stop_name, lat, lon) VALUES (?, ?, ?, ?)",
            (stop_id, info["stop_name"], info["lat"], info["lon"])
        )

    # Insert routes
    for route_id, config in route_config.items():
        cursor.execute(
            "INSERT OR REPLACE INTO routes (route_id, route_name, route_type) VALUES (?, ?, ?)",
            (route_id, config["name"], config["type"])
        )

    conn.commit()
    print(f"  Inserted {len(stops_info)} stops, {len(route_config)} routes")


def generate_and_insert_daily_data(
    conn: sqlite3.Connection,
    current_date: date,
    route_trips: Dict,
    trip_stop_times: Dict,
    route_config: Dict
):
    """Generate and insert ridership data for a single day."""
    cursor = conn.cursor()
    day_of_week = current_date.weekday()
    date_str = current_date.isoformat()

    day_mult = get_day_multiplier(day_of_week)

    # Track daily aggregates
    route_summaries = {}
    system_totals = {
        "trip_count": 0,
        "total_boardings": 0,
        "total_alightings": 0,
        "total_load": 0,
        "load_count": 0,
        "max_load": 0
    }

    for route_id, trips in route_trips.items():
        if route_id not in route_config:
            continue

        config = route_config[route_id]
        n_trips = len(trips)
        if n_trips == 0:
            continue

        # Get route-specific seasonal multipliers (creates interesting demo patterns)
        seasonal_mult, load_seasonal_mult = get_seasonal_multiplier(current_date, route_id)

        base_per_trip = config["base_daily"] / n_trips
        if config["type"] == "frequent":
            base_per_trip *= 1.15

        route_summary = {
            "trip_count": 0,
            "total_boardings": 0,
            "total_alightings": 0,
            "total_load": 0,
            "load_count": 0,
            "max_load": 0
        }

        for trip in trips:
            trip_id = trip["trip_id"]
            start_time = trip.get("start_time", "12:00:00")
            direction_id = trip.get("direction_id", "0")
            time_period = get_time_period(start_time)

            # Calculate trip ridership with route-specific seasonal pattern
            time_mult = get_time_multiplier(start_time, direction_id)
            trip_ridership = int(base_per_trip * time_mult * day_mult * seasonal_mult * random.uniform(0.85, 1.15))
            trip_ridership = max(1, trip_ridership)

            # Generate stop-level data with load seasonal multiplier for crowding patterns
            stops = trip_stop_times.get(trip_id, [])
            stop_data, max_load = generate_stop_ridership(
                stops, trip_ridership, direction_id, start_time, load_seasonal_mult
            )

            # Calculate actuals from stop data
            total_boardings = sum(s["boardings"] for s in stop_data)
            total_alightings = sum(s["alightings"] for s in stop_data)

            # Insert trip ridership
            cursor.execute("""
                INSERT INTO trip_ridership
                (date, day_of_week, trip_id, route_id, direction_id, start_time, time_period,
                 total_boardings, total_alightings, max_load)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (date_str, day_of_week, trip_id, route_id, direction_id, start_time, time_period,
                  total_boardings, total_alightings, max_load))

            # Insert stop ridership
            for stop in stop_data:
                cursor.execute("""
                    INSERT INTO stop_ridership
                    (date, trip_id, route_id, stop_id, stop_sequence, boardings, alightings, load_after)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (date_str, trip_id, route_id, stop["stop_id"], stop["stop_sequence"],
                      stop["boardings"], stop["alightings"], stop["load_after"]))

            # Update route summary
            route_summary["trip_count"] += 1
            route_summary["total_boardings"] += total_boardings
            route_summary["total_alightings"] += total_alightings
            route_summary["max_load"] = max(route_summary["max_load"], max_load)
            for stop in stop_data:
                route_summary["total_load"] += stop["load_after"]
                route_summary["load_count"] += 1

        # Store route summary
        route_summaries[route_id] = route_summary

        # Update system totals
        system_totals["trip_count"] += route_summary["trip_count"]
        system_totals["total_boardings"] += route_summary["total_boardings"]
        system_totals["total_alightings"] += route_summary["total_alightings"]
        system_totals["total_load"] += route_summary["total_load"]
        system_totals["load_count"] += route_summary["load_count"]
        system_totals["max_load"] = max(system_totals["max_load"], route_summary["max_load"])

    # Insert daily route summaries
    for route_id, summary in route_summaries.items():
        avg_load = summary["total_load"] / summary["load_count"] if summary["load_count"] > 0 else 0
        cursor.execute("""
            INSERT INTO daily_route_summary
            (date, day_of_week, route_id, trip_count, total_boardings, total_alightings, avg_load, max_load)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (date_str, day_of_week, route_id, summary["trip_count"], summary["total_boardings"],
              summary["total_alightings"], avg_load, summary["max_load"]))

    # Insert daily system summary
    avg_load = system_totals["total_load"] / system_totals["load_count"] if system_totals["load_count"] > 0 else 0
    cursor.execute("""
        INSERT INTO daily_system_summary
        (date, day_of_week, route_count, trip_count, total_boardings, total_alightings, avg_load, max_load)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (date_str, day_of_week, len(route_summaries), system_totals["trip_count"],
          system_totals["total_boardings"], system_totals["total_alightings"],
          avg_load, system_totals["max_load"]))

    conn.commit()
    return system_totals["total_boardings"]


# === MAIN ===

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generate ridership SQLite database")
    parser.add_argument("--route-trips", default="public/data/route_trips.json")
    parser.add_argument("--stop-times", default="public/data/trip_stop_times.json")
    parser.add_argument("--output", default="public/data/ridership.db")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--start-date", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", help="End date (YYYY-MM-DD)")

    args = parser.parse_args()
    random.seed(args.seed)

    # Determine date range
    start_date = datetime.strptime(args.start_date, "%Y-%m-%d").date() if args.start_date else GENERATE_START
    end_date = datetime.strptime(args.end_date, "%Y-%m-%d").date() if args.end_date else GENERATE_END

    print("=" * 60)
    print("Ridership Database Generator")
    print("=" * 60)
    print(f"\nDate range: {start_date} to {end_date}")
    print(f"Output: {args.output}\n")

    # Load data
    target_routes = list(ROUTE_CONFIG.keys())
    route_trips, trip_stop_times, stops_info = load_gtfs_data(
        args.route_trips, args.stop_times, target_routes
    )

    # Create database
    print("\nCreating database...")
    conn = create_database(args.output)

    # Insert static data
    print("Inserting static data...")
    insert_static_data(conn, stops_info, ROUTE_CONFIG)

    # Generate daily data
    print("\nGenerating daily ridership data...")
    current = start_date
    total_days = (end_date - start_date).days + 1
    day_num = 0
    total_boardings = 0

    while current <= end_date:
        day_num += 1
        boardings = generate_and_insert_daily_data(
            conn, current, route_trips, trip_stop_times, ROUTE_CONFIG
        )
        total_boardings += boardings

        # Report progress weekly or on last day
        if day_num % 7 == 0 or current == end_date:
            pct = (day_num / total_days) * 100
            avg_daily = total_boardings / day_num
            print(f"  Day {day_num:3d}/{total_days} ({pct:5.1f}%) | {current} | {boardings:,} boardings | Avg: {avg_daily:,.0f}/day")

        current += timedelta(days=1)

    # Final stats
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM trip_ridership")
    trip_records = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM stop_ridership")
    stop_records = cursor.fetchone()[0]

    # Get monthly breakdown
    cursor.execute("""
        SELECT
            strftime('%Y-%m', date) as month,
            SUM(total_boardings) as boardings,
            COUNT(DISTINCT date) as days
        FROM daily_system_summary
        GROUP BY month
        ORDER BY month
    """)
    monthly_stats = cursor.fetchall()

    conn.close()

    # Get file size
    file_size = os.path.getsize(args.output) / (1024 * 1024)

    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Date range: {start_date} to {end_date}")
    print(f"Days generated: {total_days}")
    print(f"Total boardings: {total_boardings:,}")
    print(f"Average daily: {total_boardings / total_days:,.0f}")
    print(f"Trip records: {trip_records:,}")
    print(f"Stop records: {stop_records:,}")
    print(f"Database size: {file_size:.1f} MB")

    print("\n" + "-" * 40)
    print("Monthly Breakdown")
    print("-" * 40)
    for month, boardings, days in monthly_stats:
        avg = boardings / days if days > 0 else 0
        print(f"  {month}: {boardings:>10,} boardings ({avg:>6,.0f}/day)")

    print(f"\nDone! Database saved to {args.output}")


if __name__ == "__main__":
    main()
