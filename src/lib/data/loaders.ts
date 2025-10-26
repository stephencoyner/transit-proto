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
