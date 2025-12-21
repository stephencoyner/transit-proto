#!/usr/bin/env python3
"""
Transit Ridership Data Generator v3.1

Generates synthetic ridership data for King County Metro routes.
Outputs CSV files for Supabase import.

Usage:
    python generate_ridership_v3_1.py [--seed 42] [--output-dir ./output]

Requirements documented in Transit_Data_Generation_Requirements_v3_1.md

Changes from v3.0:
- Tiered max load distribution (72% normal, 23% crowded, 5% outlier)
- Directional load profiles (peak at UW, taper toward Ballard)
- Route 13 AM/PM SPU stop asymmetry
- Concentrated summer drops at UW/SLU stops
- Scaled down base demand for variation headroom
- Hardcoded outlier trip IDs for consistent demos
"""

import argparse
import csv
import os
import random
import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional
from collections import defaultdict
import statistics

# ============================================
# Configuration Constants
# ============================================

GTFS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'GTFS')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'generated_v3_1')

# Date range: Spring + Summer 2025 (194 days)
START_DATE = date(2025, 3, 21)
END_DATE = date(2025, 9, 30)

# Season boundaries
SPRING_END = date(2025, 6, 21)
SUMMER_START = date(2025, 6, 22)

# Key dates
KEY_DATES = {
    "spring_break_start": date(2025, 3, 24),
    "spring_break_end": date(2025, 3, 28),
    "memorial_day": date(2025, 5, 26),
    "uw_ends": date(2025, 6, 13),
    "k12_ends": date(2025, 6, 20),
    "labor_day": date(2025, 9, 1),
    "k12_starts": date(2025, 9, 3),
    "uw_starts": date(2025, 9, 24),
}

# Target routes (GTFS route_id -> short name)
TARGET_ROUTES = {
    "100001": "1",
    "100275": "8",
    "100002": "10",
    "100009": "11",
    "100028": "13",
    "100039": "14",
    "102574": "40",
    "100224": "44",
    "100252": "62",
    "100264": "70",
}

# Route to short name reverse lookup
ROUTE_SHORT_TO_ID = {v: k for k, v in TARGET_ROUTES.items()}

# Route classifications by ridership tier
ROUTE_TIERS = {
    "high": ["40", "44", "70"],      # 8,000-12,000 daily boardings
    "medium": ["8", "62", "1"],       # 3,000-6,000 daily boardings
    "lower": ["10", "11", "13", "14"], # 1,000-2,500 daily boardings
}

# Daily boarding targets by tier (weekday baseline, Spring)
# These create a system-wide daily total of ~50k-70k weekday boardings
# These are the ROUTE-LEVEL daily totals, not per-trip
TIER_DAILY_BOARDINGS = {
    "high": (8000, 12000),    # 3 routes = 24k-36k
    "medium": (3500, 5500),   # 3 routes = 10.5k-16.5k
    "lower": (1200, 2500),    # 4 routes = 4.8k-10k
}

# Approximate trips per route per day (for demand distribution)
TRIPS_PER_ROUTE_PER_DAY = {
    "40": 400,
    "44": 350,
    "70": 450,
    "62": 300,
    "8": 350,
    "1": 250,
    "10": 150,
    "11": 120,
    "13": 150,
    "14": 180,
}

# Bus types and capacity
BUS_TYPE = {
    "40": "articulated",  # 60'
    "44": "articulated",
    "70": "articulated",
    "62": "articulated",
    "8": "standard",      # 40'
    "1": "standard",
    "10": "standard",
    "11": "standard",
    "13": "standard",
    "14": "standard",
}

BUS_CAPACITY = {
    "standard": 60,      # 40' bus max
    "articulated": 100,  # 60' bus max
}

# Load level thresholds
LOAD_LEVELS = {
    "standard": {
        "comfortable": (1, 30),
        "crowded": (31, 45),
        "packed": (46, 60),
    },
    "articulated": {
        "comfortable": (1, 50),
        "crowded": (51, 75),
        "packed": (76, 100),
    },
}

# Time period definitions (hour ranges, inclusive start, exclusive end)
TIME_PERIODS = {
    "early_am": (0, 6),
    "am_peak": (6, 9),
    "midday": (9, 15),
    "pm_peak": (15, 19),
    "evening": (19, 22),
    "night": (22, 24),
}

# Period multipliers relative to midday baseline
PERIOD_MULTIPLIERS = {
    "early_am": 0.25,
    "am_peak": 2.5,
    "midday": 1.0,
    "pm_peak": 2.75,
    "evening": 0.6,
    "night": 0.25,
}

# Day of week multipliers (0=Monday, 6=Sunday)
DAY_MULTIPLIERS = {
    0: 1.0,   # Monday
    1: 1.0,   # Tuesday
    2: 1.0,   # Wednesday
    3: 1.0,   # Thursday
    4: 0.95,  # Friday
    5: 0.37,  # Saturday (35-40%)
    6: 0.27,  # Sunday (25-30%)
}

# Holiday multiplier
HOLIDAY_MULTIPLIER = 0.55  # 50-60% of normal

# Route 62 holiday exception (recreational travel to Green Lake)
ROUTE_62_HOLIDAY_MULTIPLIER = 0.75  # 70-75% instead of 50-60%

# Seasonal multipliers (summer drop-off from spring baseline)
# Note: Route 13 uses AM/PM specific multipliers below
SUMMER_MULTIPLIERS = {
    # School-dependent routes (higher swing)
    "44": 0.72,  # -28% (UW) - target 25-30%
    "70": 0.72,  # -28% (UW)
    "13": 0.78,  # -22% (SPU) - baseline, overridden by AM/PM specific
    "8": 0.80,   # -20% (Seattle Central)
    "62": 0.83,  # -17% (Roosevelt HS)
    # Resilient routes (lower swing)
    "40": 0.88,  # -12%
    "1": 0.88,
    "10": 0.90,
    "11": 0.90,
    "14": 0.90,
}

# Route 13 AM/PM specific summer multipliers (overrides base)
# AM should drop 40-50%, PM should drop only 10-15%
ROUTE13_SUMMER_MULTIPLIERS = {
    "am_peak": 0.55,  # -45% drop in AM (students not commuting to SPU)
    "pm_peak": 0.88,  # -12% drop in PM (resilient non-student traffic)
}

# Back-to-school ramp-up (September weeks)
SEPT_WEEK_MULTIPLIERS = {
    date(2025, 9, 1): 1.0,    # Labor Day week - summer baseline
    date(2025, 9, 8): 1.10,   # +10% from summer
    date(2025, 9, 15): 1.15,  # +15% from summer
    date(2025, 9, 22): 1.22,  # +20-25% from summer (full school)
    date(2025, 9, 29): 1.22,  # Same as week 4
}

# ============================================
# Direction Mapping (from GTFS headsign analysis)
# ============================================
# Route 44: direction_id=0 -> Ballard (westbound, AWAY from UW)
#           direction_id=1 -> U District (eastbound, TOWARD UW)
# Route 70: direction_id=0 -> U District (northbound, TOWARD UW)
#           direction_id=1 -> Downtown (southbound, AWAY from UW)
# Route 40: direction_id=0 -> Northgate (northbound)
#           direction_id=1 -> Downtown/Ballard (southbound)
# Route 13: direction_id=0 -> SPU (northbound, TOWARD SPU)
#           direction_id=1 -> Downtown (southbound, AWAY from SPU)

# Direction that goes AWAY from school (for PM Peak load buildup then taper)
DIRECTION_AWAY_FROM_SCHOOL = {
    "44": 0,  # Westbound toward Ballard
    "70": 1,  # Southbound toward Downtown
    "40": 1,  # Southbound toward Downtown
    "13": 1,  # Southbound toward Downtown
}

# Direction that goes TOWARD school (for AM Peak load buildup)
DIRECTION_TOWARD_SCHOOL = {
    "44": 1,  # Eastbound toward U District
    "70": 0,  # Northbound toward U District
    "40": 0,  # Northbound toward Northgate
    "13": 0,  # Northbound toward SPU
}

# ============================================
# Outlier Trip IDs (hardcoded for consistent demos)
# These trips will always be "severely crowded" (max load 90-100)
# ============================================
OUTLIER_TRIPS = {
    # Route 44 - 2 trips at ~3:45pm and ~4:15pm toward Ballard
    "634038629": {"route": "44", "time": "15:45", "target_max": 94},
    "664046939": {"route": "44", "time": "15:46", "target_max": 92},
    # Route 70 - 1 trip at ~4:00pm toward Downtown
    "608611409": {"route": "70", "time": "16:00", "target_max": 90},
    "664213389": {"route": "70", "time": "16:00", "target_max": 88},
    # Route 40 - 1 trip at ~3:45pm toward Downtown
    "724901839": {"route": "40", "time": "15:45", "target_max": 92},
    "686398889": {"route": "40", "time": "15:45", "target_max": 90},
}

