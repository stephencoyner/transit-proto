// Helper function to decompress gzipped fetch response
async function fetchGzipped<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);

  const blob = await res.blob();
  const ds = new DecompressionStream('gzip');
  const decompressedStream = blob.stream().pipeThrough(ds);
  const decompressedBlob = await new Response(decompressedStream).blob();
  const text = await decompressedBlob.text();
  return JSON.parse(text) as T;
}

export async function fetchShapesKCM() {
  return fetchGzipped<GeoJSON.FeatureCollection>('/data/shapes_kcm_subset_complete.geojson.gz');
}

export async function fetchStopsKCM() {
  return fetchGzipped<GeoJSON.FeatureCollection>('/data/stops_kcm_subset.geojson.gz');
}

// Fetch pre-built route-stops mapping
export async function fetchRouteStopsMap(): Promise<{ [routeId: string]: Set<string> }> {
  const data = await fetchGzipped<{ [routeId: string]: string[] }>('/data/route_stops_map.json.gz');

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
  return fetchGzipped<{ [shapeId: string]: PatternInfo }>('/data/pattern_lookup.json.gz');
}

// Fetch route patterns (route_id -> pattern list)
export async function fetchRoutePatterns(): Promise<{ [routeId: string]: RoutePatternInfo }> {
  return fetchGzipped<{ [routeId: string]: RoutePatternInfo }>('/data/route_patterns.json.gz');
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

// Fetch all route trips from GTFS (using gzipped file for faster loading)
export async function fetchRouteTrips(): Promise<{ [routeId: string]: Trip[] }> {
  const data = await fetchGzipped<{ [routeId: string]: Trip[] }>('/data/route_trips.json.gz');

  // Add placeholder ridership to each trip (random between 50-500)
  for (const trips of Object.values(data)) {
    for (const trip of trips) {
      trip.ridership = Math.floor(Math.random() * 450) + 50;
    }
  }

  return data;
}

// Helper function to check if a GTFS time is valid (< 24:00)
// GTFS allows times >= 24:00 for trips that run past midnight
function isValidServiceTime(time: string): boolean {
  const [hourStr] = time.split(':');
  const hour = parseInt(hourStr, 10);
  return hour < 24;
}

// Trip stop time data (stop-by-stop details for each trip)
export interface TripStopTime {
  id: string;      // stop_id
  t: string;       // arrival_time (HH:MM:SS)
  n: string;       // stop_name
  lat: number;     // stop_lat
  lon: number;     // stop_lon
}

// Fetch trip stop times (lazy loaded due to large file size)
let tripStopTimesCache: { [tripId: string]: TripStopTime[] } | null = null;

export async function fetchTripStopTimes(): Promise<{ [tripId: string]: TripStopTime[] }> {
  if (tripStopTimesCache) {
    return tripStopTimesCache;
  }

  const res = await fetch('/data/trip_stop_times.json.gz');
  if (!res.ok) throw new Error('Failed to load trip_stop_times.json.gz');

  // Decompress the gzipped response
  const blob = await res.blob();
  const ds = new DecompressionStream('gzip');
  const decompressedStream = blob.stream().pipeThrough(ds);
  const decompressedBlob = await new Response(decompressedStream).blob();
  const text = await decompressedBlob.text();
  tripStopTimesCache = JSON.parse(text);

  return tripStopTimesCache!;
}

// Get stop times for a specific trip (loads full file on first call, then cached)
export async function getTripStopTimes(tripId: string): Promise<TripStopTime[] | null> {
  const allTripStopTimes = await fetchTripStopTimes();
  return allTripStopTimes[tripId] || null;
}

// Organize trips by pattern (headsign) for a specific route
export function organizeTripsbyPattern(
  trips: Trip[],
  routePatternInfo: RoutePatternInfo
): TripsByPattern[] {
  const tripsByPattern: TripsByPattern[] = [];

  // Filter out trips with times >= 24:00 (past midnight trips from previous service day)
  const validTrips = trips.filter(trip => isValidServiceTime(trip.start_time));

  // Use the patterns from route_patterns.json to group trips
  for (const pattern of routePatternInfo.patterns) {
    const patternTrips = validTrips.filter(trip =>
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
