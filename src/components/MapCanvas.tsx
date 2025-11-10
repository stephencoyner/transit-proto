'use client';

import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import Map from 'react-map-gl/mapbox';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import { fetchShapesKCM, fetchStopsKCM, fetchRouteStopsMap, fetchPatternLookup, fetchRoutePatterns, PatternInfo, RoutePatternInfo, TripsByPattern, Trip, fetchRouteTrips, organizeTripsbyPattern } from '@/lib/data/loaders';
import { WebMercatorViewport } from '@deck.gl/core';
import NavRail from '@/components/NavRail';
import { Button, Card, Input, Select, StatefulButton } from '@/components/ui';
import { MetricCard, ByDateChart, ByDayChart, ByPeriodChart } from '@/components/charts';

// Type for bounds
type LngLatBoundsLike = [[number, number], [number, number]];

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

// Color palette for routes and stops using design system tokens
const RIDERSHIP_COLORS = [
  [237, 126, 34],  // #ED7E22 - map-1
  [232, 92, 70],   // #E85C46 - map-2
  [220, 44, 126],  // #DC2C7E - map-3
  [199, 127, 143], // #C77F8F - map-4
  [160, 16, 132],  // #A01084 - map-5
  [127, 26, 163],  // #7F1AA3 - map-6
  [92, 18, 118],   // #5C1276 - map-7
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
  transitionDuration: 200
};

// Calculate UI padding dynamically based on visible panels
const getUIPadding = (isFiltersPanelOpen: boolean) => {
  // NavRail: 64px, Filters panel: 240px (when open), Data panel: 360px
  // Margins: 12px between panels, 12px from screen edges
  const navRailWidth = 64;
  const filtersPanelWidth = isFiltersPanelOpen ? 240 : 0;
  const dataPanelWidth = 360;
  const leftMargin = 12; // margin from screen edge
  const gapBetweenPanels = 12;

  // Extra breathing room for better visibility
  const breathingRoom = 80;

  // Total left panel width (from left screen edge to right edge of data panel)
  const totalLeftPanelWidth = leftMargin + navRailWidth + filtersPanelWidth + dataPanelWidth + (gapBetweenPanels * 2);

  return {
    top: 24 + breathingRoom,
    right: 24 + breathingRoom,
    bottom: 24 + breathingRoom,
    // Center in the space between data panel right edge and screen right edge
    left: totalLeftPanelWidth + breathingRoom
  };
};

const MAX_ZOOM = 16;
const MIN_ZOOM = 8;

