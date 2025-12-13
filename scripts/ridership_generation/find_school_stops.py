#!/usr/bin/env python3
"""
Find school-adjacent stops for Routes 44 and 8.
Outputs candidates for manual verification before data generation.
"""

import csv
import os
from dataclasses import dataclass
from typing import Optional

GTFS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'GTFS')

# Target routes
ROUTE_44_ID = "100224"  # Route 44: Ballard - Montlake
ROUTE_8_ID = "100275"   # Route 8: Seattle Center - Capitol Hill - Rainier Beach

# School-adjacent stop patterns to search for
SCHOOL_STOP_PATTERNS = {
    "44": [
        {"pattern": "U District Station", "notes": "Near UW Link station", "school": "UW"},
        {"pattern": "15th Ave NE & NE Campus Pkwy", "notes": "UW campus edge", "school": "UW"},
        {"pattern": "15th Ave NE & NE 42nd St", "notes": "UW campus edge", "school": "UW"},
        {"pattern": "NE Pacific St & 15th Ave NE", "notes": "UW Medical Center", "school": "UW"},
    ],
    "8": [
        {"pattern": "Broadway & E John St", "notes": "Seattle Central College", "school": "Seattle Central"},
        {"pattern": "E John St & Broadway", "notes": "Seattle Central College", "school": "Seattle Central"},
        {"pattern": "23rd Ave & E Jefferson St", "notes": "Near Garfield HS", "school": "Garfield HS"},
        {"pattern": "MLK Jr Way & E Alder St", "notes": "Near Garfield HS", "school": "Garfield HS"},
    ]
}

# Approximate school locations for verification
SCHOOL_LOCATIONS = {
    "UW": (47.6553, -122.3035),  # University of Washington
    "Seattle Central": (47.6164, -122.3215),  # Seattle Central College
    "Garfield HS": (47.6073, -122.3028),  # Garfield High School
}


@dataclass
class Stop:
    stop_id: str
    stop_code: str
    stop_name: str
    stop_lat: float
    stop_lon: float


