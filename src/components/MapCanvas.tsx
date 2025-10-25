'use client';

import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import Map from 'react-map-gl/mapbox';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import { fetchShapesKCM, fetchStopsKCM, fetchRouteStopsMap } from '@/lib/data/loaders';
import { WebMercatorViewport } from '@deck.gl/core';
import NavRail from '@/components/NavRail';

// Type for bounds
type LngLatBoundsLike = [[number, number], [number, number]];
// Import icons from public folder
const DropdownArrowIcon = '/icons/dropdown-arrow.svg';

// Import season icons from components folder
import WinterIcon from '@/components/Icons/Winter.svg';
import SpringIcon from '@/components/Icons/Spring.svg';
import SummerIcon from '@/components/Icons/Summer.svg';
import FallIcon from '@/components/Icons/Fall.svg';

// Import chevron icons
import ChevronLeftIcon from '@/components/Icons/Chevron_Left.svg';
import ChevronRightIcon from '@/components/Icons/Chevron_Right.svg';

// TypeScript interfaces for our GTFS data
interface RouteFeature extends GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString> {
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
  // Gas Works Park coordinates with offset to account for nav rail and data panel
  // Original Gas Works Park: -122.3342, 47.6456
  // Nav rail (64px) + Data panel (360px) + margins (24px) = 448px total
  // Offset longitude to the right to center in visible map area only
  longitude: -122.270,
  latitude: 47.6456,
  zoom: 12,
  pitch: 0,
  bearing: 0,
  transitionDuration: 400
};

const UI_PADDING = {
  top: 24,
  right: 24,
  bottom: 24,
  // Only account for data panel since map container already starts after nav rail
  left: 360 + 12
};
const MAX_ZOOM = 16;
const MIN_ZOOM = 8;

