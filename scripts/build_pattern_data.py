#!/usr/bin/env python3
"""
Build pattern lookup data from GTFS trips.txt
Generates:
- pattern_lookup.json: shape_id -> pattern info mapping
- route_patterns.json: route_id -> patterns array
"""

import csv
import json
from collections import defaultdict

def build_pattern_data():
    """Build pattern lookup tables from GTFS trips data."""

    # Data structures
    pattern_lookup = {}
    route_patterns_raw = defaultdict(lambda: defaultdict(lambda: {
        'headsign': '',
        'direction_id': '',
        'shape_ids': set(),
        'trip_count': 0,
        'trip_ids': set()  # Track trip IDs for stop mapping
    }))

    # Read GTFS routes for route_short_name
    route_names = {}
    with open('GTFS/routes.txt', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            route_names[row['route_id']] = row['route_short_name']

    # Read GTFS trips
    print("Reading trips.txt...")
    with open('GTFS/trips.txt', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            route_id = row['route_id']
            shape_id = row['shape_id']
            trip_headsign = row['trip_headsign']
            direction_id = row['direction_id']

            # Build pattern lookup (shape_id -> pattern info)
            if shape_id not in pattern_lookup:
                pattern_lookup[shape_id] = {
                    'headsign': trip_headsign,
                    'direction_id': direction_id,
                    'trip_count': 0,
                    'route_id': route_id
                }
            pattern_lookup[shape_id]['trip_count'] += 1

            # Build route patterns (route_id -> patterns)
            key = f"{trip_headsign}|{direction_id}"
            if not route_patterns_raw[route_id][key]['headsign']:
                route_patterns_raw[route_id][key]['headsign'] = trip_headsign
                route_patterns_raw[route_id][key]['direction_id'] = direction_id
            route_patterns_raw[route_id][key]['shape_ids'].add(shape_id)
            route_patterns_raw[route_id][key]['trip_ids'].add(row['trip_id'])
            route_patterns_raw[route_id][key]['trip_count'] += 1

    print(f"Processed {len(pattern_lookup)} unique shapes")

    # Build pattern-to-stops mapping from stop_times.txt
    print("Reading stop_times.txt to map patterns to stops...")
    pattern_stops = defaultdict(dict)  # key: "route_id|headsign" -> dict of {stop_id: stop_sequence}
    pattern_trip_samples = {}  # Store one sample trip per pattern to get stop sequence

    with open('GTFS/stop_times.txt', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            trip_id = row['trip_id']
            stop_id = row['stop_id']
            stop_sequence = int(row['stop_sequence'])

            # Find which pattern this trip belongs to
            for route_id, patterns in route_patterns_raw.items():
                for key, pattern_data in patterns.items():
                    if trip_id in pattern_data['trip_ids']:
                        pattern_key = f"{route_id}|{pattern_data['headsign']}"

                        # Store stop with its sequence number
                        if stop_id not in pattern_stops[pattern_key]:
                            pattern_stops[pattern_key][stop_id] = stop_sequence

                        # Keep track of a sample trip for this pattern (to get consistent ordering)
                        if pattern_key not in pattern_trip_samples:
                            pattern_trip_samples[pattern_key] = trip_id

                        break

    print(f"Mapped stops for {len(pattern_stops)} patterns")

    # Convert to final format with percentages
    print("Building route patterns with percentages...")
    route_patterns_output = {}

    for route_id, patterns in route_patterns_raw.items():
        total_trips = sum(p['trip_count'] for p in patterns.values())

        patterns_list = []
        for pattern in patterns.values():
            pattern_key = f"{route_id}|{pattern['headsign']}"
            stops_dict = pattern_stops.get(pattern_key, {})

            # Sort stops by their stop_sequence
            stop_ids = [stop_id for stop_id, _ in sorted(stops_dict.items(), key=lambda x: x[1])]

            patterns_list.append({
                'headsign': pattern['headsign'],
                'direction_id': pattern['direction_id'],
                'shape_ids': sorted(list(pattern['shape_ids'])),
                'stop_ids': stop_ids,
                'trip_count': pattern['trip_count'],
                'pct_of_route': round((pattern['trip_count'] / total_trips) * 100, 1)
            })

        # Sort by trip count (descending)
        patterns_list.sort(key=lambda x: x['trip_count'], reverse=True)

        route_patterns_output[route_id] = {
            'route_short_name': route_names.get(route_id, ''),
            'patterns': patterns_list
        }

    print(f"Built patterns for {len(route_patterns_output)} routes")

    # Write output files
    print("Writing pattern_lookup.json...")
    with open('public/data/pattern_lookup.json', 'w', encoding='utf-8') as f:
        json.dump(pattern_lookup, f, indent=2, ensure_ascii=False)

    print("Writing route_patterns.json...")
    with open('public/data/route_patterns.json', 'w', encoding='utf-8') as f:
        json.dump(route_patterns_output, f, indent=2, ensure_ascii=False)

    print("\n✓ Successfully built pattern data files!")
    print(f"  - pattern_lookup.json: {len(pattern_lookup)} shapes")
    print(f"  - route_patterns.json: {len(route_patterns_output)} routes")

    # Show some examples
    print("\nExample: Route 40 (102574) patterns:")
    if '102574' in route_patterns_output:
        for pattern in route_patterns_output['102574']['patterns']:
            print(f"  - {pattern['headsign'][:50]:50s} {pattern['pct_of_route']:5.1f}% of trips")

if __name__ == '__main__':
    build_pattern_data()
