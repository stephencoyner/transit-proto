export async function fetchShapesKCM() {
  const res = await fetch('/data/shapes_kcm_subset.geojson', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load shapes_kcm_subset.geojson');
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
