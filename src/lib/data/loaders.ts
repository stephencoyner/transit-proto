export async function fetchShapesKCM() {
  const res = await fetch('/data/shapes_kcm_subset_complete.geojson', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load shapes_kcm_subset_complete.geojson');
  return res.json() as Promise<GeoJSON.FeatureCollection>;
}

export async function fetchStopsKCM() {
  const res = await fetch('/data/stops_kcm_subset.geojson', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load stops_kcm_subset.geojson');
  return res.json() as Promise<GeoJSON.FeatureCollection>;
}

// Fetch pre-built route-stops mapping
export async function fetchRouteStopsMap(): Promise<{ [routeId: string]: Set<string> }> {
  const res = await fetch('/data/route_stops_map.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load route_stops_map.json');
  const data = await res.json() as { [routeId: string]: string[] };

  // Convert arrays back to Sets
  const routeStopsMap: { [routeId: string]: Set<string> } = {};
  for (const [routeId, stopIds] of Object.entries(data)) {
    routeStopsMap[routeId] = new Set(stopIds);
  }

  return routeStopsMap;
}

// Pattern data types
export interface PatternInfo {
  headsign: string;
  direction_id: string;
  trip_count: number;
  route_id: string;
  shape_length?: number;
}

export interface RoutePattern {
  headsign: string;
  direction_id: string;
  shape_ids: string[];
  stop_ids: string[];
  trip_count: number;
  pct_of_route: number;
}

export interface RoutePatternInfo {
  route_short_name: string;
  patterns: RoutePattern[];
}

// Fetch pattern lookup table (shape_id -> pattern info)
export async function fetchPatternLookup(): Promise<{ [shapeId: string]: PatternInfo }> {
  const res = await fetch('/data/pattern_lookup.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load pattern_lookup.json');
  return res.json();
}

// Fetch route patterns (route_id -> pattern list)
export async function fetchRoutePatterns(): Promise<{ [routeId: string]: RoutePatternInfo }> {
  const res = await fetch('/data/route_patterns.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load route_patterns.json');
  return res.json();
}

// Trip data types
export interface Trip {
  trip_id: string;
  route_id: string;
  shape_id: string;
  headsign: string;
  direction_id: string;
  start_time: string; // HH:MM:SS format
  ridership: number; // Placeholder for now, will be real data later
}

export interface TripsByPattern {
  headsign: string;
  direction_id: string;
  trips: Trip[];
}

// Fetch all route trips from GTFS
export async function fetchRouteTrips(): Promise<{ [routeId: string]: Trip[] }> {
  const res = await fetch('/data/route_trips.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load route_trips.json');
  const data = await res.json() as { [routeId: string]: Trip[] };

  // Add placeholder ridership to each trip (random between 50-500)
  for (const trips of Object.values(data)) {
    for (const trip of trips) {
      trip.ridership = Math.floor(Math.random() * 450) + 50;
    }
  }

  return data;
}

// Organize trips by pattern (headsign) for a specific route
export function organizeTripsbyPattern(
  trips: Trip[],
  routePatternInfo: RoutePatternInfo
): TripsByPattern[] {
  const tripsByPattern: TripsByPattern[] = [];

  // Use the patterns from route_patterns.json to group trips
  for (const pattern of routePatternInfo.patterns) {
    const patternTrips = trips.filter(trip =>
      trip.headsign === pattern.headsign &&
      trip.direction_id === pattern.direction_id
    );

    // Sort by start time
    patternTrips.sort((a, b) => a.start_time.localeCompare(b.start_time));

    if (patternTrips.length > 0) {
      tripsByPattern.push({
        headsign: pattern.headsign,
        direction_id: pattern.direction_id,
        trips: patternTrips
      });
    }
  }

  return tripsByPattern;
}
