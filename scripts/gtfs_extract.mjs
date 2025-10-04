// scripts/gtfs_extract.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse';

// ======= EDIT THESE =======
// Pick ~8–10 KCM routes by their route_short_name (what riders see).
// Examples shown; change as you like.
const SELECT_ROUTES = [
  '10', '40', '62', '8', '44', '70', '1', '11', '13', '14'  // Good mix of downtown and neighborhood routes
];
// ==========================

const GTFS_DIR = path.resolve('GTFS');
const OUT_DIR = path.resolve('public/data');

async function readCSV(file, options = {}) {
  const records = [];
  const parser = fs.readFile(file, 'utf8').then(text =>
    parse(text, { columns: true, trim: true, ...options })
  );
  for await (const row of await parser) records.push(row);
  return records;
}

function toNumber(x) { const n = +x; return Number.isFinite(n) ? n : undefined; }

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log('Reading GTFS…');
  const [routes, trips, shapes, stops, stopTimes] = await Promise.all([
    readCSV(path.join(GTFS_DIR, 'routes.txt')),
    readCSV(path.join(GTFS_DIR, 'trips.txt')),
    readCSV(path.join(GTFS_DIR, 'shapes.txt')),
    readCSV(path.join(GTFS_DIR, 'stops.txt')),
    readCSV(path.join(GTFS_DIR, 'stop_times.txt')),
  ]);

  // Map routes by ID and short_name -> id
  const routeById = new Map();
  const routeIdsByShort = new Map();
  for (const r of routes) {
    routeById.set(r.route_id, r);
    const short = (r.route_short_name || '').trim();
    if (short) {
      const arr = routeIdsByShort.get(short) || [];
      arr.push(r.route_id);
      routeIdsByShort.set(short, arr);
    }
  }

  // Resolve selected route_ids from SELECT_ROUTES (by short name)
  const selectedRouteIds = new Set(
    SELECT_ROUTES.flatMap(sn => routeIdsByShort.get(sn) || [])
  );
  if (selectedRouteIds.size === 0) {
    console.error('No routes matched SELECT_ROUTES. Check your route_short_name values.');
    process.exit(1);
  }
  console.log('Selected route_ids:', [...selectedRouteIds].slice(0, 12), '…');

  // Collect shape_ids belonging to selected routes via trips
  const selectedShapeIds = new Set();
  const selectedTripIds  = new Set();
  for (const t of trips) {
    if (selectedRouteIds.has(t.route_id)) {
      if (t.shape_id) selectedShapeIds.add(t.shape_id);
      selectedTripIds.add(t.trip_id);
    }
  }
  console.log('Selected shape_ids:', selectedShapeIds.size, 'trips:', selectedTripIds.size);

  // Build shapes: group coords per shape_id ordered by shape_pt_sequence
  const coordsByShape = new Map();
  for (const s of shapes) {
    if (!selectedShapeIds.has(s.shape_id)) continue;
    const seq = toNumber(s.shape_pt_sequence) ?? 0;
    const lon = toNumber(s.shape_pt_lon);
    const lat = toNumber(s.shape_pt_lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const arr = coordsByShape.get(s.shape_id) || [];
    arr.push({ seq, lon, lat });
    coordsByShape.set(s.shape_id, arr);
  }

  // Map shape_id -> route_id via any trip that references it
  const routeIdByShape = new Map();
  for (const t of trips) {
    if (selectedRouteIds.has(t.route_id) && t.shape_id) {
      if (!routeIdByShape.has(t.shape_id)) routeIdByShape.set(t.shape_id, t.route_id);
    }
  }

  // Create shapes GeoJSON - keep only one representative shape per route
  const shapeFeatures = [];
  const shapesByRoute = new Map();
  
  // Group shapes by route
  for (const [shape_id, pts] of coordsByShape.entries()) {
    const route_id = routeIdByShape.get(shape_id);
    if (!route_id) continue;
    
    pts.sort((a,b) => a.seq - b.seq);
    const coordinates = pts.map(p => [p.lon, p.lat]);
    
    if (!shapesByRoute.has(route_id)) {
      shapesByRoute.set(route_id, []);
    }
    shapesByRoute.get(route_id).push({ shape_id, coordinates, pointCount: pts.length });
  }
  
  // Keep only the longest shape per route (most representative)
  for (const [route_id, shapes] of shapesByRoute.entries()) {
    const bestShape = shapes.reduce((longest, current) => 
      current.pointCount > longest.pointCount ? current : longest
    );
    
    const route = routeById.get(route_id) || {};
    shapeFeatures.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: bestShape.coordinates },
      properties: {
        route_id,
        shape_id: bestShape.shape_id,
        route_short_name: route.route_short_name ?? null,
        route_long_name: route.route_long_name ?? null
      }
    });
  }
  const shapesFC = { type: 'FeatureCollection', features: shapeFeatures };
  await fs.writeFile(path.join(OUT_DIR, 'shapes_kcm_subset.geojson'), JSON.stringify(shapesFC));

  // Build stops for selected routes:
  //  trip_id -> stop_ids (via stop_times), then map to stops.txt
  const stopIds = new Set();
  for (const st of stopTimes) {
    if (selectedTripIds.has(st.trip_id)) stopIds.add(st.stop_id);
  }
  const stopFeatures = [];
  for (const s of stops) {
    if (!stopIds.has(s.stop_id)) continue;
    const lon = toNumber(s.stop_lon);
    const lat = toNumber(s.stop_lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    stopFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { stop_id: s.stop_id, name: s.stop_name }
    });
  }
  const stopsFC = { type: 'FeatureCollection', features: stopFeatures };
  await fs.writeFile(path.join(OUT_DIR, 'stops_kcm_subset.geojson'), JSON.stringify(stopsFC));

  console.log('Wrote:',
    path.join(OUT_DIR, 'shapes_kcm_subset.geojson'),
    'and',
    path.join(OUT_DIR, 'stops_kcm_subset.geojson')
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
