#!/usr/bin/env python3
"""
Process GTFS trips.txt and stop_times.txt to create route_trips.json
This extracts trip data with start times for each route
"""

import csv
import json
from collections import defaultdict

def process_gtfs_trips():
    # Read trips.txt
    trips_by_route = defaultdict(list)
    trip_lookup = {}

    print("Reading trips.txt...")
    with open('GTFS/trips.txt', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            trip_id = row['trip_id']
            route_id = row['route_id']

            trip_data = {
                'trip_id': trip_id,
                'route_id': route_id,
                'headsign': row['trip_headsign'],
                'direction_id': row['direction_id'],
                'shape_id': row['shape_id']
            }

            trip_lookup[trip_id] = trip_data
            trips_by_route[route_id].append(trip_data)

    print(f"Found {len(trip_lookup)} trips across {len(trips_by_route)} routes")

    # Read stop_times.txt to get start times (first stop)
    print("Reading stop_times.txt to get start times...")
    trip_start_times = {}

    with open('GTFS/stop_times.txt', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            trip_id = row['trip_id']
            stop_sequence = int(row['stop_sequence'])

            # Only capture the first stop (stop_sequence == 1)
            if stop_sequence == 1:
                trip_start_times[trip_id] = row['departure_time']

    print(f"Found start times for {len(trip_start_times)} trips")

    # Combine trip data with start times
    route_trips = {}

    for route_id, trips in trips_by_route.items():
        route_trips[route_id] = []

        for trip in trips:
            trip_id = trip['trip_id']

            # Only include trips with start times
            if trip_id in trip_start_times:
                trip['start_time'] = trip_start_times[trip_id]
                # Add placeholder ridership (will be replaced with real data)
                trip['ridership'] = 0  # Placeholder
                route_trips[route_id].append(trip)

        # Sort trips by start time
        route_trips[route_id].sort(key=lambda t: t['start_time'])

    # Write to JSON
    output_file = 'public/data/route_trips.json'
    print(f"Writing to {output_file}...")

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(route_trips, f, indent=2)

    print(f"Done! Created {output_file}")

    # Print some stats
    total_trips = sum(len(trips) for trips in route_trips.values())
    print(f"\nStats:")
    print(f"  Routes: {len(route_trips)}")
    print(f"  Total trips with start times: {total_trips}")
    print(f"  Average trips per route: {total_trips / len(route_trips):.1f}")

if __name__ == '__main__':
    process_gtfs_trips()