// Helper function to format time from HH:MM:SS to 12-hour format
function formatTime12Hour(time24: string): string {
  const [hourStr, minuteStr] = time24.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = minuteStr;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minute} ${ampm}`;
}

export default function MapCanvas() {
  const [shapes, setShapes] = useState<RouteFeature[]>([]);
  const [stops, setStops] = useState<StopFeature[]>([]);
  const [routeStopsMap, setRouteStopsMap] = useState<{ [routeId: string]: Set<string> }>({});
  const [activeTab, setActiveTab] = useState<'system' | 'routes' | 'stops' | 'components'>('system');
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const [hoveredStop, setHoveredStop] = useState<string | null>(null);
  const [openFilter, setOpenFilter] = useState<'date' | 'days' | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [selectedRouteTab, setSelectedRouteTab] = useState<'Summary' | 'Trips' | 'Grid'>('Summary');
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState<boolean>(true);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [selectedMetric, setSelectedMetric] = useState<string>('Average daily boardings');

  // Sorting state for routes/stops list (disabled for now)
  // const [sortBy, setSortBy] = useState<'route' | 'metric'>('route');
  // const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pattern filtering state
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null); // headsign
  const [patternLookup, setPatternLookup] = useState<{ [shapeId: string]: PatternInfo }>({});
  const [routePatterns, setRoutePatterns] = useState<{ [routeId: string]: RoutePatternInfo }>({});

  // Trip data state
  const [allTripsData, setAllTripsData] = useState<{ [routeId: string]: Trip[] }>({});
  const [routeTrips, setRouteTrips] = useState<TripsByPattern[]>([]);
  
  // Refs for the filter elements and panel
  const dateRef = useRef<HTMLDivElement | null>(null);
  const daysRef = useRef<HTMLDivElement | null>(null);
  // const metricRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const initialFittedViewRef = useRef<typeof INITIAL_VIEW_STATE | null>(null);
  
  // State for panel position
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  // Add hover state tracking for filters and button
  const [isDateHovered, setIsDateHovered] = useState(false);
  const [isDaysHovered, setIsDaysHovered] = useState(false);
  const [isCompareHovered, setIsCompareHovered] = useState(false);

  // Add hover state tracking for date picker elements
  const [hoveredSeason, setHoveredSeason] = useState<string | null>(null);

  // Tooltip state for date filter
  const [showDateTooltip, setShowDateTooltip] = useState(false);
  const dateTooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dateTextRef = useRef<HTMLSpanElement | null>(null);

  // Tooltip state for metric filter
  const [showMetricTooltip, setShowMetricTooltip] = useState(false);
  const metricTooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const metricTextRef = useRef<HTMLSpanElement | null>(null);

  // Tooltip state for days filter
  const [showDaysTooltip, setShowDaysTooltip] = useState(false);
  const daysTooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const daysTextRef = useRef<HTMLSpanElement | null>(null);

  // Suppress unused variable warnings for future use
  void isCompareHovered;
  void setIsCompareHovered;
  void isMetricHovered;
  void showDateTooltip;
  void showMetricTooltip;
  void setShowMetricTooltip;
  void metricTooltipTimerRef;
  void metricTextRef;

  // Tooltip state for charts
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [chartTooltip, setChartTooltip] = useState<{
    show: boolean;
    value: string;
    label: string;
    x: number;
    y: number;
    lineX?: number;
    lineHeight?: number;
  } | null>(null);

  // State to track which trip is being hovered (format: "groupIndex-tripIndex")
  const [hoveredTrip, setHoveredTrip] = useState<string | null>(null);

  // Ref for trips scroll container
  const tripsScrollRef = useRef<HTMLDivElement>(null);

  // Date picker state - Applied state (what's actually being used)
  const [appliedSeason, setAppliedSeason] = useState<{ season: 'winter' | 'spring' | 'summer' | 'fall'; year: number } | null>({ season: 'fall', year: 2025 });
  const [appliedQuickPick, setAppliedQuickPick] = useState<string | null>(null);
  const [appliedStartDate, setAppliedStartDate] = useState<Date | null>(null);
  const [appliedEndDate, setAppliedEndDate] = useState<Date | null>(null);

  // Staged state (temporary changes in the picker)
  const [datePickerMode, setDatePickerMode] = useState<'shortcuts' | 'custom'>('shortcuts');
  const [selectedYear, setSelectedYear] = useState(2025);
  const [stagedSeason, setStagedSeason] = useState<{ season: 'winter' | 'spring' | 'summer' | 'fall'; year: number } | null>({ season: 'fall', year: 2025 });
  const [stagedQuickPick, setStagedQuickPick] = useState<string | null>(null);
  const [calendarStartMonth, setCalendarStartMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth());
  });
  const [stagedStartDate, setStagedStartDate] = useState<Date | null>(null);
  const [stagedEndDate, setStagedEndDate] = useState<Date | null>(null);

  // Original state when picker was opened (for Reset)
  const [originalSeason, setOriginalSeason] = useState<{ season: 'winter' | 'spring' | 'summer' | 'fall'; year: number } | null>(null);
  const [originalQuickPick, setOriginalQuickPick] = useState<string | null>(null);
  const [originalStartDate, setOriginalStartDate] = useState<Date | null>(null);
  const [originalEndDate, setOriginalEndDate] = useState<Date | null>(null);

  // Day/Time period picker state - Applied state (what's actually being used)
  const [appliedDaysMode, setAppliedDaysMode] = useState<'all' | 'weekdays' | 'weekends' | 'custom'>('weekdays');
  const [appliedCustomDays, setAppliedCustomDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [appliedTimeMode, setAppliedTimeMode] = useState<'all' | 'custom'>('all');
  const [appliedTimePeriods, setAppliedTimePeriods] = useState<string[]>([]);

  // Staged state (temporary changes in the picker)
  const [stagedDaysMode, setStagedDaysMode] = useState<'all' | 'weekdays' | 'weekends' | 'custom'>('weekdays');
  const [stagedCustomDays, setStagedCustomDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [stagedTimeMode, setStagedTimeMode] = useState<'all' | 'custom'>('all');
  const [stagedTimePeriods, setStagedTimePeriods] = useState<string[]>([]);

  // Original state when picker was opened (for Reset)
  const [originalDaysMode, setOriginalDaysMode] = useState<'all' | 'weekdays' | 'weekends' | 'custom'>('weekdays');
  const [originalCustomDays, setOriginalCustomDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [originalTimeMode, setOriginalTimeMode] = useState<'all' | 'custom'>('all');
  const [originalTimePeriods, setOriginalTimePeriods] = useState<string[]>([]);

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

  // Transform mock data for Recharts
  const chartDataByDate = mockDataByDate.map((value, index) => ({
    date: `Day ${index + 1}`,
    value: value
  }));

  // Calculate average for By Day chart
  const averageDailyByDay = mockDataByDay.reduce((sum, item) => sum + item.value, 0) / mockDataByDay.length;

  // Color palette for pie chart - using brown/beige design tokens
  const PERIOD_COLORS = [
    'var(--text-primary)',    // Darkest brown (#1A1410)
    'var(--text-secondary)',  // Dark brown (#3D2817)
    'var(--text-tertiary)',   // Medium brown (#5C4939)
    'var(--border-focus)',    // Light brown (#C9B4A3)
    'var(--border-hover)',    // Lighter beige (#D4C9BA)
    'var(--border-default)'   // Lightest beige (#D8CCBD)
  ];

  // State for pie chart active segment
  const [activePieIndex, setActivePieIndex] = useState<number | null>(null);

  // State to persist mock ridership values
  const [routeMockValues, setRouteMockValues] = React.useState<{ [key: string]: number }>({});
  const [stopMockValues, setStopMockValues] = React.useState<{ [key: string]: number }>({});

  // Extract unique routes from shapes data with mock values
  const routesList = React.useMemo(() => {
    const uniqueRoutes: { [key: string]: { id: string; name: string; value: number } } = {};
    const newMockValues: { [key: string]: number } = { ...routeMockValues };

    shapes.forEach(shape => {
      const routeId = shape.properties.route_id; // Use actual route_id, not short_name
      const routeShortName = shape.properties.route_short_name || routeId;
      if (!uniqueRoutes[routeId]) {
        // Use existing mock value or generate new one only if it doesn't exist
        if (!newMockValues[routeId]) {
          newMockValues[routeId] = Math.floor(Math.random() * 5000) + 100;
        }
        uniqueRoutes[routeId] = {
          id: routeId,
          name: `Route ${routeShortName}`,
          value: newMockValues[routeId]
        };
      }
    });

    // Update state if new values were generated
    if (Object.keys(newMockValues).length !== Object.keys(routeMockValues).length) {
      setRouteMockValues(newMockValues);
    }

    const routes = Object.values(uniqueRoutes);

    // Apply sorting based on sortBy and sortOrder
    return routes.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'route') {
        // Sort by route number (convert to number for proper numeric sorting)
        const aNum = parseInt(a.id, 10);
        const bNum = parseInt(b.id, 10);
        comparison = aNum - bNum;
      } else {
        // Sort by metric value
        comparison = a.value - b.value;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [shapes, routeMockValues, sortBy, sortOrder]);

  // Extract stops data with mock values
  const stopsList = React.useMemo(() => {
    const newMockValues: { [key: string]: number } = { ...stopMockValues };

    const stopsWithValues = stops.map(stop => {
      const stopId = stop.properties.stop_id;
      // Use existing mock value or generate new one only if it doesn't exist
      if (!newMockValues[stopId]) {
        newMockValues[stopId] = Math.floor(Math.random() * 500) + 50;
      }
      return {
        id: stopId,
        name: stop.properties.name,
        value: newMockValues[stopId]
      };
    });

    // Update state if new values were generated
    if (Object.keys(newMockValues).length !== Object.keys(stopMockValues).length) {
      setStopMockValues(newMockValues);
    }

    return stopsWithValues.sort((a, b) => b.value - a.value);
  }, [stops, stopMockValues]);

  // Filter data based on selection
  const filteredShapes = React.useMemo(() => {
    if (selectedRouteId) {
      let filtered = shapes.filter(shape => {
        return shape.properties.route_id === selectedRouteId;
      });

      // Apply pattern filter by headsign
      if (selectedPattern && Object.keys(patternLookup).length > 0) {
        filtered = filtered.filter(shape => {
          const shapeId = shape.properties.shape_id;
          const patternInfo = patternLookup[shapeId];
          return patternInfo && patternInfo.headsign === selectedPattern;
        });
      }

      return filtered;
    }

    // In system view, show only the most frequent pattern per route
    if (Object.keys(patternLookup).length > 0) {
      const mostFrequentShapePerRoute: { [routeId: string]: string } = {};

      // Find the shape with highest trip_count for each route
      shapes.forEach(shape => {
        const routeId = shape.properties.route_id;
        const shapeId = shape.properties.shape_id;
        const patternInfo = patternLookup[shapeId];

        if (patternInfo) {
          if (!mostFrequentShapePerRoute[routeId]) {
            mostFrequentShapePerRoute[routeId] = shapeId;
          } else {
            const currentShapeId = mostFrequentShapePerRoute[routeId];
            const currentPattern = patternLookup[currentShapeId];
            if (patternInfo.trip_count > currentPattern.trip_count) {
              mostFrequentShapePerRoute[routeId] = shapeId;
            }
          }
        }
      });

      // Filter to only include the most frequent shape per route
      return shapes.filter(shape =>
        mostFrequentShapePerRoute[shape.properties.route_id] === shape.properties.shape_id
      );
    }

    return shapes;
  }, [shapes, selectedRouteId, selectedPattern, patternLookup]);

  const filteredStops = React.useMemo(() => {
    if (selectedStopId) {
      // Show all stops when in stop detail view, so user can see context
      return stops;
    }

    if (selectedRouteId) {
      // If a pattern is selected, use pattern's stop_ids
      if (selectedPattern && routePatterns[selectedRouteId]) {
        const patternInfo = routePatterns[selectedRouteId].patterns.find(
          p => p.headsign === selectedPattern
        );

        if (patternInfo && patternInfo.stop_ids) {
          const patternStopIds = new Set(patternInfo.stop_ids);
          return stops.filter(stop => patternStopIds.has(stop.properties.stop_id));
        }
      }

      // Otherwise show all stops for the route
      const routeStopIds = routeStopsMap[selectedRouteId];

      if (routeStopIds) {
        return stops.filter(stop => routeStopIds.has(stop.properties.stop_id));
      }
    }

    // Only show all stops when in stops tab view
    return activeTab === 'stops' ? stops : [];
  }, [stops, selectedStopId, selectedRouteId, selectedPattern, routeStopsMap, routePatterns, activeTab]);

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
  const showStops = (activeTab === 'stops' || selectedStopId || selectedRouteId) && activeTab !== 'components';

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
  // Note: isFiltersPanelOpen is captured at call time via getUIPadding, not as a dependency
  // This prevents fitToBounds from being recreated on every panel toggle
  const fitToBounds = useCallback((bounds: LngLatBoundsLike, size: {width: number; height: number}) => {
    const { width, height } = size;
    const padding = getUIPadding(isFiltersPanelOpen);
    const viewport = new WebMercatorViewport({ width, height });
    const { longitude, latitude, zoom } = viewport.fitBounds(bounds, {
      padding,
      maxZoom: MAX_ZOOM
    });
    console.log('fitToBounds called:', { padding, zoom, isFiltersPanelOpen });
    return {
      longitude,
      latitude,
      zoom: Math.max(zoom, MIN_ZOOM),
      pitch: 0,
      bearing: 0,
      transitionDuration: 200
    };
  }, [isFiltersPanelOpen]);

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

  // Handlers for days filter tooltip
  const handleDaysFilterMouseEnter = () => {
    setIsDaysHovered(true);
    // Set timer to show tooltip after 0.5 seconds, but only if text is cut off
    daysTooltipTimerRef.current = setTimeout(() => {
      // Check if text is overflowing
      if (daysTextRef.current) {
        const isOverflowing = daysTextRef.current.scrollWidth > daysTextRef.current.clientWidth;
        if (isOverflowing) {
          setShowDaysTooltip(true);
        }
      }
    }, 500);
  };

  const handleDaysFilterMouseLeave = () => {
    setIsDaysHovered(false);
    // Clear timer and hide tooltip instantly
    if (daysTooltipTimerRef.current) {
      clearTimeout(daysTooltipTimerRef.current);
      daysTooltipTimerRef.current = null;
    }
    setShowDaysTooltip(false);
  };

  // Handlers for metric filter tooltip
  // const handleMetricFilterMouseEnter = () => {
  //   setIsMetricHovered(true);
  //   // Set timer to show tooltip after 0.5 seconds, but only if text is cut off
  //   metricTooltipTimerRef.current = setTimeout(() => {
  //     // Check if text is overflowing
  //     if (metricTextRef.current) {
  //       const isOverflowing = metricTextRef.current.scrollWidth > metricTextRef.current.clientWidth;
  //       if (isOverflowing) {
  //         setShowMetricTooltip(true);
  //       }
  //     }
  //   }, 500);
  // };

  // const handleMetricFilterMouseLeave = () => {
  //   setIsMetricHovered(false);
  //   // Clear timer and hide tooltip instantly
  //   if (metricTooltipTimerRef.current) {
  //     clearTimeout(metricTooltipTimerRef.current);
  //     metricTooltipTimerRef.current = null;
  //   }
  //   setShowMetricTooltip(false);
  // };

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

  // Compute the display text for the date filter button (using applied state)
  const getDateFilterText = () => {
    if (appliedQuickPick) {
      return getQuickPickDateRange(appliedQuickPick);
    }
    if (appliedSeason) {
      const seasonLabels = {
        winter: 'Winter',
        spring: 'Spring',
        summer: 'Summer',
        fall: 'Fall'
      };
      return `${seasonLabels[appliedSeason.season]} Service ${appliedSeason.year}`;
    }
    if (appliedStartDate && appliedEndDate) {
      return `${formatDate(appliedStartDate)} - ${formatDate(appliedEndDate)}`;
    }
    return 'Select Date Range';
  };

  // Compute the display text for the days/time filter button (using applied state)
  const getDaysFilterText = () => {
    let daysText = '';
    let timeText = '';

    // Days text
    if (appliedDaysMode === 'all') {
      daysText = 'All Days';
    } else if (appliedDaysMode === 'weekdays') {
      daysText = 'Weekdays';
    } else if (appliedDaysMode === 'weekends') {
      daysText = 'Weekends';
    } else if (appliedDaysMode === 'custom') {
      if (appliedCustomDays.length === 7) {
        daysText = 'All Days';
      } else if (appliedCustomDays.length === 0) {
        daysText = 'No Days';
      } else {
        // Sort days in the correct order: Mon, Tue, Wed, Thu, Fri, Sat, Sun
        const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const sortedDays = appliedCustomDays.sort((a, b) => {
          return dayOrder.indexOf(a) - dayOrder.indexOf(b);
        });
        daysText = sortedDays.map(day => {
          const shortDay = day === 'Mon' ? 'M' : day === 'Tue' ? 'T' : day === 'Wed' ? 'W' : day === 'Thu' ? 'Th' : day === 'Fri' ? 'F' : day === 'Sat' ? 'Sa' : 'Su';
          return shortDay;
        }).join(', ');
      }
    }

    // Time text
    if (appliedTimeMode === 'all') {
      timeText = 'All Day';
    } else if (appliedTimeMode === 'custom') {
      if (appliedTimePeriods.length === 0) {
        timeText = 'No Times';
      } else if (appliedTimePeriods.length === 6) {
        timeText = 'All Day';
      } else {
        timeText = appliedTimePeriods.join(', ');
      }
    }

    return `${daysText} • ${timeText}`;
  };

  // When date picker opens, capture the current applied state as both original and staged
  useEffect(() => {
    if (openFilter === 'date') {
      // Capture original state for Reset
      setOriginalSeason(appliedSeason);
      setOriginalQuickPick(appliedQuickPick);
      setOriginalStartDate(appliedStartDate);
      setOriginalEndDate(appliedEndDate);

      // Initialize staged state from applied state
      setStagedSeason(appliedSeason);
      setStagedQuickPick(appliedQuickPick);
      setStagedStartDate(appliedStartDate);
      setStagedEndDate(appliedEndDate);
    }
  }, [openFilter, appliedSeason, appliedQuickPick, appliedStartDate, appliedEndDate]);

  // Handle Apply button - copy staged state to applied state and close picker
  const handleApplyDateFilter = () => {
    setAppliedSeason(stagedSeason);
    setAppliedQuickPick(stagedQuickPick);
    setAppliedStartDate(stagedStartDate);
    setAppliedEndDate(stagedEndDate);
    setOpenFilter(null); // Close the picker
  };

  // Handle Reset button - restore original state to staged
  const handleResetDateFilter = () => {
    setStagedSeason(originalSeason);
    setStagedQuickPick(originalQuickPick);
    setStagedStartDate(originalStartDate);
    setStagedEndDate(originalEndDate);
  };

  // Check if there are changes (for enabling/disabling Reset button)
  const hasChanges =
    JSON.stringify(stagedSeason) !== JSON.stringify(originalSeason) ||
    stagedQuickPick !== originalQuickPick ||
    stagedStartDate?.getTime() !== originalStartDate?.getTime() ||
    stagedEndDate?.getTime() !== originalEndDate?.getTime();

  // When days/time picker opens, capture the current applied state as both original and staged
  useEffect(() => {
    if (openFilter === 'days') {
      // Capture original state for Reset
      setOriginalDaysMode(appliedDaysMode);
      setOriginalCustomDays(appliedCustomDays);
      setOriginalTimeMode(appliedTimeMode);
      setOriginalTimePeriods(appliedTimePeriods);

      // Initialize staged state from applied state
      setStagedDaysMode(appliedDaysMode);
      setStagedCustomDays(appliedCustomDays);
      setStagedTimeMode(appliedTimeMode);
      setStagedTimePeriods(appliedTimePeriods);
    }
  }, [openFilter, appliedDaysMode, appliedCustomDays, appliedTimeMode, appliedTimePeriods]);

  // Handle Apply button - copy staged state to applied state and close picker
  const handleApplyDaysFilter = () => {
    setAppliedDaysMode(stagedDaysMode);
    setAppliedCustomDays(stagedCustomDays);
    setAppliedTimeMode(stagedTimeMode);
    setAppliedTimePeriods(stagedTimePeriods);
    setOpenFilter(null); // Close the picker
  };

  // Handle Reset button - restore original state to staged
  const handleResetDaysFilter = () => {
    setStagedDaysMode(originalDaysMode);
    setStagedCustomDays(originalCustomDays);
    setStagedTimeMode(originalTimeMode);
    setStagedTimePeriods(originalTimePeriods);
  };

  // Check if there are changes for days/time picker
  const hasDaysChanges =
    stagedDaysMode !== originalDaysMode ||
    JSON.stringify(stagedCustomDays) !== JSON.stringify(originalCustomDays) ||
    stagedTimeMode !== originalTimeMode ||
    JSON.stringify(stagedTimePeriods) !== JSON.stringify(originalTimePeriods);

  // Function to update panel position based on which filter is open
  const updatePanelPosition = useCallback(() => {
    const GAP = 8; // 8px gap between filter and panel
    const trigger =
      openFilter === 'date' ? dateRef.current :
      openFilter === 'days' ? daysRef.current :
      null;

    if (!trigger) return setPanelPos(null);

    const rect = trigger.getBoundingClientRect(); // Get viewport coordinates
    setPanelPos({
      top: rect.bottom + GAP,  // Below trigger + gap
      left: rect.left,         // Left-align with trigger
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
        !daysRef.current.contains(event.target as Node)
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
        const patternLookupData = await fetchPatternLookup();
        const routePatternsData = await fetchRoutePatterns();
        const tripsData = await fetchRouteTrips();
        console.log('Loaded trips data for routes:', Object.keys(tripsData).length);

        const routeFeatures = shapesFC.features as RouteFeature[];
        const stopFeatures = stopsFC.features as StopFeature[];
        setShapes(routeFeatures);
        setStops(stopFeatures);
        setRouteStopsMap(routeStopsData);
        setPatternLookup(patternLookupData);
        setRoutePatterns(routePatternsData);
        setAllTripsData(tripsData);

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

  // Reset pattern filter and tab when route changes
  useEffect(() => {
    setSelectedPattern(null);
    setSelectedRouteTab('Summary');
  }, [selectedRouteId]);

  // Reset trips scroll position when route or pattern changes
  useEffect(() => {
    if (tripsScrollRef.current) {
      tripsScrollRef.current.scrollTop = 0;
    }
  }, [selectedRouteId, selectedPattern]);

  // Organize trips by pattern when a route is selected
  useEffect(() => {
    if (selectedRouteId && routePatterns[selectedRouteId] && allTripsData[selectedRouteId]) {
      console.log('Organizing trips for route:', selectedRouteId);
      console.log('All trips for route:', allTripsData[selectedRouteId]?.length);
      const organizedTrips = organizeTripsbyPattern(
        allTripsData[selectedRouteId],
        routePatterns[selectedRouteId]
      );
      console.log('Organized trips by pattern:', organizedTrips);
      setRouteTrips(organizedTrips);
    } else {
      console.log('Cannot organize trips:', { selectedRouteId, hasPatterns: !!routePatterns[selectedRouteId], hasTrips: !!allTripsData[selectedRouteId] });
      setRouteTrips([]);
    }
  }, [selectedRouteId, routePatterns, allTripsData]);

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
      // Find the actual selected stop
      const stop = filteredStops.find(s => s.properties.stop_id === selectedStopId);
      if (!stop) return;
      const [stopLng, stopLat] = stop.geometry.coordinates as number[];

      // Calculate the center point accounting for the left panel offset
      const el = mapContainerRef.current;
      const width = el?.clientWidth ?? window.innerWidth;
      const height = el?.clientHeight ?? window.innerHeight;
      const padding = getUIPadding(isFiltersPanelOpen);

      // Create a viewport at zoom 16 centered on the stop
      const viewport = new WebMercatorViewport({
        width,
        height,
        longitude: stopLng,
        latitude: stopLat,
        zoom: 16
      });

      // The stop is currently at screen center (width/2)
      // We want it at the center of the visible area
      const screenCenterX = width / 2;
      const visibleCenterX = padding.left + ((width - padding.left - padding.right) / 2);
      const offsetX = visibleCenterX - screenCenterX;

      // Project the stop to screen coordinates, shift it, then unproject
      const [stopX, stopY] = viewport.project([stopLng, stopLat]);
      const [newLng, newLat] = viewport.unproject([stopX - offsetX, stopY]);

      setViewState({
        longitude: newLng,
        latitude: newLat,
        zoom: 16,
        pitch: 0,
        bearing: 0,
        transitionDuration: 200
      });
    } else if (!selectedRouteId && !selectedStopId) {
      // Reset to the originally fitted system view, not the hardcoded Gas Works view
      setViewState(initialFittedViewRef.current ?? INITIAL_VIEW_STATE);
    }
  }, [selectedRouteId, selectedStopId, filteredShapes, filteredStops, fitToBounds, isFiltersPanelOpen]);

  // Memoize DeckGL accessor functions to prevent unnecessary recalculations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getStopPosition = React.useCallback((d: any) => d.geometry.coordinates, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getStopBorderColor = React.useCallback((d: any): [number, number, number, number] => {
    const color = getColorForId(d.properties.stop_id);
    const isSelected = selectedStopId === d.properties.stop_id;
    const alpha = selectedStopId ? (isSelected ? 200 : 100) : 200;
    return [...color, alpha] as [number, number, number, number];
  }, [selectedStopId]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getStopCenterColor = React.useCallback((d: any): [number, number, number, number] => {
    const isSelected = selectedStopId === d.properties.stop_id;
    const alpha = selectedStopId ? (isSelected ? 255 : 128) : 255;
    return [255, 255, 255, alpha] as [number, number, number, number];
  }, [selectedStopId]);

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
          // If a route is selected (detail view), use hardcoded light gray
          if (selectedRouteId) {
            return [186, 177, 169, 255]; // #BAB1A9 at full opacity
          }
          // Otherwise use the color scheme
          const color = getColorForId(d.properties.route_id);
          return [...color, 200]; // Add alpha for transparency
        },
        widthMinPixels: 4.5,
        widthMaxPixels: 18,
        pickable: !selectedRouteId, // Disable hover in route detail view
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

    // Add route labels - only show when NOT in route detail view
    if (!selectedRouteId) {
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

    // Add directional arrows when a pattern is selected
    if (selectedPattern && selectedRouteId && filteredStops.length > 1) {
      // Get the pattern data to find the correct stop sequence
      const matchingShape = shapes.find(shape =>
        (shape.properties.route_short_name || shape.properties.route_id) === selectedRouteId
      );
      const actualRouteId = matchingShape?.properties.route_id;

      if (actualRouteId && routePatterns[actualRouteId]) {
        const patternInfo = routePatterns[actualRouteId].patterns.find(
          p => p.headsign === selectedPattern
        );

        if (patternInfo && patternInfo.stop_ids && patternInfo.stop_ids.length > 1) {
          // Get first and last stop IDs from the ordered sequence to determine direction
          const firstStopId = patternInfo.stop_ids[0];
          const lastStopId = patternInfo.stop_ids[patternInfo.stop_ids.length - 1];

          // Find the actual stop coordinates
          const firstStop = filteredStops.find(s => s.properties.stop_id === firstStopId);
          const lastStop = filteredStops.find(s => s.properties.stop_id === lastStopId);

          if (firstStop && lastStop) {
            const stopLabels = [
              {
                position: firstStop.geometry.coordinates,
                text: 'First stop'
              },
              {
                position: lastStop.geometry.coordinates,
                text: 'Last stop'
              }
            ];

            layers.push(
              new TextLayer({
                id: 'stop-direction-labels',
                data: stopLabels,
                getPosition: (d) => d.position,
                getText: (d) => d.text,
                getSize: 12,
                getColor: [61, 40, 23, 255], // text-secondary #3D2817
                getBackgroundColor: [255, 255, 255, 255], // white background
                getTextAnchor: 'start',
                getAlignmentBaseline: 'center',
                getBorderColor: [232, 224, 213, 255], // border-default #E8E0D5
                getBorderWidth: 0.5,
                background: true,
                backgroundPadding: [8, 4, 8, 4], // [top, right, bottom, left] - 8px top/bottom, 4px left/right
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                sizeScale: 1,
                sizeMinPixels: 12,
                sizeMaxPixels: 12,
                pickable: false,
                getPixelOffset: [12, 0], // Offset to the right of the stop
                // Note: getBorderRadius is not supported by deck.gl TextLayer
              })
            );
          }
        }
      }
    }
  }

  // Conditionally add stops layer
  if (showStops) {
    // Selected stop halo layer (render first, so it's below everything else)
    if (selectedStopId) {
      const selectedStopData = filteredStops.filter(stop => stop.properties.stop_id === selectedStopId);
      if (selectedStopData.length > 0) {
        const selectedStopColor = getColorForId(selectedStopId);

        // Halo layer (12px larger than the stop, 50% opacity)
        layers.push(
          new ScatterplotLayer({
            id: 'selected-stop-halo',
            data: selectedStopData,
            getPosition: getStopPosition,
            getRadius: 24, // 12px (base) + 12px = 24px
            getFillColor: [...selectedStopColor, 128], // 50% opacity
            radiusMinPixels: 18, // 6px (base min) + 12px = 18px
            radiusMaxPixels: 36, // 24px (base max) + 12px = 36px
          })
        );
      }
    }

    // Hovered stop halo (same style as selected stop, render before base layers)
    if (hoveredStop && hoveredStop !== selectedStopId) {
      const hoveredStopData = filteredStops.filter(stop => stop.properties.stop_id === hoveredStop);
      if (hoveredStopData.length > 0) {
        const hoveredStopColor = getColorForId(hoveredStop);

        // Halo layer (12px larger than the stop, 50% opacity)
        layers.push(
          new ScatterplotLayer({
            id: 'hovered-stop-halo',
            data: hoveredStopData,
            getPosition: getStopPosition,
            getRadius: 24, // 12px (base) + 12px = 24px
            getFillColor: [...hoveredStopColor, 128], // 50% opacity
            radiusMinPixels: 18, // 6px (base min) + 12px = 18px
            radiusMaxPixels: 36, // 24px (base max) + 12px = 36px
          })
        );
      }
    }

    // Base stops layers
    layers.push(
        // Colored border layer (outer ring)
        new ScatterplotLayer({
          id: 'stops-border',
          data: filteredStops,
          getPosition: getStopPosition,
          getRadius: 12, // Outer radius (8px border + 4px white center)
          getFillColor: getStopBorderColor,
          radiusMinPixels: 6,
          radiusMaxPixels: 24,
          pickable: true, // Enable hover and click detection
          onHover: ({ object }) => setHoveredStop(object ? (object as StopFeature).properties.stop_id : null),
          onClick: ({ object }) => {
            if (object) {
              setSelectedStopId((object as StopFeature).properties.stop_id);
              setActiveTab('stops'); // Switch to stops tab to show stop detail
            }
          },
          updateTriggers: {
            getFillColor: [selectedStopId] // Force recalculation when selectedStopId changes
          }
        }),
        // White center layer (inner circle)
        new ScatterplotLayer({
          id: 'stops-center',
          data: filteredStops,
          getPosition: getStopPosition,
          getRadius: 4, // Inner radius (white center stays same)
          getFillColor: getStopCenterColor,
          radiusMinPixels: 2,
          radiusMaxPixels: 8,
          pickable: true, // Enable hover and click detection
          onHover: ({ object }) => setHoveredStop(object ? (object as StopFeature).properties.stop_id : null),
          onClick: ({ object }) => {
            if (object) {
              setSelectedStopId((object as StopFeature).properties.stop_id);
              setActiveTab('stops'); // Switch to stops tab to show stop detail
            }
          },
          updateTriggers: {
            getFillColor: [selectedStopId] // Force recalculation when selectedStopId changes
          }
        })
    );
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* Left Container Wrapper with Shadow */}
      <div style={{
        position: 'fixed',
        left: '12px',
        top: '12px',
        height: 'calc(100% - 24px)',
        width: isFiltersPanelOpen ? '664px' : '424px',
        boxShadow: 'var(--shadow-lg)',
        borderRadius: '28px',
        pointerEvents: 'none',
        zIndex: 999,
        transition: 'width 300ms ease-in-out'
      }} />

      {/* Nav Rail */}
      <div style={{
        width: '64px',
        height: 'calc(100% - 24px)',
        position: 'fixed',
        left: '12px',
        top: '12px',
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
          height: 'calc(100% - 24px)',
          backgroundColor: 'var(--bg-primary)',
          borderTop: '0.5px solid var(--border-default)',
          borderBottom: '0.5px solid var(--border-default)',
          borderRight: isFiltersPanelOpen ? '0.5px solid var(--border-default)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          left: '76px',
          top: '12px',
          zIndex: 1000,
          overflow: 'hidden',
          transition: 'width 300ms ease-in-out',
          borderRadius: '0'
        }}>
        {/* Filter Section */}
        <div style={{
          padding: '22px 12px 24px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px', // Space between the two separate filters
          width: '240px',
          minWidth: '240px'
        }}>
          {/* Date-time Section */}
          <div style={{ marginBottom: '8px' }}>
            <label className="label text-text-tertiary block mb-1">Date-time</label>

            {/* Date Range Filter */}
            <div ref={dateRef} style={{ marginBottom: '8px', position: 'relative' }}>
              <div
                onClick={() => setOpenFilter(openFilter === 'date' ? null : 'date')}
                onMouseEnter={handleDateFilterMouseEnter}
                onMouseLeave={handleDateFilterMouseLeave}
                className="button-small h-10 px-4 flex items-center justify-between cursor-pointer transition-colors rounded-full border"
                style={{
                  borderWidth: 'var(--border-width)',
                  backgroundColor: openFilter === 'date' ? 'var(--bg-elevated)' : (isDateHovered ? 'var(--bg-elevated)' : 'var(--bg-primary)'),
                  borderColor: openFilter === 'date' ? 'var(--border-focus)' : 'var(--border-default)',
                  color: 'var(--text-secondary)'
                }}
              >
                <span
                  ref={dateTextRef}
                  className="flex-grow overflow-hidden text-ellipsis whitespace-nowrap mr-2"
                >
                  {getDateFilterText()}
                </span>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                  <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
                </svg>
              </div>
              {showDateTooltip && (
                <Tooltip text={getDateFilterText()}>
                  {null}
                </Tooltip>
              )}
            </div>

            {/* Days of Week Filter */}
            <div ref={daysRef} style={{ position: 'relative' }}>
              <div
                onClick={() => setOpenFilter(openFilter === 'days' ? null : 'days')}
                onMouseEnter={handleDaysFilterMouseEnter}
                onMouseLeave={handleDaysFilterMouseLeave}
                className="button-small h-10 px-4 flex items-center justify-between cursor-pointer transition-colors rounded-full border"
                style={{
                  borderWidth: 'var(--border-width)',
                  backgroundColor: openFilter === 'days' ? 'var(--bg-elevated)' : (isDaysHovered ? 'var(--bg-elevated)' : 'var(--bg-primary)'),
                  borderColor: openFilter === 'days' ? 'var(--border-focus)' : 'var(--border-default)',
                  color: 'var(--text-secondary)'
                }}
              >
                <span
                  ref={daysTextRef}
                  className="flex-grow overflow-hidden text-ellipsis whitespace-nowrap mr-2"
                >
                  {getDaysFilterText()}
                </span>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                  <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
                </svg>
              </div>
              {showDaysTooltip && (
                <Tooltip text={getDaysFilterText()}>
                  {null}
                </Tooltip>
              )}
            </div>

            {/* Compare Button */}
            <div style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
              <Button
                variant="tertiary"
                size="small"
                onClick={() => {
                  // Add compare functionality here
                  console.log('Compare clicked');
                }}
              >
                Compare
              </Button>
            </div>
          </div>

          {/* Metric Section */}
          <div style={{ marginTop: '16px' }}>
            <label className="label text-text-tertiary block mb-1">Metric</label>
            <Select
              value={selectedMetric}
              onChange={(value) => setSelectedMetric(value)}
              options={[
                { value: 'Average daily boardings', label: 'Average daily boardings' },
                { value: 'Total boardings', label: 'Total boardings' },
                { value: 'Average daily alightings', label: 'Average daily alightings' },
                { value: 'Total daily boardings', label: 'Total daily boardings' },
                { value: 'Average daily activity', label: 'Average daily activity' },
                { value: 'Total activity', label: 'Total activity' },
                { value: 'Average load', label: 'Average load' },
                { value: 'Maxload', label: 'Maxload' }
              ]}
            />
          </div>

          {/* Route and Pattern Filters - Only show in route detail view */}
          {selectedRouteId && (() => {
            // selectedRouteId is now the actual route_id, so we can use it directly
            const routePatternInfo = routePatterns[selectedRouteId];

            if (!routePatternInfo) return null;

            return (
              <>
                {/* Divider */}
                <div style={{
                  width: '100%',
                  height: '0.5px',
                  backgroundColor: 'var(--border-default)',
                  marginTop: '24px',
                  marginBottom: '24px'
                }} />

                {/* Route Filter */}
                <div>
                  <label className="label text-text-tertiary block mb-1">Route</label>
                  <Select
                    value={selectedRouteId}
                    onChange={(value) => {
                      setSelectedRouteId(value);
                    }}
                    options={routesList.map(route => ({
                      value: route.id,
                      label: route.name
                    }))}
                  />
                </div>

                {/* Pattern Filter */}
                <div style={{ marginTop: '16px' }}>
                  <label className="label text-text-tertiary block mb-1">Pattern</label>
                  <Select
                    value={selectedPattern || 'all'}
                    onChange={(value) => setSelectedPattern(value === 'all' ? null : value)}
                    options={[
                      {
                        value: 'all',
                        label: 'All patterns'
                      },
                      ...routePatternInfo.patterns.map(pattern => ({
                        value: pattern.headsign,
                        label: pattern.headsign,
                        description: `${Math.round(pattern.pct_of_route)}% of trips`
                      }))
                    ]}
                  />
                </div>
              </>
            );
          })()}
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
            backgroundColor: 'var(--bg-elevated)',
            border: '0.5px solid var(--border-default)',
            borderRadius: '28px',
            padding: '24px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            color: 'var(--text-primary)',
            zIndex: 2000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            width: openFilter === 'date' ? '620px' : openFilter === 'days' ? '452px' : '300px',
          }}
        >
          {openFilter === 'date' ? (
            <div>
              {/* Segmented Control */}
              <div style={{
                display: 'flex',
                backgroundColor: 'var(--bg-secondary)',
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
                    backgroundColor: datePickerMode === 'shortcuts' ? 'var(--bg-elevated)' : 'transparent',
                    border: datePickerMode === 'shortcuts' ? 'var(--border-width) solid var(--border-default)' : 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 'var(--button-small-size)',
                    fontWeight: 'var(--button-small-weight)',
                    color: datePickerMode === 'shortcuts' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    lineHeight: 'var(--button-small-line-height)',
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
                    backgroundColor: datePickerMode === 'custom' ? 'var(--bg-elevated)' : 'transparent',
                    border: datePickerMode === 'custom' ? 'var(--border-width) solid var(--border-default)' : 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 'var(--button-small-size)',
                    fontWeight: 'var(--button-small-weight)',
                    color: datePickerMode === 'custom' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    lineHeight: 'var(--button-small-line-height)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Custom
                </button>
              </div>

              {datePickerMode === 'shortcuts' ? (
                <div style={{ paddingBottom: '24px' }}>
                  {/* Year Selector */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '24px',
                    paddingLeft: '124px',
                    paddingRight: '124px'
                  }}>
                    <button
                      type="button"
                      onClick={() => setSelectedYear(selectedYear - 1)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: '0.5px solid var(--border-default)',
                        backgroundColor: 'var(--bg-elevated)',
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
                      fontSize: 'var(--heading-3-size)',
                      fontWeight: 'var(--heading-3-weight)',
                      color: 'var(--text-primary)',
                      minWidth: '200px',
                      textAlign: 'center',
                      lineHeight: 'var(--heading-3-line-height)',
                      letterSpacing: 'var(--heading-3-letter-spacing)'
                    }}>
                      Service {selectedYear}
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
                        border: '0.5px solid var(--border-default)',
                        backgroundColor: selectedYear >= 2025 ? '#F5F5F5' : 'var(--bg-elevated)',
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
                      { key: 'winter', label: 'Winter', icon: WinterIcon },
                      { key: 'spring', label: 'Spring', icon: SpringIcon },
                      { key: 'summer', label: 'Summer', icon: SummerIcon },
                      { key: 'fall', label: 'Fall', icon: FallIcon },
                    ].map((season) => {
                      // Generate date ranges based on selected year
                      let dateRange = '';
                      const prevYear = selectedYear - 1;
                      const nextYear = selectedYear + 1;

                      // Determine the display year for the season label
                      // Winter starts in the previous year, others start in selectedYear
                      const displayYear = season.key === 'winter' ? prevYear : selectedYear;

                      switch(season.key) {
                        case 'winter':
                          dateRange = `9/21/${prevYear.toString().slice(-2)} - 3/20/${selectedYear.toString().slice(-2)}`;
                          break;
                        case 'spring':
                          dateRange = `3/21/${selectedYear.toString().slice(-2)} - 6/21/${selectedYear.toString().slice(-2)}`;
                          break;
                        case 'summer':
                          dateRange = `6/22/${selectedYear.toString().slice(-2)} - 9/18/${selectedYear.toString().slice(-2)}`;
                          break;
                        case 'fall':
                          // Show "9/19/25 - Today" for Fall 2025 (current season)
                          if (selectedYear === 2025) {
                            dateRange = '9/19/25 - Today';
                          } else {
                            dateRange = `9/19/${selectedYear.toString().slice(-2)} - 3/19/${nextYear.toString().slice(-2)}`;
                          }
                          break;
                      }

                      return (
                      <button
                        key={season.key}
                        type="button"
                        onClick={() => {
                          setStagedSeason({ season: season.key as 'winter' | 'spring' | 'summer' | 'fall', year: displayYear });
                          setStagedQuickPick(null);
                          setStagedStartDate(null);
                          setStagedEndDate(null);
                        }}
                        onMouseEnter={() => setHoveredSeason(season.key)}
                        onMouseLeave={() => setHoveredSeason(null)}
                        style={{
                          paddingTop: '20px',
                          paddingBottom: '20px',
                          paddingLeft: '12px',
                          paddingRight: '12px',
                          backgroundColor: stagedSeason?.season === season.key && stagedSeason?.year === displayYear ? 'var(--bg-primary)' : (hoveredSeason === season.key ? 'var(--bg-primary)' : 'var(--bg-elevated)'),
                          border: stagedSeason?.season === season.key && stagedSeason?.year === displayYear ? '0.5px solid var(--border-focus)' : '0.5px solid var(--border-default)',
                          borderRadius: '20px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <img
                          src={season.icon.src}
                          alt={season.label}
                          style={{
                            width: '48px',
                            height: '48px',
                            marginBottom: '4px',
                            filter: 'brightness(0) saturate(100%)',
                            opacity: '0.87'
                          }}
                        />
                        <div style={{
                          fontSize: 'var(--button-small-size)',
                          fontWeight: 'var(--button-small-weight)',
                          color: 'var(--text-primary)',
                          fontFamily: 'Inter, sans-serif',
                          lineHeight: 'var(--button-small-line-height)'
                        }}>
                          {season.label} {displayYear}
                        </div>
                        <div style={{
                          fontSize: 'var(--nav-label-size)',
                          fontWeight: 'var(--nav-label-weight)',
                          color: 'var(--text-secondary)',
                          fontFamily: 'Inter, sans-serif',
                          textAlign: 'center',
                          lineHeight: 'var(--nav-label-line-height)',
                          letterSpacing: 'var(--nav-label-letter-spacing)'
                        }}>
                          {dateRange}
                        </div>
                      </button>
                      );
                    })}
                  </div>

                  {/* Quick Picks */}
                  <div>
                    <div style={{
                      fontSize: 'var(--heading-3-size)',
                      fontWeight: 'var(--heading-3-weight)',
                      color: 'var(--text-primary)',
                      marginBottom: '16px',
                      textAlign: 'center',
                      lineHeight: 'var(--heading-3-line-height)',
                      letterSpacing: 'var(--heading-3-letter-spacing)'
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
                          <StatefulButton
                            key={pick}
                            size="medium"
                            selected={stagedQuickPick === pick}
                            onToggle={(selected) => {
                              if (selected) {
                                setStagedQuickPick(pick);
                                setStagedSeason(null);
                                setStagedStartDate(null);
                                setStagedEndDate(null);
                              } else {
                                setStagedQuickPick(null);
                              }
                            }}
                            style={{ whiteSpace: 'nowrap' }}
                          >
                            {pick}
                          </StatefulButton>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {['Month to date', 'Quarter to date', 'Year to date'].map((pick) => (
                          <StatefulButton
                            key={pick}
                            size="medium"
                            selected={stagedQuickPick === pick}
                            onToggle={(selected) => {
                              if (selected) {
                                setStagedQuickPick(pick);
                                setStagedSeason(null);
                                setStagedStartDate(null);
                                setStagedEndDate(null);
                              } else {
                                setStagedQuickPick(null);
                              }
                            }}
                            style={{ whiteSpace: 'nowrap' }}
                          >
                            {pick}
                          </StatefulButton>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Custom Date Picker
                <div style={{ paddingLeft: '24px', paddingRight: '24px', paddingBottom: '24px' }}>
                  {/* Calendar Navigation */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '24px',
                    paddingLeft: '100px',
                    paddingRight: '100px'
                  }}>
                    <button
                      type="button"
                      onClick={() => setCalendarStartMonth(new Date(calendarStartMonth.getFullYear(), calendarStartMonth.getMonth() - 1))}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: '0.5px solid var(--border-default)',
                        backgroundColor: 'var(--bg-elevated)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0
                      }}
                    >
                      <img
                        src={ChevronLeftIcon.src}
                        alt="Previous month"
                        style={{
                          width: '24px',
                          height: '24px',
                          filter: 'brightness(0)'
                        }}
                      />
                    </button>
                    <div style={{
                      fontSize: 'var(--heading-3-size)',
                      fontWeight: 'var(--heading-3-weight)',
                      color: 'var(--text-primary)',
                      minWidth: '200px',
                      textAlign: 'center',
                      lineHeight: 'var(--heading-3-line-height)',
                      letterSpacing: 'var(--heading-3-letter-spacing)'
                    }}>
                      {calendarStartMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const currentMonth = now.getMonth();
                        const currentYear = now.getFullYear();
                        const calendarMonth = calendarStartMonth.getMonth();
                        const calendarYear = calendarStartMonth.getFullYear();

                        if (calendarYear < currentYear || (calendarYear === currentYear && calendarMonth < currentMonth)) {
                          setCalendarStartMonth(new Date(calendarStartMonth.getFullYear(), calendarStartMonth.getMonth() + 1));
                        }
                      }}
                      disabled={(() => {
                        const now = new Date();
                        const currentMonth = now.getMonth();
                        const currentYear = now.getFullYear();
                        const calendarMonth = calendarStartMonth.getMonth();
                        const calendarYear = calendarStartMonth.getFullYear();
                        return calendarYear === currentYear && calendarMonth === currentMonth;
                      })()}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: '0.5px solid var(--border-default)',
                        backgroundColor: (() => {
                          const now = new Date();
                          const currentMonth = now.getMonth();
                          const currentYear = now.getFullYear();
                          const calendarMonth = calendarStartMonth.getMonth();
                          const calendarYear = calendarStartMonth.getFullYear();
                          const isDisabled = calendarYear === currentYear && calendarMonth === currentMonth;
                          return isDisabled ? '#F5F5F5' : 'var(--bg-elevated)';
                        })(),
                        cursor: (() => {
                          const now = new Date();
                          const currentMonth = now.getMonth();
                          const currentYear = now.getFullYear();
                          const calendarMonth = calendarStartMonth.getMonth();
                          const calendarYear = calendarStartMonth.getFullYear();
                          const isDisabled = calendarYear === currentYear && calendarMonth === currentMonth;
                          return isDisabled ? 'not-allowed' : 'pointer';
                        })(),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        opacity: (() => {
                          const now = new Date();
                          const currentMonth = now.getMonth();
                          const currentYear = now.getFullYear();
                          const calendarMonth = calendarStartMonth.getMonth();
                          const calendarYear = calendarStartMonth.getFullYear();
                          const isDisabled = calendarYear === currentYear && calendarMonth === currentMonth;
                          return isDisabled ? 0.5 : 1;
                        })()
                      }}
                    >
                      <img
                        src={ChevronRightIcon.src}
                        alt="Next month"
                        style={{
                          width: '24px',
                          height: '24px',
                          filter: (() => {
                            const now = new Date();
                            const currentMonth = now.getMonth();
                            const currentYear = now.getFullYear();
                            const calendarMonth = calendarStartMonth.getMonth();
                            const calendarYear = calendarStartMonth.getFullYear();
                            const isDisabled = calendarYear === currentYear && calendarMonth === currentMonth;
                            return isDisabled ? 'none' : 'brightness(0)';
                          })()
                        }}
                      />
                    </button>
                  </div>

                  {/* Single Month Calendar */}
                  <div>
                    {(() => {
                      const year = calendarStartMonth.getFullYear();
                      const month = calendarStartMonth.getMonth();

                      // Get days in month
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const firstDayOfMonth = new Date(year, month, 1).getDay();

                      const days: (Date | null)[] = [];
                      for (let i = 0; i < firstDayOfMonth; i++) {
                        days.push(null);
                      }
                      for (let i = 1; i <= daysInMonth; i++) {
                        days.push(new Date(year, month, i));
                      }

                      return (
                        <div>
                          {/* Weekday headers */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 48px)',
                            columnGap: '0',
                            marginBottom: '8px',
                            marginTop: '8px',
                            justifyContent: 'center'
                          }}>
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                              <div
                                key={idx}
                                style={{
                                  fontSize: 'var(--label-size)',
                                  fontWeight: 'var(--label-weight)',
                                  color: 'var(--text-tertiary)',
                                  textAlign: 'center',
                                  padding: '8px 0',
                                  letterSpacing: 'var(--label-letter-spacing)'
                                }}
                              >
                                {day}
                              </div>
                            ))}
                          </div>

                          {/* Calendar days */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 48px)',
                            rowGap: '4px',
                            columnGap: '0',
                            justifyContent: 'center'
                          }}>
                            {days.map((day, idx) => {
                              if (!day) {
                                return <div key={`empty-${idx}`} />;
                              }

                              const isStart = stagedStartDate && day.getTime() === stagedStartDate.getTime();
                              const isEnd = stagedEndDate && day.getTime() === stagedEndDate.getTime();
                              const isInRange = stagedStartDate && stagedEndDate &&
                                day.getTime() > stagedStartDate.getTime() &&
                                day.getTime() < stagedEndDate.getTime();
                              const isSelected = isStart || isEnd;
                              const isToday = day.toDateString() === new Date().toDateString();

                              // Check if this date is at the start or end of a week row
                              const dayOfWeek = day.getDay(); // 0 = Sunday, 6 = Saturday
                              const isRowStart = dayOfWeek === 0; // Sunday
                              const isRowEnd = dayOfWeek === 6; // Saturday

                              // Check if previous/next day is also selected or in range
                              const prevDaySelected = idx > 0 && days[idx - 1] && stagedStartDate && stagedEndDate && (
                                (days[idx - 1]!.getTime() >= stagedStartDate.getTime() && days[idx - 1]!.getTime() <= stagedEndDate.getTime())
                              );
                              const nextDaySelected = idx < days.length - 1 && days[idx + 1] && stagedStartDate && stagedEndDate && (
                                (days[idx + 1]!.getTime() >= stagedStartDate.getTime() && days[idx + 1]!.getTime() <= stagedEndDate.getTime())
                              );

                              // Determine border radius for wrapper background
                              let wrapperBorderRadius = '0';
                              let buttonBorderRadius = '8px';
                              const isActive = isSelected || isInRange;

                              // Check if adjacent to selected dates
                              const prevIsSelected = idx > 0 && days[idx - 1] && stagedStartDate && stagedEndDate && (
                                days[idx - 1]!.getTime() === stagedStartDate.getTime() ||
                                days[idx - 1]!.getTime() === stagedEndDate.getTime()
                              );
                              const nextIsSelected = idx < days.length - 1 && days[idx + 1] && stagedStartDate && stagedEndDate && (
                                days[idx + 1]!.getTime() === stagedStartDate.getTime() ||
                                days[idx + 1]!.getTime() === stagedEndDate.getTime()
                              );

                              // Margins to extend backgrounds into adjacent cells
                              let wrapperMarginLeft = '0';
                              let wrapperMarginRight = '0';
                              let backgroundZIndex = 0;

                              if (isActive) {
                                if (isSelected) {
                                  // Selected dates (start/end) are always circles
                                  wrapperBorderRadius = '50%';
                                  buttonBorderRadius = '50%';
                                  backgroundZIndex = 2; // Higher z-index so circles appear above in-range backgrounds
                                } else if (isInRange) {
                                  // In-range dates form continuous rectangle
                                  // Extend background to overlap with adjacent selected dates
                                  if (prevIsSelected) {
                                    wrapperMarginLeft = '-24px'; // Extend left to cover half of previous cell
                                  }
                                  if (nextIsSelected) {
                                    wrapperMarginRight = '-24px'; // Extend right to cover half of next cell
                                  }

                                  // Only round edges at row boundaries
                                  const roundLeft = isRowStart;
                                  const roundRight = isRowEnd;

                                  if (roundLeft && roundRight) {
                                    wrapperBorderRadius = '8px';
                                  } else if (roundLeft) {
                                    wrapperBorderRadius = '8px 0 0 8px';
                                  } else if (roundRight) {
                                    wrapperBorderRadius = '0 8px 8px 0';
                                  }
                                  buttonBorderRadius = '8px';
                                  backgroundZIndex = 1; // Lower z-index so in-range backgrounds go behind circles
                                }
                              }

                              return (
                                <div
                                  key={idx}
                                  style={{
                                    position: 'relative',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '48px'
                                  }}
                                >
                                  {/* Background layer */}
                                  <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: wrapperMarginLeft,
                                    right: wrapperMarginRight,
                                    bottom: 0,
                                    background: isSelected ? 'var(--btn-primary)' : (isInRange ? 'var(--bg-primary)' : 'transparent'),
                                    borderRadius: wrapperBorderRadius,
                                    zIndex: backgroundZIndex
                                  }} />
                                  <button
                                    onClick={() => {
                                      // Clear quick pick when custom dates are selected
                                      setStagedQuickPick(null);
                                      setStagedSeason(null);

                                      if (!stagedStartDate || (stagedStartDate && stagedEndDate)) {
                                        setStagedStartDate(day);
                                        setStagedEndDate(null);
                                      } else if (day.getTime() > stagedStartDate.getTime()) {
                                        setStagedEndDate(day);
                                      } else {
                                        setStagedEndDate(stagedStartDate);
                                        setStagedStartDate(day);
                                      }
                                    }}
                                    style={{
                                      position: 'relative',
                                      zIndex: 3,
                                      background: isSelected ? 'var(--btn-primary)' : 'transparent',
                                      border: 'none',
                                      borderRadius: buttonBorderRadius,
                                      color: isSelected ? 'var(--text-on-primary)' : 'var(--text-primary)',
                                      cursor: 'pointer',
                                      width: '48px',
                                      height: '48px',
                                      fontSize: 'var(--body-regular-size)',
                                      fontWeight: 'var(--body-regular-weight)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isSelected && !isInRange) {
                                        e.currentTarget.style.background = 'var(--bg-secondary)';
                                        e.currentTarget.style.borderRadius = '50%';
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isSelected && !isInRange) {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.borderRadius = buttonBorderRadius;
                                      }
                                    }}
                                  >
                                    {day.getDate()}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Divider */}
              <div style={{
                borderTop: 'var(--border-width) solid var(--border-default)',
                marginTop: '24px',
                marginLeft: '-24px',
                marginRight: '-24px'
              }} />

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                padding: '20px 0 0 0',
                justifyContent: 'flex-end'
              }}>
                <Button
                  variant="tertiary"
                  size="medium"
                  onClick={handleResetDateFilter}
                  disabled={!hasChanges}
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                  }}
                  onMouseEnter={(e) => {
                    if (hasChanges) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                  }}
                >
                  Reset
                </Button>
                <Button
                  variant="primary"
                  size="medium"
                  onClick={handleApplyDateFilter}
                  disabled={!hasChanges}
                >
                  Apply
                </Button>
              </div>
            </div>
          ) : openFilter === 'days' ? (
            <div>
              {/* Days of the week section */}
              <div style={{ marginBottom: '32px' }}>
                <div style={{
                  fontSize: 'var(--heading-3-size)',
                  fontWeight: 'var(--heading-3-weight)',
                  color: 'var(--text-primary)',
                  marginBottom: '16px',
                  lineHeight: 'var(--heading-3-line-height)',
                  letterSpacing: 'var(--heading-3-letter-spacing)',
                  textAlign: 'center'
                }}>
                  Days of the week
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <StatefulButton
                    size="medium"
                    selected={stagedDaysMode === 'all'}
                    onToggle={() => setStagedDaysMode('all')}
                  >
                    All
                  </StatefulButton>
                  <StatefulButton
                    size="medium"
                    selected={stagedDaysMode === 'weekdays'}
                    onToggle={() => {
                      setStagedDaysMode('weekdays');
                      setStagedCustomDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
                    }}
                  >
                    Weekdays
                  </StatefulButton>
                  <StatefulButton
                    size="medium"
                    selected={stagedDaysMode === 'weekends'}
                    onToggle={() => {
                      setStagedDaysMode('weekends');
                      setStagedCustomDays(['Sat', 'Sun']);
                    }}
                  >
                    Weekends
                  </StatefulButton>
                  <StatefulButton
                    size="medium"
                    selected={stagedDaysMode === 'custom'}
                    onToggle={() => setStagedDaysMode('custom')}
                  >
                    Custom
                  </StatefulButton>
                </div>

                {/* Custom day selector */}
                {stagedDaysMode === 'custom' && (
                  <>
                    {/* Divider */}
                    <div style={{
                      borderTop: 'var(--border-width) solid var(--border-default)',
                      marginTop: '12px',
                      marginBottom: '12px'
                    }} />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                      const isSelected = stagedCustomDays.includes(day);
                      const shortDay = day === 'Mon' ? 'M' : day === 'Tue' ? 'T' : day === 'Wed' ? 'W' : day === 'Thu' ? 'T' : day === 'Fri' ? 'F' : day === 'Sat' ? 'Sa' : 'Su';
                      return (
                        <StatefulButton
                          key={day}
                          size="medium"
                          selected={isSelected}
                          onToggle={() => {
                            if (isSelected) {
                              setStagedCustomDays(stagedCustomDays.filter(d => d !== day));
                            } else {
                              setStagedCustomDays([...stagedCustomDays, day]);
                            }
                          }}
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            padding: 0
                          }}
                        >
                          {shortDay}
                        </StatefulButton>
                      );
                    })}
                    </div>
                  </>
                )}
              </div>

              {/* Time of day section */}
              <div>
                <div style={{
                  fontSize: 'var(--heading-3-size)',
                  fontWeight: 'var(--heading-3-weight)',
                  color: 'var(--text-primary)',
                  marginBottom: '16px',
                  lineHeight: 'var(--heading-3-line-height)',
                  letterSpacing: 'var(--heading-3-letter-spacing)',
                  textAlign: 'center'
                }}>
                  Time of day
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', justifyContent: 'center' }}>
                  <StatefulButton
                    size="medium"
                    selected={stagedTimeMode === 'all'}
                    onToggle={() => {
                      setStagedTimeMode('all');
                      setStagedTimePeriods([]);
                    }}
                  >
                    All
                  </StatefulButton>
                  <StatefulButton
                    size="medium"
                    selected={stagedTimeMode === 'custom'}
                    onToggle={() => setStagedTimeMode('custom')}
                  >
                    Custom
                  </StatefulButton>
                </div>

                {/* Custom time periods */}
                {stagedTimeMode === 'custom' && (
                  <>
                    {/* Divider */}
                    <div style={{
                      borderTop: 'var(--border-width) solid var(--border-default)',
                      marginTop: '12px',
                      marginBottom: '12px'
                    }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                    {[
                      { label: 'Early AM', time: '12AM - 6AM' },
                      { label: 'AM Peak', time: '6AM - 9AM' },
                      { label: 'Midday', time: '9AM - 3PM' },
                      { label: 'PM Peak', time: '3PM - 7PM' },
                      { label: 'Evening', time: '7PM - 10PM' },
                      { label: 'Night', time: '10PM - 12AM' }
                    ].map(({ label, time }) => {
                      const isSelected = stagedTimePeriods.includes(label);
                      return (
                        <StatefulButton
                          key={label}
                          size="medium"
                          selected={isSelected}
                          onToggle={() => {
                            if (isSelected) {
                              setStagedTimePeriods(stagedTimePeriods.filter(p => p !== label));
                            } else {
                              setStagedTimePeriods([...stagedTimePeriods, label]);
                            }
                          }}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderRadius: '100px',
                            textAlign: 'left',
                            width: '100%'
                          }}
                        >
                          <span>{label}</span>
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>{time}</span>
                        </StatefulButton>
                      );
                    })}
                    </div>
                  </>
                )}
              </div>

              {/* Divider */}
              <div style={{
                borderTop: 'var(--border-width) solid var(--border-default)',
                marginTop: '24px',
                marginLeft: '-24px',
                marginRight: '-24px'
              }} />

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                padding: '20px 0 0 0',
                justifyContent: 'flex-end'
              }}>
                <Button
                  variant="tertiary"
                  size="medium"
                  onClick={handleResetDaysFilter}
                  disabled={!hasDaysChanges}
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                  }}
                  onMouseEnter={(e) => {
                    if (hasDaysChanges) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                  }}
                >
                  Reset
                </Button>
                <Button
                  variant="primary"
                  size="medium"
                  onClick={handleApplyDaysFilter}
                  disabled={!hasDaysChanges}
                >
                  Apply
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Map Container */}
      <div
        ref={mapContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0
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
          mapStyle="mapbox://styles/stephencoynerseattle/cmgifl16g001u01s6699hg7iv"
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
        left: isFiltersPanelOpen ? '316px' : '76px',
        width: '360px',
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '0 28px 28px 0',
        padding: '24px 12px 0 12px',
        fontFamily: 'Inter, sans-serif',
        zIndex: 1001,
        overflowX: 'hidden',
        transition: 'left 300ms ease-in-out',
        border: '0.5px solid var(--border-default)',
        borderLeft: 'none',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {selectedRouteId || selectedStopId ? (
          /* Detail View for Selected Route/Stop */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Back Button and Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginTop: '-4px',
              marginBottom: '4px',
              cursor: 'pointer',
              flexShrink: 0
            }}
            onClick={() => {
              setSelectedRouteId(null);
              setSelectedStopId(null);
            }}>
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.1231 1.32543C10.5503 0.891944 11.2429 0.891752 11.67 1.32543C12.097 1.75919 12.097 2.46299 11.67 2.89672L6.64658 7.99633L11.6778 13.1047C12.1045 13.5384 12.1045 14.2414 11.6778 14.675C11.2507 15.1088 10.5581 15.1087 10.131 14.675L4.42001 8.87719C4.3857 8.84984 4.35203 8.82043 4.3204 8.78832C4.10691 8.57146 4.0001 8.28736 4.00009 8.00317C3.99644 7.71413 4.10225 7.4239 4.31943 7.20336C4.35442 7.16784 4.39152 7.13541 4.42978 7.10571L10.1231 1.32543Z" fill="currentColor"/>
              </svg>
              <div className="heading-1" style={{
                color: 'var(--text-primary)'
              }}>
                {selectedRouteId ? (routesList.find((r) => r.id === selectedRouteId)?.name || `Route ${selectedRouteId}`) : (stopsList.find((s) => s.id === selectedStopId)?.name || 'Stop')}
              </div>
            </div>

            {/* Summary/Trips/Grid Tabs */}
            <div style={{
              position: 'relative',
              marginLeft: '-12px',
              marginRight: '-12px',
              flexShrink: 0
            }}>
              {/* Horizontal divider line */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '1px',
                backgroundColor: 'var(--border-default)'
              }} />

              {/* Tabs */}
              <div style={{
                display: 'flex',
                gap: '24px',
                paddingLeft: '12px'
              }}>
                {(['Summary', 'Trips', 'Grid'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSelectedRouteTab(tab)}
                    style={{
                      position: 'relative',
                      padding: '12px 0',
                      border: 'none',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 'var(--button-small-size)',
                      fontWeight: selectedRouteTab === tab ? 'var(--button-small-weight)' : '400',
                      color: selectedRouteTab === tab ? 'var(--text-primary)' : 'var(--text-disabled)',
                      lineHeight: 'var(--button-small-line-height)',
                      transition: 'color 0.2s ease'
                    }}
                  >
                    {tab}
                    {/* Underline indicator for selected tab */}
                    {selectedRouteTab === tab && (
                      <div style={{
                        position: 'absolute',
                        bottom: '0',
                        left: 0,
                        right: 0,
                        height: '2px',
                        backgroundColor: 'var(--text-primary)',
                        borderTopLeftRadius: '2px',
                        borderTopRightRadius: '2px'
                      }} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            {selectedRouteTab === 'Summary' ? (
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingTop: '12px', paddingBottom: '24px' }}>
                <MetricCard
                  value={selectedRouteId
                    ? (routesList.find((r) => r.id === selectedRouteId)?.value || 0)
                    : (stopsList.find((s) => s.id === selectedStopId)?.value || 0)
                  }
                />
                <ByDateChart data={chartDataByDate} gradientId="colorValue" />
                <ByDayChart data={mockDataByDay} average={averageDailyByDay} />
                <ByPeriodChart
                  data={mockDataByPeriod}
                  colors={PERIOD_COLORS}
                  activePieIndex={activePieIndex}
                  setActivePieIndex={setActivePieIndex}
                />
              </div>
            ) : selectedRouteTab === 'Trips' ? (
              /* Trips View */
              <div
                ref={tripsScrollRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  paddingBottom: '24px'
                }}
              >
                {routeTrips.length === 0 ? (
                  <div style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 'var(--body-size)'
                  }}>
                    No trips available for this route
                  </div>
                ) : (
                  routeTrips
                    .filter(patternGroup => !selectedPattern || patternGroup.headsign === selectedPattern)
                    .map((patternGroup, groupIndex) => {
                      const maxRidership = Math.max(...patternGroup.trips.map(t => t.ridership));

                      return (
                        <div key={groupIndex} style={{ marginTop: groupIndex > 0 ? '16px' : 0 }}>
                          {/* Pattern Title - Sticky */}
                          <div className="data-small" style={{
                            position: 'sticky',
                            top: 0,
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            paddingTop: '12px',
                            paddingBottom: '12px',
                            zIndex: 10
                          }}>
                            {patternGroup.headsign}
                          </div>

                          {/* Trips List */}
                          <div style={{ position: 'relative' }}>
                            {/* Grid Lines Background */}
                            <div style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: '68px', // 60px (time label width) + 8px (gap)
                              right: 0,
                              display: 'flex',
                              pointerEvents: 'none',
                              zIndex: 0
                            }}>
                              {[0, 20, 40, 60, 80, 100].map((percent, i) => (
                                <div
                                  key={i}
                                  style={{
                                    position: 'absolute',
                                    left: `${percent}%`,
                                    top: 0,
                                    bottom: 0,
                                    width: '1px',
                                    backgroundColor: 'var(--border-default)',
                                    opacity: 0.5
                                  }}
                                />
                              ))}
                            </div>

                            {/* Trips */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingBottom: '8px', position: 'relative', zIndex: 1 }}>
                              {patternGroup.trips.map((trip, tripIndex) => {
                                const barWidth = (trip.ridership / maxRidership) * 100;
                                const tripKey = `${groupIndex}-${tripIndex}`;
                                const showTooltip = hoveredTrip === tripKey;

                                return (
                                  <div
                                    key={tripIndex}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px'
                                    }}
                                  >
                                    {/* Time Label */}
                                    <div className="caption" style={{
                                      color: 'var(--text-tertiary)',
                                      minWidth: '60px',
                                      flexShrink: 0
                                    }}>
                                      {formatTime12Hour(trip.start_time)}
                                    </div>

                                    {/* Bar with Tooltip */}
                                    <div
                                      style={{
                                        position: 'relative',
                                        height: '24px',
                                        width: `${barWidth}%`,
                                      }}
                                      onMouseEnter={() => setHoveredTrip(tripKey)}
                                      onMouseLeave={() => setHoveredTrip(null)}
                                    >
                                      <div
                                        style={{
                                          height: '100%',
                                          backgroundColor: 'var(--border-hover)',
                                          borderRadius: '4px',
                                          transition: 'width 0.3s ease',
                                          cursor: 'pointer'
                                        }}
                                      />
                                      {showTooltip && (
                                        <div
                                          className="label"
                                          style={{
                                            position: 'absolute',
                                            bottom: 'calc(100% + 8px)',
                                            left: '0',
                                            backgroundColor: 'var(--btn-primary)',
                                            color: 'var(--text-btn-primary)',
                                            padding: '8px 12px',
                                            borderRadius: 'var(--radius-sm)',
                                            whiteSpace: 'nowrap',
                                            zIndex: 9999,
                                            boxShadow: 'var(--shadow-lg)',
                                            pointerEvents: 'none'
                                          }}
                                        >
                                          <div>{formatTime12Hour(trip.start_time)}</div>
                                          <div>{trip.ridership} average daily boardings</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            ) : (
              /* Grid View - Placeholder */
              <div style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                paddingBottom: '24px'
              }}>
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 'var(--body-size)'
                }}>
                  Grid view coming soon
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'system' ? (
          /* System View - Aggregated Charts */
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: '24px' }}>
            {/* Charts */}
            <MetricCard value="8,973" />
            <ByDateChart data={chartDataByDate} gradientId="colorValueSystem" />
            <ByDayChart data={mockDataByDay} average={averageDailyByDay} />
            <ByPeriodChart
              data={mockDataByPeriod}
              colors={PERIOD_COLORS}
              activePieIndex={activePieIndex}
              setActivePieIndex={setActivePieIndex}
            />
          </div>
        ) : activeTab === 'components' ? (
          /* Components View - Showcase */
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: '24px' }}>
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '500', marginBottom: '24px', color: 'var(--text-primary)' }}>
                UI Components
              </h2>

              {/* Buttons Section */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px', color: 'var(--text-secondary)' }}>
                  Buttons
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <Button variant="primary" size="medium" style={{ width: '100%' }}>Primary</Button>
                  <Button variant="secondary" size="medium" style={{ width: '100%' }}>Secondary</Button>
                  <Button variant="tertiary" size="medium" style={{ width: '100%' }}>Tertiary</Button>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="primary" size="small">Primary</Button>
                    <Button variant="secondary" size="small">Secondary</Button>
                    <Button variant="tertiary" size="small">Tertiary</Button>
                  </div>
                </div>
              </div>

              {/* Cards Section */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px', color: 'var(--text-secondary)' }}>
                  Cards
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <Card>
                    <div style={{ padding: '16px' }}>
                      <h4 style={{ marginBottom: '8px', fontSize: '16px', fontWeight: '500' }}>Card Title</h4>
                      <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>This is a basic card component with some example content.</p>
                    </div>
                  </Card>
                  <Card>
                    <div style={{ padding: '16px' }}>
                      <h4 style={{ marginBottom: '8px', fontSize: '16px', fontWeight: '500' }}>Another Card</h4>
                      <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Cards can contain any content you need.</p>
                    </div>
                  </Card>
                </div>
              </div>

              {/* Inputs Section */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px', color: 'var(--text-secondary)' }}>
                  Inputs
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <Input placeholder="Enter text here..." />
                  <Input placeholder="Disabled input" disabled />
                  <Input placeholder="Input with default value" defaultValue="Sample text" />
                  <Input label="Input Label" placeholder="Input with label" />
                </div>
              </div>

              {/* Select Section */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px', color: 'var(--text-secondary)' }}>
                  Select
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <Select
                    options={[
                      { value: 'option1', label: 'Option 1' },
                      { value: 'option2', label: 'Option 2' },
                      { value: 'option3', label: 'Option 3' }
                    ]}
                    value="option1"
                    onChange={() => {}}
                    placeholder="Select an option"
                  />
                  <Select
                    label="Select Label"
                    options={[
                      { value: 'option1', label: 'Option 1' },
                      { value: 'option2', label: 'Option 2' },
                      { value: 'option3', label: 'Option 3' }
                    ]}
                    placeholder="Select with label"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Routes/Stops View - List */
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: '24px' }}>
            {/* Sort and Filter Buttons - DISABLED FOR NOW */}
            {/* <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '24px'
            }}>
              <SortButton
                sortBy={sortBy}
                sortOrder={sortOrder}
                options={[
                  { value: 'route', label: 'Route' },
                  { value: 'metric', label: selectedMetric }
                ]}
                onSortByChange={(value) => setSortBy(value as 'route' | 'metric')}
                onSortOrderToggle={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              />
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
            </div> */}

            {/* List Items */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0'
            }}>
              {(activeTab === 'routes' ? routesList : stopsList).map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (activeTab === 'routes') {
                      setSelectedRouteId(item.id);
                    } else {
                      setSelectedStopId(item.id);
                    }
                  }}
                  style={{
                    cursor: 'pointer'
                  }}>
                  <MetricCard value={item.value} title={item.name} />
                </div>
              ))}
            </div>
          </div>
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