# Crowded (but not outlier) trips - max load 75-85
CROWDED_TRIPS = {
    # Route 44 - Several trips in 3:30-4:30 window
    "634036579": {"route": "44", "time": "15:30", "target_max": 82},
    "629474819": {"route": "44", "time": "15:31", "target_max": 80},
    "664048429": {"route": "44", "time": "15:35", "target_max": 78},
    "664047239": {"route": "44", "time": "15:55", "target_max": 81},
    "634036959": {"route": "44", "time": "16:00", "target_max": 79},
    "629474839": {"route": "44", "time": "16:00", "target_max": 77},
    # Route 70
    "608611389": {"route": "70", "time": "15:30", "target_max": 80},
    "664213539": {"route": "70", "time": "15:30", "target_max": 78},
    "724577769": {"route": "70", "time": "15:31", "target_max": 76},
    # Route 40
    "724901699": {"route": "40", "time": "15:30", "target_max": 82},
    "686398679": {"route": "40", "time": "15:30", "target_max": 80},
}

# ============================================
# School-Adjacent Stops
# ============================================
SCHOOL_ADJACENT_STOPS = {
    # Route 44/70 - UW
    "9587": {"school": "UW", "routes": ["44", "70"], "name": "U District Station - Bay 1"},
    "10911": {"school": "UW", "routes": ["44", "70"], "name": "U District Station - Bay 3"},
    "29440": {"school": "UW", "routes": ["44", "70"], "name": "15th Ave NE & NE Campus Pkwy"},
    "10914": {"school": "UW", "routes": ["44", "70"], "name": "15th Ave NE & NE Campus Pkwy"},
    "11352": {"school": "UW", "routes": ["44", "70"], "name": "15th Ave NE & NE 42nd St"},
    "29420": {"school": "UW", "routes": ["44"], "name": "NE Pacific St & 15th Ave NE"},
    "10912": {"school": "UW", "routes": ["70"], "name": "15th Ave NE & NE 43rd St"},
    "9580": {"school": "UW", "routes": ["70"], "name": "NE Campus Pkwy & Brooklyn Ave NE - Bay 1"},
    "9138": {"school": "UW", "routes": ["70"], "name": "NE Campus Pkwy & 12th Ave NE - Bay 4"},

    # Route 8 - Seattle Central College
    "29270": {"school": "Seattle Central", "routes": ["8"], "name": "E John St & Broadway E - Bay 1"},
    "29262": {"school": "Seattle Central", "routes": ["8"], "name": "E John St & Broadway E - Bay 2"},

    # Route 13 - SPU
    "18220": {"school": "SPU", "routes": ["13"], "name": "W Nickerson St & 3rd Ave W"},
    "41390": {"school": "SPU", "routes": ["13"], "name": "3rd Ave W & W Dravus St"},
    "41255": {"school": "SPU", "routes": ["13"], "name": "3rd Ave W & W Cremona St"},

    # Route 62 - Roosevelt HS
    "36940": {"school": "Roosevelt HS", "routes": ["62"], "name": "Roosevelt Station - Bay 2"},
    "16430": {"school": "Roosevelt HS", "routes": ["62"], "name": "Roosevelt Station - Bay 1"},
    "16416": {"school": "Roosevelt HS", "routes": ["62"], "name": "NE 65th St & 8th Ave NE"},
    "36931": {"school": "Roosevelt HS", "routes": ["62"], "name": "NE 65th St & 14th Ave NE"},

    # Routes 40, 70 - Cornish College
    "600": {"school": "Cornish", "routes": ["40"], "name": "3rd Ave & Virginia St"},
    "420": {"school": "Cornish", "routes": ["40"], "name": "3rd Ave & Virginia St"},
    "880": {"school": "Cornish", "routes": ["70"], "name": "Virginia St & 6th Ave"},
    "900": {"school": "Cornish", "routes": ["70"], "name": "Virginia St & 9th Ave"},
}

# UW Corridor stops (for concentrated summer drop)
UW_CORRIDOR_STOPS = {"9587", "10911", "29440", "10914", "11352", "29420", "10912", "9580", "9138"}

# SLU Corridor stops (Route 70) - for concentrated summer drop
SLU_CORRIDOR_STOPS = {
    "10170", "10280", "10190", "10340", "10325", "10210", "10240", "10305", "10350", "10225", "10180",
    "9220", "9550", "900", "9480", "940", "9190",
}

# Wallingford/Fremont corridor (Routes 44) - for load taper visualization
WALLINGFORD_STOPS = {
    "29500", "29865", "29480", "29234", "29236", "17310", "29231", "29455", "29530", "17410", "29232", "29540",
}

# SPU stops for Route 13 AM/PM asymmetry
SPU_STOPS = {"18220", "41390", "41255"}

# School types for calendar-aware crowding
SCHOOL_CALENDARS = {
    "UW": {"end": KEY_DATES["uw_ends"], "start": KEY_DATES["uw_starts"], "type": "university"},
    "Seattle Central": {"end": KEY_DATES["uw_ends"], "start": KEY_DATES["uw_starts"], "type": "college"},
    "SPU": {"end": KEY_DATES["uw_ends"], "start": KEY_DATES["uw_starts"], "type": "university"},
    "Roosevelt HS": {"end": KEY_DATES["k12_ends"], "start": KEY_DATES["k12_starts"], "type": "k12"},
    "Cornish": {"end": KEY_DATES["uw_ends"], "start": KEY_DATES["uw_starts"], "type": "college"},
}

# Stop category summer multipliers for concentrated drops
STOP_SUMMER_MULTIPLIERS = {
    "uw_corridor": 0.62,      # 38% drop (target 35-40%)
    "slu_corridor": 0.75,     # 25% drop (target 20-30%)
    "wallingford": 0.82,      # 18% drop (target 15-20%)
    "downtown": 0.88,         # 12% drop (target 10-15%)
    "other": 0.88,            # 12% drop (baseline)
}

# ============================================
# Data Classes
# ============================================

@dataclass
class Route:
    route_id: str
    route_short_name: str
    route_long_name: str
    route_type: int
    tier: str
    bus_type: str
    capacity: int


@dataclass
class Stop:
    stop_id: str
    stop_name: str
    lat: float
    lon: float
    has_shelter: bool = False
    has_seating: bool = False
    has_lighting: bool = False
    has_real_time_display: bool = False
    has_bike_rack: bool = False
    has_wheelchair_access: bool = False
    has_tactile_paving: bool = False
    has_trash_can: bool = False


@dataclass
class Trip:
    trip_id: str
    route_id: str
    shape_id: str
    direction_id: int
    start_time: str
    time_period: str
    headsign: str
    stop_sequence: list = field(default_factory=list)


@dataclass
class StopRidership:
    date: date
    trip_id: str
    route_id: str
    shape_id: str
    stop_id: str
    stop_sequence: int
    direction_id: int
    time_period: str
    day_of_week: int
    boardings: int
    alightings: int
    load_after: int


@dataclass
class TripRidership:
    date: date
    trip_id: str
    route_id: str
    shape_id: str
    direction_id: int
    start_time: str
    time_period: str
    day_of_week: int
    total_boardings: int
    total_alightings: int
    avg_load: float
    max_load: int


# ============================================
# GTFS Loading
# ============================================

