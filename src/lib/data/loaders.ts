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
