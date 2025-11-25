#!/usr/bin/env python3
"""
Process GTFS stop_times.txt and stops.txt to create trip_stop_times.json
This extracts stop-by-stop data for each trip including arrival times and stop details
Only includes trips that exist in route_trips.json to keep file size manageable
"""

import csv
import json
from collections import defaultdict

def process_trip_stop_times():
    # First, load route_trips.json to get the set of trip_ids we care about
    print("Reading route_trips.json to get valid trip IDs...")
    valid_trip_ids = set()

    with open('public/data/route_trips.json', 'r', encoding='utf-8') as f:
        route_trips = json.load(f)
        for route_id, trips in route_trips.items():
            for trip in trips:
                valid_trip_ids.add(trip['trip_id'])

    print(f"Found {len(valid_trip_ids)} valid trip IDs")

    # Read stops.txt to get stop details
    print("Reading stops.txt...")
    stops = {}

    with open('GTFS/stops.txt', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            stops[row['stop_id']] = {
                'n': row['stop_name'],  # Shortened key names to reduce file size
                'lat': float(row['stop_lat']),
                'lon': float(row['stop_lon'])
            }

    print(f"Loaded {len(stops)} stops")

    # Read stop_times.txt and group by trip_id (only for valid trips)
    print("Reading stop_times.txt...")
    trip_stops = defaultdict(list)

    with open('GTFS/stop_times.txt', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            trip_id = row['trip_id']

            # Skip trips not in our route_trips.json
            if trip_id not in valid_trip_ids:
                continue

            stop_id = row['stop_id']

            # Get stop details
            stop_info = stops.get(stop_id, {})

            # Use short key names to reduce file size
            stop_time = {
                'id': stop_id,
                'seq': int(row['stop_sequence']),
                't': row['arrival_time'],
                'n': stop_info.get('n', 'Unknown'),
                'lat': stop_info.get('lat', 0),
                'lon': stop_info.get('lon', 0)
            }

            trip_stops[trip_id].append(stop_time)

    print(f"Found stop times for {len(trip_stops)} trips")

    # Sort each trip's stops by stop_sequence, then remove seq field
    print("Sorting stops by sequence...")
    for trip_id in trip_stops:
        trip_stops[trip_id].sort(key=lambda s: s['seq'])
        # Remove seq field since array order is now the sequence
        for stop in trip_stops[trip_id]:
            del stop['seq']

    # Convert to regular dict for JSON serialization
    trip_stop_times = dict(trip_stops)

    # Write to JSON
    output_file = 'public/data/trip_stop_times.json'
    print(f"Writing to {output_file}...")

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(trip_stop_times, f)  # No indent to save space

    print(f"Done! Created {output_file}")

    # Print some stats
    total_stop_times = sum(len(stops) for stops in trip_stop_times.values())
    avg_stops_per_trip = total_stop_times / len(trip_stop_times) if trip_stop_times else 0

    print(f"\nStats:")
    print(f"  Trips: {len(trip_stop_times)}")
    print(f"  Total stop times: {total_stop_times}")
    print(f"  Average stops per trip: {avg_stops_per_trip:.1f}")

    # Show file size
    import os
    file_size = os.path.getsize(output_file)
    print(f"  File size: {file_size / (1024*1024):.1f} MB")

if __name__ == '__main__':
    process_trip_stop_times()
