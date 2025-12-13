#!/usr/bin/env python3
"""
Transit Ridership Data Generator

Generates synthetic ridership data for King County Metro routes.
Outputs CSV files for Supabase import.

Usage:
    python generate_ridership.py [--seed 42] [--output-dir ./output]

Requirements documented in Transit_Ridership_Requirements_v2.5
"""

import argparse
import csv
import gzip
import json
import os
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Optional
from collections import defaultdict
import statistics

# ============================================
# Configuration
# ============================================

GTFS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'GTFS')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')

# Date range: September 2025
START_DATE = date(2025, 9, 1)
END_DATE = date(2025, 9, 30)
LABOR_DAY = date(2025, 9, 1)  # Monday, September 1, 2025

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

# Route classifications by ridership tier
ROUTE_TIERS = {
    # High ridership: 8,000-12,000 daily boardings
    "high": ["40", "44", "70"],
    # Medium ridership: 3,000-6,000 daily boardings
    "medium": ["8", "62", "1"],
    # Lower ridership: 1,000-2,500 daily boardings
    "lower": ["10", "11", "13", "14"],
}

# Daily boarding targets by tier (weekday baseline)
TIER_DAILY_BOARDINGS = {
    "high": (8000, 12000),
    "medium": (3000, 6000),
    "lower": (1000, 2500),
}

# Time period definitions (hour ranges, inclusive start, exclusive end)
TIME_PERIODS = {
    "early_am": (0, 6),    # 12:00 AM - 6:00 AM
    "am_peak": (6, 9),     # 6:00 AM - 9:00 AM
    "midday": (9, 15),     # 9:00 AM - 3:00 PM
    "pm_peak": (15, 19),   # 3:00 PM - 7:00 PM
    "evening": (19, 22),   # 7:00 PM - 10:00 PM
    "night": (22, 24),     # 10:00 PM - 12:00 AM
}

# Period multipliers relative to midday baseline
PERIOD_MULTIPLIERS = {
    "early_am": 0.25,   # 20-30% of peak
    "am_peak": 2.5,     # 2-3x midday
    "midday": 1.0,      # baseline
    "pm_peak": 2.5,     # 2-3x midday
    "evening": 0.6,     # moderate
    "night": 0.25,      # 20-30% of peak
}

# Day of week multipliers (0=Monday, 6=Sunday)
DAY_MULTIPLIERS = {
    0: 1.0,   # Monday
    1: 1.0,   # Tuesday
    2: 1.0,   # Wednesday
    3: 1.0,   # Thursday
    4: 0.95,  # Friday (slightly lower)
    5: 0.35,  # Saturday (~1/3 weekday)
    6: 0.30,  # Sunday (~1/3 weekday, lower than Sat)
}

# School-adjacent stops (verified from GTFS lookup)
SCHOOL_ADJACENT_STOPS = {
    # Route 44 (UW)
    "9587": {"school": "UW", "route": "44", "name": "U District Station - Bay 1"},
    "29440": {"school": "UW", "route": "44", "name": "15th Ave NE & NE Campus Pkwy"},
    "11352": {"school": "UW", "route": "44", "name": "15th Ave NE & NE 42nd St"},
    "29420": {"school": "UW", "route": "44", "name": "NE Pacific St & 15th Ave NE"},
    # Route 8 (Seattle Central College)
    "29270": {"school": "Seattle Central", "route": "8", "name": "E John St & Broadway E - Bay 1"},
    "29262": {"school": "Seattle Central", "route": "8", "name": "E John St & Broadway E - Bay 2"},
    # Route 8 (Garfield HS)
    "43720": {"school": "Garfield", "route": "8", "name": "Martin L King Jr Way & E Alder St"},
    "43778": {"school": "Garfield", "route": "8", "name": "Martin L King Jr Way & E Alder St"},
    "43782": {"school": "Garfield", "route": "8", "name": "Martin L King Jr Way & E Cherry St"},
    "43716": {"school": "Garfield", "route": "8", "name": "Martin L King Jr Way & E Cherry St"},
}

# School crowding parameters
SCHOOL_CROWDING = {
    "affected_routes": ["44", "8"],
    "crowded_periods": ["am_peak", "pm_peak"],
    "crowded_time_ranges": {
        "am_peak": (7, 9),   # 7:30-8:30 AM primarily
        "pm_peak": (15, 17), # 3:00-5:00 PM primarily
    },
    "load_multiplier": 1.8,  # Increase load by 80% near schools
    "avg_load_target": (60, 80),
    "max_load_target": (100, 120),
}

