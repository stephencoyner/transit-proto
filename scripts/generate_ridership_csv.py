#!/usr/bin/env python3
"""
Generate realistic ridership data for King County Metro transit prototype.

DESIGN GOALS:
1. No zero-ridership stops - every stop has activity (min 5-10/day)
2. Clear crowding hotspots on specific routes/segments
3. Visible growth arc across the month (UW start = "big moment")
4. Distinct route personalities (time-of-day signatures)
5. Dramatic event impacts (football, UW start)

INPUT: CSV files (stops, routes, route_trips, sample_trips)
OUTPUT: CSV files for Supabase import (chunked for large tables)

Data range: September 1-30, 2025
Story: "How Seattle Transit Survives September"
"""

import csv
import random
import math
import os
from datetime import datetime, timedelta, date
from collections import defaultdict
from typing import Dict, List, Tuple, Optional
import argparse

# =============================================================================
# CONFIGURATION
# =============================================================================

GENERATE_START = date(2025, 9, 1)
GENERATE_END = date(2025, 9, 30)

# Time periods (matching platform UI)
TIME_PERIODS = {
    "early_am": (0, 6),
    "am_peak": (6, 9),
    "midday": (9, 15),
    "pm_peak": (15, 19),
    "evening": (19, 22),
    "night": (22, 24),
}

# =============================================================================
# ROUTE PERSONALITIES
# Each route has distinct characteristics that planners would recognize
# =============================================================================

ROUTE_CONFIG = {
    # FREQUENT ROUTES (high ridership, distinct patterns)
    "100224": {  # Route 44: Ballard - U-District
        "name": "44",
        "type": "frequent",
        "base_daily": 6500,
        "personality": "student_commuter",
        "peak_ratio": 3.5,
        "weekend_ratio": 0.35,
        "am_bias": 1.0,
        "pm_bias": 1.2,
        "growth_type": "step_change",
        "crowding_zone": (0.3, 0.7),  # Middle 40% of route gets crowded
        "max_load_target": 55,
    },
    "100264": {  # Route 70: Eastlake/SLU - Downtown
        "name": "70",
        "type": "frequent",
        "base_daily": 5000,
        "personality": "tech_commuter",
        "peak_ratio": 3.2,
        "weekend_ratio": 0.30,
        "am_bias": 0.9,
        "pm_bias": 1.4,
        "growth_type": "step_change",
        "crowding_zone": (0.2, 0.6),
        "max_load_target": 50,
    },
    "100252": {  # Route 62: Fremont - Roosevelt - U-District
        "name": "62",
        "type": "frequent",
        "base_daily": 5500,
        "personality": "mixed_use",
        "peak_ratio": 2.5,
        "weekend_ratio": 0.50,
        "am_bias": 1.0,
        "pm_bias": 1.1,
        "growth_type": "step_change",
        "crowding_zone": (0.35, 0.65),
        "max_load_target": 45,
    },
    "102574": {  # Route 40: Ballard - Fremont - Downtown
        "name": "40",
        "type": "frequent",
        "base_daily": 7500,
        "personality": "neighborhood_connector",
        "peak_ratio": 2.2,
        "weekend_ratio": 0.55,
        "am_bias": 1.0,
        "pm_bias": 1.3,
        "growth_type": "gradual",
        "crowding_zone": (0.4, 0.75),
        "max_load_target": 48,
    },
    "100275": {  # Route 8: Capitol Hill - MLK
        "name": "8",
        "type": "frequent",
        "base_daily": 5000,
        "personality": "neighborhood_connector",
        "peak_ratio": 2.0,
        "weekend_ratio": 0.60,
        "am_bias": 0.95,
        "pm_bias": 1.0,
        "growth_type": "gradual",
        "crowding_zone": (0.3, 0.6),
        "max_load_target": 40,
    },

    # LOCAL ROUTES (lower ridership, residential patterns)
    "100001": {  # Route 1: Kinnear - Downtown
        "name": "1",
        "type": "local",
        "base_daily": 3000,
        "personality": "residential_commuter",
        "peak_ratio": 2.8,
        "weekend_ratio": 0.40,
        "am_bias": 1.2,
        "pm_bias": 0.9,
        "growth_type": "stable",
        "crowding_zone": (0.2, 0.5),
        "max_load_target": 30,
    },
    "100002": {  # Route 10: Capitol Hill - Downtown
        "name": "10",
        "type": "local",
        "base_daily": 2800,
        "personality": "residential_commuter",
        "peak_ratio": 2.6,
        "weekend_ratio": 0.45,
        "am_bias": 1.15,
        "pm_bias": 0.95,
        "growth_type": "stable",
        "crowding_zone": (0.2, 0.5),
        "max_load_target": 28,
    },
    "100009": {  # Route 11: Madison Park - Downtown
        "name": "11",
        "type": "local",
        "base_daily": 2500,
        "personality": "residential_commuter",
        "peak_ratio": 2.5,
        "weekend_ratio": 0.42,
        "am_bias": 1.2,
        "pm_bias": 0.9,
        "growth_type": "stable",
        "crowding_zone": (0.2, 0.5),
        "max_load_target": 25,
    },
    "100028": {  # Route 13: Seattle Pacific - Downtown
        "name": "13",
        "type": "local",
        "base_daily": 2200,
        "personality": "student_commuter",
        "peak_ratio": 2.4,
        "weekend_ratio": 0.38,
        "am_bias": 1.1,
        "pm_bias": 1.0,
        "growth_type": "step_change",
        "crowding_zone": (0.3, 0.6),
        "max_load_target": 25,
    },
    "100039": {  # Route 14: Mount Baker - Downtown
        "name": "14",
        "type": "local",
        "base_daily": 2600,
        "personality": "residential_commuter",
        "peak_ratio": 2.7,
        "weekend_ratio": 0.40,
        "am_bias": 1.15,
        "pm_bias": 0.95,
        "growth_type": "stable",
        "crowding_zone": (0.25, 0.55),
        "max_load_target": 28,
    },
}

