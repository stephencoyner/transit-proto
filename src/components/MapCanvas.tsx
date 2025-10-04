'use client';

import { useState, useEffect } from 'react';
import Map from 'react-map-gl/mapbox';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer, TextLayer } from '@deck.gl/layers';
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

// Color palette for routes and stops based on ridership data
const RIDERSHIP_COLORS = [
  [58, 12, 72],    // 3A0C48 - Dark purple
  [121, 39, 145],  // 792791 - Purple
  [186, 42, 173],  // BA2AAD - Magenta
  [222, 64, 157],  // DE409D - Pink-magenta
  [241, 100, 121], // F16479 - Coral
  [248, 137, 116], // F88974 - Light coral
  [255, 178, 100], // FFB264 - Orange
  [251, 218, 115], // FBDA73 - Yellow
];

// Helper function to get a consistent color for a route/stop based on its ID
function getColorForId(id: string): [number, number, number] {
  // Use a simple hash function to get consistent colors
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % RIDERSHIP_COLORS.length;
  return RIDERSHIP_COLORS[index] as [number, number, number];
}

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
  const [showRoutes, setShowRoutes] = useState(true);
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);

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

  const layers = [];
  
  // Conditionally add route layer
  if (showRoutes) {
    // Base route layer
    layers.push(
      new PathLayer({
        id: 'routes',
        data: shapes,
        getPath: (d) => d.geometry.coordinates,
        getWidth: 9,
        getColor: (d) => {
          const color = getColorForId(d.properties.route_id);
          return [...color, 200]; // Add alpha for transparency
        },
        widthMinPixels: 4.5,
        widthMaxPixels: 18,
        pickable: true,
        onHover: (info) => {
          if (info.object) {
            setHoveredRoute(info.object.properties.route_id);
          } else {
            setHoveredRoute(null);
          }
        },
      })
    );

    // Hovered route layer (glowing effect)
    if (hoveredRoute) {
      const hoveredShape = shapes.find(s => s.properties.route_id === hoveredRoute);
      if (hoveredShape) {
        const routeColor = getColorForId(hoveredRoute);
        
        // Outer glow layer (very wide, very transparent)
        layers.push(
          new PathLayer({
            id: 'route-glow-outer',
            data: [hoveredShape],
            getPath: (d) => d.geometry.coordinates,
            getWidth: 20,
            getColor: [...routeColor, 40], // Very low opacity for soft glow
            widthMinPixels: 10,
            widthMaxPixels: 40,
            pickable: false,
          })
        );
        
        // Middle glow layer (medium width, medium transparency)
        layers.push(
          new PathLayer({
            id: 'route-glow-middle',
            data: [hoveredShape],
            getPath: (d) => d.geometry.coordinates,
            getWidth: 14,
            getColor: [...routeColor, 80], // Medium opacity
            widthMinPixels: 7,
            widthMaxPixels: 28,
            pickable: false,
          })
        );
        
        // Inner glow layer (closer to core, higher opacity)
        layers.push(
          new PathLayer({
            id: 'route-glow-inner',
            data: [hoveredShape],
            getPath: (d) => d.geometry.coordinates,
            getWidth: 10,
            getColor: [...routeColor, 120], // Higher opacity
            widthMinPixels: 5,
            widthMaxPixels: 20,
            pickable: false,
          })
        );
        
        // Core route layer (full opacity, slightly thicker than base)
        layers.push(
          new PathLayer({
            id: 'route-core',
            data: [hoveredShape],
            getPath: (d) => d.geometry.coordinates,
            getWidth: 8,
            getColor: [...routeColor, 255], // Full opacity
            widthMinPixels: 4,
            widthMaxPixels: 16,
            pickable: false,
          })
        );
      }
    }
    
    // Add route labels
    layers.push(
      new TextLayer({
        id: 'route-labels',
        data: shapes,
        background: true, // Enable background rendering
        getPosition: (d) => {
          // Get the middle point of the route for label placement
          const coords = d.geometry.coordinates;
          const midIndex = Math.floor(coords.length / 2);
          return coords[midIndex];
        },
        getText: (d) => d.properties.route_short_name || '?',
        getSize: 16,
        getColor: [64, 64, 64], // dark gray text (like in the image)
        getBackgroundColor: (d) => {
          const color = getColorForId(d.properties.route_id);
          return [...color, 200]; // Use route color with transparency
        },
        getBorderColor: (d) => {
          const color = getColorForId(d.properties.route_id);
          return color; // Use route color for border
        },
        getBorderWidth: 2,
        getBorderRadius: 20, // high border radius for oval shape
        getPadding: [6, 10, 6, 10], // padding around text
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        sizeScale: 1,
        sizeMinPixels: 12,
        sizeMaxPixels: 20,
      })
    );
  }
  
  // Conditionally add stops layer
  if (!showRoutes) {
    layers.push(
      new ScatterplotLayer({
        id: 'stops',
        data: stops,
        getPosition: (d) => d.geometry.coordinates,
        getRadius: 3,
        getFillColor: (d) => {
          const color = getColorForId(d.properties.stop_id);
          return [...color, 200]; // Add alpha for transparency
        },
        radiusMinPixels: 2,
        radiusMaxPixels: 6,
      })
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Toggle Controls */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.8)',
        padding: '10px',
        borderRadius: '8px',
        display: 'flex',
        gap: '10px',
        alignItems: 'center'
      }}>
        <button
          onClick={() => setShowRoutes(true)}
          style={{
            padding: '8px 16px',
            backgroundColor: showRoutes ? '#4CAF50' : '#333',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            fontFamily: 'Inter, sans-serif'
          }}
        >
          Routes
        </button>
        <button
          onClick={() => setShowRoutes(false)}
          style={{
            padding: '8px 16px',
            backgroundColor: !showRoutes ? '#4CAF50' : '#333',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            fontFamily: 'Inter, sans-serif'
          }}
        >
          Stops
        </button>
      </div>

      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        style={{ position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' }}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={`mapbox://styles/stephencoynerseattle/cmgcvmqog004r01re3a5a6l6j?v=${Date.now()}`}
          reuseMaps={false}
          style={{ position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' }}
        />
      </DeckGL>
    </div>
  );
}