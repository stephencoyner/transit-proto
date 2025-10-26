#!/usr/bin/env python3
"""
Build complete shapes GeoJSON from GTFS shapes.txt
Includes all shapes for all routes, not just a subset
"""

import csv
import json
from collections import defaultdict

def build_full_shapes_geojson():
    """Build complete GeoJSON from all GTFS shapes."""

    print("Reading routes.txt...")
    routes = {}
    with open('GTFS/routes.txt', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            routes[row['route_id']] = {
                'route_short_name': row['route_short_name'],
                'route_long_name': row['route_long_name']
            }

    print("Reading trips.txt to map shapes to routes...")
    shape_to_route = {}
    with open('GTFS/trips.txt', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            shape_id = row['shape_id']
            route_id = row['route_id']
            if shape_id not in shape_to_route:
                shape_to_route[shape_id] = route_id

    print("Reading shapes.txt...")
    shapes_data = defaultdict(list)
    with open('GTFS/shapes.txt', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            shape_id = row['shape_id']
            shapes_data[shape_id].append({
                'lon': float(row['shape_pt_lon']),
                'lat': float(row['shape_pt_lat']),
                'sequence': int(row['shape_pt_sequence'])
            })

    print(f"Processing {len(shapes_data)} shapes...")

    # Build GeoJSON features
    features = []
    for shape_id, points in shapes_data.items():
        # Sort by sequence
        points.sort(key=lambda p: p['sequence'])

        # Get route info
        route_id = shape_to_route.get(shape_id)
        if not route_id or route_id not in routes:
            continue

        route_info = routes[route_id]

        # Build LineString coordinates
        coordinates = [[p['lon'], p['lat']] for p in points]

        feature = {
            'type': 'Feature',
            'geometry': {
                'type': 'LineString',
                'coordinates': coordinates
            },
            'properties': {
                'route_id': route_id,
                'shape_id': shape_id,
                'route_short_name': route_info['route_short_name'],
                'route_long_name': route_info['route_long_name']
            }
        }
        features.append(feature)

    # Create FeatureCollection
    geojson = {
        'type': 'FeatureCollection',
        'features': features
    }

    print(f"Writing shapes_kcm_full.geojson with {len(features)} features...")
    with open('public/data/shapes_kcm_full.geojson', 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False)

    print(f"\n✓ Successfully built shapes_kcm_full.geojson!")
    print(f"  - Total shapes: {len(features)}")
    print(f"  - Total routes: {len(set(shape_to_route.values()))}")

if __name__ == '__main__':
    build_full_shapes_geojson()