# =============================================================================
# GEOGRAPHIC ZONES (for stop importance)
# =============================================================================

ZONES = {
    "downtown": {
        "bounds": {"min_lat": 47.602, "max_lat": 47.615, "min_lon": -122.345, "max_lon": -122.325},
        "multiplier": (3.0, 8.0),
    },
    "udistrict": {
        "bounds": {"min_lat": 47.655, "max_lat": 47.670, "min_lon": -122.320, "max_lon": -122.295},
        "multiplier": (2.0, 4.0),
    },
    "capitol_hill": {
        "bounds": {"min_lat": 47.615, "max_lat": 47.635, "min_lon": -122.325, "max_lon": -122.305},
        "multiplier": (1.5, 3.0),
    },
    "slu": {
        "bounds": {"min_lat": 47.620, "max_lat": 47.630, "min_lon": -122.345, "max_lon": -122.335},
        "multiplier": (2.0, 3.5),
    },
    "ballard": {
        "bounds": {"min_lat": 47.665, "max_lat": 47.680, "min_lon": -122.390, "max_lon": -122.370},
        "multiplier": (1.5, 2.5),
    },
    "fremont": {
        "bounds": {"min_lat": 47.648, "max_lat": 47.658, "min_lon": -122.360, "max_lon": -122.345},
        "multiplier": (1.5, 2.5),
    },
}

# =============================================================================
# SEPTEMBER 2025 EVENTS
# =============================================================================