# Month progression (Vignette 2)
# Week 1 includes Labor Day, Week 4 is "normal"
# These multipliers are VERY SUBTLE since random variation already adds noise
# Target: ~8% system-wide growth from week 1 to week 4
WEEK_MULTIPLIERS = {
    1: 0.98,   # Week 1 (Sept 1-7): slightly lower baseline
    2: 0.99,   # Week 2 (Sept 8-14): ramping up
    3: 1.01,   # Week 3 (Sept 15-21): normal
    4: 1.02,   # Week 4 (Sept 22-28): ~4% above week 1 baseline
    5: 1.02,   # Week 5 (Sept 29-30): same as week 4
}

# School routes get extra boost in later weeks
# Target: ~15-20% week 4 vs week 1 for school routes (routes 44, 8)
# The school stop crowding also adds localized boost, so keep route-level subtle
SCHOOL_ROUTE_WEEK_BOOST = {
    1: 0.97,   # Week 1: slightly lower (no school routines yet)
    2: 1.00,   # Week 2: building up to normal
    3: 1.01,   # Week 3: established
    4: 1.02,   # Week 4: fully established
    5: 1.02,   # Week 5: same
}

# Graduated school stop crowding by week (applied at stop level only)
# This is a localized boost at specific school-adjacent stops
# Flattened significantly to keep week 4 vs week 1 difference manageable
SCHOOL_STOP_WEEK_CROWDING = {
    1: 1.0,    # Week 1: baseline
    2: 1.05,   # Week 2: slight crowding starting
    3: 1.10,   # Week 3: moderate crowding
    4: 1.15,   # Week 4: full crowding
    5: 1.15,   # Week 5: same
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
    tier: str = ""


@dataclass
class Stop:
    stop_id: str
    stop_name: str
    lat: float
    lon: float
    # Amenities (generated)
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
    start_time: str  # HH:MM:SS
    time_period: str
    headsign: str
    stop_sequence: list = field(default_factory=list)  # List of (stop_id, stop_sequence)


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
                # Determine tier
                tier = "lower"  # default
                for t, route_list in ROUTE_TIERS.items():
                    if short_name in route_list:
                        tier = t
                        break
                routes[row['route_id']] = Route(
                    route_id=row['route_id'],
                    route_short_name=short_name,
                    route_long_name=row.get('route_long_name', ''),
                    route_type=int(row.get('route_type', 3)),
                    tier=tier,
                )
    return routes


def get_time_period(time_str: str) -> str:
    """Convert HH:MM:SS to time period. Handles times >24:00:00."""
    parts = time_str.split(':')
    hour = int(parts[0]) % 24  # Normalize >24 hour times

    for period, (start, end) in TIME_PERIODS.items():
        if start <= hour < end:
            return period
    return "night"  # fallback


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
                    start_time="",  # Will be set from stop_times
                    time_period="",  # Will be set from start_time
                    headsign=row.get('trip_headsign', ''),
                )
    return trips


