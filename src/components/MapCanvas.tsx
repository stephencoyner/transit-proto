'use client';

import { useState, useEffect } from 'react';
import Map from 'react-map-gl/mapbox';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer } from '@deck.gl/layers';
import { fetchShapesKCM, fetchStopsKCM } from '@/lib/data/loaders';

// TypeScript interfaces for our GTFS data
interface RouteFeature extends GeoJSON.Feature<GeoJSON.LineString> {
  properties: {
    route_id: string;
    shape_id: string;
    route_short_name: string | null;
    route_long_name: string | null;
  };
}

interface StopFeature extends GeoJSON.Feature<GeoJSON.Point> {
  properties: {
    stop_id: string;
    name: string;
  };
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

const INITIAL_VIEW_STATE = {
  longitude: -122.335,
  latitude: 47.608,
  zoom: 10,
  pitch: 0,
  bearing: 0
};

export default function MapCanvas() {
  const [shapes, setShapes] = useState<RouteFeature[]>([]);
  const [stops, setStops] = useState<StopFeature[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const shapesFC = await fetchShapesKCM();
        const stopsFC = await fetchStopsKCM();
        setShapes(shapesFC.features as RouteFeature[]);
        setStops(stopsFC.features as StopFeature[]);
      } catch (error) {
        console.error('Failed to load GTFS data:', error);
      }
    })();
  }, []);

  const layers = [
    // Route paths
    new PathLayer({
      id: 'routes',
      data: shapes,
      getPath: (d) => d.geometry.coordinates,
      getWidth: 4,
      getColor: [255, 255, 255, 200], // white with some transparency
      widthMinPixels: 2,
      widthMaxPixels: 8,
    }),
    // Bus stops
    new ScatterplotLayer({
      id: 'stops',
      data: stops,
      getPosition: (d) => d.geometry.coordinates,
      getRadius: 3,
      getFillColor: [255, 99, 71], // tomato red
      radiusMinPixels: 2,
      radiusMaxPixels: 6,
    })
  ];

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller={true}
      layers={layers}
      style={{ position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' }}
    >
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        reuseMaps
        style={{ position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' }}
      />
    </DeckGL>
  );
}