SEPTEMBER_EVENTS = {
    # Labor Day weekend
    date(2025, 9, 1): {"type": "holiday", "name": "Labor Day", "system_mult": 0.45},
    date(2025, 9, 2): {"type": "post_holiday", "name": "Post Labor Day", "system_mult": 0.70},

    # K-12 schools start
    date(2025, 9, 3): {"type": "k12_start", "name": "Seattle Schools Open", "system_mult": 1.08},

    # Football Saturdays (games typically at 12:30pm or 7pm)
    date(2025, 9, 6): {"type": "football", "name": "UW vs Weber State"},
    date(2025, 9, 13): {"type": "football", "name": "UW vs Portland State"},
    date(2025, 9, 27): {"type": "football", "name": "UW Conference Game"},

    # UW Fall Quarter - THE BIG MOMENT
    date(2025, 9, 24): {"type": "uw_start", "name": "UW Fall Quarter Starts"},
}

# UW-affected routes
UW_ROUTES = {"100224", "100252", "100264"}  # 44, 62, 70


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def time_to_hour(time_str: str) -> int:
    """Convert time string (HH:MM:SS) to hour (handles >24:00)."""
    parts = time_str.split(":")
    return int(parts[0]) % 24


def get_time_period(time_str: str) -> str:
    """Get time period name for a given time."""
    hour = time_to_hour(time_str)
    for period, (start, end) in TIME_PERIODS.items():
        if start <= hour < end:
            return period
    return "night"


def get_zone(lat: float, lon: float) -> Optional[str]:
    """Determine which geographic zone a stop is in."""
    for zone_name, zone_data in ZONES.items():
        b = zone_data["bounds"]
        if (b["min_lat"] <= lat <= b["max_lat"] and
            b["min_lon"] <= lon <= b["max_lon"]):
            return zone_name
    return None


def get_stop_importance(lat: float, lon: float) -> float:
    """Get stop importance multiplier based on location."""
    zone = get_zone(lat, lon)
    if zone:
        mult_range = ZONES[zone]["multiplier"]
        return random.uniform(mult_range[0], mult_range[1])
    # Default: suburban/residential
    return random.uniform(0.5, 1.2)


# =============================================================================
# MULTIPLIER FUNCTIONS
# =============================================================================

def get_growth_multiplier(current_date: date, growth_type: str, route_id: str) -> float:
    """Calculate ridership multiplier based on growth pattern."""
    day = current_date.day

    if growth_type == "step_change":
        if route_id in UW_ROUTES:
            if day < 3:  # Labor Day weekend
                return 0.75
            elif day < 24:  # Before UW
                return 0.88
            else:  # UW started - THE BIG JUMP
                return 1.38
        else:
            # Non-UW routes with step change (SPU, etc)
            if day < 24:
                return 0.95
            else:
                return 1.12

    elif growth_type == "gradual":
        # Steady climb from 0.88 to 1.12 over the month
        progress = day / 30
        return 0.88 + (0.24 * progress)

    else:  # stable
        return random.uniform(0.97, 1.03)


def get_event_multiplier(current_date: date, route_id: str, time_period: str) -> Tuple[float, float]:
    """Returns (ridership_mult, load_mult) for special events."""
    event = SEPTEMBER_EVENTS.get(current_date)
    if not event:
        return 1.0, 1.0

    event_type = event["type"]
    is_uw_route = route_id in UW_ROUTES
    is_pm = time_period in ("pm_peak", "evening")
    is_midday = time_period == "midday"

    if event_type == "holiday":
        return event.get("system_mult", 0.5), 0.6

    elif event_type == "post_holiday":
        return event.get("system_mult", 0.7), 0.8

    elif event_type == "k12_start":
        # AM peak boost for school routes
        if time_period == "am_peak":
            return 1.15, 1.2
        return event.get("system_mult", 1.05), 1.05

    elif event_type == "football":
        if is_uw_route:
            if is_midday:
                return 1.5, 1.6  # Pre-game
            elif is_pm:
                return 2.0, 2.3  # Game time / post-game CRUSH
            else:
                return 1.2, 1.3
        else:
            return 0.95, 0.95

    elif event_type == "uw_start":
        if is_uw_route:
            return 1.45, 1.6  # Big jump + crowding
        else:
            return 1.05, 1.05

    return 1.0, 1.0