def load_stops() -> dict[str, Stop]:
    """Load all stops from GTFS."""
    stops = {}
    with open(os.path.join(GTFS_DIR, 'stops.txt'), 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            stops[row['stop_id']] = Stop(
                stop_id=row['stop_id'],
                stop_code=row.get('stop_code', ''),
                stop_name=row['stop_name'],
                stop_lat=float(row['stop_lat']),
                stop_lon=float(row['stop_lon'])
            )
    return stops


def load_trips_for_route(route_id: str) -> set[str]:
    """Get all trip_ids for a route."""
    trip_ids = set()
    with open(os.path.join(GTFS_DIR, 'trips.txt'), 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['route_id'] == route_id:
                trip_ids.add(row['trip_id'])
    return trip_ids


def load_stops_for_trips(trip_ids: set[str]) -> set[str]:
    """Get all stop_ids served by a set of trips."""
    stop_ids = set()
    with open(os.path.join(GTFS_DIR, 'stop_times.txt'), 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['trip_id'] in trip_ids:
                stop_ids.add(row['stop_id'])
    return stop_ids


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two points."""
    import math
    R = 6371  # Earth's radius in km

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    return R * c


def find_matching_stops(stops: dict[str, Stop], route_stop_ids: set[str],
                        pattern: str, school: str) -> list[tuple[Stop, float]]:
    """Find stops matching pattern and calculate distance to school."""
    matches = []
    school_loc = SCHOOL_LOCATIONS.get(school)

    # Normalize pattern for matching
    pattern_lower = pattern.lower()

    for stop_id in route_stop_ids:
        if stop_id not in stops:
            continue
        stop = stops[stop_id]
        stop_name_lower = stop.stop_name.lower()

        # Check if pattern matches (flexible substring matching)
        pattern_parts = pattern_lower.split('&')
        if len(pattern_parts) == 2:
            # Cross-street pattern - check both parts
            part1 = pattern_parts[0].strip()
            part2 = pattern_parts[1].strip()
            if part1 in stop_name_lower and part2 in stop_name_lower:
                dist = haversine_distance(stop.stop_lat, stop.stop_lon,
                                          school_loc[0], school_loc[1]) if school_loc else 0
                matches.append((stop, dist))
        else:
            # Single name pattern
            if pattern_lower in stop_name_lower:
                dist = haversine_distance(stop.stop_lat, stop.stop_lon,
                                          school_loc[0], school_loc[1]) if school_loc else 0
                matches.append((stop, dist))

    # Sort by distance to school
    matches.sort(key=lambda x: x[1])
    return matches


def main():
    print("=" * 80)
    print("SCHOOL-ADJACENT STOPS LOOKUP")
    print("For Routes 44 and 8 - Manual Verification Required")
    print("=" * 80)
    print()

    # Load GTFS data
    print("Loading GTFS data...")
    stops = load_stops()
    print(f"  Loaded {len(stops)} stops")

    route_stops = {}
    for route_name, route_id in [("44", ROUTE_44_ID), ("8", ROUTE_8_ID)]:
        print(f"  Loading trips for Route {route_name}...")
        trip_ids = load_trips_for_route(route_id)
        print(f"    Found {len(trip_ids)} trips")
        stop_ids = load_stops_for_trips(trip_ids)
        print(f"    Found {len(stop_ids)} unique stops")
        route_stops[route_name] = stop_ids

    print()
    print("=" * 80)
    print("STOP CANDIDATES FOR VERIFICATION")
    print("=" * 80)

    results = {}

    for route_name, patterns in SCHOOL_STOP_PATTERNS.items():
        print(f"\n{'='*40}")
        print(f"ROUTE {route_name}")
        print(f"{'='*40}")

        results[route_name] = []

        for pattern_info in patterns:
            pattern = pattern_info["pattern"]
            notes = pattern_info["notes"]
            school = pattern_info["school"]

            print(f"\nSearching for: \"{pattern}\"")
            print(f"  Expected near: {school}")
            print(f"  Notes: {notes}")

            matches = find_matching_stops(stops, route_stops[route_name], pattern, school)

            if matches:
                print(f"  Found {len(matches)} candidate(s):")
                for stop, dist in matches[:3]:  # Show top 3
                    print(f"    - stop_id: {stop.stop_id}")
                    print(f"      name: {stop.stop_name}")
                    print(f"      lat/lon: {stop.stop_lat}, {stop.stop_lon}")
                    print(f"      distance to {school}: {dist:.2f} km")
                    print(f"      Google Maps: https://www.google.com/maps?q={stop.stop_lat},{stop.stop_lon}")
                    print()

                # Record best match
                best = matches[0]
                results[route_name].append({
                    "pattern": pattern,
                    "stop_id": best[0].stop_id,
                    "stop_name": best[0].stop_name,
                    "lat": best[0].stop_lat,
                    "lon": best[0].stop_lon,
                    "school": school,
                    "distance_km": best[1],
                    "notes": notes
                })
            else:
                print(f"  WARNING: No matches found!")
                # Try broader search
                print(f"  Attempting broader search...")
                pattern_parts = pattern.lower().split('&')
                if len(pattern_parts) >= 1:
                    main_street = pattern_parts[0].strip().split()[0]  # First word
                    broader_matches = []
                    for stop_id in route_stops[route_name]:
                        if stop_id in stops:
                            stop = stops[stop_id]
                            if main_street in stop.stop_name.lower():
                                school_loc = SCHOOL_LOCATIONS.get(school)
                                if school_loc:
                                    dist = haversine_distance(stop.stop_lat, stop.stop_lon,
                                                            school_loc[0], school_loc[1])
                                    if dist < 1.0:  # Within 1km of school
                                        broader_matches.append((stop, dist))

                    broader_matches.sort(key=lambda x: x[1])
                    if broader_matches:
                        print(f"  Found {len(broader_matches)} stops containing '{main_street}' near {school}:")
                        for stop, dist in broader_matches[:5]:
                            print(f"    - stop_id: {stop.stop_id}, name: {stop.stop_name}, dist: {dist:.2f}km")

    # Output summary
    print()
    print("=" * 80)
    print("RECOMMENDED STOP IDS (for data generation config)")
    print("=" * 80)
    print()

    print("SCHOOL_ADJACENT_STOPS = {")
    for route_name, route_results in results.items():
        print(f"    # Route {route_name}")
        for r in route_results:
            print(f"    \"{r['stop_id']}\": {{")
            print(f"        \"route\": \"{route_name}\",")
            print(f"        \"stop_name\": \"{r['stop_name']}\",")
            print(f"        \"school\": \"{r['school']}\",")
            print(f"        \"notes\": \"{r['notes']}\",")
            print(f"    }},")
    print("}")

    print()
    print("Please verify these stops on Google Maps before proceeding with data generation.")
    print("Update the SCHOOL_ADJACENT_STOPS config in the data generation script as needed.")


if __name__ == "__main__":
    main()