def load_routes() -> dict[str, Route]:
    """Load routes from GTFS, filtered to target routes."""
    routes = {}
    with open(os.path.join(GTFS_DIR, 'routes.txt'), 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['route_id'] in TARGET_ROUTES:
                short_name = TARGET_ROUTES[row['route_id']]
                tier = next((t for t, rlist in ROUTE_TIERS.items() if short_name in rlist), "lower")
                bus_type = BUS_TYPE[short_name]

                routes[row['route_id']] = Route(
                    route_id=row['route_id'],
                    route_short_name=short_name,
                    route_long_name=row.get('route_long_name', ''),
                    route_type=int(row.get('route_type', 3)),
                    tier=tier,
                    bus_type=bus_type,
                    capacity=BUS_CAPACITY[bus_type],
                )
    return routes


def get_time_period(time_str: str) -> str:
    """Convert HH:MM:SS to time period. Handles times >24:00:00."""
    parts = time_str.split(':')
    hour = int(parts[0]) % 24

    for period, (start, end) in TIME_PERIODS.items():
        if start <= hour < end:
            return period
    return "night"


def load_trips(routes: dict[str, Route]) -> dict[str, Trip]:
    """Load trips from GTFS, filtered to target routes."""
    trips = {}
    route_ids = set(routes.keys())

    with open(os.path.join(GTFS_DIR, 'trips.txt'), 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['route_id'] in route_ids:
                trips[row['trip_id']] = Trip(
                    trip_id=row['trip_id'],
                    route_id=row['route_id'],
                    shape_id=row['shape_id'],
                    direction_id=int(row.get('direction_id', 0)),
                    start_time="",
                    time_period="",
                    headsign=row.get('trip_headsign', ''),
                )
    return trips


def load_stops_for_routes(trips: dict[str, Trip]) -> tuple[dict[str, Stop], dict[str, list]]:
    """Load stops served by our trips and build stop sequences."""
    trip_ids = set(trips.keys())
    stop_ids_needed = set()
    trip_stop_times = defaultdict(list)

    print("  Loading stop_times.txt...")
    with open(os.path.join(GTFS_DIR, 'stop_times.txt'), 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['trip_id'] in trip_ids:
                time_val = row.get('arrival_time') or row.get('departure_time') or ''
                if not time_val:
                    continue
                stop_ids_needed.add(row['stop_id'])
                trip_stop_times[row['trip_id']].append((
                    int(row['stop_sequence']),
                    row['stop_id'],
                    time_val
                ))

    # Sort and set start times
    for trip_id, stop_times in trip_stop_times.items():
        stop_times.sort(key=lambda x: x[0])
        trips[trip_id].stop_sequence = [(st[1], st[0]) for st in stop_times]
        if stop_times:
            start_time = stop_times[0][2]
            parts = start_time.split(':')
            hour = int(parts[0]) % 24
            trips[trip_id].start_time = f"{hour:02d}:{parts[1]}:{parts[2]}"
            trips[trip_id].time_period = get_time_period(start_time)

    print("  Loading stops.txt...")
    stops = {}
    with open(os.path.join(GTFS_DIR, 'stops.txt'), 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['stop_id'] in stop_ids_needed:
                stops[row['stop_id']] = Stop(
                    stop_id=row['stop_id'],
                    stop_name=row['stop_name'],
                    lat=float(row['stop_lat']),
                    lon=float(row['stop_lon']),
                )

    return stops, trip_stop_times


# ============================================
# Amenity Generation
# ============================================

def generate_amenities(stops: dict[str, Stop], rng: random.Random,
                       target_high_ridership_no_amenity: int = 7) -> list[str]:
    """Generate synthetic amenities for stops."""
    DOWNTOWN_BOUNDS = {
        "lat_min": 47.600, "lat_max": 47.620,
        "lon_min": -122.345, "lon_max": -122.325,
    }
    HUB_KEYWORDS = ["station", "transit center", "tc", "p&r", "park & ride", "terminal"]

    high_tier = []
    mid_tier = []
    low_tier = []

    for stop_id, stop in stops.items():
        is_downtown = (
            DOWNTOWN_BOUNDS["lat_min"] <= stop.lat <= DOWNTOWN_BOUNDS["lat_max"] and
            DOWNTOWN_BOUNDS["lon_min"] <= stop.lon <= DOWNTOWN_BOUNDS["lon_max"]
        )
        is_hub = any(kw in stop.stop_name.lower() for kw in HUB_KEYWORDS)

        if is_downtown or is_hub:
            high_tier.append(stop_id)
        elif abs(stop.lat - 47.61) < 0.05 and abs(stop.lon + 122.33) < 0.02:
            mid_tier.append(stop_id)
        else:
            low_tier.append(stop_id)

    def generate_for_tier(stop_ids: list[str], base_prob: float):
        for stop_id in stop_ids:
            stop = stops[stop_id]
            stop.has_shelter = rng.random() < base_prob
            stop.has_seating = rng.random() < base_prob * 0.95
            stop.has_lighting = rng.random() < min(1.0, base_prob * 1.1)
            stop.has_real_time_display = rng.random() < base_prob * 0.4
            stop.has_bike_rack = rng.random() < base_prob * 0.35
            stop.has_wheelchair_access = rng.random() < 0.95
            stop.has_tactile_paving = rng.random() < base_prob * 0.7
            stop.has_trash_can = rng.random() < base_prob * 0.8

    generate_for_tier(high_tier, 0.80)
    generate_for_tier(mid_tier, 0.50)
    generate_for_tier(low_tier, 0.20)

    candidates = [
        sid for sid in mid_tier
        if stops[sid].has_shelter or stops[sid].has_seating
    ]
    rng.shuffle(candidates)

    high_ridership_no_amenity = []
    for stop_id in candidates[:target_high_ridership_no_amenity]:
        stop = stops[stop_id]
        stop.has_shelter = False
        stop.has_seating = False
        stop.has_lighting = False
        stop.has_real_time_display = False
        stop.has_bike_rack = False
        stop.has_trash_can = False
        high_ridership_no_amenity.append(stop_id)

    return high_ridership_no_amenity


# ============================================
# Calendar and Seasonal Logic
# ============================================

def is_holiday(d: date) -> bool:
    """Check if date is a holiday."""
    return d in [KEY_DATES["memorial_day"], KEY_DATES["labor_day"]]


def is_spring_break(d: date) -> bool:
    """Check if date is during spring break."""
    return KEY_DATES["spring_break_start"] <= d <= KEY_DATES["spring_break_end"]


def get_season(d: date) -> str:
    """Get season for date."""
    return "spring" if d <= SPRING_END else "summer"


def is_school_in_session(d: date, school_type: str) -> bool:
    """Check if school is in session on given date."""
    if school_type == "university" or school_type == "college":
        if d <= KEY_DATES["uw_ends"]:
            return not is_spring_break(d)
        elif d >= KEY_DATES["uw_starts"]:
            return True
        return False
    elif school_type == "k12":
        if d <= KEY_DATES["k12_ends"]:
            return not is_spring_break(d)
        elif d >= KEY_DATES["k12_starts"]:
            return True
        return False
    return False


def get_september_week_multiplier(d: date) -> float:
    """Get back-to-school ramp-up multiplier for September dates."""
    if d.month != 9:
        return 1.0

    for week_start in sorted(SEPT_WEEK_MULTIPLIERS.keys(), reverse=True):
        if d >= week_start:
            return SEPT_WEEK_MULTIPLIERS[week_start]
    return 1.0


def get_seasonal_multiplier(d: date, route_short_name: str, time_period: str = None) -> float:
    """Get combined seasonal multiplier for a route on a date."""
    season = get_season(d)

    if season == "spring":
        return 1.0

    # Route 13 has AM/PM specific summer multipliers
    if route_short_name == "13" and time_period in ROUTE13_SUMMER_MULTIPLIERS:
        summer_mult = ROUTE13_SUMMER_MULTIPLIERS[time_period]
    else:
        summer_mult = SUMMER_MULTIPLIERS.get(route_short_name, 0.90)

    if d.month == 9:
        sept_mult = get_september_week_multiplier(d)
        return summer_mult * sept_mult

    return summer_mult


def get_stop_summer_multiplier(stop_id: str, route_short_name: str) -> float:
    """Get stop-specific summer multiplier for concentrated drops."""
    if route_short_name in ["44", "70"]:
        if stop_id in UW_CORRIDOR_STOPS:
            return STOP_SUMMER_MULTIPLIERS["uw_corridor"]
        elif stop_id in SLU_CORRIDOR_STOPS:
            return STOP_SUMMER_MULTIPLIERS["slu_corridor"]
        elif stop_id in WALLINGFORD_STOPS:
            return STOP_SUMMER_MULTIPLIERS["wallingford"]
    return STOP_SUMMER_MULTIPLIERS["other"]


# ============================================
# Ridership Generation
# ============================================

def poisson(lam: float, rng: random.Random) -> int:
    """Generate Poisson-distributed random integer."""
    if lam <= 0:
        return 0
    if lam > 30:
        return max(0, int(rng.gauss(lam, math.sqrt(lam))))

    L = math.exp(-lam)
    k = 0
    p = 1.0
    while p > L:
        k += 1
        p *= rng.random()
    return k - 1


def get_trip_load_tier(trip_id: str, route_short_name: str, time_period: str,
                       direction_id: int, d: date, rng: random.Random) -> tuple[str, int]:
    """
    Determine what load tier a trip should fall into.
    Returns (tier, target_max_load).

    Tier distribution for PM Peak back-to-school:
    - 72% normal (max 60-75)
    - 23% crowded (max 75-85)
    - 5% outlier (max 90-100)
    """
    # Check if this is a hardcoded outlier trip
    if trip_id in OUTLIER_TRIPS:
        return ("outlier", OUTLIER_TRIPS[trip_id]["target_max"])

    if trip_id in CROWDED_TRIPS:
        return ("crowded", CROWDED_TRIPS[trip_id]["target_max"])

    # Only apply tiered distribution during back-to-school PM Peak
    # Use Sep 15 when both K-12 and UW are in session for more pronounced effect
    is_back_to_school = (d >= date(2025, 9, 15))
    is_pm_peak = (time_period == "pm_peak")
    is_school_route = route_short_name in ["40", "44", "70"]
    is_away_direction = (direction_id == DIRECTION_AWAY_FROM_SCHOOL.get(route_short_name))

    if is_back_to_school and is_pm_peak and is_school_route and is_away_direction:
        roll = rng.random()
        if roll < 0.72:
            # Normal tier (72%): max 60-75
            target = int(rng.gauss(67, 5))
            return ("normal", max(55, min(75, target)))
        elif roll < 0.95:
            # Crowded tier (23%): max 75-85
            target = int(rng.gauss(80, 3))
            return ("crowded", max(75, min(88, target)))
        else:
            # Outlier tier (5%): max 90-100
            target = int(rng.gauss(93, 3))
            return ("outlier", max(88, min(100, target)))

    # Default: no specific target
    return ("default", 0)


def calculate_stop_position_factors_directional(
    stop_idx: int,
    total_stops: int,
    direction_id: int,
    time_period: str,
    route_short_name: str,
    stop_id: str,
    is_outlier_trip: bool,
) -> tuple[float, float]:
    """
    Calculate boarding/alighting factors with directional awareness.

    For PM Peak trips leaving UW (e.g., Route 44 direction_id=0):
    - High boarding at U District stops (beginning)
    - Load stays high through first 30% of trip
    - Gradual taper through Wallingford
    - Significant drop after Fremont
    - Light by Ballard terminus
    """
    position = stop_idx / max(1, total_stops - 1)  # 0.0 to 1.0

    # Check if this is a school-corridor trip (PM Peak leaving school area)
    is_school_route = route_short_name in ["40", "44", "70"]
    is_pm_peak = (time_period == "pm_peak")
    is_away_direction = (direction_id == DIRECTION_AWAY_FROM_SCHOOL.get(route_short_name))

    if is_school_route and is_pm_peak and is_away_direction:
        # Directional profile: Peak at origin (school), taper toward terminus
        # This creates the "packed from U District, light by Ballard" pattern

        if position < 0.15:
            # First few stops (U District): HEAVY boarding, minimal alighting
            base_boarding = 2.5 if is_outlier_trip else 1.8
            base_alighting = 0.15
        elif position < 0.35:
            # Next section: Moderate boarding continues, light alighting starts
            base_boarding = 1.2 if is_outlier_trip else 0.9
            base_alighting = 0.3
        elif position < 0.55:
            # Wallingford: Boarding drops, alighting picks up
            base_boarding = 0.5
            base_alighting = 0.8
        elif position < 0.75:
            # Fremont area: Low boarding, significant alighting
            base_boarding = 0.3
            base_alighting = 1.3
        else:
            # Ballard/terminus: Minimal boarding, heavy alighting
            base_boarding = 0.15
            base_alighting = 1.8

        return base_boarding, base_alighting

    # Check for AM Peak toward school
    is_am_peak = (time_period == "am_peak")
    is_toward_direction = (direction_id == DIRECTION_TOWARD_SCHOOL.get(route_short_name))

    if is_school_route and is_am_peak and is_toward_direction:
        # AM Peak toward school: builds load, dumps at school
        if position < 0.3:
            base_boarding = 1.5
            base_alighting = 0.2
        elif position < 0.6:
            base_boarding = 1.2
            base_alighting = 0.4
        elif position < 0.85:
            # Approaching school: boarding drops, alighting picks up
            base_boarding = 0.5
            base_alighting = 1.0
        else:
            # At school: minimal boarding, heavy alighting
            base_boarding = 0.2
            base_alighting = 2.0

        return base_boarding, base_alighting

    # Default curve for other trips
    if position < 0.3:
        base_boarding = 1.4 - position
        base_alighting = 0.3 + position * 0.6
    elif position < 0.7:
        base_boarding = 0.9
        base_alighting = 0.9
    else:
        base_boarding = 0.4 + (1 - position) * 0.5
        base_alighting = 1.4 - (1 - position) * 0.4

    # Adjust for direction and time period (general commute patterns)
    if time_period == "am_peak":
        if direction_id == 0:
            base_boarding *= 1.1 if position < 0.5 else 0.7
            base_alighting *= 0.6 if position < 0.5 else 1.3
        else:
            base_boarding *= 0.8 if position < 0.5 else 1.0
            base_alighting *= 1.0 if position < 0.5 else 0.8
    elif time_period == "pm_peak":
        if direction_id == 0:
            base_boarding *= 1.2 if position < 0.3 else 0.6
            base_alighting *= 0.5 if position < 0.3 else 1.2
        else:
            base_boarding *= 0.7 if position < 0.5 else 1.1
            base_alighting *= 1.1 if position < 0.5 else 0.7

    return base_boarding, base_alighting


def get_route13_spu_multipliers(
    stop_id: str,
    time_period: str,
    direction_id: int,
    d: date,
) -> tuple[float, float]:
    """
    Get special boarding/alighting multipliers for Route 13 SPU stops.
    Implements the AM/PM asymmetry for Vignette 2.

    Spring AM Peak: Heavy alighting at SPU (students arriving)
    Spring PM Peak: Heavy boarding at SPU (students leaving)
    Summer: AM collapses dramatically (40-50% drop), PM modest drop (10-15%)
    """
    if stop_id not in SPU_STOPS:
        return 1.0, 1.0

    season = get_season(d)
    is_school_session = is_school_in_session(d, "university")

    if time_period == "am_peak":
        if season == "spring" and is_school_session:
            # Spring AM: Low boarding, HIGH alighting (students getting off)
            # Direction toward SPU (0) has the high alighting
            if direction_id == 0:  # Toward SPU
                return 0.3, 3.5  # Increased from 2.5 for stronger spring baseline
            else:
                return 0.5, 1.2
        else:
            # Summer AM: Dramatic drop (target 40-50% reduction)
            if direction_id == 0:
                return 0.15, 0.4  # Alighting drops from 3.5 to 0.4 = ~88% drop at stop
            else:
                return 0.2, 0.3

    elif time_period == "pm_peak":
        if season == "spring" and is_school_session:
            # Spring PM: HIGH boarding, low alighting (students leaving)
            # Direction away from SPU (1) has the high boarding
            if direction_id == 1:  # Away from SPU
                return 3.0, 0.3
            else:
                return 1.0, 0.5
        else:
            # Summer PM: Modest drop (only 10-15% reduction, PM is resilient)
            if direction_id == 1:
                return 2.6, 0.25  # Only drops from 3.0 to 2.6 = ~13% drop
            else:
                return 0.9, 0.45

    return 1.0, 1.0


def generate_trip_ridership(
    trip: Trip,
    route: Route,
    d: date,
    stops: dict[str, Stop],
    rng: random.Random,
    high_ridership_no_amenity_stops: list[str],
    route_trip_counts: dict[str, int],
) -> tuple[list[StopRidership], Optional[TripRidership]]:
    """Generate ridership data for a single trip on a single day."""

    day_of_week = d.weekday()
    total_stops = len(trip.stop_sequence)

    if total_stops == 0:
        return [], None

    # --- Determine trip load tier ---
    load_tier, target_max = get_trip_load_tier(
        trip.trip_id, route.route_short_name, trip.time_period,
        trip.direction_id, d, rng
    )
    is_outlier_trip = (load_tier == "outlier")
    is_crowded_trip = (load_tier == "crowded")

    # --- Calculate base demand ---
    tier_min, tier_max = TIER_DAILY_BOARDINGS[route.tier]
    base_daily = rng.uniform(tier_min, tier_max)

    trips_per_day = TRIPS_PER_ROUTE_PER_DAY.get(route.route_short_name, 100)
    base_trip = base_daily / trips_per_day

    # --- Apply multipliers ---
    period_mult = PERIOD_MULTIPLIERS.get(trip.time_period, 1.0)
    day_mult = DAY_MULTIPLIERS.get(day_of_week, 1.0)

    if is_holiday(d):
        if route.route_short_name == "62":
            day_mult = ROUTE_62_HOLIDAY_MULTIPLIER
        else:
            day_mult = HOLIDAY_MULTIPLIER

    if is_spring_break(d) and day_of_week < 5:
        day_mult *= 0.75

    seasonal_mult = get_seasonal_multiplier(d, route.route_short_name, trip.time_period)

    # Route 14 directional asymmetry
    route14_mult = 1.0
    if route.route_short_name == "14":
        if trip.time_period == "pm_peak" and trip.direction_id == 1:
            route14_mult = 0.60

    # Combined trip demand
    trip_demand = base_trip * period_mult * day_mult * seasonal_mult * route14_mult

    # Boost for outlier/crowded trips to hit target max loads
    # Higher multipliers needed to achieve 90+ max loads on articulated buses
    if is_outlier_trip:
        trip_demand *= 4.0  # Increased from 2.0 to hit 90+ max loads
    elif is_crowded_trip:
        trip_demand *= 2.5  # Increased from 1.5 to hit 75-85 max loads

    # --- Generate stop-level data ---
    stop_ridership_list = []
    current_load = 0
    total_boardings = 0
    total_alightings = 0
    loads_for_avg = []

    for i, (stop_id, stop_seq) in enumerate(trip.stop_sequence):
        is_final_stop = (i == total_stops - 1)

        # Directional position-based factors
        b_factor, a_factor = calculate_stop_position_factors_directional(
            i, total_stops, trip.direction_id, trip.time_period,
            route.route_short_name, stop_id, is_outlier_trip
        )

        # Route 13 SPU special handling
        if route.route_short_name == "13":
            spu_b_mult, spu_a_mult = get_route13_spu_multipliers(
                stop_id, trip.time_period, trip.direction_id, d
            )
            b_factor *= spu_b_mult
            a_factor *= spu_a_mult

        # Stop-specific summer multiplier for concentrated drops
        if get_season(d) == "summer" and route.route_short_name in ["44", "70"]:
            stop_summer_mult = get_stop_summer_multiplier(stop_id, route.route_short_name)
            # Apply extra reduction at specific stops (already have route-level)
            extra_stop_reduction = stop_summer_mult / STOP_SUMMER_MULTIPLIERS["other"]
            b_factor *= extra_stop_reduction
            a_factor *= extra_stop_reduction

        # School-adjacent boost for back-to-school
        school_boost = 1.0
        if stop_id in SCHOOL_ADJACENT_STOPS:
            school_info = SCHOOL_ADJACENT_STOPS[stop_id]
            if route.route_short_name in school_info["routes"]:
                school = school_info["school"]
                school_cal = SCHOOL_CALENDARS.get(school)
                if school_cal and is_school_in_session(d, school_cal["type"]):
                    if trip.time_period in ["am_peak", "pm_peak"]:
                        tier_boost = 2.0 if route.tier == "lower" else 1.0
                        if d.month == 9 and d >= KEY_DATES["k12_starts"]:
                            # Back-to-school: strong boost
                            school_boost = 4.0 * tier_boost
                        else:
                            school_boost = 1.3 * tier_boost

        # High-ridership-no-amenity boost
        amenity_boost = 1.0
        if stop_id in high_ridership_no_amenity_stops:
            amenity_boost = 8.0

        # Calculate expected boardings/alightings
        stop_share = trip_demand / total_stops
        expected_boardings = stop_share * b_factor * school_boost * amenity_boost
        expected_alightings = stop_share * a_factor

        if is_final_stop:
            boardings = 0
            alightings = current_load
        else:
            boardings = poisson(expected_boardings, rng)
            expected_alightings_capped = min(expected_alightings, current_load * 0.8)
            alightings = min(poisson(expected_alightings_capped, rng), current_load)

        if i == 0 and boardings == 0:
            boardings = max(1, poisson(1.5, rng))

        new_load = current_load + boardings - alightings

        # Capacity enforcement
        if new_load > route.capacity:
            excess = new_load - route.capacity
            boardings = max(0, boardings - excess)
            new_load = route.capacity

        current_load = max(0, new_load)

        if not is_final_stop:
            loads_for_avg.append(current_load)

        total_boardings += boardings
        total_alightings += alightings

        stop_ridership_list.append(StopRidership(
            date=d,
            trip_id=trip.trip_id,
            route_id=trip.route_id,
            shape_id=trip.shape_id,
            stop_id=stop_id,
            stop_sequence=stop_seq,
            direction_id=trip.direction_id,
            time_period=trip.time_period,
            day_of_week=day_of_week,
            boardings=boardings,
            alightings=alightings,
            load_after=current_load,
        ))

    # Balance fix-up
    diff = total_boardings - total_alightings
    if abs(diff) > 3 and abs(diff) / max(1, total_boardings) > 0.05:
        if stop_ridership_list:
            final = stop_ridership_list[-1]
            adjustment = diff
            final.alightings = max(0, final.alightings + adjustment)
            total_alightings += adjustment

    # Create trip summary
    avg_load = statistics.mean(loads_for_avg) if loads_for_avg else 0
    max_load = max(loads_for_avg) if loads_for_avg else 0

    trip_summary = TripRidership(
        date=d,
        trip_id=trip.trip_id,
        route_id=trip.route_id,
        shape_id=trip.shape_id,
        direction_id=trip.direction_id,
        start_time=trip.start_time,
        time_period=trip.time_period,
        day_of_week=day_of_week,
        total_boardings=total_boardings,
        total_alightings=total_alightings,
        avg_load=round(avg_load, 2),
        max_load=max_load,
    )

    return stop_ridership_list, trip_summary


def generate_all_ridership(
    routes: dict[str, Route],
    trips: dict[str, Trip],
    stops: dict[str, Stop],
    rng: random.Random,
    high_ridership_no_amenity_stops: list[str],
) -> tuple[list[StopRidership], list[TripRidership]]:
    """Generate ridership for all trips across all days."""

    all_stop_ridership = []
    all_trip_ridership = []

    route_trip_counts = defaultdict(int)
    for trip in trips.values():
        if trip.stop_sequence:
            route_trip_counts[trip.route_id] += 1

    current_date = START_DATE
    total_days = (END_DATE - START_DATE).days + 1
    day_num = 0

    while current_date <= END_DATE:
        day_num += 1
        if day_num % 10 == 0 or day_num == 1:
            print(f"  Day {day_num}/{total_days}: {current_date}")

        for trip_id, trip in trips.items():
            route = routes.get(trip.route_id)
            if not route or not trip.stop_sequence:
                continue

            stop_data, trip_data = generate_trip_ridership(
                trip, route, current_date, stops, rng,
                high_ridership_no_amenity_stops, route_trip_counts
            )

            if stop_data:
                all_stop_ridership.extend(stop_data)
            if trip_data:
                all_trip_ridership.append(trip_data)

        current_date += timedelta(days=1)

    return all_stop_ridership, all_trip_ridership


# ============================================
# Summary Table Generation
# ============================================

def generate_daily_summaries(
    stop_ridership: list[StopRidership],
    trip_ridership: list[TripRidership],
) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    """Generate pre-aggregated summary tables."""

    trips_by_date = defaultdict(list)
    for tr in trip_ridership:
        trips_by_date[tr.date].append(tr)

    stops_by_date_stop = defaultdict(lambda: defaultdict(list))
    for sr in stop_ridership:
        stops_by_date_stop[sr.date][sr.stop_id].append(sr)

    final_seq = {}
    for sr in stop_ridership:
        k = (sr.date, sr.trip_id)
        final_seq[k] = max(final_seq.get(k, -1), sr.stop_sequence)

    segments_by_date = defaultdict(list)
    segments_by_date_route = defaultdict(lambda: defaultdict(list))
    segments_by_date_period = defaultdict(lambda: defaultdict(list))

    for sr in stop_ridership:
        if sr.stop_sequence == final_seq[(sr.date, sr.trip_id)]:
            continue
        segments_by_date[sr.date].append(sr.load_after)
        segments_by_date_route[sr.date][sr.route_id].append(sr.load_after)
        segments_by_date_period[sr.date][sr.time_period].append(sr.load_after)

    daily_system = []
    daily_route = []
    daily_stop = []
    daily_period = []

    for d in sorted(trips_by_date.keys()):
        day_trips = trips_by_date[d]
        day_of_week = d.weekday()

        total_boardings = sum(t.total_boardings for t in day_trips)
        total_alightings = sum(t.total_alightings for t in day_trips)
        all_segment_loads = segments_by_date[d]
        all_max_loads = [t.max_load for t in day_trips]

        daily_system.append({
            "date": d.isoformat(),
            "day_of_week": day_of_week,
            "trip_count": len(day_trips),
            "total_boardings": total_boardings,
            "total_alightings": total_alightings,
            "avg_load": round(statistics.mean(all_segment_loads), 2) if all_segment_loads else 0,
            "max_load": max(all_max_loads) if all_max_loads else 0,
        })

        trips_by_route = defaultdict(list)
        for t in day_trips:
            trips_by_route[t.route_id].append(t)

        for route_id, route_trips in trips_by_route.items():
            route_boardings = sum(t.total_boardings for t in route_trips)
            route_alightings = sum(t.total_alightings for t in route_trips)
            route_segment_loads = segments_by_date_route[d][route_id]
            route_max_loads = [t.max_load for t in route_trips]

            daily_route.append({
                "date": d.isoformat(),
                "route_id": route_id,
                "day_of_week": day_of_week,
                "trip_count": len(route_trips),
                "total_boardings": route_boardings,
                "total_alightings": route_alightings,
                "avg_load": round(statistics.mean(route_segment_loads), 2) if route_segment_loads else 0,
                "max_load": max(route_max_loads) if route_max_loads else 0,
            })

        for stop_id, stop_records in stops_by_date_stop[d].items():
            stop_boardings = sum(sr.boardings for sr in stop_records)
            stop_alightings = sum(sr.alightings for sr in stop_records)

            daily_stop.append({
                "date": d.isoformat(),
                "stop_id": stop_id,
                "day_of_week": day_of_week,
                "total_boardings": stop_boardings,
                "total_alightings": stop_alightings,
            })

        period_trips = defaultdict(list)
        for t in day_trips:
            period_trips[t.time_period].append(t)

        for time_period in TIME_PERIODS.keys():
            p_trips = period_trips.get(time_period, [])
            period_boardings = sum(t.total_boardings for t in p_trips)
            period_alightings = sum(t.total_alightings for t in p_trips)
            period_segment_loads = segments_by_date_period[d][time_period]
            period_max_loads = [t.max_load for t in p_trips]

            daily_period.append({
                "date": d.isoformat(),
                "time_period": time_period,
                "day_of_week": day_of_week,
                "total_boardings": period_boardings,
                "total_alightings": period_alightings,
                "avg_load": round(statistics.mean(period_segment_loads), 2) if period_segment_loads else 0,
                "max_load": max(period_max_loads) if period_max_loads else 0,
            })

    return daily_system, daily_route, daily_stop, daily_period


# ============================================
# Validation
# ============================================

def run_validation(
    stop_ridership: list[StopRidership],
    trip_ridership: list[TripRidership],
    routes: dict[str, Route],
    stops: dict[str, Stop],
) -> tuple[int, int]:
    """Run validation checks."""
    print("\n" + "=" * 60)
    print("VALIDATION")
    print("=" * 60)

    hard_failures = 0
    warnings = 0

    # 6.1 Load and Capacity
    print("\n[6.1] Load and Capacity Checks...")

    capacity_violations = 0
    negative_loads = 0
    for sr in stop_ridership:
        route = routes.get(sr.route_id)
        if route and sr.load_after > route.capacity:
            capacity_violations += 1
        if sr.load_after < 0:
            negative_loads += 1

    if capacity_violations > 0:
        print(f"  FAIL: {capacity_violations} segments exceed bus capacity")
        hard_failures += 1
    else:
        print("  PASS: No capacity violations")

    if negative_loads > 0:
        print(f"  FAIL: {negative_loads} negative load values")
        hard_failures += 1
    else:
        print("  PASS: No negative loads")

    trip_final_stops = {}
    for sr in stop_ridership:
        key = (sr.date, sr.trip_id)
        if key not in trip_final_stops or sr.stop_sequence > trip_final_stops[key][0]:
            trip_final_stops[key] = (sr.stop_sequence, sr.load_after)

    high_final_loads = sum(1 for _, load in trip_final_stops.values() if load > 5)
    if high_final_loads > len(trip_final_stops) * 0.05:
        print(f"  WARN: {high_final_loads} trips have final stop load > 5")
        warnings += 1
    else:
        print(f"  PASS: Final stop loads acceptable ({high_final_loads} > 5)")

    # 6.2 Zero and Minimum Values
    print("\n[6.2] Zero/Minimum Value Checks...")

    zero_boarding_trips = sum(1 for tr in trip_ridership if tr.total_boardings == 0)
    if zero_boarding_trips > 0:
        print(f"  FAIL: {zero_boarding_trips} trips have 0 boardings")
        hard_failures += 1
    else:
        print("  PASS: All trips have boardings")

    # 6.3 Balance Checks
    print("\n[6.3] Balance Checks...")

    unbalanced = 0
    for tr in trip_ridership:
        diff = abs(tr.total_boardings - tr.total_alightings)
        pct = diff / max(1, tr.total_boardings)
        if diff > 3 and pct > 0.05:
            unbalanced += 1

    if unbalanced > len(trip_ridership) * 0.01:
        print(f"  WARN: {unbalanced} trips have unbalanced boardings/alightings")
        warnings += 1
    else:
        print(f"  PASS: Trip balance acceptable ({unbalanced} unbalanced)")

    # 6.4 Temporal Consistency
    print("\n[6.4] Temporal Consistency...")

    daily_boardings = defaultdict(int)
    for tr in trip_ridership:
        daily_boardings[(tr.date, tr.day_of_week)] += tr.total_boardings

    weekday_avg = statistics.mean([b for (d, dow), b in daily_boardings.items() if dow < 5])
    weekend_avg = statistics.mean([b for (d, dow), b in daily_boardings.items() if dow >= 5])

    if weekday_avg <= weekend_avg:
        print(f"  FAIL: Weekday avg ({weekday_avg:.0f}) should exceed weekend ({weekend_avg:.0f})")
        hard_failures += 1
    else:
        print(f"  PASS: Weekday ({weekday_avg:.0f}) > Weekend ({weekend_avg:.0f})")

    spring_boardings = []
    summer_boardings = []
    for tr in trip_ridership:
        if tr.day_of_week < 5:
            if tr.date <= SPRING_END:
                spring_boardings.append(tr.total_boardings)
            elif tr.date < date(2025, 9, 1):
                summer_boardings.append(tr.total_boardings)

    spring_avg = statistics.mean(spring_boardings) if spring_boardings else 0
    summer_avg = statistics.mean(summer_boardings) if summer_boardings else 0

    if spring_avg <= summer_avg:
        print(f"  FAIL: Spring avg ({spring_avg:.2f}) should exceed summer ({summer_avg:.2f})")
        hard_failures += 1
    else:
        print(f"  PASS: Spring ({spring_avg:.2f}) > Summer ({summer_avg:.2f})")

    sept_week1 = [tr.total_boardings for tr in trip_ridership
                  if date(2025, 9, 1) <= tr.date <= date(2025, 9, 7)]
    sept_week4 = [tr.total_boardings for tr in trip_ridership
                  if date(2025, 9, 22) <= tr.date <= date(2025, 9, 28)]

    w1_avg = statistics.mean(sept_week1) if sept_week1 else 0
    w4_avg = statistics.mean(sept_week4) if sept_week4 else 0

    if w4_avg <= w1_avg:
        print(f"  FAIL: Sept week 4 ({w4_avg:.2f}) should exceed week 1 ({w1_avg:.2f})")
        hard_failures += 1
    else:
        print(f"  PASS: Sept week 4 ({w4_avg:.2f}) > week 1 ({w1_avg:.2f})")

    # 6.6 Reasonableness Bounds
    print("\n[6.6] Reasonableness Bounds...")

    daily_system = defaultdict(int)
    for tr in trip_ridership:
        daily_system[tr.date] += tr.total_boardings

    min_daily = min(daily_system.values())
    max_daily = max(daily_system.values())

    if min_daily < 40000 or max_daily > 100000:
        print(f"  WARN: Daily system range [{min_daily}, {max_daily}] outside expected [40k, 100k]")
        warnings += 1
    else:
        print(f"  PASS: Daily system range [{min_daily}, {max_daily}] within bounds")

    print("\n" + "=" * 60)
    print(f"VALIDATION COMPLETE: {hard_failures} hard failures, {warnings} warnings")
    print("=" * 60)

    return hard_failures, warnings


# ============================================
# Vignette Acceptance Tests
# ============================================

def run_acceptance_tests(
    stop_ridership: list[StopRidership],
    trip_ridership: list[TripRidership],
    daily_route: list[dict],
    daily_stop: list[dict],
    stops: dict[str, Stop],
    routes: dict[str, Route],
) -> bool:
    """Run acceptance tests for all vignettes."""

    print("\n" + "=" * 60)
    print("VIGNETTE ACCEPTANCE TESTS")
    print("=" * 60)

    all_passed = True
    route_id_44 = ROUTE_SHORT_TO_ID["44"]
    route_id_70 = ROUTE_SHORT_TO_ID["70"]
    route_id_8 = ROUTE_SHORT_TO_ID["8"]
    route_id_13 = ROUTE_SHORT_TO_ID["13"]
    route_id_62 = ROUTE_SHORT_TO_ID["62"]
    route_id_14 = ROUTE_SHORT_TO_ID["14"]
    route_id_40 = ROUTE_SHORT_TO_ID["40"]

    # --- Vignette 1: Back-to-School Crowding with Load Tiers ---
    print("\n[V1] Back-to-School Crowding (Sep 15-30, PM Peak)")
    print("-" * 40)

    school_routes = [route_id_44, route_id_70, route_id_40]
    v1_start = date(2025, 9, 15)
    v1_end = date(2025, 9, 30)

    # Check load tier distribution
    max_loads_by_route = defaultdict(list)
    for tr in trip_ridership:
        if (tr.route_id in school_routes and
            tr.time_period == "pm_peak" and
            v1_start <= tr.date <= v1_end):
            max_loads_by_route[tr.route_id].append(tr.max_load)

    print("\n  Max Load Distribution by Route:")
    tier_counts = {"60-75": 0, "75-85": 0, "90+": 0}
    for route_id, loads in max_loads_by_route.items():
        route_name = TARGET_ROUTES[route_id]
        normal = sum(1 for l in loads if 60 <= l <= 75)
        crowded = sum(1 for l in loads if 75 < l <= 85)
        outlier = sum(1 for l in loads if l >= 90)
        tier_counts["60-75"] += normal
        tier_counts["75-85"] += crowded
        tier_counts["90+"] += outlier
        print(f"    Route {route_name}: Normal(60-75)={normal}, Crowded(75-85)={crowded}, Outlier(90+)={outlier}")

    total_trips = sum(len(loads) for loads in max_loads_by_route.values())
    if total_trips > 0:
        normal_pct = tier_counts["60-75"] / total_trips * 100
        crowded_pct = tier_counts["75-85"] / total_trips * 100
        outlier_pct = tier_counts["90+"] / total_trips * 100
        print(f"\n  Overall: Normal={normal_pct:.1f}%, Crowded={crowded_pct:.1f}%, Outlier={outlier_pct:.1f}%")

        # Check for differentiation (not all the same)
        v1_differentiation = (tier_counts["60-75"] > 0 and tier_counts["90+"] > 0)
        v1_has_outliers = tier_counts["90+"] >= 10  # At least some outliers across the period
    else:
        v1_differentiation = False
        v1_has_outliers = False

    print(f"\n  Differentiation: {'PASS' if v1_differentiation else 'FAIL'}")
    print(f"  Has Outliers (90+): {'PASS' if v1_has_outliers else 'FAIL'}")

    # Check hardcoded outlier trips specifically
    print("\n  Checking hardcoded outlier trips:")
    outlier_hits = 0
    for trip_id in OUTLIER_TRIPS:
        matching = [tr for tr in trip_ridership
                   if tr.trip_id == trip_id and tr.time_period == "pm_peak"
                   and v1_start <= tr.date <= v1_end]
        if matching:
            avg_max = statistics.mean([tr.max_load for tr in matching])
            print(f"    {trip_id}: avg max_load = {avg_max:.1f}")
            if avg_max >= 85:
                outlier_hits += 1

    v1_outliers_work = outlier_hits >= len(OUTLIER_TRIPS) // 2
    print(f"  Outlier trips hitting targets: {'PASS' if v1_outliers_work else 'FAIL'}")

    v1_passed = v1_differentiation and v1_has_outliers
    all_passed = all_passed and v1_passed

    # --- Vignette 2: Summer Drop-off ---
    print("\n[V2] Summer Ridership Drop (Mar-May vs Jun-Aug)")
    print("-" * 40)

    spring_period = [tr for tr in trip_ridership
                     if date(2025, 3, 21) <= tr.date <= date(2025, 5, 31) and tr.day_of_week < 5]
    summer_period = [tr for tr in trip_ridership
                     if date(2025, 6, 22) <= tr.date <= date(2025, 8, 31) and tr.day_of_week < 5]

    spring_total = sum(tr.total_boardings for tr in spring_period)
    summer_total = sum(tr.total_boardings for tr in summer_period)
    spring_days = len(set(tr.date for tr in spring_period))
    summer_days = len(set(tr.date for tr in summer_period))

    if spring_days > 0 and summer_days > 0:
        spring_daily = spring_total / spring_days
        summer_daily = summer_total / summer_days
        system_drop = (1 - summer_daily / spring_daily) * 100
    else:
        system_drop = 0

    # Routes 44, 70 specific
    spring_44_70 = sum(tr.total_boardings for tr in spring_period if tr.route_id in [route_id_44, route_id_70])
    summer_44_70 = sum(tr.total_boardings for tr in summer_period if tr.route_id in [route_id_44, route_id_70])
    if spring_44_70 > 0:
        route_44_70_drop = (1 - (summer_44_70/summer_days) / (spring_44_70/spring_days)) * 100
    else:
        route_44_70_drop = 0

    v2_system_passed = 12 <= system_drop <= 22
    v2_routes_passed = 20 <= route_44_70_drop <= 35

    print(f"  System-wide drop: {system_drop:.1f}% (target: 15-18%)")
    print(f"  Routes 44/70 drop: {route_44_70_drop:.1f}% (target: 25-30%)")
    print(f"  System {'PASS' if v2_system_passed else 'FAIL'}")
    print(f"  Routes 44/70 {'PASS' if v2_routes_passed else 'FAIL'}")

    # Route 13 AM/PM check
    spring_13_am = [tr for tr in spring_period if tr.route_id == route_id_13 and tr.time_period == "am_peak"]
    summer_13_am = [tr for tr in summer_period if tr.route_id == route_id_13 and tr.time_period == "am_peak"]
    spring_13_pm = [tr for tr in spring_period if tr.route_id == route_id_13 and tr.time_period == "pm_peak"]
    summer_13_pm = [tr for tr in summer_period if tr.route_id == route_id_13 and tr.time_period == "pm_peak"]

    if spring_13_am and summer_13_am and spring_13_pm and summer_13_pm:
        spring_13_am_avg = statistics.mean([tr.total_boardings for tr in spring_13_am])
        summer_13_am_avg = statistics.mean([tr.total_boardings for tr in summer_13_am])
        spring_13_pm_avg = statistics.mean([tr.total_boardings for tr in spring_13_pm])
        summer_13_pm_avg = statistics.mean([tr.total_boardings for tr in summer_13_pm])

        r13_am_drop = (1 - summer_13_am_avg / spring_13_am_avg) * 100
        r13_pm_drop = (1 - summer_13_pm_avg / spring_13_pm_avg) * 100

        print(f"\n  Route 13 AM Peak drop: {r13_am_drop:.1f}% (target: 40-50%)")
        print(f"  Route 13 PM Peak drop: {r13_pm_drop:.1f}% (target: 10-15%)")

        v2_r13_passed = r13_am_drop > r13_pm_drop + 15  # AM should drop much more than PM
    else:
        v2_r13_passed = False
        print("  Route 13 AM/PM: INSUFFICIENT DATA")

    print(f"  Route 13 AM/PM asymmetry: {'PASS' if v2_r13_passed else 'FAIL'}")

    all_passed = all_passed and v2_system_passed and v2_routes_passed

    # --- Vignette 3: Route 14 Asymmetry ---
    print("\n[V3] Route 14 Direction Asymmetry")
    print("-" * 40)

    route14_trips = [tr for tr in trip_ridership if tr.route_id == route_id_14 and tr.day_of_week < 5]

    am_outbound = [tr for tr in route14_trips if tr.time_period == "am_peak" and tr.direction_id == 0]
    pm_inbound = [tr for tr in route14_trips if tr.time_period == "pm_peak" and tr.direction_id == 1]

    am_out_avg = statistics.mean([tr.total_boardings for tr in am_outbound]) if am_outbound else 0
    pm_in_avg = statistics.mean([tr.total_boardings for tr in pm_inbound]) if pm_inbound else 0

    asymmetry = (1 - pm_in_avg / am_out_avg) * 100 if am_out_avg > 0 else 0
    v3_passed = 30 <= asymmetry <= 50

    print(f"  AM outbound avg: {am_out_avg:.1f}")
    print(f"  PM inbound avg: {pm_in_avg:.1f}")
    print(f"  Asymmetry: {asymmetry:.1f}% (target: 35-45%)")
    print(f"  {'PASS' if v3_passed else 'FAIL'}")
    all_passed = all_passed and v3_passed

    # --- Vignette 4: Amenity Equity ---
    print("\n[V4] High-Ridership Stops Without Amenities")
    print("-" * 40)

    stop_daily = defaultdict(list)
    for ds in daily_stop:
        stop_daily[ds["stop_id"]].append(ds["total_boardings"])

    avg_boardings = {sid: statistics.mean(vals) for sid, vals in stop_daily.items()}

    high_no_amenity = []
    for sid, avg in avg_boardings.items():
        if avg > 300 and sid in stops:
            stop = stops[sid]
            has_comfort_amenity = any([
                stop.has_shelter, stop.has_seating, stop.has_lighting,
                stop.has_real_time_display, stop.has_bike_rack, stop.has_trash_can
            ])
            if not has_comfort_amenity:
                high_no_amenity.append((sid, avg))

    routes_served = set()
    for sid, _ in high_no_amenity:
        for sr in stop_ridership:
            if sr.stop_id == sid:
                routes_served.add(sr.route_id)
                break

    v4_count_passed = 5 <= len(high_no_amenity) <= 8
    v4_routes_passed = len(routes_served) >= 3

    print(f"  Stops with >300 boardings, no amenities: {len(high_no_amenity)}")
    for sid, avg in sorted(high_no_amenity, key=lambda x: -x[1])[:5]:
        print(f"    {sid}: {avg:.0f} avg daily")
    print(f"  Across {len(routes_served)} routes")
    print(f"  Count {'PASS' if v4_count_passed else 'FAIL'} (target: 5-8)")
    print(f"  Routes {'PASS' if v4_routes_passed else 'FAIL'} (target: 3+)")
    all_passed = all_passed and v4_count_passed and v4_routes_passed

    # --- Vignette 5: Holiday Patterns ---
    print("\n[V5] Holiday Ridership (Memorial Day)")
    print("-" * 40)

    memorial_day = date(2025, 5, 26)
    normal_monday = date(2025, 5, 19)

    memorial_trips = [tr for tr in trip_ridership if tr.date == memorial_day]
    normal_trips = [tr for tr in trip_ridership if tr.date == normal_monday]

    memorial_total = sum(tr.total_boardings for tr in memorial_trips)
    normal_total = sum(tr.total_boardings for tr in normal_trips)

    holiday_pct = (memorial_total / normal_total * 100) if normal_total > 0 else 0
    v5_system_passed = 45 <= holiday_pct <= 65

    memorial_62 = sum(tr.total_boardings for tr in memorial_trips if tr.route_id == route_id_62)
    normal_62 = sum(tr.total_boardings for tr in normal_trips if tr.route_id == route_id_62)
    route62_pct = (memorial_62 / normal_62 * 100) if normal_62 > 0 else 0
    v5_route62_passed = 65 <= route62_pct <= 85

    print(f"  Memorial Day vs normal Monday: {holiday_pct:.1f}% (target: 50-60%)")
    print(f"  Route 62 holiday retention: {route62_pct:.1f}% (target: 70-80%)")
    print(f"  System {'PASS' if v5_system_passed else 'FAIL'}")
    print(f"  Route 62 {'PASS' if v5_route62_passed else 'FAIL'}")
    all_passed = all_passed and v5_system_passed and v5_route62_passed

    print("\n" + "=" * 60)
    print(f"ALL VIGNETTES {'PASSED' if all_passed else 'FAILED'}")
    print("=" * 60)

    return all_passed


# ============================================
# CSV Output
# ============================================

def write_csv(output_dir: str, filename: str, data: list[dict], fieldnames: list[str]):
    """Write data to CSV file."""
    filepath = os.path.join(output_dir, filename)
    with open(filepath, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)
    print(f"  Written: {filename} ({len(data):,} rows)")


def output_all_csv(
    output_dir: str,
    routes: dict[str, Route],
    stops: dict[str, Stop],
    trips: dict[str, Trip],
    stop_ridership: list[StopRidership],
    trip_ridership: list[TripRidership],
    daily_system: list[dict],
    daily_route: list[dict],
    daily_stop: list[dict],
    daily_period: list[dict],
):
    """Write all data to CSV files."""
    os.makedirs(output_dir, exist_ok=True)

    routes_data = [{
        "route_id": r.route_id,
        "route_short_name": r.route_short_name,
        "route_long_name": r.route_long_name,
        "route_type": r.route_type,
    } for r in routes.values()]
    write_csv(output_dir, "routes.csv", routes_data,
              ["route_id", "route_short_name", "route_long_name", "route_type"])

    stops_data = [{
        "stop_id": s.stop_id,
        "stop_name": s.stop_name,
        "lat": s.lat,
        "lon": s.lon,
        "has_shelter": s.has_shelter,
        "has_seating": s.has_seating,
        "has_lighting": s.has_lighting,
        "has_real_time_display": s.has_real_time_display,
        "has_bike_rack": s.has_bike_rack,
        "has_wheelchair_access": s.has_wheelchair_access,
        "has_tactile_paving": s.has_tactile_paving,
        "has_trash_can": s.has_trash_can,
    } for s in stops.values()]
    write_csv(output_dir, "stops.csv", stops_data, [
        "stop_id", "stop_name", "lat", "lon",
        "has_shelter", "has_seating", "has_lighting", "has_real_time_display",
        "has_bike_rack", "has_wheelchair_access", "has_tactile_paving", "has_trash_can"
    ])

    trips_data = [{
        "trip_id": t.trip_id,
        "route_id": t.route_id,
        "shape_id": t.shape_id,
        "direction_id": t.direction_id,
        "start_time": t.start_time,
        "time_period": t.time_period,
        "headsign": t.headsign,
    } for t in trips.values() if t.start_time]
    write_csv(output_dir, "trips.csv", trips_data, [
        "trip_id", "route_id", "shape_id", "direction_id", "start_time", "time_period", "headsign"
    ])

    stop_ridership_data = [{
        "date": sr.date.isoformat(),
        "trip_id": sr.trip_id,
        "route_id": sr.route_id,
        "shape_id": sr.shape_id,
        "stop_id": sr.stop_id,
        "stop_sequence": sr.stop_sequence,
        "direction_id": sr.direction_id,
        "time_period": sr.time_period,
        "day_of_week": sr.day_of_week,
        "boardings": sr.boardings,
        "alightings": sr.alightings,
        "load_after": sr.load_after,
    } for sr in stop_ridership]
    write_csv(output_dir, "stop_ridership.csv", stop_ridership_data, [
        "date", "trip_id", "route_id", "shape_id", "stop_id", "stop_sequence",
        "direction_id", "time_period", "day_of_week", "boardings", "alightings", "load_after"
    ])

    trip_ridership_data = [{
        "date": tr.date.isoformat(),
        "trip_id": tr.trip_id,
        "route_id": tr.route_id,
        "shape_id": tr.shape_id,
        "direction_id": tr.direction_id,
        "start_time": tr.start_time,
        "time_period": tr.time_period,
        "day_of_week": tr.day_of_week,
        "total_boardings": tr.total_boardings,
        "total_alightings": tr.total_alightings,
        "avg_load": tr.avg_load,
        "max_load": tr.max_load,
    } for tr in trip_ridership]
    write_csv(output_dir, "trip_ridership.csv", trip_ridership_data, [
        "date", "trip_id", "route_id", "shape_id", "direction_id", "start_time",
        "time_period", "day_of_week", "total_boardings", "total_alightings", "avg_load", "max_load"
    ])

    write_csv(output_dir, "daily_system_summary.csv", daily_system, [
        "date", "day_of_week", "trip_count", "total_boardings", "total_alightings", "avg_load", "max_load"
    ])
    write_csv(output_dir, "daily_route_summary.csv", daily_route, [
        "date", "route_id", "day_of_week", "trip_count", "total_boardings", "total_alightings", "avg_load", "max_load"
    ])
    write_csv(output_dir, "daily_stop_summary.csv", daily_stop, [
        "date", "stop_id", "day_of_week", "total_boardings", "total_alightings"
    ])
    write_csv(output_dir, "daily_period_summary.csv", daily_period, [
        "date", "time_period", "day_of_week", "total_boardings", "total_alightings", "avg_load", "max_load"
    ])


# ============================================
# Main
# ============================================

def main():
    parser = argparse.ArgumentParser(description="Generate synthetic transit ridership data v3.1")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory for CSV files")
    args = parser.parse_args()

    output_dir = args.output_dir or OUTPUT_DIR

    print("=" * 60)
    print("Transit Ridership Data Generator v3.1")
    print("=" * 60)
    print(f"Seed: {args.seed}")
    print(f"Output: {output_dir}")
    print(f"Date range: {START_DATE} to {END_DATE} ({(END_DATE - START_DATE).days + 1} days)")
    print()

    rng = random.Random(args.seed)

    print("Loading GTFS data...")
    routes = load_routes()
    print(f"  Loaded {len(routes)} routes")

    trips = load_trips(routes)
    print(f"  Loaded {len(trips)} trips")

    stops, _ = load_stops_for_routes(trips)
    print(f"  Loaded {len(stops)} stops")

    trips = {tid: t for tid, t in trips.items() if t.stop_sequence}
    print(f"  Filtered to {len(trips)} trips with stop sequences")

    print("\nGenerating stop amenities...")
    high_ridership_no_amenity_stops = generate_amenities(stops, rng)
    print(f"  Marked {len(high_ridership_no_amenity_stops)} high-ridership stops without amenities")

    print("\nGenerating ridership data (this may take several minutes)...")
    stop_ridership, trip_ridership = generate_all_ridership(
        routes, trips, stops, rng, high_ridership_no_amenity_stops
    )
    print(f"  Generated {len(stop_ridership):,} stop ridership records")
    print(f"  Generated {len(trip_ridership):,} trip ridership records")

    print("\nGenerating summary tables...")
    daily_system, daily_route, daily_stop, daily_period = generate_daily_summaries(
        stop_ridership, trip_ridership
    )
    print(f"  Generated {len(daily_system)} daily system summaries")
    print(f"  Generated {len(daily_route)} daily route summaries")
    print(f"  Generated {len(daily_stop):,} daily stop summaries")
    print(f"  Generated {len(daily_period)} daily period summaries")

    print("\nWriting CSV files...")
    output_all_csv(
        output_dir,
        routes, stops, trips,
        stop_ridership, trip_ridership,
        daily_system, daily_route, daily_stop, daily_period
    )

    hard_failures, warnings = run_validation(
        stop_ridership, trip_ridership, routes, stops
    )

    tests_passed = run_acceptance_tests(
        stop_ridership, trip_ridership, daily_route, daily_stop, stops, routes
    )

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Validation: {hard_failures} hard failures, {warnings} warnings")
    print(f"Vignette tests: {'PASSED' if tests_passed else 'FAILED'}")
    print(f"Output directory: {output_dir}")
    print("\nDone!")

    return 0 if (hard_failures == 0 and tests_passed) else 1


if __name__ == "__main__":
    exit(main())