def get_time_multiplier(time_str: str, direction_id: str, route_config: Dict) -> float:
    """Get ridership multiplier based on time, direction, and route personality."""
    hour = time_to_hour(time_str)
    is_inbound = direction_id == "1"

    peak_ratio = route_config.get("peak_ratio", 2.5)
    am_bias = route_config.get("am_bias", 1.0)
    pm_bias = route_config.get("pm_bias", 1.0)

    if 6 <= hour < 9:  # AM Peak
        base = peak_ratio * 0.65 * am_bias
        direction_mod = 1.4 if is_inbound else 0.65
    elif 9 <= hour < 15:  # Midday
        base = 1.0
        direction_mod = 1.0
    elif 15 <= hour < 19:  # PM Peak
        base = peak_ratio * 0.60 * pm_bias
        direction_mod = 1.4 if not is_inbound else 0.65
    elif 19 <= hour < 22:  # Evening
        base = 0.55 * pm_bias
        direction_mod = 1.15 if not is_inbound else 0.85
    else:  # Night / Early AM
        base = 0.12
        direction_mod = 1.0

    return max(0.08, base * direction_mod * random.uniform(0.92, 1.08))


def get_day_multiplier(day_of_week: int, route_config: Dict) -> float:
    """Get ridership multiplier based on day of week."""
    weekend_ratio = route_config.get("weekend_ratio", 0.45)

    if day_of_week < 5:  # Weekday
        if day_of_week in [1, 2, 3]:  # Tue-Thu (strongest)
            return random.uniform(1.0, 1.05)
        return random.uniform(0.92, 0.98)  # Mon, Fri
    elif day_of_week == 5:  # Saturday
        return weekend_ratio * random.uniform(1.0, 1.2)
    else:  # Sunday
        return weekend_ratio * 0.75 * random.uniform(0.9, 1.1)


# =============================================================================
# STOP-LEVEL RIDERSHIP GENERATION
# =============================================================================