export default function MapCanvas() {
  const [shapes, setShapes] = useState<RouteFeature[]>([]);
  const [stops, setStops] = useState<StopFeature[]>([]);
  const [routeStopsMap, setRouteStopsMap] = useState<{ [routeId: string]: Set<string> }>({});
  const [activeTab, setActiveTab] = useState<'system' | 'routes' | 'stops'>('system');
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const [hoveredStop, setHoveredStop] = useState<string | null>(null);
  const [openFilter, setOpenFilter] = useState<'date' | 'days' | 'metric' | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState<boolean>(true);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [selectedMetric, setSelectedMetric] = useState<string>('Average daily boardings');
  
  // Refs for the filter elements and panel
  const dateRef = useRef<HTMLDivElement | null>(null);
  const daysRef = useRef<HTMLDivElement | null>(null);
  const metricRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const initialFittedViewRef = useRef<typeof INITIAL_VIEW_STATE | null>(null);
  
  // State for panel position
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  // Add hover state tracking for filters and button
  const [isDateHovered, setIsDateHovered] = useState(false);
  const [isDaysHovered, setIsDaysHovered] = useState(false);
  const [isCompareHovered, setIsCompareHovered] = useState(false);
  const [isMetricHovered, setIsMetricHovered] = useState(false);

  // Add hover state tracking for date picker elements
  const [hoveredSeason, setHoveredSeason] = useState<string | null>(null);
  const [hoveredQuickPick, setHoveredQuickPick] = useState<string | null>(null);

  // Tooltip state for date filter
  const [showDateTooltip, setShowDateTooltip] = useState(false);
  const dateTooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dateTextRef = useRef<HTMLSpanElement | null>(null);

  // Tooltip state for metric filter
  const [showMetricTooltip, setShowMetricTooltip] = useState(false);
  const metricTooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const metricTextRef = useRef<HTMLSpanElement | null>(null);

  // Tooltip state for charts
  const [chartTooltip, setChartTooltip] = useState<{
    show: boolean;
    value: string;
    label: string;
    x: number;
    y: number;
    lineX?: number;
    lineHeight?: number;
  } | null>(null);

  // Date picker state
  const [datePickerMode, setDatePickerMode] = useState<'shortcuts' | 'custom'>('shortcuts');
  const [selectedYear, setSelectedYear] = useState(2020);
  const [selectedSeason, setSelectedSeason] = useState<'winter' | 'spring' | 'summer' | 'fall' | null>('summer');
  const [selectedQuickPick, setSelectedQuickPick] = useState<string | null>(null);

  // Mock data for the data panel
  const mockDataByDay = [
    { day: 'Mon', value: 18500 },
    { day: 'Tue', value: 19200 },
    { day: 'Wed', value: 18800 },
    { day: 'Thu', value: 19500 },
    { day: 'Fri', value: 24000 },
    { day: 'Sat', value: 12000 },
    { day: 'Sun', value: 10500 }
  ];

  const mockDataByPeriod = [
    { period: 'Early AM', value: 8000 },
    { period: 'AM Peak', value: 22000 },
    { period: 'Midday', value: 14000 },
    { period: 'PM Peak', value: 24000 },
    { period: 'Evening', value: 12000 },
    { period: 'Night', value: 3000 }
  ];

  // Mock data for by date (line chart) - simplified
  const mockDataByDate = [
    14800, 13500, 15000, 18000, 19500, 20500, 20800, 21000, 20500, 20000
  ];

  // Extract unique routes from shapes data with mock values
  const routesList = React.useMemo(() => {
    const uniqueRoutes: { [key: string]: { id: string; name: string; value: number } } = {};
    shapes.forEach(shape => {
      const routeId = shape.properties.route_short_name || shape.properties.route_id;
      if (!uniqueRoutes[routeId]) {
        // Generate mock ridership value based on route ID
        const mockValue = Math.floor(Math.random() * 5000) + 100;
        uniqueRoutes[routeId] = {
          id: routeId,
          name: `Route ${routeId}`,
          value: mockValue
        };
      }
    });
    return Object.values(uniqueRoutes).sort((a, b) => b.value - a.value);
  }, [shapes]);

  // Extract stops data with mock values
  const stopsList = React.useMemo(() => {
    return stops.map(stop => ({
      id: stop.properties.stop_id,
      name: stop.properties.name,
      value: Math.floor(Math.random() * 500) + 50
    })).sort((a, b) => b.value - a.value);
  }, [stops]);

  // Filter data based on selection
  const filteredShapes = React.useMemo(() => {
    if (selectedRouteId) {
      return shapes.filter(shape => {
        const routeId = shape.properties.route_short_name || shape.properties.route_id;
        return routeId === selectedRouteId;
      });
    }
    return shapes;
  }, [shapes, selectedRouteId]);

  const filteredStops = React.useMemo(() => {
    if (selectedStopId) {
      return stops.filter(stop => stop.properties.stop_id === selectedStopId);
    }
    
    if (selectedRouteId) {
      // Try to find the route stops using the selected route ID
      // First try direct match, then try to find by looking up the actual route_id
      let routeStopIds = routeStopsMap[selectedRouteId];
      
      if (!routeStopIds) {
        // If not found, selectedRouteId might be route_short_name
        // Find the actual route_id from shapes
        const matchingShape = shapes.find(shape => 
          (shape.properties.route_short_name || shape.properties.route_id) === selectedRouteId
        );
        
        if (matchingShape) {
          routeStopIds = routeStopsMap[matchingShape.properties.route_id];
        }
      }
      
      if (routeStopIds) {
        return stops.filter(stop => routeStopIds.has(stop.properties.stop_id));
      }
    }
    
    // Only show all stops when in stops tab view
    return activeTab === 'stops' ? stops : [];
  }, [stops, selectedStopId, selectedRouteId, routeStopsMap, activeTab, shapes]);

  // Flatten LineString & MultiLineString into plain paths for PathLayer
  const pathGeoms = React.useMemo(() => {
    const out: Array<{ path: number[][]; properties: RouteFeature['properties'] }> = [];
    for (const f of filteredShapes) {
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
  }, [filteredShapes]);

  // Determine what to show based on active tab
  const showRoutes = (activeTab === 'system' || activeTab === 'routes') && !selectedStopId;
  const showStops = activeTab === 'stops' || selectedStopId || selectedRouteId;

  // Helper function to calculate bounding box from features (MultiLineString-safe)
  const calculateBounds = (features: RouteFeature[]) => {
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
    return [[minLng, minLat], [maxLng, maxLat]] as LngLatBoundsLike;
  };

  // Helper function to fit bounds using proper Mercator projection
  const fitToBounds = useCallback((bounds: LngLatBoundsLike, size: {width: number; height: number}) => {
    const { width, height } = size;
    const viewport = new WebMercatorViewport({ width, height });
    const { longitude, latitude, zoom } = viewport.fitBounds(bounds, {
      padding: UI_PADDING,
      maxZoom: MAX_ZOOM
    });
    return {
      longitude,
      latitude,
      zoom: Math.max(zoom, MIN_ZOOM),
      pitch: 0,
      bearing: 0,
      transitionDuration: 400
    };
  }, []);

  // Handlers for date filter tooltip
  const handleDateFilterMouseEnter = () => {
    setIsDateHovered(true);
    // Set timer to show tooltip after 0.5 seconds, but only if text is cut off
    dateTooltipTimerRef.current = setTimeout(() => {
      // Check if text is overflowing
      if (dateTextRef.current) {
        const isOverflowing = dateTextRef.current.scrollWidth > dateTextRef.current.clientWidth;
        if (isOverflowing) {
          setShowDateTooltip(true);
        }
      }
    }, 500);
  };

  const handleDateFilterMouseLeave = () => {
    setIsDateHovered(false);
    // Clear timer and hide tooltip instantly
    if (dateTooltipTimerRef.current) {
      clearTimeout(dateTooltipTimerRef.current);
      dateTooltipTimerRef.current = null;
    }
    setShowDateTooltip(false);
  };

  // Handlers for metric filter tooltip
  const handleMetricFilterMouseEnter = () => {
    setIsMetricHovered(true);
    // Set timer to show tooltip after 0.5 seconds, but only if text is cut off
    metricTooltipTimerRef.current = setTimeout(() => {
      // Check if text is overflowing
      if (metricTextRef.current) {
        const isOverflowing = metricTextRef.current.scrollWidth > metricTextRef.current.clientWidth;
        if (isOverflowing) {
          setShowMetricTooltip(true);
        }
      }
    }, 500);
  };

  const handleMetricFilterMouseLeave = () => {
    setIsMetricHovered(false);
    // Clear timer and hide tooltip instantly
    if (metricTooltipTimerRef.current) {
      clearTimeout(metricTooltipTimerRef.current);
      metricTooltipTimerRef.current = null;
    }
    setShowMetricTooltip(false);
  };

  // Helper function to format date as "Mon DD, YYYY" or "Mon DD" (without year)
  const formatDate = (date: Date, includeYear: boolean = true) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formatted = `${months[date.getMonth()]} ${date.getDate()}`;
    return includeYear ? `${formatted}, ${date.getFullYear()}` : formatted;
  };

  // Helper function to calculate date range for quick picks
  const getQuickPickDateRange = (quickPick: string) => {
    const today = new Date();
    let startDate: Date;
    const endDate = today;

    switch (quickPick) {
      case 'Last 7 days':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
        break;
      case 'Last 4 weeks':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 28);
        break;
      case 'Last 3 months':
        startDate = new Date(today);
        startDate.setMonth(today.getMonth() - 3);
        break;
      case 'Last 12 months':
        startDate = new Date(today);
        startDate.setMonth(today.getMonth() - 12);
        break;
      case 'Month to date':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'Quarter to date':
        const currentQuarter = Math.floor(today.getMonth() / 3);
        startDate = new Date(today.getFullYear(), currentQuarter * 3, 1);
        break;
      case 'Year to date':
        startDate = new Date(today.getFullYear(), 0, 1);
        break;
      default:
        return quickPick;
    }

    // Check if both dates are in the same year
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    
    if (sameYear) {
      return `${formatDate(startDate, false)} - ${formatDate(endDate, true)}`;
    } else {
      return `${formatDate(startDate, true)} - ${formatDate(endDate, true)}`;
    }
  };

  // Compute the display text for the date filter button
  const getDateFilterText = () => {
    if (selectedQuickPick) {
      return getQuickPickDateRange(selectedQuickPick);
    }
    if (selectedSeason) {
      const seasonLabels = {
        winter: 'Winter',
        spring: 'Spring',
        summer: 'Summer',
        fall: 'Fall'
      };
      return `${seasonLabels[selectedSeason]} Service ${selectedYear}`;
    }
    return 'Select Date Range';
  };

  // Function to update panel position based on which filter is open
  const updatePanelPosition = useCallback(() => {
    const GAP = 8; // 8px gap between filter and panel
    const trigger =
      openFilter === 'date' ? dateRef.current :
      openFilter === 'days' ? daysRef.current :
      openFilter === 'metric' ? metricRef.current :
      null;

    if (!trigger) return setPanelPos(null);

    const rect = trigger.getBoundingClientRect(); // Get viewport coordinates
    setPanelPos({
      top: rect.top,           // Align tops
      left: rect.right + GAP,  // Right edge of trigger + gap
    });
  }, [openFilter]);

  // Update position when filter opens/closes
  useLayoutEffect(() => {
    if (openFilter) {
      updatePanelPosition();
    } else {
      setPanelPos(null);
    }
  }, [openFilter, updatePanelPosition]);

  // Recompute on resize
  useEffect(() => {
    const onResize = () => {
      if (openFilter) updatePanelPosition();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [openFilter, updatePanelPosition]);

  // Outside click handler to close the panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside both the panel and the filter triggers
      if (
        openFilter &&
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        dateRef.current &&
        !dateRef.current.contains(event.target as Node) &&
        daysRef.current &&
        !daysRef.current.contains(event.target as Node) &&
        metricRef.current &&
        !metricRef.current.contains(event.target as Node)
      ) {
        setOpenFilter(null);
      }
    };

    if (openFilter) {
      // Add listener with a slight delay to avoid immediate closing
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openFilter]);

  useEffect(() => {
    (async () => {
      try {
        const shapesFC = await fetchShapesKCM();
        const stopsFC = await fetchStopsKCM();
        const routeStopsData = await fetchRouteStopsMap();
        
        const routeFeatures = shapesFC.features as RouteFeature[];
        const stopFeatures = stopsFC.features as StopFeature[];
        setShapes(routeFeatures);
        setStops(stopFeatures);
        setRouteStopsMap(routeStopsData);

        if (routeFeatures.length > 0) {
          // get container size
          const el = mapContainerRef.current;
          const width = el?.clientWidth ?? window.innerWidth;
          const height = el?.clientHeight ?? window.innerHeight;

          const bounds = calculateBounds(routeFeatures);
          if (bounds) {
            const initialView = fitToBounds(bounds, { width, height });
            initialFittedViewRef.current = initialView;     // save for later resets
            setViewState(initialView);
          }
        }
      } catch (error) {
        console.error('Failed to load GTFS data:', error);
      }
    })();
  }, [fitToBounds]);

  // Update view state when route or stop is selected
  useEffect(() => {
    if (selectedRouteId && filteredShapes.length > 0) {
      const bounds = calculateBounds(filteredShapes);
      if (bounds) {
        const el = mapContainerRef.current;
        const width = el?.clientWidth ?? window.innerWidth;
        const height = el?.clientHeight ?? window.innerHeight;
        const newViewState = fitToBounds(bounds, { width, height });
        setViewState(newViewState);
      }
    } else if (selectedStopId && filteredStops.length > 0) {
      const stop = filteredStops[0];
      const [longitude, latitude] = stop.geometry.coordinates as number[];
      setViewState({
        longitude,
        latitude,
        zoom: 16,
        pitch: 0,
        bearing: 0,
        transitionDuration: 400
      });
    } else if (!selectedRouteId && !selectedStopId) {
      // Reset to the originally fitted system view, not the hardcoded Gas Works view
      setViewState(initialFittedViewRef.current ?? INITIAL_VIEW_STATE);
    }
  }, [selectedRouteId, selectedStopId, filteredShapes, filteredStops, fitToBounds]);

  const layers = [];
  
  // Conditionally add route layer
  if (showRoutes) {
    // Base route layer
    layers.push(
      new PathLayer({
        id: 'routes',
        data: pathGeoms,
        getPath: (d) => d.path,
        getWidth: 9,
        getColor: (d) => {
          // If a route is selected (detail view), show it in black with 30% opacity
          if (selectedRouteId) {
            return [0, 0, 0, 77]; // Black at 30% opacity (255 * 0.3 = 77)
          }
          // Otherwise use the color scheme
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
      const hoveredPaths = pathGeoms.filter(p => p.properties.route_id === hoveredRoute);
      if (hoveredPaths.length) {
        const routeColor = getColorForId(hoveredRoute);
        
        // Outer glow layer (very wide, very transparent)
        layers.push(
          new PathLayer({
            id: 'route-glow-outer',
            data: hoveredPaths,
            getPath: (d) => d.path,
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
            data: hoveredPaths,
            getPath: (d) => d.path,
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
            data: hoveredPaths,
            getPath: (d) => d.path,
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
            data: hoveredPaths,
            getPath: (d) => d.path,
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
        data: filteredShapes,
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
  if (showStops) {
    // Base stops layers
    layers.push(
        // Colored border layer (outer ring)
        new ScatterplotLayer({
          id: 'stops-border',
          data: filteredStops,
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
          data: filteredStops,
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
      const hoveredStopData = filteredStops.filter(stop => stop.properties.stop_id === hoveredStop);
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
      {/* Nav Rail */}
      <div style={{
        width: '64px',
        height: '100%',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 1000
      }}>
        <NavRail
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setSelectedRouteId(null);
            setSelectedStopId(null);
          }}
          userInitial="S"
          isFiltersPanelOpen={isFiltersPanelOpen}
          onToggleFiltersPanel={() => setIsFiltersPanelOpen(!isFiltersPanelOpen)}
        />
      </div>

      {/* Left Panel - Filter Section */}
      <div
        id="filters-panel"
        style={{
          width: isFiltersPanelOpen ? '240px' : '0px',
          height: '100%',
          backgroundColor: '#FFFFFF',
          borderRight: isFiltersPanelOpen ? '1px solid #e0e0e0' : 'none',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          left: '64px',
          top: 0,
          zIndex: 1000,
          overflow: 'hidden',
          transition: 'width 300ms ease-in-out, border-right 300ms ease-in-out'
        }}>
        {/* Filter Section */}
        <div style={{
          padding: '16px 12px 24px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px' // Space between the two separate filters
        }}>
          {/* Date Range Filter */}
          <div 
            ref={dateRef}
            onClick={() => setOpenFilter(openFilter === 'date' ? null : 'date')}
            onMouseEnter={handleDateFilterMouseEnter}
            onMouseLeave={handleDateFilterMouseLeave}
            style={{
              backgroundColor: openFilter === 'date' ? '#E8E8E8' : (isDateHovered ? '#E8E8E8' : '#FFFFFF'),
              border: openFilter === 'date' ? '1.5px solid #000000' : '1px solid #D9D9D9',
              borderRadius: '20px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px',
              color: '#333',
              userSelect: 'none',
              transition: 'background-color 0.2s ease',
              boxSizing: 'border-box',
              position: 'relative'
            }}
          >
            <span 
              ref={dateTextRef}
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flexGrow: 1,
                marginRight: '8px'
              }}
            >{getDateFilterText()}</span>
            <img
              src={DropdownArrowIcon}
              alt="Dropdown"
              style={{
                width: '24px',
                height: '24px',
                transform: openFilter === 'date' ? 'rotate(-90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }}
            />
            {/* Custom Tooltip */}
            {showDateTooltip && (
              <div style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: '0',
                backgroundColor: '#333',
                color: '#FFFFFF',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'nowrap',
                zIndex: 3000,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                pointerEvents: 'none'
              }}>
                {getDateFilterText()}
              </div>
            )}
          </div>

          {/* Days of Week Filter */}
          <div 
            ref={daysRef}
            onClick={() => setOpenFilter(openFilter === 'days' ? null : 'days')}
            onMouseEnter={() => setIsDaysHovered(true)}
            onMouseLeave={() => setIsDaysHovered(false)}
            style={{
              backgroundColor: openFilter === 'days' ? '#E8E8E8' : (isDaysHovered ? '#E8E8E8' : '#FFFFFF'),
              border: openFilter === 'days' ? '1.5px solid #000000' : '1px solid #D9D9D9',
              borderRadius: '20px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px',
              color: '#333',
              userSelect: 'none',
              transition: 'background-color 0.2s ease',
              boxSizing: 'border-box'
            }}
          >
            <span>Weekdays • All Day</span>
            <img
              src={DropdownArrowIcon}
              alt="Dropdown"
              style={{
                width: '24px',
                height: '24px',
                transform: openFilter === 'days' ? 'rotate(-90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }}
            />
          </div>

          {/* Compare Button */}
          <button
            onClick={() => {
              // Add compare functionality here
              console.log('Compare clicked');
            }}
            onMouseEnter={() => setIsCompareHovered(true)}
            onMouseLeave={() => setIsCompareHovered(false)}
            style={{
              height: '28px',
              padding: '0 20px',
              backgroundColor: isCompareHovered ? '#E8E8E8' : '#FFFFFF',
              border: '1px solid #D9D9D9',
              borderRadius: '20px',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px',
              color: '#333',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'flex-start',
              whiteSpace: 'nowrap',
              transition: 'background-color 0.2s ease'
            }}
          >
            Compare
          </button>

          {/* Metric Filter */}
          <div 
            ref={metricRef}
            onClick={() => setOpenFilter(openFilter === 'metric' ? null : 'metric')}
            onMouseEnter={handleMetricFilterMouseEnter}
            onMouseLeave={handleMetricFilterMouseLeave}
            style={{
              backgroundColor: openFilter === 'metric' ? '#E8E8E8' : (isMetricHovered ? '#E8E8E8' : '#FFFFFF'),
              border: openFilter === 'metric' ? '1.5px solid #000000' : '1px solid #D9D9D9',
              borderRadius: '20px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px',
              color: '#333',
              userSelect: 'none',
              transition: 'background-color 0.2s ease',
              marginTop: '24px',
              boxSizing: 'border-box',
              position: 'relative'
            }}
          >
            <span 
              ref={metricTextRef}
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flexGrow: 1,
                marginRight: '8px'
              }}
            >{selectedMetric}</span>
            <img
              src={DropdownArrowIcon}
              alt="Dropdown"
              style={{
                width: '24px',
                height: '24px',
                transform: openFilter === 'metric' ? 'rotate(-90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }}
            />
            {/* Custom Tooltip */}
            {showMetricTooltip && (
              <div style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: '0',
                backgroundColor: '#333',
                color: '#FFFFFF',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'nowrap',
                zIndex: 3000,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                pointerEvents: 'none'
              }}>
                {selectedMetric}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Open Filter Content - Overlay with Dynamic Positioning */}
      {openFilter && panelPos && (
        <div 
          ref={panelRef}
          style={{
            position: 'fixed',
            top: `${panelPos.top}px`,
            left: `${panelPos.left}px`,
            backgroundColor: '#FFFFFF',
            border: '1px solid #D9D9D9',
            borderRadius: '16px',
            padding: '24px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            color: '#333',
            zIndex: 2000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            width: openFilter === 'date' ? '620px' : '300px',
          }}
        >
          {openFilter === 'date' ? (
            <div>
              {/* Segmented Control */}
              <div style={{
                display: 'flex',
                backgroundColor: '#E8E8E8',
                borderRadius: '24px',
                padding: '4px',
                marginBottom: '24px',
                width: 'fit-content',
                margin: '0 auto 24px auto'
              }}>
                <button
                  type="button"
                  onClick={() => setDatePickerMode('shortcuts')}
                  style={{
                    padding: '8px 32px',
                    backgroundColor: datePickerMode === 'shortcuts' ? '#FFFFFF' : 'transparent',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '14px',
                    fontWeight: datePickerMode === 'shortcuts' ? '500' : '400',
                    color: '#333',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Shortcuts
                </button>
                <button
                  type="button"
                  onClick={() => setDatePickerMode('custom')}
                  style={{
                    padding: '8px 32px',
                    backgroundColor: datePickerMode === 'custom' ? '#FFFFFF' : 'transparent',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '14px',
                    fontWeight: datePickerMode === 'custom' ? '500' : '400',
                    color: '#333',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Custom
                </button>
              </div>

              {datePickerMode === 'shortcuts' ? (
                <>
                  {/* Year Selector */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px',
                    marginBottom: '24px'
                  }}>
                    <button
                      type="button"
                      onClick={() => setSelectedYear(selectedYear - 1)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: '1px solid #D9D9D9',
                        backgroundColor: '#FFFFFF',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0
                      }}
                    >
                      <img 
                        src={ChevronLeftIcon.src} 
                        alt="Previous year"
                        style={{ 
                          width: '24px', 
                          height: '24px',
                          filter: 'brightness(0)'
                        }} 
                      />
                    </button>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#333',
                      minWidth: '120px',
                      textAlign: 'center'
                    }}>
                      {selectedYear} Service
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedYear < 2025) {
                          setSelectedYear(selectedYear + 1);
                        }
                      }}
                      disabled={selectedYear >= 2025}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: selectedYear >= 2025 ? '1px solid #E8E8E8' : '1px solid #D9D9D9',
                        backgroundColor: selectedYear >= 2025 ? '#F5F5F5' : '#FFFFFF',
                        cursor: selectedYear >= 2025 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        opacity: selectedYear >= 2025 ? 0.5 : 1
                      }}
                    >
                      <img 
                        src={ChevronRightIcon.src} 
                        alt="Next year"
                        style={{ 
                          width: '24px', 
                          height: '24px',
                          filter: selectedYear >= 2025 ? 'none' : 'brightness(0)'
                        }} 
                      />
                    </button>
                  </div>

                  {/* Season Cards */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '12px',
                    marginBottom: '32px'
                  }}>
                    {[
                      { key: 'winter', label: 'Winter', icon: WinterIcon, dates: 'Sep 21, 2019 - Mar 20' },
                      { key: 'spring', label: 'Spring', icon: SpringIcon, dates: 'Mar 21 - Jun 21' },
                      { key: 'summer', label: 'Summer', icon: SummerIcon, dates: 'Jun 22 - Sep 18' },
                      { key: 'fall', label: 'Fall', icon: FallIcon, dates: 'Sep 19 - Mar 19, 2021' },
                    ].map((season) => (
                      <button
                        key={season.key}
                        type="button"
                        onClick={() => {
                          setSelectedSeason(season.key as 'winter' | 'spring' | 'summer' | 'fall');
                          setSelectedQuickPick(null);
                        }}
                        onMouseEnter={() => setHoveredSeason(season.key)}
                        onMouseLeave={() => setHoveredSeason(null)}
                        style={{
                          padding: '20px 12px',
                          backgroundColor: selectedSeason === season.key ? '#E8E8E8' : (hoveredSeason === season.key ? '#E8E8E8' : '#FFFFFF'),
                          border: selectedSeason === season.key ? '1px solid #333' : '1px solid #D9D9D9',
                          borderRadius: '20px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <img 
                          src={season.icon.src} 
                          alt={season.label}
                          style={{ 
                            width: '48px', 
                            height: '48px',
                            marginBottom: '4px'
                          }} 
                        />
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '400',
                          color: '#333',
                          fontFamily: 'Inter, sans-serif'
                        }}>
                          {season.label} {selectedYear}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#666',
                          fontFamily: 'Inter, sans-serif',
                          textAlign: 'center',
                          lineHeight: '1.3'
                        }}>
                          {season.dates}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Quick Picks */}
                  <div>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#333',
                      marginBottom: '16px',
                      textAlign: 'center'
                    }}>
                      Quick picks
                    </div>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {['Last 7 days', 'Last 4 weeks', 'Last 3 months', 'Last 12 months'].map((pick) => (
                          <button
                            key={pick}
                            type="button"
                            onClick={() => {
                              setSelectedQuickPick(pick);
                              setSelectedSeason(null);
                            }}
                            onMouseEnter={() => setHoveredQuickPick(pick)}
                            onMouseLeave={() => setHoveredQuickPick(null)}
                            style={{
                              padding: '10px 20px',
                              backgroundColor: selectedQuickPick === pick ? '#E8E8E8' : (hoveredQuickPick === pick ? '#E8E8E8' : '#FFFFFF'),
                              border: selectedQuickPick === pick ? '1.5px solid #000000' : '1px solid #D9D9D9',
                              borderRadius: '20px',
                              cursor: 'pointer',
                              fontFamily: 'Inter, sans-serif',
                              fontSize: '14px',
                              color: '#333',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {pick}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {['Month to date', 'Quarter to date', 'Year to date'].map((pick) => (
                          <button
                            key={pick}
                            type="button"
                            onClick={() => {
                              setSelectedQuickPick(pick);
                              setSelectedSeason(null);
                            }}
                            onMouseEnter={() => setHoveredQuickPick(pick)}
                            onMouseLeave={() => setHoveredQuickPick(null)}
                            style={{
                              padding: '10px 20px',
                              backgroundColor: selectedQuickPick === pick ? '#E8E8E8' : (hoveredQuickPick === pick ? '#E8E8E8' : '#FFFFFF'),
                              border: selectedQuickPick === pick ? '1.5px solid #000000' : '1px solid #D9D9D9',
                              borderRadius: '20px',
                              cursor: 'pointer',
                              fontFamily: 'Inter, sans-serif',
                              fontSize: '14px',
                              color: '#333',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {pick}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#666'
                }}>
                  Custom date picker coming soon...
                </div>
              )}
            </div>
          ) : openFilter === 'days' ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              Days Filter Open
            </div>
          ) : openFilter === 'metric' ? (
            <div style={{ 
              padding: '0',
              fontFamily: 'Inter, sans-serif',
              minWidth: '280px'
            }}>
              {[
                'Average daily boardings',
                'Total boardings',
                'Average daily alightings',
                'Total daily boardings',
                'Average daily activity',
                'Total activity',
                'Average load',
                'Maxload'
              ].map((metric, index, array) => (
                <div
                  key={metric}
                  onClick={() => {
                    setSelectedMetric(metric);
                    setOpenFilter(null);
                  }}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'background-color 0.2s ease',
                    borderRadius: '8px',
                    margin: index === 0 ? '12px 12px 4px 12px' : (index === array.length - 1 ? '4px 12px 12px 12px' : '4px 12px'),
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#F5F5F5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {selectedMetric === metric && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                  <span style={{ marginLeft: selectedMetric === metric ? '0' : '32px' }}>
                    {metric}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Map Container */}
      <div
        ref={mapContainerRef}
        style={{
          flex: 1,
          marginLeft: isFiltersPanelOpen ? '304px' : '64px',
          position: 'relative',
          width: isFiltersPanelOpen ? 'calc(100% - 304px)' : 'calc(100% - 64px)',
          height: '100%',
          transition: 'margin-left 300ms ease-in-out, width 300ms ease-in-out'
        }}>

      <DeckGL
        viewState={viewState}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onViewStateChange={(params: any) => setViewState(params.viewState)}
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

      {/* Data Panel */}
      <div style={{
        position: 'fixed',
        top: '12px',
        bottom: '12px',
        left: isFiltersPanelOpen ? 'calc(304px + 12px)' : 'calc(64px + 12px)',
        width: '360px',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        padding: '24px',
        fontFamily: 'Inter, sans-serif',
        zIndex: 1000,
        overflowY: 'auto',
        transition: 'left 300ms ease-in-out'
      }}>
        {selectedRouteId || selectedStopId ? (
          /* Detail View for Selected Route/Stop */
          <>
            {/* Back Button and Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '24px',
              cursor: 'pointer'
            }}
            onClick={() => {
              setSelectedRouteId(null);
              setSelectedStopId(null);
            }}>
              <div style={{
                fontSize: '24px',
                color: '#333'
              }}>←</div>
              <div style={{
                fontSize: '28px',
                fontWeight: '400',
                color: '#333'
              }}>
                {selectedRouteId ? `Route ${selectedRouteId}` : (stopsList.find((s) => s.id === selectedStopId)?.name || 'Stop')}
              </div>
            </div>

            {/* Summary/Trips/Grid Tabs */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '24px'
            }}>
              {['Summary', 'Trips', 'Grid'].map(tab => (
                <button key={tab} style={{
                  padding: '8px 16px',
                  backgroundColor: tab === 'Summary' ? '#333' : '#FFFFFF',
                  color: tab === 'Summary' ? '#FFFFFF' : '#333',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '14px'
                }}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Value */}
            <div style={{
              marginBottom: '24px'
            }}>
              <div style={{
                fontSize: '16px',
                color: '#666',
                marginBottom: '8px'
              }}>
                Average daily boardings
              </div>
              <div style={{
                fontSize: '28px',
                fontWeight: '400',
                color: '#333',
                lineHeight: '1'
              }}>
                {selectedRouteId 
                  ? (routesList.find((r) => r.id === selectedRouteId)?.value || 0).toLocaleString()
                  : (stopsList.find((s) => s.id === selectedStopId)?.value || 0).toLocaleString()
                }
              </div>
            </div>

        {/* By Date Chart */}
        <div style={{
          marginBottom: '32px',
          paddingBottom: '32px',
          borderBottom: '1px solid #E0E0E0'
        }}>
          <div style={{
            fontSize: '16px',
            fontWeight: '400',
            color: '#333',
            marginBottom: '16px'
          }}>
            By date
          </div>
          <div style={{
            position: 'relative',
            height: '120px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            {/* Y-axis labels */}
            <div style={{
              position: 'absolute',
              left: '0',
              top: '0',
              bottom: '0',
              width: '40px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#999',
              textAlign: 'right',
              paddingRight: '12px'
            }}>
              <div>5K</div>
              <div>4K</div>
              <div>3K</div>
              <div>2K</div>
              <div>1K</div>
            </div>
            {/* Chart area */}
            <svg 
              width="280" 
              height="120" 
              style={{ marginLeft: '40px', cursor: 'crosshair' }}
              onMouseMove={(e) => {
                const svg = e.currentTarget;
                const rect = svg.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                // Find the closest data point
                const pointIndex = Math.round((x / 280) * (mockDataByDate.length - 1));
                const clampedIndex = Math.max(0, Math.min(mockDataByDate.length - 1, pointIndex));
                const value = mockDataByDate[clampedIndex];
                const scaledValue = value * (selectedRouteId ? 0.5 : 0.05);
                const lineX = (clampedIndex / (mockDataByDate.length - 1)) * 280;
                
                setChartTooltip({
                  show: true,
                  value: Math.round(scaledValue).toLocaleString(),
                  label: `Day ${clampedIndex + 1}`,
                  x: rect.left + lineX,
                  y: rect.top,
                  lineX: lineX,
                  lineHeight: 120
                });
              }}
              onMouseLeave={() => {
                setChartTooltip(null);
              }}
            >
              {/* Grid lines */}
              {[0, 1, 2, 3, 4].map((i) => (
                <line
                  key={i}
                  x1="0"
                  y1={i * 30}
                  x2="280"
                  y2={i * 30}
                  stroke="#F0F0F0"
                  strokeWidth="1"
                />
              ))}
              {/* Line chart - scaled to route/stop */}
              <polyline
                points={mockDataByDate.map((value, i) => {
                  const x = (i / (mockDataByDate.length - 1)) * 280;
                  const scaledValue = value * (selectedRouteId ? 0.5 : 0.05);
                  const y = 120 - ((scaledValue - 500) / 4500) * 120;
                  return `${x},${Math.max(0, Math.min(120, y))}`;
                }).join(' ')}
                fill="none"
                stroke="#333"
                strokeWidth="2"
                pointerEvents="none"
              />
              {/* Vertical hover line */}
              {chartTooltip && chartTooltip.lineX !== undefined && chartTooltip.lineHeight === 120 && (
                <line
                  x1={chartTooltip.lineX}
                  y1="0"
                  x2={chartTooltip.lineX}
                  y2="120"
                  stroke="#000"
                  strokeWidth="1"
                  pointerEvents="none"
                />
              )}
            </svg>
          </div>
        </div>

        {/* By Day Chart */}
        <div style={{
          marginBottom: '32px',
          paddingBottom: '32px',
          borderBottom: '1px solid #E0E0E0'
        }}>
          <div style={{
            fontSize: '16px',
            fontWeight: '400',
            color: '#333',
            marginBottom: '16px'
          }}>
            By day
          </div>
          <div style={{
            position: 'relative',
            height: '160px'
          }}>
            {/* Y-axis labels */}
            <div style={{
              position: 'absolute',
              left: '0',
              top: '0',
              bottom: '30px',
              width: '40px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#999',
              textAlign: 'right',
              paddingRight: '12px'
            }}>
              <div>5K</div>
              <div>4K</div>
              <div>3K</div>
              <div>2K</div>
              <div>1K</div>
            </div>
            {/* Chart area */}
            <div style={{
              marginLeft: '40px',
              height: '130px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '12px',
              borderBottom: '1px solid #E0E0E0',
              position: 'relative'
            }}>
              {mockDataByDay.map((item) => {
                const scaledValue = item.value * (selectedRouteId ? 0.2 : 0.02);
                const heightPx = (scaledValue / 5000) * 130;
                return (
                  <div key={item.day} style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '130px',
                    justifyContent: 'flex-end'
                  }}>
                    <div 
                      style={{
                        width: '100%',
                        height: `${heightPx}px`,
                        backgroundColor: '#333',
                        borderRadius: '4px 4px 0 0',
                        cursor: 'pointer',
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setChartTooltip({
                          show: true,
                          value: Math.round(scaledValue).toLocaleString(),
                          label: item.day,
                          x: rect.left + rect.width / 2,
                          y: rect.top
                        });
                      }}
                      onMouseLeave={() => {
                        setChartTooltip(null);
                      }}
                    />
                  </div>
                );
              })}
            </div>
            {/* X-axis labels */}
            <div style={{
              marginLeft: '40px',
              marginTop: '8px',
              display: 'flex',
              gap: '12px'
            }}>
              {mockDataByDay.map((item) => (
                <div key={item.day} style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: '12px',
                  color: '#999'
                }}>
                  {item.day}
                </div>
              ))}
            </div>
          </div>
        </div>
          </>
        ) : activeTab === 'system' ? (
          /* System View - Aggregated Charts */
          <>
            {/* Header */}
            <div style={{
              marginBottom: '24px'
            }}>
              <div style={{
                fontSize: '16px',
                color: '#666',
                marginBottom: '8px'
              }}>
                Average daily boardings
              </div>
              <div style={{
                fontSize: '28px',
                fontWeight: '400',
                color: '#333',
                lineHeight: '1'
              }}>
                8,973
              </div>
            </div>

        {/* By Date Chart */}
        <div style={{
          marginBottom: '32px',
          paddingBottom: '32px',
          borderBottom: '1px solid #E0E0E0'
        }}>
          <div style={{
            fontSize: '16px',
            fontWeight: '400',
            color: '#333',
            marginBottom: '16px'
          }}>
            By Date
          </div>
          <div style={{
            position: 'relative',
            height: '120px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            {/* Y-axis labels */}
            <div style={{
              position: 'absolute',
              left: '0',
              top: '0',
              bottom: '0',
              width: '40px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#999',
              textAlign: 'right',
              paddingRight: '12px'
            }}>
              <div>25K</div>
              <div>20K</div>
              <div>15K</div>
              <div>10K</div>
              <div>5K</div>
            </div>
            {/* Chart area */}
            <svg 
              width="280" 
              height="120" 
              style={{ marginLeft: '40px', cursor: 'crosshair' }}
              onMouseMove={(e) => {
                const svg = e.currentTarget;
                const rect = svg.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                // Find the closest data point
                const pointIndex = Math.round((x / 280) * (mockDataByDate.length - 1));
                const clampedIndex = Math.max(0, Math.min(mockDataByDate.length - 1, pointIndex));
                const value = mockDataByDate[clampedIndex];
                const lineX = (clampedIndex / (mockDataByDate.length - 1)) * 280;
                
                setChartTooltip({
                  show: true,
                  value: value.toLocaleString(),
                  label: `Day ${clampedIndex + 1}`,
                  x: rect.left + lineX,
                  y: rect.top,
                  lineX: lineX,
                  lineHeight: 120
                });
              }}
              onMouseLeave={() => {
                setChartTooltip(null);
              }}
            >
              {/* Grid lines */}
              {[0, 1, 2, 3, 4].map((i) => (
                <line
                  key={i}
                  x1="0"
                  y1={i * 30}
                  x2="280"
                  y2={i * 30}
                  stroke="#F0F0F0"
                  strokeWidth="1"
                />
              ))}
              {/* Line chart */}
              <polyline
                points={mockDataByDate.map((value, i) => {
                  const x = (i / (mockDataByDate.length - 1)) * 280;
                  const y = 120 - ((value - 10000) / 15000) * 120;
                  return `${x},${y}`;
                }).join(' ')}
                fill="none"
                stroke="#333"
                strokeWidth="2"
                pointerEvents="none"
              />
              {/* Vertical hover line */}
              {chartTooltip && chartTooltip.lineX !== undefined && chartTooltip.lineHeight === 120 && (
                <line
                  x1={chartTooltip.lineX}
                  y1="0"
                  x2={chartTooltip.lineX}
                  y2="120"
                  stroke="#000"
                  strokeWidth="1"
                  pointerEvents="none"
                />
              )}
            </svg>
          </div>
        </div>

        {/* By Day Chart */}
        <div style={{
          marginBottom: '32px',
          paddingBottom: '32px',
          borderBottom: '1px solid #E0E0E0'
        }}>
          <div style={{
            fontSize: '16px',
            fontWeight: '400',
            color: '#333',
            marginBottom: '16px'
          }}>
            By Day
          </div>
          <div style={{
            position: 'relative',
            height: '160px'
          }}>
            {/* Y-axis labels */}
            <div style={{
              position: 'absolute',
              left: '0',
              top: '0',
              bottom: '30px',
              width: '40px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#999',
              textAlign: 'right',
              paddingRight: '12px'
            }}>
              <div>25K</div>
              <div>20K</div>
              <div>15K</div>
              <div>10K</div>
              <div>5K</div>
            </div>
            {/* Chart area */}
            <div style={{
              marginLeft: '40px',
              height: '130px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '12px',
              borderBottom: '1px solid #E0E0E0',
              position: 'relative'
            }}>
              {mockDataByDay.map((item) => {
                const heightPx = (item.value / 25000) * 130;
                return (
                  <div key={item.day} style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '130px',
                    justifyContent: 'flex-end'
                  }}>
                    <div 
                      style={{
                        width: '100%',
                        height: `${heightPx}px`,
                        backgroundColor: '#333',
                        borderRadius: '4px 4px 0 0',
                        cursor: 'pointer',
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setChartTooltip({
                          show: true,
                          value: item.value.toLocaleString(),
                          label: item.day,
                          x: rect.left + rect.width / 2,
                          y: rect.top
                        });
                      }}
                      onMouseLeave={() => {
                        setChartTooltip(null);
                      }}
                    />
                  </div>
                );
              })}
            </div>
            {/* X-axis labels */}
            <div style={{
              marginLeft: '40px',
              marginTop: '8px',
              display: 'flex',
              gap: '12px'
            }}>
              {mockDataByDay.map((item) => (
                <div key={item.day} style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: '12px',
                  color: '#999'
                }}>
                  {item.day}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* By Period Chart */}
        <div>
          <div style={{
            fontSize: '16px',
            fontWeight: '400',
            color: '#333',
            marginBottom: '16px'
          }}>
            By Period
          </div>
          <div style={{
            position: 'relative',
            height: '200px'
          }}>
            {/* Y-axis labels */}
            <div style={{
              position: 'absolute',
              left: '0',
              top: '0',
              bottom: '50px',
              width: '40px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#999',
              textAlign: 'right',
              paddingRight: '12px'
            }}>
              <div>25K</div>
              <div>20K</div>
              <div>15K</div>
              <div>10K</div>
              <div>5K</div>
            </div>
            {/* Chart area */}
            <div style={{
              marginLeft: '40px',
              height: '150px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '12px',
              borderBottom: '1px solid #E0E0E0',
              position: 'relative'
            }}>
              {mockDataByPeriod.map((item) => {
                const heightPx = (item.value / 25000) * 150;
                return (
                  <div key={item.period} style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '150px',
                    justifyContent: 'flex-end'
                  }}>
                    <div 
                      style={{
                        width: '100%',
                        height: `${heightPx}px`,
                        backgroundColor: '#333',
                        borderRadius: '4px 4px 0 0',
                        cursor: 'pointer',
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setChartTooltip({
                          show: true,
                          value: item.value.toLocaleString(),
                          label: item.period,
                          x: rect.left + rect.width / 2,
                          y: rect.top
                        });
                      }}
                      onMouseLeave={() => {
                        setChartTooltip(null);
                      }}
                    />
                  </div>
                );
              })}
            </div>
            {/* X-axis labels */}
            <div style={{
              marginLeft: '40px',
              marginTop: '8px',
              display: 'flex',
              gap: '12px'
            }}>
              {mockDataByPeriod.map((item) => (
                <div key={item.period} style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: '11px',
                  color: '#999',
                  transform: 'rotate(-45deg)',
                  transformOrigin: 'center',
                  marginTop: '20px'
                }}>
                  {item.period}
                </div>
              ))}
            </div>
          </div>
        </div>
          </>
        ) : (
          /* Routes/Stops View - List */
          <>
            {/* Sort and Filter Buttons */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '24px'
            }}>
              <button style={{
                padding: '8px 20px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #D9D9D9',
                borderRadius: '20px',
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
                color: '#333',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                Sort ▼
              </button>
              <button style={{
                padding: '8px 20px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #D9D9D9',
                borderRadius: '20px',
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
                color: '#333',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                + Filter
              </button>
            </div>

            {/* List Items */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0'
            }}>
              {(activeTab === 'routes' ? routesList : stopsList).map((item, index: number) => (
                <div 
                  key={index} 
                  onClick={() => {
                    if (activeTab === 'routes') {
                      setSelectedRouteId(item.id);
                    } else {
                      setSelectedStopId(item.id);
                    }
                  }}
                  style={{
                    padding: '16px 0',
                    borderBottom: '1px solid #F0F0F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    cursor: 'pointer'
                  }}>
                  <div style={{
                    fontSize: '14px',
                    color: '#666',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    {item.name}
                  </div>
                  <div style={{
                    fontSize: '28px',
                    fontWeight: '400',
                    color: '#333',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    {item.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      </div>

      {/* Chart Tooltip */}
      {chartTooltip && chartTooltip.show && (
        <div style={{
          position: 'fixed',
          left: `${chartTooltip.x}px`,
          top: `${chartTooltip.y - 8}px`,
          transform: 'translate(-50%, -100%)',
          backgroundColor: '#333',
          color: '#FFFFFF',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '13px',
          whiteSpace: 'nowrap',
          zIndex: 10000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          pointerEvents: 'none'
        }}>
          <div style={{ fontWeight: '500', marginBottom: '2px' }}>{chartTooltip.label}</div>
          <div style={{ fontSize: '14px' }}>{chartTooltip.value}</div>
        </div>
      )}
    </div>
  );
}
