import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CSV helper
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i];
    });
    return obj;
  });
}

console.log('Loading trips.txt...');
const tripsText = fs.readFileSync(path.join(__dirname, '../GTFS/trips.txt'), 'utf-8');
const trips = parseCSV(tripsText);
console.log(`Loaded ${trips.length} trips`);

console.log('Loading stop_times.txt...');
const stopTimesText = fs.readFileSync(path.join(__dirname, '../GTFS/stop_times.txt'), 'utf-8');
const stopTimes = parseCSV(stopTimesText);
console.log(`Loaded ${stopTimes.length} stop times`);

console.log('Building route-stops mapping...');

// First, build trip_id -> route_id map
const tripToRoute = {};
trips.forEach(trip => {
  tripToRoute[trip.trip_id] = trip.route_id;
});

// Then, build route_id -> array of stop_ids (using array instead of Set for JSON serialization)
const routeStops = {};
stopTimes.forEach(st => {
  const routeId = tripToRoute[st.trip_id];
  if (routeId) {
    if (!routeStops[routeId]) {
      routeStops[routeId] = new Set();
    }
    routeStops[routeId].add(st.stop_id);
  }
});

// Convert Sets to Arrays for JSON serialization
const routeStopsArray = {};
for (const [routeId, stopSet] of Object.entries(routeStops)) {
  routeStopsArray[routeId] = Array.from(stopSet);
}

console.log(`Found ${Object.keys(routeStopsArray).length} routes`);

// Write to JSON file
const outputPath = path.join(__dirname, '../public/data/route_stops_map.json');
fs.writeFileSync(outputPath, JSON.stringify(routeStopsArray, null, 2));

console.log(`Wrote route-stops mapping to ${outputPath}`);

// Print stats
const totalStops = Object.values(routeStopsArray).reduce((sum, stops) => sum + stops.length, 0);
console.log(`Total route-stop associations: ${totalStops}`);