def generate_stop_ridership(
    stops: List[Dict],
    stop_coords: Dict[str, Tuple[float, float]],
    trip_total: int,
    direction_id: str,
    time_str: str,
    route_config: Dict,
    load_mult: float = 1.0
) -> Tuple[List[Dict], int]:
    """
    Generate boardings/alightings/load for each stop on a trip.

    GUARANTEES:
    - No zero-boarding stops (minimum floor per stop)
    - Load builds in crowding_zone
    - Peak load occurs 40-70% through trip
    """
    n_stops = len(stops)
    if n_stops == 0:
        return [], 0

    # Calculate stop importance weights
    weights = []
    for stop in stops:
        stop_id = str(stop["stop_id"])
        if stop_id in stop_coords:
            lat, lon = stop_coords[stop_id]
            weight = get_stop_importance(lat, lon)
        else:
            weight = random.uniform(0.5, 1.0)
        weights.append(weight)

    # Normalize weights
    total_weight = sum(weights) or 1
    weights = [w / total_weight for w in weights]

    # Boarding/alighting curves based on time and direction
    hour = time_to_hour(time_str)
    is_am_peak = 6 <= hour < 9
    is_pm_peak = 15 <= hour < 19
    is_inbound = direction_id == "1"

    # Peak direction: heavy boarding early in trip
    if (is_inbound and is_am_peak) or (not is_inbound and is_pm_peak):
        boarding_curve = [max(0.15, 1.0 - (i / n_stops) ** 0.55) for i in range(n_stops)]
    elif (not is_inbound and is_am_peak) or (is_inbound and is_pm_peak):
        boarding_curve = [max(0.12, 0.65 - (i / n_stops) ** 0.5) for i in range(n_stops)]
    else:  # Off-peak: more distributed
        boarding_curve = [max(0.15, 1.0 - abs(i / n_stops - 0.35) * 1.2) for i in range(n_stops)]

    # Combine weights with curves
    boarding_weights = [w * b for w, b in zip(weights, boarding_curve)]
    bw_total = sum(boarding_weights) or 1
    boarding_weights = [bw / bw_total for bw in boarding_weights]

    # Generate boardings with MINIMUM FLOOR (no zeros!)
    total_boardings = max(n_stops, int(trip_total * random.uniform(0.92, 1.08)))
    boardings = []
    remaining = total_boardings

    # Minimum 1 boarding per stop (except terminus)
    min_per_stop = 1

    for i, weight in enumerate(boarding_weights[:-1]):
        expected = remaining * weight * random.uniform(0.88, 1.12)
        count = max(min_per_stop, int(expected))

        # Probabilistic boost for fractional part
        if random.random() < (expected - int(expected)):
            count += 1

        # Reserve enough for remaining stops
        max_allowed = remaining - (n_stops - i - 1) * min_per_stop
        count = min(count, max(min_per_stop, max_allowed))

        boardings.append(count)
        remaining -= count

    # Last stop: no boardings at terminus
    boardings.append(0)

    # Distribute any remaining to high-weight stops
    if remaining > 0:
        high_weight_indices = sorted(range(n_stops - 1), key=lambda i: weights[i], reverse=True)
        for i in high_weight_indices[:remaining]:
            boardings[i] += 1

    # Generate alightings to create proper load curve
    # Load should BUILD in crowding_zone, then release
    crowding_start, crowding_end = route_config.get("crowding_zone", (0.3, 0.7))

    alightings = []
    current_load = 0
    max_load = 0

    for i in range(n_stops):
        current_load += boardings[i]

        if i == n_stops - 1:
            # Everyone off at terminus
            alightings.append(current_load)
            current_load = 0
        elif i == 0:
            # No one gets off at first stop
            alightings.append(0)
        else:
            # Calculate position in route
            position = i / n_stops

            # In crowding zone: slow alighting (load builds)
            if crowding_start <= position <= crowding_end:
                alight_rate = 0.06 / load_mult
            # After crowding zone: faster alighting (load releases)
            elif position > crowding_end:
                alight_rate = 0.35 / load_mult
            # Before crowding zone: moderate
            else:
                alight_rate = 0.18 / load_mult

            target_alight = int(current_load * alight_rate * random.uniform(0.75, 1.25))
            target_alight = max(0, min(target_alight, current_load - 1))
            alightings.append(target_alight)
            current_load -= target_alight

        max_load = max(max_load, current_load)

    # Scale to hit target max load during peaks
    max_load_target = route_config.get("max_load_target", 35)
    if max_load > 0 and (is_am_peak or is_pm_peak):
        target = max_load_target * load_mult * random.uniform(0.85, 1.15)
        scale = target / max_load
        scale = max(0.5, min(scale, 2.5))
    else:
        scale = random.uniform(0.4, 0.7)  # Off-peak: lower loads

    # Build result with scaled loads
    result = []
    running_load = 0
    final_max_load = 0

    for i, stop in enumerate(stops):
        running_load += boardings[i] - alightings[i]
        running_load = max(0, running_load)
        scaled_load = max(0, int(running_load * scale))

        result.append({
            "stop_id": str(stop["stop_id"]),
            "stop_sequence": stop["stop_sequence"],
            "boardings": boardings[i],
            "alightings": alightings[i],
            "load_after": scaled_load
        })

        final_max_load = max(final_max_load, scaled_load)

    return result, final_max_load


# =============================================================================
# DATA LOADING
# =============================================================================

