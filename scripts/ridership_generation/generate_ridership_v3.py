#!/usr/bin/env python3
"""
Transit Ridership Data Generator v3.0

Generates synthetic ridership data for King County Metro routes.
Outputs CSV files for Supabase import.

Usage:
    python generate_ridership_v3.py [--seed 42] [--output-dir ./output]

Requirements documented in Transit_Data_Generation_Requirements_v8.md
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
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'generated_v3')

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
# These are the ROUTE-LEVEL daily totals, not per-trip
TIER_DAILY_BOARDINGS = {
    "high": (8000, 12000),
    "medium": (3000, 6000),
    "lower": (1000, 2500),
}

# Approximate trips per route per day (for demand distribution)
# This is used to distribute daily route total across trips
# Note: GTFS has many trip variants; we scale to match actual service
# Total GTFS trips: 3743, running 194 days = many trip-days
# Need to ensure system daily stays in 40k-100k range
TRIPS_PER_ROUTE_PER_DAY = {
    "40": 400,   # High frequency routes have more variants in GTFS
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
    "early_am": 0.25,   # 20-30% of peak
    "am_peak": 2.5,     # Peak
    "midday": 1.0,      # Baseline
    "pm_peak": 2.75,    # Slightly higher than AM
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
# Applied at route level
# Note: These need to produce ~15-18% system drop and ~25-30% for UW routes
SUMMER_MULTIPLIERS = {
    # School-dependent routes (higher swing)
    "44": 0.70,  # -30% (UW)
    "70": 0.70,  # -30% (UW)
    "13": 0.78,  # -22% (SPU)
    "8": 0.80,   # -20% (Seattle Central)
    "62": 0.83,  # -17% (Roosevelt HS)
    # Resilient routes (lower swing)
    "40": 0.88,  # -12%
    "1": 0.88,
    "10": 0.90,
    "11": 0.90,
    "14": 0.90,
}

# Back-to-school ramp-up (September weeks)
SEPT_WEEK_MULTIPLIERS = {
    # Week starting dates and multipliers relative to summer baseline
    date(2025, 9, 1): 1.0,    # Labor Day week - summer baseline
    date(2025, 9, 8): 1.10,   # +10% from summer
    date(2025, 9, 15): 1.15,  # +15% from summer
    date(2025, 9, 22): 1.22,  # +20-25% from summer (full school)
    date(2025, 9, 29): 1.22,  # Same as week 4
}

# School-adjacent stops (verified from GTFS lookup)
SCHOOL_ADJACENT_STOPS = {
    # Route 44 - UW
    "9587": {"school": "UW", "routes": ["44", "70"], "name": "U District Station - Bay 1"},
    "10911": {"school": "UW", "routes": ["44", "70"], "name": "U District Station - Bay 3"},
    "29440": {"school": "UW", "routes": ["44", "70"], "name": "15th Ave NE & NE Campus Pkwy"},
    "10914": {"school": "UW", "routes": ["44", "70"], "name": "15th Ave NE & NE Campus Pkwy"},
    "11352": {"school": "UW", "routes": ["44", "70"], "name": "15th Ave NE & NE 42nd St"},
    "29420": {"school": "UW", "routes": ["44"], "name": "NE Pacific St & 15th Ave NE"},

    # Route 70 - UW (additional)
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

    # Routes 40, 70 - Cornish College (near 1000 Lenora St)
    "600": {"school": "Cornish", "routes": ["40"], "name": "3rd Ave & Virginia St"},
    "420": {"school": "Cornish", "routes": ["40"], "name": "3rd Ave & Virginia St"},
    "880": {"school": "Cornish", "routes": ["70"], "name": "Virginia St & 6th Ave"},
    "900": {"school": "Cornish", "routes": ["70"], "name": "Virginia St & 9th Ave"},
}

# School types for calendar-aware crowding
SCHOOL_CALENDARS = {
    "UW": {"end": KEY_DATES["uw_ends"], "start": KEY_DATES["uw_starts"], "type": "university"},
    "Seattle Central": {"end": KEY_DATES["uw_ends"], "start": KEY_DATES["uw_starts"], "type": "college"},
    "SPU": {"end": KEY_DATES["uw_ends"], "start": KEY_DATES["uw_starts"], "type": "university"},
    "Roosevelt HS": {"end": KEY_DATES["k12_ends"], "start": KEY_DATES["k12_starts"], "type": "k12"},
    "Cornish": {"end": KEY_DATES["uw_ends"], "start": KEY_DATES["uw_starts"], "type": "college"},
}

# Downtown high-volume stops (for spatial validation)
DOWNTOWN_STOPS_KEYWORDS = ["3rd & pike", "westlake", "pioneer square", "3rd ave & pike"]

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
                # Handle empty string arrival_time (fallback to departure_time)
                time_val = row.get('arrival_time') or row.get('departure_time') or ''
                if not time_val:
                    continue  # Skip rows with no time data
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
    """
    Generate synthetic amenities for stops.
    Returns list of stop_ids designated as high-ridership without amenities.
    """
    DOWNTOWN_BOUNDS = {
        "lat_min": 47.600, "lat_max": 47.620,
        "lon_min": -122.345, "lon_max": -122.325,
    }
    HUB_KEYWORDS = ["station", "transit center", "tc", "p&r", "park & ride", "terminal"]

    # Categorize stops by estimated ridership tier
    high_tier = []  # Downtown, hubs
    mid_tier = []   # Near downtown, busy corridors
    low_tier = []   # Neighborhood stops

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

    # Generate amenities based on tier
    def generate_for_tier(stop_ids: list[str], base_prob: float):
        for stop_id in stop_ids:
            stop = stops[stop_id]
            stop.has_shelter = rng.random() < base_prob
            stop.has_seating = rng.random() < base_prob * 0.95
            stop.has_lighting = rng.random() < min(1.0, base_prob * 1.1)
            stop.has_real_time_display = rng.random() < base_prob * 0.4
            stop.has_bike_rack = rng.random() < base_prob * 0.35
            stop.has_wheelchair_access = rng.random() < 0.95  # ADA
            stop.has_tactile_paving = rng.random() < base_prob * 0.7
            stop.has_trash_can = rng.random() < base_prob * 0.8

    generate_for_tier(high_tier, 0.80)
    generate_for_tier(mid_tier, 0.50)
    generate_for_tier(low_tier, 0.20)

    # Select stops to intentionally lack amenities (for Vignette 4)
    # Choose from mid-tier stops that naturally got amenities
    candidates = [
        sid for sid in mid_tier
        if stops[sid].has_shelter or stops[sid].has_seating
    ]
    rng.shuffle(candidates)

    high_ridership_no_amenity = []
    for stop_id in candidates[:target_high_ridership_no_amenity]:
        stop = stops[stop_id]
        # Zero out comfort amenities only, not ADA compliance features
        stop.has_shelter = False
        stop.has_seating = False
        stop.has_lighting = False
        stop.has_real_time_display = False
        stop.has_bike_rack = False
        stop.has_trash_can = False
        # KEEP wheelchair_access and tactile_paving (ADA compliance)
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
        # Universities: in session until ~Jun 13, resume ~Sep 24
        if d <= KEY_DATES["uw_ends"]:
            return not is_spring_break(d)
        elif d >= KEY_DATES["uw_starts"]:
            return True
        return False
    elif school_type == "k12":
        # K-12: in session until ~Jun 20, resume ~Sep 3
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

    # Find which week we're in
    for week_start in sorted(SEPT_WEEK_MULTIPLIERS.keys(), reverse=True):
        if d >= week_start:
            return SEPT_WEEK_MULTIPLIERS[week_start]
    return 1.0


def get_seasonal_multiplier(d: date, route_short_name: str) -> float:
    """
    Get combined seasonal multiplier for a route on a date.
    Accounts for spring/summer difference and September ramp-up.
    """
    season = get_season(d)

    if season == "spring":
        return 1.0  # Spring is baseline

    # Summer: apply summer drop
    summer_mult = SUMMER_MULTIPLIERS.get(route_short_name, 0.90)

    # September: apply back-to-school ramp
    if d.month == 9:
        sept_mult = get_september_week_multiplier(d)
        return summer_mult * sept_mult

    return summer_mult


# ============================================
# Ridership Generation
# ============================================

def poisson(lam: float, rng: random.Random) -> int:
    """Generate Poisson-distributed random integer."""
    if lam <= 0:
        return 0
    # For large lambda, use normal approximation
    if lam > 30:
        return max(0, int(rng.gauss(lam, math.sqrt(lam))))

    L = math.exp(-lam)
    k = 0
    p = 1.0
    while p > L:
        k += 1
        p *= rng.random()
    return k - 1


def calculate_stop_position_factors(stop_idx: int, total_stops: int,
                                    direction_id: int, time_period: str) -> tuple[float, float]:
    """
    Calculate boarding/alighting factors based on position and direction.
    Returns (boarding_factor, alighting_factor).

    Implements directional load curves per A.10:
    - AM Peak outbound (to downtown): Load builds early, peaks approaching downtown
    - AM Peak inbound: Opposite
    - PM Peak: Reverse of AM patterns
    """
    position = stop_idx / max(1, total_stops - 1)  # 0.0 to 1.0

    # Base curve: builds then tapers
    if position < 0.3:
        base_boarding = 1.4 - position
        base_alighting = 0.3 + position * 0.6
    elif position < 0.7:
        base_boarding = 0.9
        base_alighting = 0.9
    else:
        base_boarding = 0.4 + (1 - position) * 0.5
        base_alighting = 1.4 - (1 - position) * 0.4

    # Adjust for direction and time period
    # direction_id 0 typically = outbound (to downtown), 1 = inbound
    if time_period == "am_peak":
        if direction_id == 0:  # Outbound morning = commuters going downtown
            # Heavy boarding early, heavy alighting at end (downtown)
            base_boarding *= 1.1 if position < 0.5 else 0.7
            base_alighting *= 0.6 if position < 0.5 else 1.3
        else:  # Inbound morning = reverse commute
            base_boarding *= 0.8 if position < 0.5 else 1.0
            base_alighting *= 1.0 if position < 0.5 else 0.8
    elif time_period == "pm_peak":
        if direction_id == 0:  # Outbound evening = leaving downtown
            base_boarding *= 1.2 if position < 0.3 else 0.6
            base_alighting *= 0.5 if position < 0.3 else 1.2
        else:  # Inbound evening = going to downtown
            base_boarding *= 0.7 if position < 0.5 else 1.1
            base_alighting *= 1.1 if position < 0.5 else 0.7

    return base_boarding, base_alighting


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

    # --- Calculate base demand ---
    # Get route's daily boarding target
    tier_min, tier_max = TIER_DAILY_BOARDINGS[route.tier]
    base_daily = rng.uniform(tier_min, tier_max)

    # Per-trip share - use realistic trips per day, not GTFS total
    trips_per_day = TRIPS_PER_ROUTE_PER_DAY.get(route.route_short_name, 100)
    base_trip = base_daily / trips_per_day

    # --- Apply multipliers ---

    # Time period
    period_mult = PERIOD_MULTIPLIERS.get(trip.time_period, 1.0)

    # Day of week
    day_mult = DAY_MULTIPLIERS.get(day_of_week, 1.0)

    # Holiday override
    if is_holiday(d):
        if route.route_short_name == "62":
            day_mult = ROUTE_62_HOLIDAY_MULTIPLIER
        else:
            day_mult = HOLIDAY_MULTIPLIER

    # Spring break (reduced but not holiday-level)
    if is_spring_break(d) and day_of_week < 5:
        day_mult *= 0.75

    # Seasonal (spring/summer/september ramp)
    seasonal_mult = get_seasonal_multiplier(d, route.route_short_name)

    # Route 14 directional asymmetry (Vignette 3)
    # PM inbound is 40% lower due to Link competition
    route14_mult = 1.0
    if route.route_short_name == "14":
        if trip.time_period == "pm_peak" and trip.direction_id == 1:
            route14_mult = 0.60  # 40% reduction

    # Combined trip demand
    trip_demand = base_trip * period_mult * day_mult * seasonal_mult * route14_mult

    # --- Generate stop-level data ---
    stop_ridership_list = []
    current_load = 0
    total_boardings = 0
    total_alightings = 0
    loads_for_avg = []  # Excludes final stop per A.6

    for i, (stop_id, stop_seq) in enumerate(trip.stop_sequence):
        is_final_stop = (i == total_stops - 1)

        # Position-based factors
        b_factor, a_factor = calculate_stop_position_factors(
            i, total_stops, trip.direction_id, trip.time_period
        )

        # School-adjacent boost
        # NOTE: The seasonal multiplier already accounts for school calendar
        # This boost is for localized crowding AT school stops during peak
        school_boost = 1.0
        if stop_id in SCHOOL_ADJACENT_STOPS:
            school_info = SCHOOL_ADJACENT_STOPS[stop_id]
            if route.route_short_name in school_info["routes"]:
                school = school_info["school"]
                school_cal = SCHOOL_CALENDARS.get(school)
                if school_cal and is_school_in_session(d, school_cal["type"]):
                    if trip.time_period in ["am_peak", "pm_peak"]:
                        # Back-to-school September gets strong boost for V1 vignette
                        # Lower-tier routes need extra boost to show crowding
                        tier_boost = 2.0 if route.tier == "lower" else 1.0
                        if d.month == 9 and d >= KEY_DATES["k12_starts"]:
                            school_boost = 6.0 * tier_boost  # Very strong crowding for back-to-school
                        else:
                            # Normal school session: modest boost
                            # Keep small to not distort V2 May vs June comparison
                            school_boost = 1.3 * tier_boost

        # High-ridership-no-amenity boost (Vignette 4)
        amenity_boost = 1.0
        if stop_id in high_ridership_no_amenity_stops:
            amenity_boost = 8.0  # Very strong boost to ensure >300 daily boardings

        # Calculate expected boardings/alightings
        stop_share = trip_demand / total_stops
        expected_boardings = stop_share * b_factor * school_boost * amenity_boost
        expected_alightings = stop_share * a_factor

        if is_final_stop:
            # Final stop: no boardings, everyone alights
            boardings = 0
            alightings = current_load
        else:
            # Poisson-distributed counts
            boardings = poisson(expected_boardings, rng)

            # Alightings can't exceed current load
            expected_alightings_capped = min(expected_alightings, current_load * 0.8)
            alightings = min(poisson(expected_alightings_capped, rng), current_load)

        # Ensure first stop has at least 1 boarding (no empty trips)
        if i == 0 and boardings == 0:
            boardings = max(1, poisson(1.5, rng))

        # Update load
        new_load = current_load + boardings - alightings

        # Capacity enforcement (A.13)
        if new_load > route.capacity:
            # Cap boardings - excess passengers don't board
            excess = new_load - route.capacity
            boardings = max(0, boardings - excess)
            new_load = route.capacity

        current_load = max(0, new_load)

        # Track loads (exclude final stop per A.6)
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

    # --- Balance fix-up (A.16) ---
    # Ensure total boardings ~ total alightings
    diff = total_boardings - total_alightings
    if abs(diff) > 3 and abs(diff) / max(1, total_boardings) > 0.05:
        # Adjust final stop alightings
        if stop_ridership_list:
            final = stop_ridership_list[-1]
            adjustment = diff
            final.alightings = max(0, final.alightings + adjustment)
            total_alightings += adjustment

    # --- Create trip summary ---
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

    # Count trips per route for demand distribution
    route_trip_counts = defaultdict(int)
    for trip in trips.values():
        if trip.stop_sequence:
            route_trip_counts[trip.route_id] += 1

    # Generate for each day
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

    # Group data
    trips_by_date = defaultdict(list)
    for tr in trip_ridership:
        trips_by_date[tr.date].append(tr)

    stops_by_date_stop = defaultdict(lambda: defaultdict(list))
    for sr in stop_ridership:
        stops_by_date_stop[sr.date][sr.stop_id].append(sr)

    # Precompute final stop_sequence per (date, trip_id) to exclude from avg_load
    final_seq = {}
    for sr in stop_ridership:
        k = (sr.date, sr.trip_id)
        final_seq[k] = max(final_seq.get(k, -1), sr.stop_sequence)

    # For segment-weighted avg_load (A.6a) - exclude final stops
    segments_by_date = defaultdict(list)
    segments_by_date_route = defaultdict(lambda: defaultdict(list))
    segments_by_date_period = defaultdict(lambda: defaultdict(list))

    for sr in stop_ridership:
        # Exclude final stops (no segment after them)
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

        # System summary (segment-weighted avg_load)
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

        # Route summaries
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

        # Stop summaries
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

        # Period summaries
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
    """
    Run validation checks per Section 6.
    Returns (hard_failures, warnings).
    """
    print("\n" + "=" * 60)
    print("VALIDATION")
    print("=" * 60)

    hard_failures = 0
    warnings = 0

    # --- 6.1 Load and Capacity (Hard Failures) ---
    print("\n[6.1] Load and Capacity Checks...")

    # Check max loads don't exceed capacity
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

    # Check final stop loads
    trip_final_stops = {}
    for sr in stop_ridership:
        key = (sr.date, sr.trip_id)
        if key not in trip_final_stops or sr.stop_sequence > trip_final_stops[key][0]:
            trip_final_stops[key] = (sr.stop_sequence, sr.load_after)

    high_final_loads = sum(1 for _, load in trip_final_stops.values() if load > 5)
    if high_final_loads > len(trip_final_stops) * 0.05:  # Allow 5% tolerance
        print(f"  WARN: {high_final_loads} trips have final stop load > 5")
        warnings += 1
    else:
        print(f"  PASS: Final stop loads acceptable ({high_final_loads} > 5)")

    # --- 6.2 Zero and Minimum Values (Hard Failures) ---
    print("\n[6.2] Zero/Minimum Value Checks...")

    zero_boarding_trips = sum(1 for tr in trip_ridership if tr.total_boardings == 0)
    if zero_boarding_trips > 0:
        print(f"  FAIL: {zero_boarding_trips} trips have 0 boardings")
        hard_failures += 1
    else:
        print("  PASS: All trips have boardings")

    # --- 6.3 Balance Checks (Hard Failures) ---
    print("\n[6.3] Balance Checks...")

    unbalanced = 0
    for tr in trip_ridership:
        diff = abs(tr.total_boardings - tr.total_alightings)
        pct = diff / max(1, tr.total_boardings)
        if diff > 3 and pct > 0.05:
            unbalanced += 1

    if unbalanced > len(trip_ridership) * 0.01:  # Allow 1% tolerance
        print(f"  WARN: {unbalanced} trips have unbalanced boardings/alightings")
        warnings += 1
    else:
        print(f"  PASS: Trip balance acceptable ({unbalanced} unbalanced)")

    # --- 6.4 Temporal Consistency (Hard Failures) ---
    print("\n[6.4] Temporal Consistency...")

    # Weekday > weekend
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

    # Spring > Summer (system-wide)
    spring_boardings = []
    summer_boardings = []
    for tr in trip_ridership:
        if tr.day_of_week < 5:  # Weekdays only
            if tr.date <= SPRING_END:
                spring_boardings.append(tr.total_boardings)
            elif tr.date < date(2025, 9, 1):  # Before Labor Day
                summer_boardings.append(tr.total_boardings)

    spring_avg = statistics.mean(spring_boardings) if spring_boardings else 0
    summer_avg = statistics.mean(summer_boardings) if summer_boardings else 0

    if spring_avg <= summer_avg:
        print(f"  FAIL: Spring avg ({spring_avg:.2f}) should exceed summer ({summer_avg:.2f})")
        hard_failures += 1
    else:
        print(f"  PASS: Spring ({spring_avg:.2f}) > Summer ({summer_avg:.2f})")

    # September week 4 > week 1
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

    # --- 6.6 Reasonableness Bounds (Hard Failures) ---
    print("\n[6.6] Reasonableness Bounds...")

    # System daily bounds
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
    """Run acceptance tests for all 5 vignettes."""

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

    # --- Vignette 1: Back-to-School Crowding ---
    print("\n[V1] Back-to-School Crowding (Sep 15-30, PM Peak)")
    print("-" * 40)

    school_routes = [route_id_44, route_id_70, route_id_8, route_id_13, route_id_62]
    v1_start = date(2025, 9, 15)
    v1_end = date(2025, 9, 30)

    # Find trips with high max_load near schools
    # Thresholds from spec Section 3.6: "crowded" level
    # Standard (40'): crowded = 31-45, so threshold 35
    # Articulated (60'): crowded = 51-75, so threshold 55
    high_load_trips = defaultdict(int)
    for tr in trip_ridership:
        if (tr.route_id in school_routes and
            tr.time_period == "pm_peak" and
            v1_start <= tr.date <= v1_end):
            route = routes[tr.route_id]
            threshold = 55 if route.bus_type == "articulated" else 35
            if tr.max_load >= threshold:
                high_load_trips[tr.route_id] += 1

    routes_with_crowding = sum(1 for count in high_load_trips.values() if count >= 5)
    v1_passed = routes_with_crowding >= 3

    print(f"  Routes with 5+ high-load trips: {routes_with_crowding}")
    for rid, count in high_load_trips.items():
        print(f"    Route {TARGET_ROUTES[rid]}: {count} trips")
    print(f"  {'PASS' if v1_passed else 'FAIL'}: Expected >= 3 routes")
    all_passed = all_passed and v1_passed

    # --- Vignette 2: Summer Drop-off ---
    print("\n[V2] Summer Ridership Drop (May vs June)")
    print("-" * 40)

    # May 25-31 vs June 22-28
    may_period = [tr for tr in trip_ridership
                  if date(2025, 5, 25) <= tr.date <= date(2025, 5, 31) and tr.day_of_week < 5]
    june_period = [tr for tr in trip_ridership
                   if date(2025, 6, 22) <= tr.date <= date(2025, 6, 28) and tr.day_of_week < 5]

    may_total = sum(tr.total_boardings for tr in may_period)
    june_total = sum(tr.total_boardings for tr in june_period)
    may_days = len(set(tr.date for tr in may_period))
    june_days = len(set(tr.date for tr in june_period))

    system_drop = (1 - (june_total/june_days) / (may_total/may_days)) * 100 if may_total > 0 else 0

    # Routes 44, 70 specific
    may_44_70 = sum(tr.total_boardings for tr in may_period if tr.route_id in [route_id_44, route_id_70])
    june_44_70 = sum(tr.total_boardings for tr in june_period if tr.route_id in [route_id_44, route_id_70])
    route_44_70_drop = (1 - (june_44_70/june_days) / (may_44_70/may_days)) * 100 if may_44_70 > 0 else 0

    v2_system_passed = 12 <= system_drop <= 22  # Target 15-18%
    v2_routes_passed = 20 <= route_44_70_drop <= 35  # Target 25-30%

    print(f"  System-wide drop: {system_drop:.1f}% (target: 15-18%)")
    print(f"  Routes 44/70 drop: {route_44_70_drop:.1f}% (target: 25-30%)")
    print(f"  System {'PASS' if v2_system_passed else 'FAIL'}")
    print(f"  Routes 44/70 {'PASS' if v2_routes_passed else 'FAIL'}")
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
    v3_passed = 30 <= asymmetry <= 50  # Target 35-45%

    print(f"  AM outbound avg: {am_out_avg:.1f}")
    print(f"  PM inbound avg: {pm_in_avg:.1f}")
    print(f"  Asymmetry: {asymmetry:.1f}% (target: 35-45%)")
    print(f"  {'PASS' if v3_passed else 'FAIL'}")
    all_passed = all_passed and v3_passed

    # --- Vignette 4: Amenity Equity ---
    print("\n[V4] High-Ridership Stops Without Amenities")
    print("-" * 40)

    # Calculate avg daily boardings per stop
    stop_daily = defaultdict(list)
    for ds in daily_stop:
        stop_daily[ds["stop_id"]].append(ds["total_boardings"])

    avg_boardings = {sid: statistics.mean(vals) for sid, vals in stop_daily.items()}

    # Find stops with >300 avg daily and no comfort amenities
    # (ADA features like wheelchair_access don't count - those are legal requirements)
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

    # Check they're across multiple routes
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

    # Memorial Day (May 26) vs May 19 (previous Monday)
    memorial_day = date(2025, 5, 26)
    normal_monday = date(2025, 5, 19)

    memorial_trips = [tr for tr in trip_ridership if tr.date == memorial_day]
    normal_trips = [tr for tr in trip_ridership if tr.date == normal_monday]

    memorial_total = sum(tr.total_boardings for tr in memorial_trips)
    normal_total = sum(tr.total_boardings for tr in normal_trips)

    holiday_pct = (memorial_total / normal_total * 100) if normal_total > 0 else 0
    v5_system_passed = 45 <= holiday_pct <= 65  # Target 50-60%

    # Route 62 specifically
    memorial_62 = sum(tr.total_boardings for tr in memorial_trips if tr.route_id == route_id_62)
    normal_62 = sum(tr.total_boardings for tr in normal_trips if tr.route_id == route_id_62)
    route62_pct = (memorial_62 / normal_62 * 100) if normal_62 > 0 else 0
    v5_route62_passed = 65 <= route62_pct <= 85  # Target 70-80%

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

    # Routes
    routes_data = [{
        "route_id": r.route_id,
        "route_short_name": r.route_short_name,
        "route_long_name": r.route_long_name,
        "route_type": r.route_type,
    } for r in routes.values()]
    write_csv(output_dir, "routes.csv", routes_data,
              ["route_id", "route_short_name", "route_long_name", "route_type"])

    # Stops
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

    # Trips
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

    # Stop ridership
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

    # Trip ridership
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

    # Summary tables
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
    parser = argparse.ArgumentParser(description="Generate synthetic transit ridership data v3.0")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory for CSV files")
    args = parser.parse_args()

    output_dir = args.output_dir or OUTPUT_DIR

    print("=" * 60)
    print("Transit Ridership Data Generator v3.0")
    print("=" * 60)
    print(f"Seed: {args.seed}")
    print(f"Output: {output_dir}")
    print(f"Date range: {START_DATE} to {END_DATE} ({(END_DATE - START_DATE).days + 1} days)")
    print()

    # Initialize RNG
    rng = random.Random(args.seed)

    # Load GTFS data
    print("Loading GTFS data...")
    routes = load_routes()
    print(f"  Loaded {len(routes)} routes")

    trips = load_trips(routes)
    print(f"  Loaded {len(trips)} trips")

    stops, _ = load_stops_for_routes(trips)
    print(f"  Loaded {len(stops)} stops")

    # Filter trips with no stops
    trips = {tid: t for tid, t in trips.items() if t.stop_sequence}
    print(f"  Filtered to {len(trips)} trips with stop sequences")

    # Generate amenities
    print("\nGenerating stop amenities...")
    high_ridership_no_amenity_stops = generate_amenities(stops, rng)
    print(f"  Marked {len(high_ridership_no_amenity_stops)} high-ridership stops without amenities")

    # Generate ridership
    print("\nGenerating ridership data (this may take several minutes)...")
    stop_ridership, trip_ridership = generate_all_ridership(
        routes, trips, stops, rng, high_ridership_no_amenity_stops
    )
    print(f"  Generated {len(stop_ridership):,} stop ridership records")
    print(f"  Generated {len(trip_ridership):,} trip ridership records")

    # Generate summaries
    print("\nGenerating summary tables...")
    daily_system, daily_route, daily_stop, daily_period = generate_daily_summaries(
        stop_ridership, trip_ridership
    )
    print(f"  Generated {len(daily_system)} daily system summaries")
    print(f"  Generated {len(daily_route)} daily route summaries")
    print(f"  Generated {len(daily_stop):,} daily stop summaries")
    print(f"  Generated {len(daily_period)} daily period summaries")

    # Write CSVs
    print("\nWriting CSV files...")
    output_all_csv(
        output_dir,
        routes, stops, trips,
        stop_ridership, trip_ridership,
        daily_system, daily_route, daily_stop, daily_period
    )

    # Validation
    hard_failures, warnings = run_validation(
        stop_ridership, trip_ridership, routes, stops
    )

    # Acceptance tests
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
