#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function addShapeLengths() {
  console.log('Reading shapes.txt to extract shape lengths...');

  // Read shapes.txt and get max shape_dist_traveled for each shape_id
  const shapeLengths = {};

  const fileStream = fs.createReadStream(path.join(__dirname, '../GTFS/shapes.txt'));
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let isFirstLine = true;
  for await (const line of rl) {
    if (isFirstLine) {
      isFirstLine = false;
      continue; // Skip header
    }

    const parts = line.split(',');
    const shapeId = parts[0];
    const distTraveled = parseFloat(parts[4]);

    if (!shapeLengths[shapeId] || distTraveled > shapeLengths[shapeId]) {
      shapeLengths[shapeId] = distTraveled;
    }
  }

  console.log(`Found lengths for ${Object.keys(shapeLengths).length} shapes`);

  // Read pattern_lookup.json
  const patternLookupPath = path.join(__dirname, '../public/data/pattern_lookup.json');
  const patternLookup = JSON.parse(fs.readFileSync(patternLookupPath, 'utf8'));

  // Add shape_length to each entry
  let addedCount = 0;
  let missingCount = 0;

  for (const shapeId in patternLookup) {
    if (shapeLengths[shapeId]) {
      patternLookup[shapeId].shape_length = shapeLengths[shapeId];
      addedCount++;
    } else {
      console.warn(`Warning: No length found for shape_id ${shapeId}`);
      missingCount++;
    }
  }

  // Write updated pattern_lookup.json
  fs.writeFileSync(
    patternLookupPath,
    JSON.stringify(patternLookup, null, 2),
    'utf8'
  );

  console.log(`✅ Added shape_length to ${addedCount} patterns`);
  if (missingCount > 0) {
    console.log(`⚠️  ${missingCount} patterns missing length data`);
  }
  console.log(`Updated ${patternLookupPath}`);
}

addShapeLengths().catch(console.error);
