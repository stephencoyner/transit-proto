/**
 * Shared map utilities extracted from MapCanvas.
 */

interface RouteFeature extends GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString> {
  properties: {
    route_id: string;
    shape_id: string;
    route_short_name: string | null;
    route_long_name: string | null;
  };
}

type LngLatBoundsLike = [[number, number], [number, number]];

/**
 * Calculate bounding box from route features (MultiLineString-safe).
 */
export function calculateBounds(features: RouteFeature[]): LngLatBoundsLike | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

  const pushCoord = ([lng, lat]: number[]) => {
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
  };

  for (const f of features) {
    const g = f.geometry;
    if (g.type === 'LineString') {
      for (const c of g.coordinates) pushCoord(c as number[]);
    } else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates as unknown as number[][][]) {
        for (const c of line) pushCoord(c);
      }
    }
  }

  if (minLng === Infinity) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

/**
 * Flatten LineString & MultiLineString into plain paths for PathLayer.
 */
export function flattenPaths(features: RouteFeature[]): Array<{ path: number[][]; properties: RouteFeature['properties'] }> {
  const out: Array<{ path: number[][]; properties: RouteFeature['properties'] }> = [];
  for (const f of features) {
    const g = f.geometry as GeoJSON.LineString | GeoJSON.MultiLineString;
    if (g.type === 'LineString') {
      out.push({ path: g.coordinates as number[][], properties: f.properties });
    } else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates as unknown as number[][][]) {
        out.push({ path: line, properties: f.properties });
      }
    }
  }
  return out;
}

export type { RouteFeature, LngLatBoundsLike };
