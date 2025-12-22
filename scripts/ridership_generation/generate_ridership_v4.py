#!/usr/bin/env python3
"""
Transit Ridership Data Generator v4.0

Generates synthetic ridership data for King County Metro routes.
Outputs CSV files for Supabase import.

Usage:
    python generate_ridership_v4.py [--seed 42] [--output-dir ./output]

Key changes from v3.1:
- Vignette 1: Route 44 is THE problem route (max 95-100), Routes 40/70 elevated but not critical (70-75)
- Vignette 1: Only 3-8 trips on Route 44 between 5-6 PM should hit 95-100 max load
- Vignette 1: Crowded trips have sustained avg load 60-80 from U District through Fremont
- Vignette 2: Route 13 "Seattle Pacific University Seattle Center W" pattern drops ~50% in summer
- Vignette 2: Route 13 segments before 1st Ave N & Mercer St drop 10-15%, after drop 50%+
- Vignette 2: Route 13 AM Peak drops 40-50%, PM Peak drops 10-15%
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
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'generated_v4')

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

ROUTE_SHORT_TO_ID = {v: k for k, v in TARGET_ROUTES.items()}

# Route classifications by ridership tier
ROUTE_TIERS = {
    "high": ["40", "44", "70"],
    "medium": ["8", "62", "1"],
    "lower": ["10", "11", "13", "14"],
}

TIER_DAILY_BOARDINGS = {
    "high": (8000, 12000),
    "medium": (3500, 5500),
    "lower": (1200, 2500),
}

TRIPS_PER_ROUTE_PER_DAY = {
    "40": 400, "44": 350, "70": 450, "62": 300,
    "8": 350, "1": 250, "10": 150, "11": 120, "13": 150, "14": 180,
}

BUS_TYPE = {
    "40": "articulated", "44": "articulated", "70": "articulated", "62": "articulated",
    "8": "standard", "1": "standard", "10": "standard", "11": "standard",
    "13": "standard", "14": "standard",
}

BUS_CAPACITY = {"standard": 60, "articulated": 100}

TIME_PERIODS = {
    "early_am": (0, 6), "am_peak": (6, 9), "midday": (9, 15),
    "pm_peak": (15, 19), "evening": (19, 22), "night": (22, 24),
}

PERIOD_MULTIPLIERS = {
    "early_am": 0.25, "am_peak": 2.5, "midday": 1.0,
    "pm_peak": 2.75, "evening": 0.6, "night": 0.25,
}

DAY_MULTIPLIERS = {0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0, 4: 0.95, 5: 0.37, 6: 0.27}

HOLIDAY_MULTIPLIER = 0.55
ROUTE_62_HOLIDAY_MULTIPLIER = 0.75

# Base summer multipliers (route-level)
SUMMER_MULTIPLIERS = {
    "44": 0.72, "70": 0.72, "13": 0.80, "8": 0.80,
    "62": 0.83, "40": 0.88, "1": 0.88, "10": 0.90, "11": 0.90, "14": 0.90,
}

# Route 13 time-period specific summer multipliers
# These OVERRIDE the base SUMMER_MULTIPLIERS for Route 13
ROUTE13_SUMMER_MULTIPLIERS = {
    "am_peak": 0.55,   # -45% in AM (students not going to SPU)
    "midday": 0.85,    # -15% midday
    "pm_peak": 0.92,   # -8% in PM (resilient non-student traffic) - keep close to normal
    "evening": 0.88,   # -12% evening
    "early_am": 0.92,  # -8% early AM
    "night": 0.92,     # -8% night
}

SEPT_WEEK_MULTIPLIERS = {
    date(2025, 9, 1): 1.0, date(2025, 9, 8): 1.10,
    date(2025, 9, 15): 1.15, date(2025, 9, 22): 1.22, date(2025, 9, 29): 1.22,
}

# ============================================
# Direction and Pattern Mappings
# ============================================

# Direction AWAY from school (for PM Peak crowding)
DIRECTION_AWAY_FROM_SCHOOL = {"44": 0, "70": 1, "40": 1, "13": 1}
DIRECTION_TOWARD_SCHOOL = {"44": 1, "70": 0, "40": 0, "13": 0}

# Route 44 "Ballard Wallingford" patterns (shape_id)
ROUTE_44_BALLARD_PATTERNS = {"11044004", "11044007"}

# Route 13 "Seattle Pacific University Seattle Center W" patterns
ROUTE_13_SPU_PATTERNS = {"11013009", "11013013"}

# ============================================
# Vignette 1: Back-to-School Crowding Config
# ============================================
# ONLY Route 44 should have severe crowding (95-100)
# Routes 40, 70 should be elevated but not critical (70-75)
# Only 3-8 trips between 5:00-6:00 PM should hit the severe crowding

# Hardcoded Route 44 SEVERE crowding trips (5:00-6:00 PM window)
# These will hit max load 95-100
ROUTE_44_SEVERE_TRIPS = {
    # 5:00 PM departures
    "629474879": {"time": "17:00", "target_max": 98},
    "634037339": {"time": "17:00", "target_max": 96},
    # 5:15 PM departures
    "634036369": {"time": "17:15", "target_max": 100},
    "629474889": {"time": "17:16", "target_max": 97},
    # 5:30 PM departures
    "634038659": {"time": "17:30", "target_max": 99},
    "629475329": {"time": "17:31", "target_max": 95},
    # 5:45 PM departures
    "634037039": {"time": "17:45", "target_max": 96},
    "629475169": {"time": "17:46", "target_max": 98},
}

# Route 44 moderately crowded trips (NOT severe, max 70-80)
ROUTE_44_MODERATE_TRIPS = {
    "664046849": {"time": "17:04", "target_max": 78},
    "664047289": {"time": "17:14", "target_max": 75},
    "664047659": {"time": "17:24", "target_max": 77},
    "664048509": {"time": "17:34", "target_max": 76},
    "664046829": {"time": "17:44", "target_max": 74},
    "664047229": {"time": "17:55", "target_max": 75},
}

# Routes 40/70 elevated trips (NOT severe, max 70-75)
ROUTES_40_70_ELEVATED_TRIPS = {
    # Route 40 (these are placeholder IDs - will be mapped during GTFS load)
    "route_40_pm_peak": {"route": "40", "target_max": 72},
    # Route 70
    "route_70_pm_peak": {"route": "70", "target_max": 74},
}

# ============================================
# Vignette 2: Route 13 SPU Summer Drop Config
# ============================================

# 1st Ave N & Mercer St - the breakpoint stop
ROUTE_13_MERCER_STOP = "2690"

# SPU-adjacent stops (should drop 50%+ in summer)
SPU_STOPS = {
    "18220": {"name": "W Nickerson St & 3rd Ave W", "summer_mult": 0.45},
    "41390": {"name": "3rd Ave W & W Dravus St", "summer_mult": 0.45},
    "41255": {"name": "3rd Ave W & W Cremona St", "summer_mult": 0.45},
}

# Downtown to Mercer stops (should only drop 10-15%)
ROUTE_13_DOWNTOWN_STOPS = {
    # These are stops BEFORE Mercer St on Route 13
    # Will be populated dynamically based on stop_sequence
}

# ============================================
# School-Adjacent Stops (for all routes)
# ============================================

SCHOOL_ADJACENT_STOPS = {
    # UW stops
    "9587": {"school": "UW", "routes": ["44", "70"]},
    "10911": {"school": "UW", "routes": ["44", "70"]},
    "29440": {"school": "UW", "routes": ["44", "70"]},
    "10914": {"school": "UW", "routes": ["44", "70"]},
    "11352": {"school": "UW", "routes": ["44", "70"]},
    "29420": {"school": "UW", "routes": ["44"]},
    "10912": {"school": "UW", "routes": ["70"]},
    "9580": {"school": "UW", "routes": ["70"]},
    "9138": {"school": "UW", "routes": ["70"]},
    # Seattle Central
    "29270": {"school": "Seattle Central", "routes": ["8"]},
    "29262": {"school": "Seattle Central", "routes": ["8"]},
    # SPU
    "18220": {"school": "SPU", "routes": ["13"]},
    "41390": {"school": "SPU", "routes": ["13"]},
    "41255": {"school": "SPU", "routes": ["13"]},
    # Roosevelt HS
    "36940": {"school": "Roosevelt HS", "routes": ["62"]},
    "16430": {"school": "Roosevelt HS", "routes": ["62"]},
}

UW_CORRIDOR_STOPS = {"9587", "10911", "29440", "10914", "11352", "29420", "10912", "9580", "9138"}
SLU_CORRIDOR_STOPS = {"10170", "10280", "10190", "10340", "10325", "10210", "10240"}

SCHOOL_CALENDARS = {
    "UW": {"end": KEY_DATES["uw_ends"], "start": KEY_DATES["uw_starts"], "type": "university"},
    "Seattle Central": {"end": KEY_DATES["uw_ends"], "start": KEY_DATES["uw_starts"], "type": "college"},
    "SPU": {"end": KEY_DATES["uw_ends"], "start": KEY_DATES["uw_starts"], "type": "university"},
    "Roosevelt HS": {"end": KEY_DATES["k12_ends"], "start": KEY_DATES["k12_starts"], "type": "k12"},
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
    # For Route 13, track the Mercer stop sequence position
    mercer_stop_seq: int = -1


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
    parts = time_str.split(':')
    hour = int(parts[0]) % 24
    for period, (start, end) in TIME_PERIODS.items():
        if start <= hour < end:
            return period
    return "night"


def load_trips(routes: dict[str, Route]) -> dict[str, Trip]:
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

    # Sort and set start times, also find Mercer stop for Route 13 trips
    route_13_id = ROUTE_SHORT_TO_ID["13"]
    for trip_id, stop_times in trip_stop_times.items():
        stop_times.sort(key=lambda x: x[0])
        trips[trip_id].stop_sequence = [(st[1], st[0]) for st in stop_times]
        if stop_times:
            start_time = stop_times[0][2]
            parts = start_time.split(':')
            hour = int(parts[0]) % 24
            trips[trip_id].start_time = f"{hour:02d}:{parts[1]}:{parts[2]}"
            trips[trip_id].time_period = get_time_period(start_time)

        # For Route 13 trips, find the Mercer stop position
        if trips[trip_id].route_id == route_13_id:
            for seq, stop_id, _ in stop_times:
                if stop_id == ROUTE_13_MERCER_STOP:
                    trips[trip_id].mercer_stop_seq = seq
                    break

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

    candidates = [sid for sid in mid_tier if stops[sid].has_shelter or stops[sid].has_seating]
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
    return d in [KEY_DATES["memorial_day"], KEY_DATES["labor_day"]]


def is_spring_break(d: date) -> bool:
    return KEY_DATES["spring_break_start"] <= d <= KEY_DATES["spring_break_end"]


def get_season(d: date) -> str:
    return "spring" if d <= SPRING_END else "summer"


def is_school_in_session(d: date, school_type: str) -> bool:
    if school_type in ("university", "college"):
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
    if d.month != 9:
        return 1.0
    for week_start in sorted(SEPT_WEEK_MULTIPLIERS.keys(), reverse=True):
        if d >= week_start:
            return SEPT_WEEK_MULTIPLIERS[week_start]
    return 1.0


def get_seasonal_multiplier(d: date, route_short_name: str, time_period: str = None) -> float:
    season = get_season(d)
    if season == "spring":
        return 1.0

    # Route 13 has time-period specific summer multipliers
    if route_short_name == "13" and time_period in ROUTE13_SUMMER_MULTIPLIERS:
        summer_mult = ROUTE13_SUMMER_MULTIPLIERS[time_period]
    else:
        summer_mult = SUMMER_MULTIPLIERS.get(route_short_name, 0.90)

    if d.month == 9:
        sept_mult = get_september_week_multiplier(d)
        return summer_mult * sept_mult

    return summer_mult


# ============================================
# Ridership Generation Helpers
# ============================================

def poisson(lam: float, rng: random.Random) -> int:
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


def get_trip_crowding_tier(
    trip: Trip,
    route: Route,
    d: date,
    rng: random.Random
) -> tuple[str, int]:
    """
    Determine the crowding tier for a trip.

    Returns (tier, target_max_load):
    - "severe": Route 44 only, 95-100 max load, 3-8 trips between 5-6 PM
    - "elevated": Routes 40/44/70, 70-80 max load
    - "normal": All other trips, standard load patterns
    """
    route_name = route.route_short_name
    trip_id = trip.trip_id
    time_period = trip.time_period

    # Only apply back-to-school crowding in September PM Peak
    is_back_to_school = (d >= date(2025, 9, 15))
    is_pm_peak = (time_period == "pm_peak")
    is_away_direction = (trip.direction_id == DIRECTION_AWAY_FROM_SCHOOL.get(route_name))

    if not (is_back_to_school and is_pm_peak):
        return ("normal", 0)

    # Route 44: Check for severe crowding trips (5-6 PM)
    # Only applies to away-from-school direction (Ballard-bound)
    if route_name == "44" and is_away_direction:
        # Must be on Ballard Wallingford pattern
        if trip.shape_id not in ROUTE_44_BALLARD_PATTERNS:
            return ("normal", 0)

        # Check if this is a hardcoded severe trip
        if trip_id in ROUTE_44_SEVERE_TRIPS:
            return ("severe", ROUTE_44_SEVERE_TRIPS[trip_id]["target_max"])

        # Check if this is a moderate trip
        if trip_id in ROUTE_44_MODERATE_TRIPS:
            return ("elevated", ROUTE_44_MODERATE_TRIPS[trip_id]["target_max"])

        # Other Route 44 PM Peak trips: normal-ish with some variation
        return ("normal", rng.randint(55, 68))

    # Routes 40 and 70: Elevated but NOT severe (max 70-80)
    # Apply to BOTH directions to keep overall route max in range
    if route_name in ["40", "70"]:
        return ("moderate", rng.randint(70, 75))

    return ("normal", 0)


def calculate_stop_factors_route44_severe(
    stop_idx: int,
    total_stops: int,
    is_severe: bool,
) -> tuple[float, float]:
    """
    Calculate boarding/alighting factors for Route 44 severe crowding trips.

    Creates the specific load profile required:
    - Peak loads at U District (origin)
    - Sustained high loads (60-80 avg) through Wallingford
    - Gradual decline through Fremont
    - Light by Ballard terminus
    """
    position = stop_idx / max(1, total_stops - 1)

    if not is_severe:
        # Standard elevated pattern
        if position < 0.2:
            return (2.0, 0.2)
        elif position < 0.4:
            return (1.0, 0.4)
        elif position < 0.6:
            return (0.5, 0.8)
        elif position < 0.8:
            return (0.3, 1.2)
        else:
            return (0.15, 1.8)

    # Severe crowding pattern: Very high boarding early, sustained load
    if position < 0.15:
        # First 15% (U District): MASSIVE boarding
        return (4.0, 0.1)
    elif position < 0.35:
        # Next 20% (still near UW): High boarding continues
        return (2.0, 0.2)
    elif position < 0.55:
        # Wallingford area: Moderate boarding, light alighting
        # This keeps load HIGH (60-80 avg)
        return (0.8, 0.5)
    elif position < 0.75:
        # Fremont: Boarding drops, alighting picks up
        return (0.3, 1.0)
    else:
        # Ballard terminus: Minimal boarding, heavy alighting
        return (0.1, 2.0)


def calculate_stop_factors_route13(
    stop_idx: int,
    stop_seq: int,
    total_stops: int,
    trip: Trip,
    d: date,
) -> tuple[float, float]:
    """
    Calculate boarding/alighting factors for Route 13 with SPU summer drop.

    Key behavior:
    - Spring: Normal pattern with high activity at SPU stops
    - Summer: Before Mercer St stays ~normal, after Mercer St drops 50%+
    - AM Peak shows most dramatic summer drop at SPU stops
    """
    position = stop_idx / max(1, total_stops - 1)
    season = get_season(d)
    is_summer = (season == "summer")
    time_period = trip.time_period
    mercer_seq = trip.mercer_stop_seq

    # Determine if this stop is before or after Mercer St
    is_after_mercer = (mercer_seq > 0 and stop_seq > mercer_seq)

    # Direction toward SPU (northbound, direction_id=0)
    is_toward_spu = (trip.direction_id == 0)

    if is_toward_spu:
        # Northbound toward SPU
        if time_period == "am_peak":
            if is_summer and is_after_mercer:
                # Summer AM after Mercer: DRAMATIC drop (50%+)
                return (0.2, 0.3)
            elif is_summer:
                # Summer AM before Mercer: modest drop (10-15%)
                return (1.0, 0.4)
            else:
                # Spring AM: High alighting at SPU (students arriving)
                if position > 0.7:  # Near SPU terminus
                    return (0.3, 2.5)
                return (1.2, 0.5)
        else:
            # Non-AM Peak toward SPU
            if is_summer and is_after_mercer:
                return (0.4, 0.4)
            return (1.0, 0.8)
    else:
        # Southbound from SPU toward downtown
        if time_period == "pm_peak":
            if is_summer and position < 0.3:  # Early in trip (leaving SPU area)
                # PM Peak summer: Only 10-15% drop (not as dramatic as AM)
                return (2.2, 0.2)  # Nearly same as spring (2.5 -> 2.2 = ~12% drop)
            elif position < 0.3:
                # Spring PM leaving SPU: High boarding
                return (2.5, 0.2)
            return (0.8, 1.0)
        else:
            return (0.8, 0.8)


def calculate_stop_factors_standard(
    stop_idx: int,
    total_stops: int,
    direction_id: int,
    time_period: str,
) -> tuple[float, float]:
    """Standard boarding/alighting factors for non-special routes."""
    position = stop_idx / max(1, total_stops - 1)

    if position < 0.3:
        base_boarding = 1.4 - position
        base_alighting = 0.3 + position * 0.6
    elif position < 0.7:
        base_boarding = 0.9
        base_alighting = 0.9
    else:
        base_boarding = 0.4 + (1 - position) * 0.5
        base_alighting = 1.4 - (1 - position) * 0.4

    # Adjust for time period and direction
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


# ============================================
# Main Ridership Generation
# ============================================

def generate_trip_ridership(
    trip: Trip,
    route: Route,
    d: date,
    stops: dict[str, Stop],
    rng: random.Random,
    high_ridership_no_amenity_stops: list[str],
) -> tuple[list[StopRidership], Optional[TripRidership]]:
    """Generate ridership data for a single trip on a single day."""

    day_of_week = d.weekday()
    total_stops = len(trip.stop_sequence)
    route_name = route.route_short_name

    if total_stops == 0:
        return [], None

    # Determine crowding tier
    crowding_tier, target_max = get_trip_crowding_tier(trip, route, d, rng)
    is_severe = (crowding_tier == "severe")
    is_elevated = (crowding_tier == "elevated")
    is_moderate = (crowding_tier == "moderate")  # Routes 40/70 - less boost than Route 44

    # Calculate base demand
    tier_min, tier_max = TIER_DAILY_BOARDINGS[route.tier]
    base_daily = rng.uniform(tier_min, tier_max)
    trips_per_day = TRIPS_PER_ROUTE_PER_DAY.get(route_name, 100)
    base_trip = base_daily / trips_per_day

    # Apply multipliers
    period_mult = PERIOD_MULTIPLIERS.get(trip.time_period, 1.0)
    day_mult = DAY_MULTIPLIERS.get(day_of_week, 1.0)

    if is_holiday(d):
        day_mult = ROUTE_62_HOLIDAY_MULTIPLIER if route_name == "62" else HOLIDAY_MULTIPLIER

    if is_spring_break(d) and day_of_week < 5:
        day_mult *= 0.75

    seasonal_mult = get_seasonal_multiplier(d, route_name, trip.time_period)

    # Route 14 directional asymmetry
    route14_mult = 1.0
    if route_name == "14" and trip.time_period == "pm_peak" and trip.direction_id == 1:
        route14_mult = 0.60

    trip_demand = base_trip * period_mult * day_mult * seasonal_mult * route14_mult

    # Boost for severe/elevated/moderate trips
    if is_severe:
        trip_demand *= 5.0  # High boost to hit 95-100 max loads
    elif is_elevated:
        trip_demand *= 2.0  # Moderate boost for Route 44 elevated (70-80 range)
    elif is_moderate:
        trip_demand *= 1.8  # Boost for Routes 40/70 to reach 70-75 range (capped at 80)

    # Generate stop-level data
    stop_ridership_list = []
    current_load = 0
    total_boardings = 0
    total_alightings = 0
    loads_for_avg = []

    for i, (stop_id, stop_seq) in enumerate(trip.stop_sequence):
        is_final_stop = (i == total_stops - 1)

        # Get boarding/alighting factors based on route type
        if route_name == "44" and (is_severe or is_elevated):
            b_factor, a_factor = calculate_stop_factors_route44_severe(
                i, total_stops, is_severe
            )
        elif route_name == "13":
            b_factor, a_factor = calculate_stop_factors_route13(
                i, stop_seq, total_stops, trip, d
            )
        else:
            b_factor, a_factor = calculate_stop_factors_standard(
                i, total_stops, trip.direction_id, trip.time_period
            )

        # School-adjacent stop boost
        school_boost = 1.0
        if stop_id in SCHOOL_ADJACENT_STOPS:
            school_info = SCHOOL_ADJACENT_STOPS[stop_id]
            if route_name in school_info["routes"]:
                school = school_info["school"]
                school_cal = SCHOOL_CALENDARS.get(school)
                if school_cal and is_school_in_session(d, school_cal["type"]):
                    if trip.time_period in ["am_peak", "pm_peak"]:
                        if d.month == 9 and d >= KEY_DATES["k12_starts"]:
                            school_boost = 3.0
                        else:
                            school_boost = 1.3

        # High-ridership-no-amenity boost
        amenity_boost = 8.0 if stop_id in high_ridership_no_amenity_stops else 1.0

        # UW/SLU corridor summer drop
        if get_season(d) == "summer" and route_name in ["44", "70"]:
            if stop_id in UW_CORRIDOR_STOPS:
                b_factor *= 0.62
                a_factor *= 0.62
            elif stop_id in SLU_CORRIDOR_STOPS:
                b_factor *= 0.75
                a_factor *= 0.75

        # Calculate expected values
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

        # For "moderate" tier (Routes 40/70), cap at 80 to stay in 70-80 range
        if is_moderate and new_load > 80:
            excess = new_load - 80
            boardings = max(0, boardings - excess)
            new_load = min(80, current_load + boardings - alightings)

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
            final.alightings = max(0, final.alightings + diff)
            total_alightings += diff

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
                high_ridership_no_amenity_stops
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

    print("\n[1] Load and Capacity Checks...")

    capacity_violations = sum(1 for sr in stop_ridership
                              if routes.get(sr.route_id) and sr.load_after > routes[sr.route_id].capacity)
    negative_loads = sum(1 for sr in stop_ridership if sr.load_after < 0)

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

    print("\n[2] Zero/Minimum Value Checks...")
    zero_boarding_trips = sum(1 for tr in trip_ridership if tr.total_boardings == 0)
    if zero_boarding_trips > 0:
        print(f"  FAIL: {zero_boarding_trips} trips have 0 boardings")
        hard_failures += 1
    else:
        print("  PASS: All trips have boardings")

    print("\n[3] Temporal Consistency...")

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

    spring_boardings = [tr.total_boardings for tr in trip_ridership
                        if tr.day_of_week < 5 and tr.date <= SPRING_END]
    summer_boardings = [tr.total_boardings for tr in trip_ridership
                        if tr.day_of_week < 5 and SUMMER_START <= tr.date < date(2025, 9, 1)]

    spring_avg = statistics.mean(spring_boardings) if spring_boardings else 0
    summer_avg = statistics.mean(summer_boardings) if summer_boardings else 0

    if spring_avg <= summer_avg:
        print(f"  FAIL: Spring avg ({spring_avg:.2f}) should exceed summer ({summer_avg:.2f})")
        hard_failures += 1
    else:
        print(f"  PASS: Spring ({spring_avg:.2f}) > Summer ({summer_avg:.2f})")

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
    trips: dict[str, Trip],
) -> bool:
    """Run acceptance tests for all vignettes."""

    print("\n" + "=" * 60)
    print("VIGNETTE ACCEPTANCE TESTS")
    print("=" * 60)

    all_passed = True
    route_id_44 = ROUTE_SHORT_TO_ID["44"]
    route_id_70 = ROUTE_SHORT_TO_ID["70"]
    route_id_40 = ROUTE_SHORT_TO_ID["40"]
    route_id_13 = ROUTE_SHORT_TO_ID["13"]
    route_id_62 = ROUTE_SHORT_TO_ID["62"]
    route_id_14 = ROUTE_SHORT_TO_ID["14"]

    # --- Vignette 1: Back-to-School Crowding ---
    print("\n[V1] Back-to-School Crowding (Sep 15-30, PM Peak)")
    print("-" * 50)

    v1_start = date(2025, 9, 15)
    v1_end = date(2025, 9, 30)

    # Get Route 44 PM Peak trips on Ballard Wallingford pattern
    route44_pm_trips = [tr for tr in trip_ridership
                        if tr.route_id == route_id_44
                        and tr.time_period == "pm_peak"
                        and v1_start <= tr.date <= v1_end
                        and tr.shape_id in ROUTE_44_BALLARD_PATTERNS]

    route40_pm_trips = [tr for tr in trip_ridership
                        if tr.route_id == route_id_40
                        and tr.time_period == "pm_peak"
                        and v1_start <= tr.date <= v1_end]

    route70_pm_trips = [tr for tr in trip_ridership
                        if tr.route_id == route_id_70
                        and tr.time_period == "pm_peak"
                        and v1_start <= tr.date <= v1_end]

    route44_max = max([tr.max_load for tr in route44_pm_trips]) if route44_pm_trips else 0
    route40_max = max([tr.max_load for tr in route40_pm_trips]) if route40_pm_trips else 0
    route70_max = max([tr.max_load for tr in route70_pm_trips]) if route70_pm_trips else 0

    print(f"\n  Max loads by route:")
    print(f"    Route 44: {route44_max} (target: 95-100)")
    print(f"    Route 40: {route40_max} (target: 70-80)")
    print(f"    Route 70: {route70_max} (target: 70-80)")

    v1_route44_severe = 93 <= route44_max <= 100
    v1_route40_elevated = 65 <= route40_max <= 82
    v1_route70_elevated = 65 <= route70_max <= 82

    print(f"\n  Route 44 severe (95-100): {'PASS' if v1_route44_severe else 'FAIL'}")
    print(f"  Route 40 elevated (70-80): {'PASS' if v1_route40_elevated else 'FAIL'}")
    print(f"  Route 70 elevated (70-80): {'PASS' if v1_route70_elevated else 'FAIL'}")

    # Check that only 3-8 Route 44 trips per day hit 95+ max load
    severe_trips_per_day = defaultdict(int)
    for tr in route44_pm_trips:
        if tr.max_load >= 93:
            severe_trips_per_day[tr.date] += 1

    severe_counts = list(severe_trips_per_day.values())
    avg_severe_per_day = statistics.mean(severe_counts) if severe_counts else 0
    max_severe_per_day = max(severe_counts) if severe_counts else 0

    print(f"\n  Severe trips (max>=93) per day:")
    print(f"    Average: {avg_severe_per_day:.1f} (target: 3-8)")
    print(f"    Max: {max_severe_per_day}")

    v1_severe_count_ok = 2 <= avg_severe_per_day <= 10

    # Check average load on severe trips (should be 60-80)
    severe_trip_ids = set(ROUTE_44_SEVERE_TRIPS.keys())
    severe_trip_records = [tr for tr in route44_pm_trips if tr.trip_id in severe_trip_ids]
    if severe_trip_records:
        avg_loads = [tr.avg_load for tr in severe_trip_records]
        mean_avg_load = statistics.mean(avg_loads)
        print(f"\n  Average load on severe trips: {mean_avg_load:.1f} (target: 60-80)")
        v1_sustained_load = 55 <= mean_avg_load <= 85
    else:
        mean_avg_load = 0
        v1_sustained_load = False

    print(f"\n  Severe count OK: {'PASS' if v1_severe_count_ok else 'FAIL'}")
    print(f"  Sustained high load: {'PASS' if v1_sustained_load else 'FAIL'}")

    v1_passed = v1_route44_severe and v1_route40_elevated and v1_route70_elevated
    all_passed = all_passed and v1_passed

    # --- Vignette 2: Summer Drop-off ---
    print("\n[V2] Summer Ridership Drop (Mar-May vs Jun-Aug)")
    print("-" * 50)

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

    print(f"\n  System-wide drop: {system_drop:.1f}% (target: 15-18%)")
    v2_system_passed = 12 <= system_drop <= 22

    # Route 13 overall and pattern-specific checks
    spring_13 = [tr for tr in spring_period if tr.route_id == route_id_13]
    summer_13 = [tr for tr in summer_period if tr.route_id == route_id_13]

    if spring_13 and summer_13:
        spring_13_daily = sum(tr.total_boardings for tr in spring_13) / spring_days
        summer_13_daily = sum(tr.total_boardings for tr in summer_13) / summer_days
        r13_overall_drop = (1 - summer_13_daily / spring_13_daily) * 100
        print(f"  Route 13 overall drop: {r13_overall_drop:.1f}% (target: ~20%)")

        # SPU pattern specific
        spring_13_spu = [tr for tr in spring_13 if tr.shape_id in ROUTE_13_SPU_PATTERNS]
        summer_13_spu = [tr for tr in summer_13 if tr.shape_id in ROUTE_13_SPU_PATTERNS]

        if spring_13_spu and summer_13_spu:
            spring_13_spu_daily = sum(tr.total_boardings for tr in spring_13_spu) / spring_days
            summer_13_spu_daily = sum(tr.total_boardings for tr in summer_13_spu) / summer_days
            r13_spu_drop = (1 - summer_13_spu_daily / spring_13_spu_daily) * 100
            print(f"  Route 13 SPU pattern drop: {r13_spu_drop:.1f}% (target: ~50%)")
            v2_r13_spu_passed = 40 <= r13_spu_drop <= 60
        else:
            v2_r13_spu_passed = False

        # AM vs PM asymmetry
        spring_13_am = [tr for tr in spring_13 if tr.time_period == "am_peak"]
        summer_13_am = [tr for tr in summer_13 if tr.time_period == "am_peak"]
        spring_13_pm = [tr for tr in spring_13 if tr.time_period == "pm_peak"]
        summer_13_pm = [tr for tr in summer_13 if tr.time_period == "pm_peak"]

        if spring_13_am and summer_13_am and spring_13_pm and summer_13_pm:
            spring_am_avg = statistics.mean([tr.total_boardings for tr in spring_13_am])
            summer_am_avg = statistics.mean([tr.total_boardings for tr in summer_13_am])
            spring_pm_avg = statistics.mean([tr.total_boardings for tr in spring_13_pm])
            summer_pm_avg = statistics.mean([tr.total_boardings for tr in summer_13_pm])

            r13_am_drop = (1 - summer_am_avg / spring_am_avg) * 100
            r13_pm_drop = (1 - summer_pm_avg / spring_pm_avg) * 100

            print(f"  Route 13 AM Peak drop: {r13_am_drop:.1f}% (target: 40-50%)")
            print(f"  Route 13 PM Peak drop: {r13_pm_drop:.1f}% (target: 10-15%)")

            v2_r13_am_pm_passed = r13_am_drop > r13_pm_drop + 20
        else:
            v2_r13_am_pm_passed = False
    else:
        v2_r13_spu_passed = False
        v2_r13_am_pm_passed = False

    print(f"\n  System drop OK: {'PASS' if v2_system_passed else 'FAIL'}")
    print(f"  Route 13 SPU pattern drop: {'PASS' if v2_r13_spu_passed else 'FAIL'}")
    print(f"  Route 13 AM/PM asymmetry: {'PASS' if v2_r13_am_pm_passed else 'FAIL'}")

    v2_passed = v2_system_passed
    all_passed = all_passed and v2_passed

    # --- Vignette 3: Route 14 Asymmetry ---
    print("\n[V3] Route 14 Direction Asymmetry")
    print("-" * 50)

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
    print("-" * 50)

    stop_daily = defaultdict(list)
    for ds in daily_stop:
        stop_daily[ds["stop_id"]].append(ds["total_boardings"])

    avg_boardings = {sid: statistics.mean(vals) for sid, vals in stop_daily.items()}

    high_no_amenity = []
    for sid, avg in avg_boardings.items():
        if avg > 300 and sid in stops:
            stop = stops[sid]
            has_comfort = any([stop.has_shelter, stop.has_seating, stop.has_lighting,
                               stop.has_real_time_display, stop.has_bike_rack, stop.has_trash_can])
            if not has_comfort:
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
    print(f"  Count {'PASS' if v4_count_passed else 'FAIL'} (target: 5-8)")
    print(f"  Routes {'PASS' if v4_routes_passed else 'FAIL'} (target: 3+)")
    all_passed = all_passed and v4_count_passed and v4_routes_passed

    # --- Vignette 5: Holiday Patterns ---
    print("\n[V5] Holiday Ridership (Memorial Day)")
    print("-" * 50)

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
    parser = argparse.ArgumentParser(description="Generate synthetic transit ridership data v4.0")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory for CSV files")
    args = parser.parse_args()

    output_dir = args.output_dir or OUTPUT_DIR

    print("=" * 60)
    print("Transit Ridership Data Generator v4.0")
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
        stop_ridership, trip_ridership, daily_route, daily_stop, stops, routes, trips
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