def load_stops(path: str) -> Dict[str, Dict]:
    """Load stops CSV into dict keyed by stop_id."""
    stops = {}
    with open(path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            stops[row['stop_id']] = {
                'stop_id': row['stop_id'],
                'stop_name': row['stop_name'],
                'lat': float(row['lat']),
                'lon': float(row['lon'])
            }
    print(f"Loaded {len(stops)} stops")
    return stops


def load_routes(path: str) -> Dict[str, Dict]:
    """Load routes CSV."""
    routes = {}
    with open(path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            routes[row['route_id']] = {
                'route_id': row['route_id'],
                'route_name': row['route_name'],
                'route_type': row['route_type']
            }
    print(f"Loaded {len(routes)} routes")
    return routes


def load_route_trips(path: str) -> Dict[str, List[Dict]]:
    """Load route_trips CSV, grouped by route_id."""
    trips_by_route = defaultdict(list)
    with open(path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            trips_by_route[row['route_id']].append({
                'trip_id': row['trip_id'],
                'direction_id': row['direction_id'],
                'start_time': row['start_time']
            })
    print(f"Loaded {sum(len(v) for v in trips_by_route.values())} trips across {len(trips_by_route)} routes")
    return dict(trips_by_route)


def load_trip_stops(path: str, route_trips: Dict[str, List[Dict]]) -> Dict[str, List[Dict]]:
    """
    Load trip_stops CSV and extract one representative trip per route.
    Returns dict: route_id -> list of {stop_id, stop_sequence}
    """
    # Build trip_id -> route_id mapping
    trip_to_route = {}
    for route_id, trips in route_trips.items():
        for trip in trips:
            trip_to_route[trip['trip_id']] = route_id

    # Load all trip stops
    trip_stops = defaultdict(list)
    with open(path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            trip_id = row['trip_id']
            if trip_id in trip_to_route:
                trip_stops[trip_id].append({
                    'stop_id': row['stop_id'],
                    'stop_sequence': int(row['stop_sequence']),
                    'stop_name': row.get('stop_name', '')
                })

    # Sort by sequence
    for trip_id in trip_stops:
        trip_stops[trip_id].sort(key=lambda x: x['stop_sequence'])

    # Pick one representative trip per route (first one with stops)
    route_stop_sequences = {}
    for route_id, trips in route_trips.items():
        for trip in trips:
            trip_id = trip['trip_id']
            if trip_id in trip_stops and len(trip_stops[trip_id]) > 0:
                route_stop_sequences[route_id] = trip_stops[trip_id]
                break

    print(f"Loaded stop sequences for {len(route_stop_sequences)} routes")
    return route_stop_sequences


# =============================================================================
# MAIN GENERATION
# =============================================================================

def generate_ridership(
    stops: Dict[str, Dict],
    routes: Dict[str, Dict],
    route_trips: Dict[str, List[Dict]],
    route_stop_sequences: Dict[str, List[Dict]],
    output_dir: str,
    chunk_size: int = 500000
):
    """Generate all ridership data and write to CSV files."""

    os.makedirs(output_dir, exist_ok=True)

    # Build stop coords lookup
    stop_coords = {sid: (s['lat'], s['lon']) for sid, s in stops.items()}

    # Prepare output files
    trip_file = open(os.path.join(output_dir, 'trip_ridership.csv'), 'w', newline='')
    trip_writer = csv.writer(trip_file)
    trip_writer.writerow([
        'date', 'trip_id', 'route_id', 'direction_id',
        'start_time', 'time_period', 'day_of_week', 'total_boardings', 'total_alightings', 'max_load'
    ])

    # Stop ridership will be chunked
    stop_chunk_num = 1
    stop_row_count = 0
    stop_file = None
    stop_writer = None

    def open_new_stop_chunk():
        nonlocal stop_file, stop_writer, stop_chunk_num
        if stop_file:
            stop_file.close()
        filename = f'stop_ridership_{stop_chunk_num}.csv'
        stop_file = open(os.path.join(output_dir, filename), 'w', newline='')
        stop_writer = csv.writer(stop_file)
        stop_writer.writerow([
            'date', 'trip_id', 'route_id', 'stop_id', 'stop_sequence',
            'boardings', 'alightings', 'load_after', 'day_of_week', 'direction_id', 'time_period'
        ])
        print(f"  Writing {filename}...")
        stop_chunk_num += 1

    open_new_stop_chunk()

    # Daily summaries
    route_summaries = []
    system_summaries = []

    # Generate day by day
    current_date = GENERATE_START
    day_num = 0
    total_days = (GENERATE_END - GENERATE_START).days + 1

    while current_date <= GENERATE_END:
        day_num += 1
        day_of_week = current_date.weekday()
        date_str = current_date.strftime("%Y-%m-%d")

        event = SEPTEMBER_EVENTS.get(current_date)
        event_name = event["name"] if event else ""

        print(f"Day {day_num}/{total_days}: {date_str} ({['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][day_of_week]}) {event_name}")

        system_stats = {
            "route_count": 0,
            "trip_count": 0,
            "total_boardings": 0,
            "total_alightings": 0,
            "total_load": 0,
            "load_count": 0,
            "max_load": 0
        }

        for route_id, trips in route_trips.items():
            if route_id not in ROUTE_CONFIG:
                continue

            config = ROUTE_CONFIG[route_id]
            stop_sequence = route_stop_sequences.get(route_id, [])

            if not stop_sequence:
                print(f"  Warning: No stop sequence for route {route_id}")
                continue

            n_trips = len(trips)
            if n_trips == 0:
                continue

            # Route multipliers
            growth_mult = get_growth_multiplier(current_date, config["growth_type"], route_id)
            day_mult = get_day_multiplier(day_of_week, config)
            base_per_trip = config["base_daily"] / n_trips

            route_stats = {
                "trip_count": 0,
                "total_boardings": 0,
                "total_alightings": 0,
                "total_load": 0,
                "load_count": 0,
                "max_load": 0
            }

            for trip in trips:
                trip_id = trip["trip_id"]
                start_time = trip["start_time"]
                direction_id = trip["direction_id"]
                time_period = get_time_period(start_time)

                # Event multipliers
                event_mult, event_load_mult = get_event_multiplier(
                    current_date, route_id, time_period
                )

                # Time of day multiplier
                time_mult = get_time_multiplier(start_time, direction_id, config)

                # Combined ridership
                combined_mult = growth_mult * day_mult * time_mult * event_mult
                trip_ridership = int(base_per_trip * combined_mult * random.uniform(0.93, 1.07))
                trip_ridership = max(len(stop_sequence), trip_ridership)  # At least 1 per stop

                # Generate stop-level data
                load_mult = event_load_mult * (1.15 if config["type"] == "frequent" else 1.0)

                stop_data, max_load = generate_stop_ridership(
                    stop_sequence, stop_coords, trip_ridership,
                    direction_id, start_time, config, load_mult
                )

                total_boardings = sum(s["boardings"] for s in stop_data)
                total_alightings = sum(s["alightings"] for s in stop_data)

                # Write trip record
                trip_writer.writerow([
                    date_str, trip_id, route_id, direction_id,
                    start_time, time_period, day_of_week, total_boardings, total_alightings, max_load
                ])

                # Write stop records
                for stop in stop_data:
                    # Check if need new chunk
                    if stop_row_count >= chunk_size:
                        open_new_stop_chunk()
                        stop_row_count = 0

                    stop_writer.writerow([
                        date_str, trip_id, route_id, stop["stop_id"], stop["stop_sequence"],
                        stop["boardings"], stop["alightings"], stop["load_after"],
                        day_of_week, direction_id, time_period
                    ])
                    stop_row_count += 1

                # Update stats
                route_stats["trip_count"] += 1
                route_stats["total_boardings"] += total_boardings
                route_stats["total_alightings"] += total_alightings
                route_stats["total_load"] += max_load
                route_stats["load_count"] += 1
                route_stats["max_load"] = max(route_stats["max_load"], max_load)

            # Route daily summary
            avg_load = route_stats["total_load"] / route_stats["load_count"] if route_stats["load_count"] > 0 else 0
            route_summaries.append([
                date_str, day_of_week, route_id, route_stats["trip_count"],
                route_stats["total_boardings"], route_stats["total_alightings"],
                round(avg_load, 2), route_stats["max_load"]
            ])

            # Update system stats
            system_stats["route_count"] += 1
            system_stats["trip_count"] += route_stats["trip_count"]
            system_stats["total_boardings"] += route_stats["total_boardings"]
            system_stats["total_alightings"] += route_stats["total_alightings"]
            system_stats["total_load"] += route_stats["total_load"]
            system_stats["load_count"] += route_stats["load_count"]
            system_stats["max_load"] = max(system_stats["max_load"], route_stats["max_load"])

        # System daily summary
        sys_avg_load = system_stats["total_load"] / system_stats["load_count"] if system_stats["load_count"] > 0 else 0
        system_summaries.append([
            date_str, day_of_week, system_stats["route_count"], system_stats["trip_count"],
            system_stats["total_boardings"], system_stats["total_alightings"],
            round(sys_avg_load, 2), system_stats["max_load"]
        ])

        current_date += timedelta(days=1)

    # Close files
    trip_file.close()
    if stop_file:
        stop_file.close()

    # Write summary files
    print("Writing summary files...")

    with open(os.path.join(output_dir, 'daily_route_summary.csv'), 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['date', 'day_of_week', 'route_id', 'trip_count',
                        'total_boardings', 'total_alightings', 'avg_load', 'max_load'])
        writer.writerows(route_summaries)

    with open(os.path.join(output_dir, 'daily_system_summary.csv'), 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['date', 'day_of_week', 'route_count', 'trip_count',
                        'total_boardings', 'total_alightings', 'avg_load', 'max_load'])
        writer.writerows(system_summaries)

    # Copy input files for reference
    print("Writing reference files...")

    with open(os.path.join(output_dir, 'stops.csv'), 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['stop_id', 'stop_name', 'lat', 'lon'])
        for s in stops.values():
            writer.writerow([s['stop_id'], s['stop_name'], s['lat'], s['lon']])

    with open(os.path.join(output_dir, 'routes.csv'), 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['route_id', 'route_name', 'route_type'])
        for r in routes.values():
            if r['route_id'] in ROUTE_CONFIG:
                writer.writerow([r['route_id'], r['route_name'], r['route_type']])

    # Print summary
    print(f"\n{'='*60}")
    print(f"Generation complete!")
    print(f"{'='*60}")
    print(f"Output directory: {output_dir}")
    print(f"Stop ridership chunks: {stop_chunk_num - 1}")
    print(f"Total stop records: ~{stop_row_count + (stop_chunk_num - 2) * chunk_size:,}")

    # List output files
    print(f"\nOutput files:")
    for f in sorted(os.listdir(output_dir)):
        size = os.path.getsize(os.path.join(output_dir, f))
        print(f"  {f}: {size / 1024 / 1024:.1f} MB")


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Generate ridership CSV files")
    parser.add_argument("--stops", required=True, help="Path to stops.csv")
    parser.add_argument("--routes", required=True, help="Path to routes.csv")
    parser.add_argument("--route-trips", required=True, help="Path to route_trips.csv")
    parser.add_argument("--trip-stops", required=True, help="Path to trip_stops.csv")
    parser.add_argument("--output-dir", default="ridership_csv", help="Output directory")
    parser.add_argument("--chunk-size", type=int, default=500000, help="Rows per stop_ridership chunk")

    args = parser.parse_args()

    # Load data
    stops = load_stops(args.stops)
    routes = load_routes(args.routes)
    route_trips = load_route_trips(args.route_trips)
    route_stop_sequences = load_trip_stops(args.trip_stops, route_trips)

    # Generate
    generate_ridership(
        stops, routes, route_trips, route_stop_sequences,
        args.output_dir, args.chunk_size
    )


if __name__ == "__main__":
    main()
