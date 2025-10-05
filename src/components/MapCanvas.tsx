'use client';

import { useState, useEffect } from 'react';
import Map from 'react-map-gl/mapbox';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import { fetchShapesKCM, fetchStopsKCM } from '@/lib/data/loaders';
// Import icons from public folder
const HopthruIcon = '/icons/hopthru.svg';
const SystemIcon = '/icons/system.svg';
const RoutesIcon = '/icons/routes.svg';
const StopsIcon = '/icons/stops.svg';

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
  const [activeTab, setActiveTab] = useState<'system' | 'routes' | 'stops'>('system');
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const [hoveredStop, setHoveredStop] = useState<string | null>(null);

  // Determine what to show based on active tab
  const showRoutes = activeTab === 'system' || activeTab === 'routes';
  const showStops = activeTab === 'stops';

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
    // Base stops layers
    layers.push(
        // Colored border layer (outer ring)
        new ScatterplotLayer({
          id: 'stops-border',
          data: stops,
          getPosition: (d) => d.geometry.coordinates,
          getRadius: 12, // Outer radius (8px border + 4px white center)
          getFillColor: (d) => {
            const color = getColorForId(d.properties.stop_id);
            return [...color, 200]; // Add alpha for transparency
          },
          radiusMinPixels: 6,
          radiusMaxPixels: 24,
          pickable: true, // Enable hover detection
          onHover: ({ object }) => setHoveredStop(object ? (object as StopFeature).properties.stop_id : null),
        }),
        // White center layer (inner circle)
        new ScatterplotLayer({
          id: 'stops-center',
          data: stops,
          getPosition: (d) => d.geometry.coordinates,
          getRadius: 4, // Inner radius (white center stays same)
          getFillColor: [255, 255, 255, 255], // White center
          radiusMinPixels: 2,
          radiusMaxPixels: 8,
          pickable: true, // Enable hover detection
          onHover: ({ object }) => setHoveredStop(object ? (object as StopFeature).properties.stop_id : null),
        })
    );

    // Hovered stop layers (glowing effect)
    if (hoveredStop) {
      const hoveredStopData = stops.filter(stop => stop.properties.stop_id === hoveredStop);
      const hoveredStopColor = getColorForId(hoveredStop);

      // Outer glow layer (most transparent, largest)
      layers.push(
        new ScatterplotLayer({
          id: 'hovered-stop-outer-glow',
          data: hoveredStopData,
          getPosition: (d) => d.geometry.coordinates,
          getRadius: 20, // Much larger for glow
          getFillColor: [...hoveredStopColor, 40], // Very transparent
          radiusMinPixels: 10,
          radiusMaxPixels: 40,
          parameters: { depthTest: false }, // Render on top
        })
      );

      // Middle glow layer
      layers.push(
        new ScatterplotLayer({
          id: 'hovered-stop-middle-glow',
          data: hoveredStopData,
          getPosition: (d) => d.geometry.coordinates,
          getRadius: 16, // Medium size
          getFillColor: [...hoveredStopColor, 80], // Medium transparency
          radiusMinPixels: 8,
          radiusMaxPixels: 32,
          parameters: { depthTest: false }, // Render on top
        })
      );

      // Inner glow layer
      layers.push(
        new ScatterplotLayer({
          id: 'hovered-stop-inner-glow',
          data: hoveredStopData,
          getPosition: (d) => d.geometry.coordinates,
          getRadius: 14, // Closer to base size
          getFillColor: [...hoveredStopColor, 120], // Higher transparency
          radiusMinPixels: 7,
          radiusMaxPixels: 28,
          parameters: { depthTest: false }, // Render on top
        })
      );

      // Enhanced border for hovered stop
      layers.push(
        new ScatterplotLayer({
          id: 'hovered-stop-border',
          data: hoveredStopData,
          getPosition: (d) => d.geometry.coordinates,
          getRadius: 12, // Same as base border
          getFillColor: [...hoveredStopColor, 255], // Full opacity
          radiusMinPixels: 6,
          radiusMaxPixels: 24,
          parameters: { depthTest: false }, // Render on top
        })
      );

      // Enhanced white center for hovered stop
      layers.push(
        new ScatterplotLayer({
          id: 'hovered-stop-center',
          data: hoveredStopData,
          getPosition: (d) => d.geometry.coordinates,
          getRadius: 4, // Same as base center
          getFillColor: [255, 255, 255, 255], // White center
          radiusMinPixels: 2,
          radiusMaxPixels: 8,
          parameters: { depthTest: false }, // Render on top
        })
      );
    }
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* Left Panel */}
      <div style={{
        width: '240px',
        height: '100%',
        backgroundColor: '#FFFFFF',
        borderRight: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 1000
      }}>
        {/* Logo/Icon */}
        <div style={{
          padding: '12px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start'
        }}>
          <img 
            src={HopthruIcon} 
            alt="Hopthru" 
            style={{ 
              width: '56px', 
              height: '56px'
            }} 
          />
        </div>

              {/* Tabs */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '0px 0'
              }}>
                <button
                  onClick={() => setActiveTab('system')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    paddingLeft: activeTab === 'system' ? '16px' : '20px',
                    paddingRight: activeTab === 'system' ? '16px' : '20px',
                    backgroundColor: activeTab === 'system' ? '#e8e8e8' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: 'Inter, sans-serif',
                    color: activeTab === 'system' ? '#333' : '#000000',
                    textAlign: 'left',
                    width: activeTab === 'system' ? 'calc(100% - 8px)' : '100%',
                    borderRadius: activeTab === 'system' ? '20px' : '0',
                    margin: activeTab === 'system' ? '0 4px' : '0'
                  }}
                >
            <img 
              src={SystemIcon} 
              alt="System" 
              style={{ 
                width: '16px', 
                height: '16px',
                filter: activeTab === 'system' ? 'none' : 'opacity(1)'
              }} 
            />
            System
          </button>
                <button
                  onClick={() => setActiveTab('routes')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    paddingLeft: activeTab === 'routes' ? '16px' : '20px',
                    paddingRight: activeTab === 'routes' ? '16px' : '20px',
                    backgroundColor: activeTab === 'routes' ? '#e8e8e8' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: 'Inter, sans-serif',
                    color: activeTab === 'routes' ? '#333' : '#000000',
                    textAlign: 'left',
                    width: activeTab === 'routes' ? 'calc(100% - 8px)' : '100%',
                    borderRadius: activeTab === 'routes' ? '20px' : '0',
                    margin: activeTab === 'routes' ? '0 4px' : '0'
                  }}
                >
            <img 
              src={RoutesIcon} 
              alt="Routes" 
              style={{ 
                width: '16px', 
                height: '16px',
                filter: activeTab === 'routes' ? 'none' : 'opacity(1)'
              }} 
            />
            Routes
          </button>
                <button
                  onClick={() => setActiveTab('stops')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    paddingLeft: activeTab === 'stops' ? '16px' : '20px',
                    paddingRight: activeTab === 'stops' ? '16px' : '20px',
                    backgroundColor: activeTab === 'stops' ? '#e8e8e8' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: 'Inter, sans-serif',
                    color: activeTab === 'stops' ? '#333' : '#000000',
                    textAlign: 'left',
                    width: activeTab === 'stops' ? 'calc(100% - 8px)' : '100%',
                    borderRadius: activeTab === 'stops' ? '20px' : '0',
                    margin: activeTab === 'stops' ? '0 4px' : '0'
                  }}
                >
            <img 
              src={StopsIcon} 
              alt="Stops" 
              style={{ 
                width: '16px', 
                height: '16px',
                filter: activeTab === 'stops' ? 'none' : 'opacity(1)'
              }} 
            />
            Stops
          </button>
        </div>

        {/* Content Area */}
        <div style={{
          flex: 1,
          padding: '20px',
          overflow: 'auto'
        }}>
          {activeTab === 'system' && (
            <div>
              <h3 style={{ 
                margin: '0 0 16px 0', 
                fontSize: '16px', 
                fontFamily: 'Inter, sans-serif',
                color: '#333'
              }}>
                System Overview
              </h3>
              <p style={{ 
                margin: '0 0 16px 0', 
                fontSize: '14px', 
                color: '#666',
                fontFamily: 'Inter, sans-serif'
              }}>
                View all transit routes across the system.
              </p>
            </div>
          )}
          {activeTab === 'routes' && (
            <div>
              <h3 style={{ 
                margin: '0 0 16px 0', 
                fontSize: '16px', 
                fontFamily: 'Inter, sans-serif',
                color: '#333'
              }}>
                Route Details
              </h3>
              <p style={{ 
                margin: '0 0 16px 0', 
                fontSize: '14px', 
                color: '#666',
                fontFamily: 'Inter, sans-serif'
              }}>
                Explore individual routes and their stops.
              </p>
            </div>
          )}
          {activeTab === 'stops' && (
            <div>
              <h3 style={{ 
                margin: '0 0 16px 0', 
                fontSize: '16px', 
                fontFamily: 'Inter, sans-serif',
                color: '#333'
              }}>
                Stop Information
              </h3>
              <p style={{ 
                margin: '0 0 16px 0', 
                fontSize: '14px', 
                color: '#666',
                fontFamily: 'Inter, sans-serif'
              }}>
                View all transit stops in the system.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Map Container */}
      <div style={{ 
        flex: 1, 
        marginLeft: '240px', 
        position: 'relative', 
        width: 'calc(100% - 240px)', 
        height: '100%' 
      }}>

      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        onHover={({ object }) => {
          if (object) {
            if ('route_id' in object.properties) {
              setHoveredRoute((object as RouteFeature).properties.route_id);
              setHoveredStop(null);
            } else if ('stop_id' in object.properties) {
              setHoveredStop((object as StopFeature).properties.stop_id);
              setHoveredRoute(null);
            }
          } else {
            setHoveredRoute(null);
            setHoveredStop(null);
          }
        }}
        style={{ position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' }}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/stephencoynerseattle/cmgcvmqog004r01re3a5a6l6j"
          style={{ position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' }}
          onError={(e) => {
            console.warn('Map error:', e);
          }}
          onLoad={() => {
            console.log('Custom map style loaded successfully');
          }}
        />
      </DeckGL>
      </div>
    </div>
  );
}