def load_stops_for_routes(trips: dict[str, Trip]) -> tuple[dict[str, Stop], dict[str, list]]:
    """
    Load stops served by our trips and build stop sequences.
    Returns (stops_dict, trip_stop_sequences).
    """
    trip_ids = set(trips.keys())
    stop_ids_needed = set()
    trip_stop_times = defaultdict(list)  # trip_id -> [(stop_sequence, stop_id, arrival_time)]

    # First pass: collect stop_times
    print("  Loading stop_times.txt...")
    with open(os.path.join(GTFS_DIR, 'stop_times.txt'), 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['trip_id'] in trip_ids:
                stop_ids_needed.add(row['stop_id'])
                trip_stop_times[row['trip_id']].append((
                    int(row['stop_sequence']),
                    row['stop_id'],
                    row.get('arrival_time', row.get('departure_time', ''))
                ))

    # Sort stop sequences and set start times
    for trip_id, stop_times in trip_stop_times.items():
        stop_times.sort(key=lambda x: x[0])  # Sort by stop_sequence
        trips[trip_id].stop_sequence = [(st[1], st[0]) for st in stop_times]  # (stop_id, seq)
        if stop_times:
            start_time = stop_times[0][2]  # First stop arrival time
            # Normalize time >24:00:00
            parts = start_time.split(':')
            hour = int(parts[0]) % 24
            normalized_time = f"{hour:02d}:{parts[1]}:{parts[2]}"
            trips[trip_id].start_time = normalized_time
            trips[trip_id].time_period = get_time_period(start_time)

    # Load stop details
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

def generate_amenities(stops: dict[str, Stop], rng: random.Random) -> list[str]:
    """
    Generate synthetic amenities for stops.
    Busier stops (downtown, transit centers) get more amenities.
    Returns list of high-ridership stops that lack all amenities (for Vignette 3).

    Note: Actual ridership isn't known yet, so we use location heuristics.
    """
    # Downtown Seattle approximate bounds
    DOWNTOWN_BOUNDS = {
        "lat_min": 47.600,
        "lat_max": 47.620,
        "lon_min": -122.345,
        "lon_max": -122.325,
    }

    # Transit hub keywords
    HUB_KEYWORDS = ["station", "transit center", "tc", "p&r", "park & ride", "terminal"]

    high_ridership_no_amenities = []

    for stop_id, stop in stops.items():
        # Determine stop "importance" score
        is_downtown = (
            DOWNTOWN_BOUNDS["lat_min"] <= stop.lat <= DOWNTOWN_BOUNDS["lat_max"] and
            DOWNTOWN_BOUNDS["lon_min"] <= stop.lon <= DOWNTOWN_BOUNDS["lon_max"]
        )
        is_hub = any(kw in stop.stop_name.lower() for kw in HUB_KEYWORDS)

        # Base probabilities
        if is_downtown or is_hub:
            base_prob = 0.85  # High probability of amenities
        else:
            base_prob = 0.40  # Lower probability

        # Generate amenities with correlated probabilities
        stop.has_shelter = rng.random() < base_prob
        stop.has_seating = rng.random() < base_prob * 0.95  # Usually comes with shelter
        stop.has_lighting = rng.random() < base_prob * 1.1  # Lighting is common
        stop.has_real_time_display = rng.random() < base_prob * 0.5  # Less common
        stop.has_bike_rack = rng.random() < base_prob * 0.4
        stop.has_wheelchair_access = rng.random() < base_prob * 1.2  # ADA compliance
        stop.has_tactile_paving = rng.random() < base_prob * 0.6
        stop.has_trash_can = rng.random() < base_prob * 0.8

        # Track stops with no amenities (potential Vignette 3 candidates)
        has_any_amenity = any([
            stop.has_shelter, stop.has_seating, stop.has_lighting,
            stop.has_real_time_display, stop.has_bike_rack,
            stop.has_wheelchair_access, stop.has_tactile_paving, stop.has_trash_can
        ])
        if not has_any_amenity and (is_downtown or is_hub):
            high_ridership_no_amenities.append(stop_id)

    # Ensure we have 5-8 high-ridership stops without amenities (Vignette 3)
    # We'll mark some additional stops as lacking amenities
    target_no_amenity_count = rng.randint(5, 8)

    # If we don't have enough, remove amenities from some medium-importance stops
    if len(high_ridership_no_amenities) < target_no_amenity_count:
        # Find candidate stops (not downtown, not hubs, but on main routes)
        candidates = [
            stop_id for stop_id, stop in stops.items()
            if stop_id not in high_ridership_no_amenities
            and not any(kw in stop.stop_name.lower() for kw in HUB_KEYWORDS)
        ]
        rng.shuffle(candidates)

        for stop_id in candidates[:target_no_amenity_count - len(high_ridership_no_amenities)]:
            stop = stops[stop_id]
            stop.has_shelter = False
            stop.has_seating = False
            stop.has_lighting = False
            stop.has_real_time_display = False
            stop.has_bike_rack = False
            stop.has_wheelchair_access = False
            stop.has_tactile_paving = False
            stop.has_trash_can = False
            high_ridership_no_amenities.append(stop_id)

    return high_ridership_no_amenities[:target_no_amenity_count]


# ============================================
# Ridership Generation
# ============================================

def get_week_number(d: date) -> int:
    """Get week number within September (1-5)."""
    day = d.day
    if day <= 7:
        return 1
    elif day <= 14:
        return 2
    elif day <= 21:
        return 3
    elif day <= 28:
        return 4
    else:
        return 5


def calculate_stop_position_factor(stop_seq: int, total_stops: int) -> tuple[float, float]:
    """
    Calculate boarding/alighting factors based on position in route.
    Returns (boarding_factor, alighting_factor).

    Pattern: Load builds early, peaks in middle, tapers at end.
    """
    position = stop_seq / total_stops  # 0.0 to 1.0

    if position < 0.3:
        # Early stops: high boarding, low alighting
        boarding_factor = 1.5 - position
        alighting_factor = 0.2 + position * 0.5
    elif position < 0.7:
        # Middle stops: moderate both
        boarding_factor = 0.8
        alighting_factor = 0.8
    else:
        # Late stops: low boarding, high alighting
        boarding_factor = 0.3 + (1 - position) * 0.5
        alighting_factor = 1.5 - (1 - position)

    return boarding_factor, alighting_factor


def generate_trip_ridership(
    trip: Trip,
    route: Route,
    d: date,
    stops: dict[str, Stop],
    rng: random.Random,
    high_ridership_no_amenity_stops: list[str],
) -> tuple[list[StopRidership], TripRidership]:
    """
    Generate ridership data for a single trip on a single day.
    Returns (list of StopRidership, TripRidership summary).
    """
    day_of_week = d.weekday()  # 0=Monday
    week_num = get_week_number(d)
    is_labor_day = d == LABOR_DAY
    is_school_route = route.route_short_name in SCHOOL_CROWDING["affected_routes"]
    is_crowded_period = trip.time_period in SCHOOL_CROWDING["crowded_periods"]

    # Base ridership from route tier
    tier_min, tier_max = TIER_DAILY_BOARDINGS[route.tier]
    base_daily_boardings = rng.randint(tier_min, tier_max)

    # Get trip count for this route to estimate per-trip boardings
    # (Simplified: assume ~100 trips per route per day)
    trips_per_day = 100
    base_trip_boardings = base_daily_boardings / trips_per_day

    # Apply multipliers
    period_mult = PERIOD_MULTIPLIERS.get(trip.time_period, 1.0)
    day_mult = DAY_MULTIPLIERS.get(day_of_week, 1.0)

    # Labor Day: treat as slow Sunday (but don't compound too much)
    if is_labor_day:
        day_mult = 0.30  # Similar to Sunday

    # Week progression
    if is_school_route:
        week_mult = SCHOOL_ROUTE_WEEK_BOOST.get(week_num, 1.0)
    else:
        week_mult = WEEK_MULTIPLIERS.get(week_num, 1.0)

    # Calculate target boardings for this trip
    trip_boardings_target = base_trip_boardings * period_mult * day_mult * week_mult

    # Add some random variation (+/- 20%)
    trip_boardings_target *= rng.uniform(0.8, 1.2)

    # Generate stop-level data
    stop_ridership_list = []
    total_stops = len(trip.stop_sequence)

    if total_stops == 0:
        # No stops for this trip
        return [], None

    current_load = 0
    total_boardings = 0
    total_alightings = 0
    loads = []

    for i, (stop_id, stop_seq) in enumerate(trip.stop_sequence):
        boarding_factor, alighting_factor = calculate_stop_position_factor(i, total_stops)

        # Check if this is a school-adjacent stop during crowded period
        # Use graduated crowding that builds through the month
        is_school_stop = stop_id in SCHOOL_ADJACENT_STOPS
        school_boost = 1.0
        if is_school_stop and is_school_route and is_crowded_period:
            school_boost = SCHOOL_STOP_WEEK_CROWDING.get(week_num, 1.0)

        # Check if this stop should have artificially high ridership (Vignette 3)
        vignette3_boost = 1.0
        if stop_id in high_ridership_no_amenity_stops:
            vignette3_boost = 1.5  # Ensure these stops have high ridership

        # Calculate boardings and alightings
        stop_base = trip_boardings_target / total_stops
        boardings = max(0, int(stop_base * boarding_factor * school_boost * vignette3_boost * rng.uniform(0.5, 1.5)))

        # Alightings can't exceed current load
        potential_alightings = max(0, int(stop_base * alighting_factor * rng.uniform(0.5, 1.5)))
        alightings = min(potential_alightings, current_load)

        # Last stop: everyone gets off
        if i == total_stops - 1:
            alightings = current_load
            boardings = 0

        # Update load
        current_load = current_load + boardings - alightings
        current_load = max(0, current_load)  # Ensure non-negative

        # Apply max load cap for crowded trips (for Vignette 1)
        # Probability and target scales with week to avoid distorting week comparison
        if is_school_route and is_crowded_period and is_school_stop:
            # Graduated probability: 15% week 1, 20% week 2, 25% week 3, 30% week 4
            max_load_prob = 0.15 + (week_num - 1) * 0.05
            if rng.random() < max_load_prob:
                target_load = rng.randint(*SCHOOL_CROWDING["max_load_target"])
                if current_load < target_load:
                    extra_boardings = target_load - current_load
                    boardings += extra_boardings
                    current_load = target_load

        loads.append(current_load)
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

    # Create trip summary
    avg_load = statistics.mean(loads) if loads else 0
    max_load = max(loads) if loads else 0

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
    """Generate ridership for all trips across all days in September 2025."""
    all_stop_ridership = []
    all_trip_ridership = []

    # Generate for each day
    current_date = START_DATE
    day_count = 0

    while current_date <= END_DATE:
        day_count += 1
        print(f"  Generating day {day_count}/30: {current_date}")

        for trip_id, trip in trips.items():
            route = routes.get(trip.route_id)
            if not route:
                continue

            stop_data, trip_data = generate_trip_ridership(
                trip, route, current_date, stops, rng, high_ridership_no_amenity_stops
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
    routes: dict[str, Route],
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Generate pre-aggregated summary tables.
    Returns (daily_system_summary, daily_route_summary, daily_stop_summary).
    """
    # Group by date
    trips_by_date = defaultdict(list)
    for tr in trip_ridership:
        trips_by_date[tr.date].append(tr)

    stops_by_date_stop = defaultdict(lambda: defaultdict(list))
    for sr in stop_ridership:
        stops_by_date_stop[sr.date][sr.stop_id].append(sr)

    daily_system = []
    daily_route = []
    daily_stop = []

    for d in sorted(trips_by_date.keys()):
        day_trips = trips_by_date[d]
        day_of_week = d.weekday()

        # System summary
        total_boardings = sum(t.total_boardings for t in day_trips)
        total_alightings = sum(t.total_alightings for t in day_trips)
        all_avg_loads = [t.avg_load for t in day_trips if t.avg_load > 0]
        all_max_loads = [t.max_load for t in day_trips]

        daily_system.append({
            "date": d.isoformat(),
            "day_of_week": day_of_week,
            "trip_count": len(day_trips),
            "total_boardings": total_boardings,
            "total_alightings": total_alightings,
            "avg_load": round(statistics.mean(all_avg_loads), 2) if all_avg_loads else 0,
            "max_load": max(all_max_loads) if all_max_loads else 0,
        })

        # Route summaries
        trips_by_route = defaultdict(list)
        for t in day_trips:
            trips_by_route[t.route_id].append(t)

        for route_id, route_trips in trips_by_route.items():
            route_boardings = sum(t.total_boardings for t in route_trips)
            route_alightings = sum(t.total_alightings for t in route_trips)
            route_avg_loads = [t.avg_load for t in route_trips if t.avg_load > 0]
            route_max_loads = [t.max_load for t in route_trips]

            daily_route.append({
                "date": d.isoformat(),
                "route_id": route_id,
                "day_of_week": day_of_week,
                "trip_count": len(route_trips),
                "total_boardings": route_boardings,
                "total_alightings": route_alightings,
                "avg_load": round(statistics.mean(route_avg_loads), 2) if route_avg_loads else 0,
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

    return daily_system, daily_route, daily_stop


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
    print(f"  Written: {filename} ({len(data)} rows)")


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
    write_csv(output_dir, "routes.csv", routes_data, ["route_id", "route_short_name", "route_long_name", "route_type"])

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
    } for t in trips.values() if t.start_time]  # Only trips with valid start times
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


# ============================================
# Acceptance Tests
# ============================================

def run_acceptance_tests(
    stop_ridership: list[StopRidership],
    trip_ridership: list[TripRidership],
    daily_stop: list[dict],
    stops: dict[str, Stop],
    routes: dict[str, Route],
) -> bool:
    """
    Run acceptance tests for the three vignettes.
    Returns True if all tests pass.
    """
    print("\n" + "=" * 60)
    print("ACCEPTANCE TESTS")
    print("=" * 60)

    all_passed = True

    # Vignette 1: Back-to-School Crowding
    print("\n[Vignette 1] Back-to-School Crowding")
    print("-" * 40)

    # Find Route 44 and 8 route_ids
    route_44_id = None
    route_8_id = None
    for route_id, route in routes.items():
        if route.route_short_name == "44":
            route_44_id = route_id
        elif route.route_short_name == "8":
            route_8_id = route_id

    # Query PM Peak trips in weeks 3-4 with max_load >= 100
    week3_start = date(2025, 9, 15)
    week4_end = date(2025, 9, 28)

    high_load_trips = [
        tr for tr in trip_ridership
        if tr.route_id in [route_44_id, route_8_id]
        and tr.time_period == "pm_peak"
        and week3_start <= tr.date <= week4_end
        and tr.max_load >= 100
    ]

    # Check if high-load segments are near school-adjacent stops
    school_stop_ids = set(SCHOOL_ADJACENT_STOPS.keys())
    trips_near_schools = 0
    for tr in high_load_trips:
        trip_stops = [sr for sr in stop_ridership if sr.trip_id == tr.trip_id and sr.date == tr.date]
        high_load_stops = [sr.stop_id for sr in trip_stops if sr.load_after >= 80]
        if any(sid in school_stop_ids for sid in high_load_stops):
            trips_near_schools += 1

    v1_passed = len(high_load_trips) >= 3
    print(f"  High-load trips (max_load >= 100): {len(high_load_trips)}")
    print(f"  Trips with high load near schools: {trips_near_schools}")
    print(f"  PASS: {v1_passed}" if v1_passed else f"  FAIL: Expected >= 3 trips")
    all_passed = all_passed and v1_passed

    # Vignette 2: Week 1 vs Week 4 comparison
    # Compare WEEKDAYS ONLY (Mon-Fri), excluding Labor Day (Sept 1)
    print("\n[Vignette 2] Beginning vs End of Month")
    print("-" * 40)

    # Week 1 weekdays: Sept 2-5 (Tue-Fri, since Sept 1 is Labor Day)
    # Week 4 weekdays: Sept 22-26 (Mon-Fri)
    week1_weekdays = [
        tr for tr in trip_ridership
        if date(2025, 9, 2) <= tr.date <= date(2025, 9, 5)  # Tue-Fri of week 1
        and tr.day_of_week < 5  # Weekdays only
    ]
    week4_weekdays = [
        tr for tr in trip_ridership
        if date(2025, 9, 22) <= tr.date <= date(2025, 9, 26)  # Mon-Fri of week 4
        and tr.day_of_week < 5  # Weekdays only
    ]

    # Calculate average daily boardings (since week 1 has 4 days, week 4 has 5)
    week1_days = len(set(tr.date for tr in week1_weekdays))
    week4_days = len(set(tr.date for tr in week4_weekdays))

    week1_boardings = sum(tr.total_boardings for tr in week1_weekdays)
    week4_boardings = sum(tr.total_boardings for tr in week4_weekdays)

    week1_avg_daily = week1_boardings / week1_days if week1_days > 0 else 0
    week4_avg_daily = week4_boardings / week4_days if week4_days > 0 else 0

    system_pct_change = ((week4_avg_daily - week1_avg_daily) / week1_avg_daily * 100) if week1_avg_daily > 0 else 0

    # School routes specifically
    week1_school = [tr for tr in week1_weekdays if tr.route_id in [route_44_id, route_8_id]]
    week4_school = [tr for tr in week4_weekdays if tr.route_id in [route_44_id, route_8_id]]

    week1_school_boardings = sum(tr.total_boardings for tr in week1_school)
    week4_school_boardings = sum(tr.total_boardings for tr in week4_school)

    week1_school_avg = week1_school_boardings / week1_days if week1_days > 0 else 0
    week4_school_avg = week4_school_boardings / week4_days if week4_days > 0 else 0

    school_pct_change = ((week4_school_avg - week1_school_avg) / week1_school_avg * 100) if week1_school_avg > 0 else 0

    v2_system_passed = 5 <= system_pct_change <= 15  # Target: 8-10%, allow tolerance
    v2_school_passed = 10 <= school_pct_change <= 25  # Target: 15-20%, allow tolerance

    print(f"  Week 1 weekdays: {week1_days} days, Week 4 weekdays: {week4_days} days")
    print(f"  System-wide avg daily change: {system_pct_change:.1f}% (target: 8-10%)")
    print(f"  School routes avg daily change: {school_pct_change:.1f}% (target: 15-20%)")
    print(f"  System PASS: {v2_system_passed}")
    print(f"  School PASS: {v2_school_passed}")
    all_passed = all_passed and v2_system_passed and v2_school_passed

    # Vignette 3: High-ridership stops without amenities
    print("\n[Vignette 3] High-Ridership Stops Without Amenities")
    print("-" * 40)

    # Calculate average daily boardings per stop
    stop_boardings = defaultdict(list)
    for ds in daily_stop:
        stop_boardings[ds["stop_id"]].append(ds["total_boardings"])

    avg_daily_boardings = {
        stop_id: statistics.mean(boardings) if boardings else 0
        for stop_id, boardings in stop_boardings.items()
    }

    # Find stops with >300 daily boardings and no amenities
    high_ridership_no_amenity = []
    for stop_id, avg_boardings in avg_daily_boardings.items():
        if avg_boardings > 300 and stop_id in stops:
            stop = stops[stop_id]
            has_any = any([
                stop.has_shelter, stop.has_seating, stop.has_lighting,
                stop.has_real_time_display, stop.has_bike_rack,
                stop.has_wheelchair_access, stop.has_tactile_paving, stop.has_trash_can
            ])
            if not has_any:
                high_ridership_no_amenity.append((stop_id, avg_boardings))

    v3_passed = 5 <= len(high_ridership_no_amenity) <= 8
    print(f"  High-ridership stops without amenities: {len(high_ridership_no_amenity)}")
    for stop_id, boardings in sorted(high_ridership_no_amenity, key=lambda x: -x[1])[:5]:
        print(f"    - {stop_id}: {boardings:.0f} avg daily boardings")
    print(f"  PASS: {v3_passed}" if v3_passed else f"  FAIL: Expected 5-8 stops")
    all_passed = all_passed and v3_passed

    print("\n" + "=" * 60)
    print(f"ALL TESTS {'PASSED' if all_passed else 'FAILED'}")
    print("=" * 60)

    return all_passed


# ============================================
# Main
# ============================================

def main():
    parser = argparse.ArgumentParser(description="Generate synthetic transit ridership data")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory for CSV files")
    args = parser.parse_args()

    output_dir = args.output_dir or OUTPUT_DIR

    print("=" * 60)
    print("Transit Ridership Data Generator")
    print("=" * 60)
    print(f"Seed: {args.seed}")
    print(f"Output: {output_dir}")
    print(f"Date range: {START_DATE} to {END_DATE}")
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

    # Filter out trips with no stops
    trips = {tid: t for tid, t in trips.items() if t.stop_sequence}
    print(f"  Filtered to {len(trips)} trips with stop sequences")

    # Generate amenities
    print("\nGenerating stop amenities...")
    high_ridership_no_amenity_stops = generate_amenities(stops, rng)
    print(f"  Marked {len(high_ridership_no_amenity_stops)} high-ridership stops without amenities")

    # Generate ridership data
    print("\nGenerating ridership data...")
    stop_ridership, trip_ridership = generate_all_ridership(
        routes, trips, stops, rng, high_ridership_no_amenity_stops
    )
    print(f"  Generated {len(stop_ridership)} stop ridership records")
    print(f"  Generated {len(trip_ridership)} trip ridership records")

    # Generate summary tables
    print("\nGenerating summary tables...")
    daily_system, daily_route, daily_stop = generate_daily_summaries(
        stop_ridership, trip_ridership, routes
    )
    print(f"  Generated {len(daily_system)} daily system summaries")
    print(f"  Generated {len(daily_route)} daily route summaries")
    print(f"  Generated {len(daily_stop)} daily stop summaries")

    # Write CSV files
    print("\nWriting CSV files...")
    output_all_csv(
        output_dir,
        routes, stops, trips,
        stop_ridership, trip_ridership,
        daily_system, daily_route, daily_stop
    )

    # Run acceptance tests
    tests_passed = run_acceptance_tests(
        stop_ridership, trip_ridership, daily_stop, stops, routes
    )

    print("\nDone!")
    return 0 if tests_passed else 1


if __name__ == "__main__":
    exit(main())
