'use client';

import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import MapboxMap from 'react-map-gl/mapbox';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer, TextLayer, IconLayer } from '@deck.gl/layers';
import { CompositeLayer, Layer } from '@deck.gl/core';
import { fetchShapesKCM, fetchStopsKCM, fetchRouteStopsMap, fetchPatternLookup, fetchRoutePatterns, PatternInfo, RoutePatternInfo, TripsByPattern, Trip, fetchRouteTrips, organizeTripsbyPattern, getTripStopTimes, TripStopTime } from '@/lib/data/loaders';
import { WebMercatorViewport } from '@deck.gl/core';
import NavRail from '@/components/NavRail';
import { Button, Card, Input, Select, StatefulButton } from '@/components/ui';
import { Tooltip } from '@/components/ui/Tooltip';
import { MetricCard, ByDateChart, ByDayChart, ByPeriodChart } from '@/components/charts';
import MapScale from '@/components/MapScale';
import { valueToColor, getValueRange } from '@/lib/utils/colorScale';

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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  // Nav rail (72px) + Data panel (376px) + margins (24px) = 472px total
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
  // NavRail: 72px, Filters panel: 256px (when open), Data panel: 376px
  // Margins: 12px between panels, 12px from screen edges
  const navRailWidth = 72;
  const filtersPanelWidth = isFiltersPanelOpen ? 256 : 0;
  const dataPanelWidth = 376;
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
  // Handle GTFS times which can be >= 24 for trips past midnight
  const hour = parseInt(hourStr, 10) % 24;
  const minute = minuteStr;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  // Convert to 12-hour format
  let hour12: number;
  if (hour === 0) {
    hour12 = 12;
  } else if (hour > 12) {
    hour12 = hour - 12;
  } else {
    hour12 = hour;
  }
  return `${hour12}:${minute} ${ampm}`;
}

// Type for route label data
interface RouteLabelData {
  position: [number, number];
  text: string;
  color: [number, number, number];
  routeId: string;
}

// Props for RouteLabelLayer
interface RouteLabelLayerProps {
  data: RouteLabelData[];
  hoveredRouteId: string | null;
}

// Custom CompositeLayer for route labels with pill backgrounds
class RouteLabelLayer extends CompositeLayer<RouteLabelLayerProps> {
  renderLayers() {
    const { data, hoveredRouteId } = this.props;

    // Create pill background icon as data URL
    // Padding: 6px top/bottom, 10px left/right
    const createPillIcon = (color: number[], textWidth: number, isHovered: boolean) => {
      const paddingX = 10;
      const paddingY = 6;
      const borderWidth = 4;
      const width = textWidth + (paddingX * 2);
      const height = 14 + (paddingY * 2); // 14pt font + 6px padding top/bottom = 26px

      // Account for border width in canvas size
      const canvasWidth = width + borderWidth;
      const canvasHeight = height + borderWidth;
      const offset = borderWidth / 2; // Center the shape with border

      const canvas = document.createElement('canvas');
      // Use higher resolution for crisp rendering
      canvas.width = canvasWidth * 2;
      canvas.height = canvasHeight * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';

      // Scale context for high DPI
      ctx.scale(2, 2);

      // Draw fully rounded rectangle (pill shape) - using full radius for both inner and outer
      const radius = height / 2;
      ctx.beginPath();
      ctx.moveTo(radius + offset, offset);
      ctx.lineTo(width - radius + offset, offset);
      ctx.quadraticCurveTo(width + offset, offset, width + offset, radius + offset);
      ctx.lineTo(width + offset, height - radius + offset);
      ctx.quadraticCurveTo(width + offset, height + offset, width - radius + offset, height + offset);
      ctx.lineTo(radius + offset, height + offset);
      ctx.quadraticCurveTo(offset, height + offset, offset, height - radius + offset);
      ctx.lineTo(offset, radius + offset);
      ctx.quadraticCurveTo(offset, offset, radius + offset, offset);
      ctx.closePath();

      // Fill white
      ctx.fillStyle = 'white';
      ctx.fill();

      // Stroke with route color - full opacity if hovered, 40% if not
      const opacity = isHovered ? 1 : 0.4;
      ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`;
      ctx.lineWidth = borderWidth;
      ctx.stroke();

      return canvas.toDataURL();
    };

    // Group data by route ID to create separate icon layers (for opacity control)
    const routeGroups: { [key: string]: RouteLabelData[] } = {};
    (data as RouteLabelData[]).forEach((d) => {
      const routeId = d.routeId;
      if (!routeGroups[routeId]) {
        routeGroups[routeId] = [];
      }
      routeGroups[routeId].push(d);
    });

    const layers: Layer[] = [];

    // Measure exact text width using canvas
    const measureTextWidth = (text: string) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return text.length * 9; // Fallback estimate
      ctx.font = '600 14px Inter, sans-serif'; // semibold 14px
      return ctx.measureText(text).width;
    };

    // Create one IconLayer per route for opacity control
    Object.entries(routeGroups).forEach(([routeId, groupData]) => {
      const color = groupData[0].color;
      // Use first item's text to measure exact size
      const sampleText = groupData[0].text || '00';
      const textWidth = measureTextWidth(sampleText);
      const isHovered = hoveredRouteId ? routeId === hoveredRouteId : true;
      const iconAtlas = createPillIcon(color, textWidth, isHovered);

      // Calculate dimensions with padding and border
      const paddingX = 10;
      const paddingY = 6;
      const borderWidth = 4;
      const width = textWidth + (paddingX * 2);
      const height = 14 + (paddingY * 2);
      const canvasWidth = width + borderWidth;
      const canvasHeight = height + borderWidth;

      const iconMapping = {
        pill: { x: 0, y: 0, width: canvasWidth * 2, height: canvasHeight * 2, mask: false }
      };

      layers.push(
        new IconLayer({
          id: `${this.props.id}-background-${routeId}`,
          data: groupData,
          getPosition: (d: RouteLabelData) => d.position,
          getIcon: () => 'pill',
          getSize: 22, // Height with padding: 14 + 4 + 4
          iconAtlas,
          iconMapping,
          sizeScale: 1,
          billboard: true,
          pickable: this.props.pickable,
          opacity: 1, // Keep all labels at full opacity
          updateTriggers: {
            getIcon: [hoveredRouteId, isHovered] // Force icon recreation when hover state changes
          }
        })
      );
    });

    // Add text layer on top - using text-primary color (#1A1410) and semibold (600)
    layers.push(
      new TextLayer({
        id: `${this.props.id}-text`,
        data,
        getPosition: (d: RouteLabelData) => d.position,
        getText: (d: RouteLabelData) => d.text,
        getSize: 14,
        getColor: (d: RouteLabelData) => {
          // text-primary when hovered or no hover, text-disabled when another route is hovered
          if (!hoveredRouteId || d.routeId === hoveredRouteId) {
            return [26, 20, 16, 255]; // --text-primary: #1A1410
          }
          return [139, 128, 137, 255]; // --text-disabled: #8B8089
        },
        fontFamily: 'Inter, sans-serif',
        fontWeight: 600, // semibold
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        billboard: true,
        pickable: this.props.pickable,
      })
    );

    return layers;
  }
}

RouteLabelLayer.layerName = 'RouteLabelLayer';
RouteLabelLayer.defaultProps = {};

export default function MapCanvas() {
  const [shapes, setShapes] = useState<RouteFeature[]>([]);
  const [stops, setStops] = useState<StopFeature[]>([]);
  const [routeStopsMap, setRouteStopsMap] = useState<{ [routeId: string]: Set<string> }>({});
  const [activeTab, setActiveTab] = useState<'system' | 'routes' | 'stops' | 'components'>('system');
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const [hoveredStop, setHoveredStop] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null); // Index of hovered segment
  const [selectedBoardingStop, setSelectedBoardingStop] = useState<string | null>(null); // Selected stop in boardings card
  const [tooltipStopIndex, setTooltipStopIndex] = useState<number | null>(null); // Index of stop showing tooltip
  const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
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

  // Track which pattern cards have sticky headers
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [stickyPatterns, setStickyPatterns] = useState<Set<number>>(new Set());

  // Track scroll position for smooth border radius animation
  const [scrollProgress, setScrollProgress] = useState(0);

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

  // State for selected trip (for trip detail view)
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedTripStops, setSelectedTripStops] = useState<TripStopTime[]>([]);
  const [isTripContentScrolled, setIsTripContentScrolled] = useState(false);

  // Tooltip state for trips
  const [tripTooltip, setTripTooltip] = useState<{
    show: boolean;
    time: string;
    ridership: number;
    x: number;
    y: number;
  } | null>(null);

  // Ref for trips scroll container
  const tripsScrollRef = useRef<HTMLDivElement>(null);

  // Trip filtering and sorting state - Applied state (what's actually being used)
  const [appliedTripFilterMin, setAppliedTripFilterMin] = useState<number | null>(null);
  const [appliedTripFilterMax, setAppliedTripFilterMax] = useState<number | null>(null);
  // Staged state (temporary changes in the picker)
  const [stagedTripFilterMin, setStagedTripFilterMin] = useState<number | null>(null);
  const [stagedTripFilterMax, setStagedTripFilterMax] = useState<number | null>(null);
  // Original state when picker was opened (for Reset)
  const [originalTripFilterMin, setOriginalTripFilterMin] = useState<number | null>(null);
  const [originalTripFilterMax, setOriginalTripFilterMax] = useState<number | null>(null);

  const [tripSortBy, setTripSortBy] = useState<'ridership' | 'time'>('time');
  const [tripSortOrder, setTripSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isTripFilterMenuOpen, setIsTripFilterMenuOpen] = useState(false);
  const [isTripSortMenuOpen, setIsTripSortMenuOpen] = useState(false);
  const [isFilterButtonHovered, setIsFilterButtonHovered] = useState(false);
  const [isSortButtonHovered, setIsSortButtonHovered] = useState(false);
  const tripFilterButtonRef = useRef<HTMLButtonElement>(null);
  const tripSortButtonRef = useRef<HTMLButtonElement>(null);

  // Stop filter/sort state
  const [appliedStopFilterMin, setAppliedStopFilterMin] = useState<number | null>(null);
  const [appliedStopFilterMax, setAppliedStopFilterMax] = useState<number | null>(null);
  const [stagedStopFilterMin, setStagedStopFilterMin] = useState<number | null>(null);
  const [stagedStopFilterMax, setStagedStopFilterMax] = useState<number | null>(null);
  const [originalStopFilterMin, setOriginalStopFilterMin] = useState<number | null>(null);
  const [originalStopFilterMax, setOriginalStopFilterMax] = useState<number | null>(null);

  const [appliedStopAmenityFilters, setAppliedStopAmenityFilters] = useState<Map<string, boolean>>(new Map());
  const [stagedStopAmenityFilters, setStagedStopAmenityFilters] = useState<Map<string, boolean>>(new Map());

  const [stopSortBy, setStopSortBy] = useState<'name' | 'ridership'>('ridership');
  const [stopSortOrder, setStopSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isStopFilterMenuOpen, setIsStopFilterMenuOpen] = useState(false);
  const [isStopSortMenuOpen, setIsStopSortMenuOpen] = useState(false);
  const [isStopFilterButtonHovered, setIsStopFilterButtonHovered] = useState(false);
  const [isStopSortButtonHovered, setIsStopSortButtonHovered] = useState(false);
  const [isStopsListScrolled, setIsStopsListScrolled] = useState(false);
  const stopFilterButtonRef = useRef<HTMLButtonElement>(null);
  const stopSortButtonRef = useRef<HTMLButtonElement>(null);

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
  const [appliedDaysMode, setAppliedDaysMode] = useState<'all' | 'weekdays' | 'weekends' | 'custom'>('all');
  const [appliedCustomDays, setAppliedCustomDays] = useState<string[]>([]);
  const [appliedTimeMode, setAppliedTimeMode] = useState<'all' | 'custom'>('all');
  const [appliedTimePeriods, setAppliedTimePeriods] = useState<string[]>([]);

  // Staged state (temporary changes in the picker)
  const [stagedDaysMode, setStagedDaysMode] = useState<'all' | 'weekdays' | 'weekends' | 'custom'>('all');
  const [stagedCustomDays, setStagedCustomDays] = useState<string[]>([]);
  const [stagedTimeMode, setStagedTimeMode] = useState<'all' | 'custom'>('all');
  const [stagedTimePeriods, setStagedTimePeriods] = useState<string[]>([]);

  // Original state when picker was opened (for Reset)
  const [originalDaysMode, setOriginalDaysMode] = useState<'all' | 'weekdays' | 'weekends' | 'custom'>('all');
  const [originalCustomDays, setOriginalCustomDays] = useState<string[]>([]);
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
  const [stopAmenities, setStopAmenities] = React.useState<{ [key: string]: { [amenity: string]: boolean } }>({});

  // Define available amenities
  const STOP_AMENITIES = [
    'Bench',
    'Bike Rack',
    'Covered Waiting Area',
    'Lighting',
    'Real-time Display',
    'Seating',
    'Shelter',
    'Tactile Paving',
    'Trash Can',
    'Wheelchair Access'
  ];

  // Extract unique routes from shapes data with mock values
  const routesList = React.useMemo(() => {
    const uniqueRoutes: { [key: string]: { id: string; name: string; value: number; shortName: string } } = {};
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
          value: newMockValues[routeId],
          shortName: routeShortName
        };
      }
    });

    // Update state if new values were generated
    if (Object.keys(newMockValues).length !== Object.keys(routeMockValues).length) {
      setRouteMockValues(newMockValues);
    }

    const routes = Object.values(uniqueRoutes);

    // Sort by route short name number (convert to number for proper numeric sorting)
    return routes.sort((a, b) => {
      const aNum = parseInt(a.shortName, 10);
      const bNum = parseInt(b.shortName, 10);
      return aNum - bNum;
    });
  }, [shapes, routeMockValues]);

  // Extract stops data with mock values and amenities
  const stopsList = React.useMemo(() => {
    const newMockValues: { [key: string]: number } = { ...stopMockValues };
    const newAmenities: { [key: string]: { [amenity: string]: boolean } } = { ...stopAmenities };

    const stopsWithValues = stops.map(stop => {
      const stopId = stop.properties.stop_id;
      // Use existing mock value or generate new one only if it doesn't exist
      if (!newMockValues[stopId]) {
        newMockValues[stopId] = Math.floor(Math.random() * 500) + 50;
      }
      // Generate amenities if they don't exist
      if (!newAmenities[stopId]) {
        newAmenities[stopId] = {};
        STOP_AMENITIES.forEach(amenity => {
          // ~60% chance of having each amenity
          newAmenities[stopId][amenity] = Math.random() > 0.4;
        });
      }
      return {
        id: stopId,
        name: stop.properties.name,
        value: newMockValues[stopId],
        amenities: newAmenities[stopId]
      };
    });

    // Update state if new values were generated
    if (Object.keys(newMockValues).length !== Object.keys(stopMockValues).length) {
      setStopMockValues(newMockValues);
    }
    if (Object.keys(newAmenities).length !== Object.keys(stopAmenities).length) {
      setStopAmenities(newAmenities);
    }

    return stopsWithValues.sort((a, b) => b.value - a.value);
  }, [stops, stopMockValues, stopAmenities, STOP_AMENITIES]);

  // Create filtered and sorted stopsList for display
  const filteredAndSortedStopsList = React.useMemo(() => {
    let filtered = stopsList;

    // Apply ridership filter
    if (appliedStopFilterMin !== null || appliedStopFilterMax !== null) {
      filtered = filtered.filter(stop => {
        return (
          (appliedStopFilterMin === null || stop.value >= appliedStopFilterMin) &&
          (appliedStopFilterMax === null || stop.value <= appliedStopFilterMax)
        );
      });
    }

    // Apply amenity filters
    if (appliedStopAmenityFilters.size > 0) {
      filtered = filtered.filter(stop => {
        // Stop must match ALL amenity filter conditions
        return Array.from(appliedStopAmenityFilters.entries()).every(([amenity, required]) =>
          stop.amenities[amenity] === required
        );
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      if (stopSortBy === 'name') {
        const comparison = a.name.localeCompare(b.name);
        return stopSortOrder === 'asc' ? comparison : -comparison;
      } else {
        // Sort by ridership
        return stopSortOrder === 'asc'
          ? a.value - b.value
          : b.value - a.value;
      }
    });

    return sorted;
  }, [stopsList, appliedStopFilterMin, appliedStopFilterMax, appliedStopAmenityFilters, stopSortBy, stopSortOrder]);

  // Filter data based on selection
  const filteredShapes = React.useMemo(() => {
    // If a trip is selected, show only that trip's shape
    if (selectedTrip) {
      return shapes.filter(shape => shape.properties.shape_id === selectedTrip.shape_id);
    }

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

    // In system view, show only the longest pattern per route
    if (Object.keys(patternLookup).length > 0) {
      const longestShapePerRoute: { [routeId: string]: string } = {};

      // Find the shape with highest shape_length for each route
      shapes.forEach(shape => {
        const routeId = shape.properties.route_id;
        const shapeId = shape.properties.shape_id;
        const patternInfo = patternLookup[shapeId];

        if (patternInfo && patternInfo.shape_length) {
          if (!longestShapePerRoute[routeId]) {
            longestShapePerRoute[routeId] = shapeId;
          } else {
            const currentShapeId = longestShapePerRoute[routeId];
            const currentPattern = patternLookup[currentShapeId];
            if (patternInfo.shape_length > (currentPattern.shape_length || 0)) {
              longestShapePerRoute[routeId] = shapeId;
            }
          }
        }
      });

      // Filter to only include the longest shape per route
      return shapes.filter(shape =>
        longestShapePerRoute[shape.properties.route_id] === shape.properties.shape_id
      );
    }

    return shapes;
  }, [shapes, selectedRouteId, selectedPattern, patternLookup, selectedTrip]);

  const filteredStops = React.useMemo(() => {
    // If a trip is selected, show only stops from that trip
    if (selectedTrip && selectedTripStops.length > 0) {
      const tripStopIds = new Set(selectedTripStops.map(s => s.id));
      return stops.filter(stop => tripStopIds.has(stop.properties.stop_id));
    }

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
    if (activeTab === 'stops') {
      // Apply stop filters when in stops tab
      const filteredStopIds = new Set(filteredAndSortedStopsList.map(s => s.id));
      return stops.filter(stop => filteredStopIds.has(stop.properties.stop_id));
    }

    return [];
  }, [stops, selectedStopId, selectedRouteId, selectedPattern, routeStopsMap, routePatterns, activeTab, selectedTrip, selectedTripStops, filteredAndSortedStopsList]);

  // Check if we should show segment-based coloring (for load metrics in route detail view)
  const isLoadMetric = selectedMetric === 'Average load' || selectedMetric === 'Maxload';
  const showSegmentColoring = selectedRouteId && isLoadMetric;

  // Generate segments between consecutive stops with mock load values (needed before value range calculation)
  const segmentGeoms = React.useMemo(() => {
    if (!showSegmentColoring || !routePatterns[selectedRouteId]) {
      return [];
    }

    // Get patterns to process - either selected pattern or all patterns
    const patternsToProcess = selectedPattern
      ? [routePatterns[selectedRouteId].patterns.find(p => p.headsign === selectedPattern)].filter(Boolean)
      : routePatterns[selectedRouteId].patterns; // Show ALL patterns when none selected

    if (patternsToProcess.length === 0) {
      return [];
    }

    // Create a map of stop_id -> coordinates
    const stopCoords = new Map<string, [number, number]>();
    filteredStops.forEach(stop => {
      const coords = stop.geometry.coordinates as [number, number];
      stopCoords.set(stop.properties.stop_id, coords);
    });

    // Helper function to find the closest point on the shape to a stop
    const findClosestPointIndex = (stopCoord: [number, number], shapeCoords: number[][]): number => {
      let minDist = Infinity;
      let closestIndex = 0;

      shapeCoords.forEach((coord, index) => {
        const dx = coord[0] - stopCoord[0];
        const dy = coord[1] - stopCoord[1];
        const dist = dx * dx + dy * dy; // squared distance is fine for comparison

        if (dist < minDist) {
          minDist = dist;
          closestIndex = index;
        }
      });

      return closestIndex;
    };

    // Generate segments for all patterns
    const segments: Array<{
      path: number[][];
      fromStopId: string;
      toStopId: string;
      loadValue: number;
      properties: RouteFeature['properties'];
      patternHeadsign: string;
    }> = [];

    patternsToProcess.forEach(patternInfo => {
      if (!patternInfo || !patternInfo.stop_ids || patternInfo.stop_ids.length < 2) {
        return;
      }

      // Get the shape for this pattern (use the first shape_id)
      const patternShapeId = patternInfo.shape_ids?.[0];
      const patternShape = filteredShapes.find(s => s.properties.shape_id === patternShapeId);

      if (!patternShape || patternShape.geometry.type !== 'LineString') {
        return;
      }

      const shapeCoords = patternShape.geometry.coordinates as number[][];

      for (let i = 0; i < patternInfo.stop_ids.length - 1; i++) {
        const fromStopId = patternInfo.stop_ids[i];
        const toStopId = patternInfo.stop_ids[i + 1];

        const fromCoords = stopCoords.get(fromStopId);
        const toCoords = stopCoords.get(toStopId);

        if (fromCoords && toCoords) {
          // Find the closest points on the shape to these stops
          const fromIndex = findClosestPointIndex(fromCoords, shapeCoords);
          const toIndex = findClosestPointIndex(toCoords, shapeCoords);

          // Extract the portion of the shape between these two stops
          let segmentPath: number[][];
          if (fromIndex < toIndex) {
            segmentPath = shapeCoords.slice(fromIndex, toIndex + 1);
            // Replace first and last coordinates with exact stop positions
            segmentPath[0] = fromCoords;
            segmentPath[segmentPath.length - 1] = toCoords;
          } else {
            // Handle reverse direction (shouldn't normally happen, but just in case)
            segmentPath = [fromCoords, toCoords];
          }

          // Generate deterministic mock load value based on segment (20-100 for passenger load)
          const hash = (fromStopId + toStopId).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const loadValue = 20 + (hash % 81); // Range 20-100

          segments.push({
            path: segmentPath,
            fromStopId,
            toStopId,
            loadValue,
            properties: patternShape.properties,
            patternHeadsign: patternInfo.headsign
          });
        }
      }
    });

    return segments;
  }, [showSegmentColoring, selectedPattern, selectedRouteId, routePatterns, filteredStops, filteredShapes]);

  // Calculate value range for segments
  const segmentValueRange = React.useMemo(() => {
    if (segmentGeoms.length === 0) return { min: 0, max: 100 };
    const values = segmentGeoms.map(s => s.loadValue);
    return getValueRange(values);
  }, [segmentGeoms]);

  // Calculate value ranges for the color scale
  // This needs to be based on what's currently visible on the map
  const { routeValueRange, stopValueRange, scaleTitle } = React.useMemo(() => {
    // Determine which data to show based on view
    if (selectedRouteId || activeTab === 'stops') {
      // If showing segment coloring, use segment range
      if (showSegmentColoring) {
        return {
          routeValueRange: { min: 0, max: 0 },
          stopValueRange: segmentValueRange,
          scaleTitle: selectedMetric,
        };
      }

      // Route detail view OR stops tab - show stop data
      const visibleStopIds = new Set(filteredStops.map(s => s.properties.stop_id));
      const visibleStopValues = stopsList
        .filter(stop => visibleStopIds.has(stop.id))
        .map(stop => stop.value);

      return {
        routeValueRange: { min: 0, max: 0 },
        stopValueRange: getValueRange(visibleStopValues),
        scaleTitle: selectedMetric,
      };
    } else {
      // System view or routes tab - show route data
      const visibleRouteIds = new Set(filteredShapes.map(s => s.properties.route_id));
      const visibleRouteValues = routesList
        .filter(route => visibleRouteIds.has(route.id))
        .map(route => route.value);

      return {
        routeValueRange: getValueRange(visibleRouteValues),
        stopValueRange: { min: 0, max: 0 },
        scaleTitle: selectedMetric,
      };
    }
  }, [selectedRouteId, activeTab, filteredShapes, filteredStops, routesList, stopsList, selectedMetric, showSegmentColoring, segmentValueRange]);

  // Create lookup maps for values
  const routeValueMap = React.useMemo(() => {
    const map = new Map<string, number>();
    routesList.forEach(route => map.set(route.id, route.value));
    return map;
  }, [routesList]);

  const stopValueMap = React.useMemo(() => {
    const map = new Map<string, number>();
    stopsList.forEach(stop => map.set(stop.id, stop.value));
    return map;
  }, [stopsList]);

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
    // Guard against invalid dimensions
    if (width <= 0 || height <= 0) {
      return null;
    }
    // Guard against invalid or degenerate bounds
    const boundsArray = bounds as [[number, number], [number, number]];
    if (!boundsArray || boundsArray.length !== 2 ||
        !Number.isFinite(boundsArray[0][0]) || !Number.isFinite(boundsArray[0][1]) ||
        !Number.isFinite(boundsArray[1][0]) || !Number.isFinite(boundsArray[1][1]) ||
        (boundsArray[0][0] === boundsArray[1][0] && boundsArray[0][1] === boundsArray[1][1])) {
      return null;
    }
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // When trip filter menu opens, capture current applied state as both original and staged
  useEffect(() => {
    if (isTripFilterMenuOpen) {
      // Capture original state for Reset
      setOriginalTripFilterMin(appliedTripFilterMin);
      setOriginalTripFilterMax(appliedTripFilterMax);
      // Initialize staged state from applied state
      setStagedTripFilterMin(appliedTripFilterMin);
      setStagedTripFilterMax(appliedTripFilterMax);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTripFilterMenuOpen]);

  // When stop filter menu opens, capture current applied state as both original and staged
  useEffect(() => {
    if (isStopFilterMenuOpen) {
      setOriginalStopFilterMin(appliedStopFilterMin);
      setOriginalStopFilterMax(appliedStopFilterMax);
      setStagedStopFilterMin(appliedStopFilterMin);
      setStagedStopFilterMax(appliedStopFilterMax);
      setStagedStopAmenityFilters(new Map(appliedStopAmenityFilters));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStopFilterMenuOpen]);

  // Cleanup tooltip timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  // Handle Apply button for trip filter
  const handleApplyTripFilter = () => {
    setAppliedTripFilterMin(stagedTripFilterMin);
    setAppliedTripFilterMax(stagedTripFilterMax);
    setIsTripFilterMenuOpen(false);
  };

  // Handle Reset button for trip filter - clears filters entirely and closes menu
  const handleResetTripFilter = () => {
    setStagedTripFilterMin(null);
    setStagedTripFilterMax(null);
    setAppliedTripFilterMin(null);
    setAppliedTripFilterMax(null);
    setIsTripFilterMenuOpen(false);
  };

  // Check if there are changes for trip filter (for Apply button)
  const hasTripFilterChanges =
    stagedTripFilterMin !== originalTripFilterMin ||
    stagedTripFilterMax !== originalTripFilterMax;

  // Check if there are any filters to reset (for Reset button)
  const hasTripFiltersToReset =
    stagedTripFilterMin !== null || stagedTripFilterMax !== null;

  // Stop filter handlers
  const handleApplyStopFilter = () => {
    setAppliedStopFilterMin(stagedStopFilterMin);
    setAppliedStopFilterMax(stagedStopFilterMax);
    setAppliedStopAmenityFilters(new Map(stagedStopAmenityFilters));
    setIsStopFilterMenuOpen(false);
  };

  const handleResetStopFilter = () => {
    setStagedStopFilterMin(null);
    setStagedStopFilterMax(null);
    setStagedStopAmenityFilters(new Map());
    setAppliedStopFilterMin(null);
    setAppliedStopFilterMax(null);
    setAppliedStopAmenityFilters(new Map());
    setIsStopFilterMenuOpen(false);
  };

  const hasStopFilterChanges =
    stagedStopFilterMin !== originalStopFilterMin ||
    stagedStopFilterMax !== originalStopFilterMax ||
    stagedStopAmenityFilters.size !== appliedStopAmenityFilters.size ||
    Array.from(stagedStopAmenityFilters.entries()).some(([k, v]) => appliedStopAmenityFilters.get(k) !== v);

  const hasStopFiltersToReset =
    stagedStopFilterMin !== null || stagedStopFilterMax !== null || stagedStopAmenityFilters.size > 0;

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

  // Animate corner radius based on scroll
  useEffect(() => {
    const handleScroll = () => {
      const scrollContainer = tripsScrollRef.current;
      if (!scrollContainer) return;

      const scrollTop = scrollContainer.scrollTop;
      // Calculate progress (0 to 1) over first 20px of scroll
      const progress = Math.min(scrollTop / 20, 1);
      setScrollProgress(progress);
    };

    const scrollContainer = tripsScrollRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      handleScroll(); // Initial call
    }

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, [selectedRouteTab]);

  // Close trip filter/sort menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (isTripFilterMenuOpen && tripFilterButtonRef.current && !tripFilterButtonRef.current.contains(target)) {
        // Check if click is inside the filter menu portal
        const filterMenus = document.querySelectorAll('[data-trip-filter-menu]');
        let clickedInMenu = false;
        filterMenus.forEach(menu => {
          if (menu.contains(target)) {
            clickedInMenu = true;
          }
        });
        if (!clickedInMenu) {
          setIsTripFilterMenuOpen(false);
        }
      }

      if (isTripSortMenuOpen && tripSortButtonRef.current && !tripSortButtonRef.current.contains(target)) {
        // Check if click is inside the sort menu portal
        const sortMenus = document.querySelectorAll('[data-trip-sort-menu]');
        let clickedInMenu = false;
        sortMenus.forEach(menu => {
          if (menu.contains(target)) {
            clickedInMenu = true;
          }
        });
        if (!clickedInMenu) {
          setIsTripSortMenuOpen(false);
        }
      }

      if (isStopFilterMenuOpen && stopFilterButtonRef.current && !stopFilterButtonRef.current.contains(target)) {
        const filterMenus = document.querySelectorAll('[data-stop-filter-menu]');
        let clickedInMenu = false;
        filterMenus.forEach(menu => {
          if (menu.contains(target)) {
            clickedInMenu = true;
          }
        });
        if (!clickedInMenu) {
          setIsStopFilterMenuOpen(false);
        }
      }

      if (isStopSortMenuOpen && stopSortButtonRef.current && !stopSortButtonRef.current.contains(target)) {
        const sortMenus = document.querySelectorAll('[data-stop-sort-menu]');
        let clickedInMenu = false;
        sortMenus.forEach(menu => {
          if (menu.contains(target)) {
            clickedInMenu = true;
          }
        });
        if (!clickedInMenu) {
          setIsStopSortMenuOpen(false);
        }
      }
    };

    if (isTripFilterMenuOpen || isTripSortMenuOpen || isStopFilterMenuOpen || isStopSortMenuOpen) {
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTripFilterMenuOpen, isTripSortMenuOpen, isStopFilterMenuOpen, isStopSortMenuOpen]);

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
            if (initialView) {
              initialFittedViewRef.current = initialView;     // save for later resets
              setViewState(initialView);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load GTFS data:', error);
      }
    })();
  }, [fitToBounds]);

  // Reset pattern filter, trip filters, and sort when route changes
  useEffect(() => {
    setSelectedPattern(null);
    // Reset trip filters
    setAppliedTripFilterMin(null);
    setAppliedTripFilterMax(null);
    setStagedTripFilterMin(null);
    setStagedTripFilterMax(null);
    // Reset sort to default (time ascending)
    setTripSortBy('time');
    setTripSortOrder('asc');
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
      console.log('Cannot organize trips:', {
        selectedRouteId,
        hasPatterns: selectedRouteId ? !!routePatterns[selectedRouteId] : false,
        hasTrips: selectedRouteId ? !!allTripsData[selectedRouteId] : false
      });
      setRouteTrips([]);
    }
  }, [selectedRouteId, routePatterns, allTripsData]);

  // Update view state when route or stop is selected
  useEffect(() => {
    if (selectedRouteId) {
      const routeShapes = shapes.filter(shape => shape.properties.route_id === selectedRouteId);
      if (routeShapes.length > 0) {
        const bounds = calculateBounds(routeShapes);
        if (bounds) {
          const el = mapContainerRef.current;
          const width = el?.clientWidth ?? window.innerWidth;
          const height = el?.clientHeight ?? window.innerHeight;
          const newViewState = fitToBounds(bounds, { width, height });
          if (newViewState) {
            setViewState(newViewState);
          }
        }
      }
    } else if (selectedStopId) {
      // Find the actual selected stop
      const stop = stops.find(s => s.properties.stop_id === selectedStopId);
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
  }, [selectedRouteId, selectedStopId, shapes, stops, fitToBounds, isFiltersPanelOpen]);

  // Memoize DeckGL accessor functions to prevent unnecessary recalculations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getStopPosition = React.useCallback((d: any) => d.geometry.coordinates, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getStopBorderColor = React.useCallback((d: any): [number, number, number, number] => {
    const stopId = d.properties.stop_id;

    // When showing segment coloring (load metrics), use white border
    if (showSegmentColoring) {
      return [255, 255, 255, 255] as [number, number, number, number];
    }

    // Otherwise use data-driven color
    const value = stopValueMap.get(stopId) || 0;
    const color = valueToColor(value, stopValueRange.min, stopValueRange.max);
    const isSelected = selectedStopId === stopId;
    const alpha = selectedStopId ? (isSelected ? 200 : 100) : 200;
    return [...color, alpha] as [number, number, number, number];
  }, [selectedStopId, stopValueMap, stopValueRange, showSegmentColoring]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getStopCenterColor = React.useCallback((d: any): [number, number, number, number] => {
    // When showing segment coloring (load metrics), use black center
    if (showSegmentColoring) {
      return [0, 0, 0, 255] as [number, number, number, number];
    }

    // Otherwise use white center
    const isSelected = selectedStopId === d.properties.stop_id;
    const alpha = selectedStopId ? (isSelected ? 255 : 128) : 255;
    return [255, 255, 255, alpha] as [number, number, number, number];
  }, [selectedStopId, showSegmentColoring]);

  const layers = [];

  // Conditionally add route layer
  if (showRoutes) {
    // If showing segment coloring (load metrics in route detail view) AND we have segments
    if (showSegmentColoring && segmentGeoms.length > 0) {
      // Add index to each segment for hover tracking
      const segmentsWithIndex = segmentGeoms.map((seg, idx) => ({ ...seg, index: idx }));

      // If there's a hovered segment, render a single glow layer for just that segment
      if (hoveredSegment !== null) {
        const hoveredSeg = segmentsWithIndex[hoveredSegment];
        if (hoveredSeg) {
          const segColor = valueToColor(hoveredSeg.loadValue, segmentValueRange.min, segmentValueRange.max);

          // Single glow layer
          layers.push(
            new PathLayer({
              id: 'segment-glow',
              data: [hoveredSeg],
              getPath: (d) => d.path,
              getWidth: 32,
              getColor: [...segColor, 80],
              widthMinPixels: 16,
              widthMaxPixels: 64,
              pickable: false,
              rounded: true, // Round the line caps to wrap around stops
            })
          );
        }
      }

      // Render all segments with base styling
      layers.push(
        new PathLayer({
          id: 'route-segments',
          data: segmentsWithIndex,
          getPath: (d) => d.path,
          getWidth: 15,
          getColor: (d) => {
            const color = valueToColor(d.loadValue, segmentValueRange.min, segmentValueRange.max);
            // Reduce opacity of non-hovered segments when hovering
            const alpha = hoveredSegment !== null && d.index !== hoveredSegment ? 102 : 255; // 40% opacity = 102/255
            return [...color, alpha];
          },
          updateTriggers: {
            getColor: [segmentValueRange, hoveredSegment]
          },
          widthMinPixels: 5,
          widthMaxPixels: 25,
          pickable: true,
          onHover: ({ object }) => setHoveredSegment(object ? object.index : null),
        })
      );
    } else {
      // Base route layer (default behavior)
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
            // Otherwise use data-driven color from value
            const value = routeValueMap.get(d.properties.route_id) || 0;
            const color = valueToColor(value, routeValueRange.min, routeValueRange.max);
            const opacity = hoveredRoute ? (d.properties.route_id === hoveredRoute ? 200 : 80) : 200;
            return [...color, opacity];
          },
          updateTriggers: {
            getColor: [hoveredRoute, selectedRouteId, routeValueMap, routeValueRange]
          },
          widthMinPixels: 4.5,
          widthMaxPixels: 18,
          pickable: !selectedRouteId, // Disable hover in route detail view
        })
      );
    }

    // Hovered route layer (glowing effect) - only in system/routes view, NOT in segment coloring mode
    if (hoveredRoute && !showSegmentColoring) {
      const hoveredPaths = pathGeoms.filter(p => p.properties.route_id === hoveredRoute);
      if (hoveredPaths.length) {
        const value = routeValueMap.get(hoveredRoute) || 0;
        const routeColor = valueToColor(value, routeValueRange.min, routeValueRange.max);

        // Outer glow layer (very wide, very transparent)
        layers.push(
          new PathLayer({
            id: 'route-glow-outer',
            data: hoveredPaths,
            getPath: (d) => d.path,
            getWidth: 30,
            getColor: [...routeColor, 40], // Very low opacity for soft glow
            widthMinPixels: 15,
            widthMaxPixels: 60,
            pickable: false,
          })
        );

        // Middle glow layer (medium width, medium transparency)
        layers.push(
          new PathLayer({
            id: 'route-glow-middle',
            data: hoveredPaths,
            getPath: (d) => d.path,
            getWidth: 24,
            getColor: [...routeColor, 80], // Medium opacity
            widthMinPixels: 12,
            widthMaxPixels: 48,
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
  }

  // Add route labels with pill backgrounds - only show when NOT in route detail view
  // Labels are added here (after glow layers) to ensure they render on top
  if (showRoutes && !selectedRouteId && filteredShapes.length > 0) {
    const labelData = filteredShapes.map(shape => {
      // Get the middle point of the route for label placement
      const coords = shape.geometry.coordinates;
      const midIndex = Math.floor(coords.length / 2);
      const [lng, lat] = coords[midIndex];

      // Use data-driven color to match route coloring
      const value = routeValueMap.get(shape.properties.route_id) || 0;
      const color = valueToColor(value, routeValueRange.min, routeValueRange.max);

      return {
        position: [lng, lat],
        text: shape.properties.route_short_name || '?',
        color,
        routeId: shape.properties.route_id
      };
    });

    // Always show all labels, but change border color based on hover state
    if (labelData.length > 0) {
      layers.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new (RouteLabelLayer as any)({
          id: 'route-labels',
          data: labelData,
          pickable: true,
          hoveredRouteId: hoveredRoute,
        })
      );
    }
  }

  // Prepare directional labels when a pattern or trip is selected (render later to ensure they're on top)
  let stopLabels: Array<{position: [number, number], text: string}> | null = null;

  // Show first/last stop labels for trip detail view
  if (selectedTrip && selectedTripStops.length > 1) {
    const firstTripStop = selectedTripStops[0];
    const lastTripStop = selectedTripStops[selectedTripStops.length - 1];

    // Find the actual stop features to get coordinates
    const firstStop = filteredStops.find(s => s.properties.stop_id === firstTripStop.id);
    const lastStop = filteredStops.find(s => s.properties.stop_id === lastTripStop.id);

    if (firstStop && lastStop) {
      stopLabels = [
        {
          position: firstStop.geometry.coordinates as [number, number],
          text: 'First stop'
        },
        {
          position: lastStop.geometry.coordinates as [number, number],
          text: 'Last stop'
        }
      ];
    }
  }
  // Show first/last stop labels for pattern filter
  else if (selectedPattern && selectedRouteId && filteredStops.length > 1) {
      // selectedRouteId is already the actual route_id (e.g., "100001")
      if (routePatterns[selectedRouteId]) {
        const patternInfo = routePatterns[selectedRouteId].patterns.find(
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
            stopLabels = [
              {
                position: firstStop.geometry.coordinates as [number, number],
                text: 'First stop'
              },
              {
                position: lastStop.geometry.coordinates as [number, number],
                text: 'Last stop'
              }
            ];
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
        const value = stopValueMap.get(selectedStopId) || 0;
        const selectedStopColor = valueToColor(value, stopValueRange.min, stopValueRange.max);

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
    // Don't show halo when in segment coloring mode
    // Also show halo for selected boarding stop
    const stopToHalo = hoveredStop || selectedBoardingStop;
    if (stopToHalo && stopToHalo !== selectedStopId && !showSegmentColoring) {
      const hoveredStopData = filteredStops.filter(stop => stop.properties.stop_id === stopToHalo);
      if (hoveredStopData.length > 0) {
        const value = stopValueMap.get(stopToHalo) || 0;
        const hoveredStopColor = valueToColor(value, stopValueRange.min, stopValueRange.max);

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
          getRadius: showSegmentColoring ? 10 : 12, // Smaller in segment mode (4px border + 6px), normal size otherwise
          getFillColor: getStopBorderColor,
          radiusMinPixels: showSegmentColoring ? 5 : 6,
          radiusMaxPixels: showSegmentColoring ? 20 : 24,
          pickable: !showSegmentColoring, // Disable hover in segment coloring mode
          visible: showSegmentColoring ? viewState.zoom >= 12 : true, // Hide stops when zoomed out in load visualization
          onHover: ({ object }) => {
            if (!showSegmentColoring) {
              setHoveredStop(object ? (object as StopFeature).properties.stop_id : null);
            }
          },
          onClick: ({ object }) => {
            if (object) {
              setSelectedStopId((object as StopFeature).properties.stop_id);
              setActiveTab('stops'); // Switch to stops tab to show stop detail
            }
          },
          updateTriggers: {
            getFillColor: [selectedStopId, showSegmentColoring], // Force recalculation when selection or coloring mode changes
            getRadius: [showSegmentColoring] // Update radius when mode changes
          }
        }),
        // Black/white center layer (inner circle)
        new ScatterplotLayer({
          id: 'stops-center',
          data: filteredStops,
          getPosition: getStopPosition,
          getRadius: showSegmentColoring ? 8 : 4, // Larger in segment mode (8px black), smaller otherwise (4px white)
          getFillColor: getStopCenterColor,
          radiusMinPixels: showSegmentColoring ? 3 : 2,
          radiusMaxPixels: showSegmentColoring ? 16 : 8,
          pickable: !showSegmentColoring, // Disable hover in segment coloring mode
          visible: showSegmentColoring ? viewState.zoom >= 12 : true, // Hide stops when zoomed out in load visualization
          onHover: ({ object }) => {
            if (!showSegmentColoring) {
              setHoveredStop(object ? (object as StopFeature).properties.stop_id : null);
            }
          },
          onClick: ({ object }) => {
            if (object) {
              setSelectedStopId((object as StopFeature).properties.stop_id);
              setActiveTab('stops'); // Switch to stops tab to show stop detail
            }
          },
          updateTriggers: {
            getFillColor: [selectedStopId, showSegmentColoring], // Force recalculation when selection or coloring mode changes
            getRadius: [showSegmentColoring] // Update radius when mode changes
          }
        })
    );
  }

  // Add stop direction labels on top of everything (rendered last so they appear above stops)
  if (stopLabels) {
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

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* Left Container Wrapper with Shadow */}
      <div style={{
        position: 'fixed',
        left: '12px',
        top: '12px',
        height: 'calc(100% - 24px)',
        width: isFiltersPanelOpen ? '704px' : '448px',
        boxShadow: 'var(--shadow-lg)',
        borderRadius: '28px',
        pointerEvents: 'none',
        zIndex: 999,
        transition: 'width 300ms ease-in-out'
      }} />

      {/* Nav Rail */}
      <div style={{
        width: '72px',
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
          width: isFiltersPanelOpen ? '256px' : '0px',
          height: 'calc(100% - 24px)',
          backgroundColor: 'var(--bg-primary)',
          borderTop: '0.5px solid var(--border-default)',
          borderBottom: '0.5px solid var(--border-default)',
          borderRight: isFiltersPanelOpen ? '0.5px solid var(--border-default)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          left: '84px',
          top: '12px',
          zIndex: 1000,
          overflow: 'hidden',
          transition: 'width 300ms ease-in-out',
          borderRadius: '0'
        }}>
        {/* Filter Section */}
        <div style={{
          padding: '22px 16px 24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px', // Space between the two separate filters
          width: '256px',
          minWidth: '256px'
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
              onChange={(value) => {
                setSelectedMetric(value);
                // Clear metric-based filters when metric changes
                setAppliedTripFilterMin(null);
                setAppliedTripFilterMax(null);
                setStagedTripFilterMin(null);
                setStagedTripFilterMax(null);
                setAppliedStopFilterMin(null);
                setAppliedStopFilterMax(null);
                setStagedStopFilterMin(null);
                setStagedStopFilterMax(null);
              }}
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
                      // If changing routes while in TDV, go to RDV Summary tab
                      if (selectedTrip) {
                        setSelectedTrip(null);
                        setSelectedTripStops([]);
                        setIsTripContentScrolled(false);
                        setSelectedRouteTab('Summary');
                      }
                      setSelectedRouteId(value);
                    }}
                    options={routesList.map(route => ({
                      value: route.id,
                      label: route.name
                    }))}
                  />
                </div>

                {/* Pattern Filter - Hidden when trip is selected */}
                {!selectedTrip && (
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
                )}

                {/* Trip Filter - Only shown when a trip is selected */}
                {selectedTrip && (
                  <div style={{ marginTop: '16px' }}>
                    <label className="label text-text-tertiary block mb-1">Trip</label>
                    <Select
                      value={selectedTrip.trip_id}
                      onChange={async (value) => {
                        // Find the trip from routeTrips
                        for (const pattern of routeTrips) {
                          const trip = pattern.trips.find(t => t.trip_id === value);
                          if (trip) {
                            setSelectedTrip(trip);
                            // Load stop times for this trip
                            const stopTimes = await getTripStopTimes(trip.trip_id);
                            if (stopTimes) {
                              setSelectedTripStops(stopTimes);
                            }
                            break;
                          }
                        }
                      }}
                      options={routeTrips.flatMap(pattern =>
                        pattern.trips.map(trip => ({
                          value: trip.trip_id,
                          label: formatTime12Hour(trip.start_time),
                          description: trip.headsign,
                          sortKey: trip.start_time
                        }))
                      ).sort((a, b) => (a as { sortKey: string }).sortKey.localeCompare((b as { sortKey: string }).sortKey))
                       .map(({ sortKey, ...rest }) => rest as { value: string; label: string; description: string })}
                    />
                  </div>
                )}
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
                              // const isToday = day.toDateString() === new Date().toDateString();

                              // Check if this date is at the start or end of a week row
                              const dayOfWeek = day.getDay(); // 0 = Sunday, 6 = Saturday
                              const isRowStart = dayOfWeek === 0; // Sunday
                              const isRowEnd = dayOfWeek === 6; // Saturday

                              // Check if previous/next day is also selected or in range
                              // const prevDaySelected = idx > 0 && days[idx - 1] && stagedStartDate && stagedEndDate && (
                              //   (days[idx - 1]!.getTime() >= stagedStartDate.getTime() && days[idx - 1]!.getTime() <= stagedEndDate.getTime())
                              // );
                              // const nextDaySelected = idx < days.length - 1 && days[idx + 1] && stagedStartDate && stagedEndDate && (
                              //   (days[idx + 1]!.getTime() >= stagedStartDate.getTime() && days[idx + 1]!.getTime() <= stagedEndDate.getTime())
                              // );

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
          if (object && object.properties) {
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
        onClick={({ object }) => {
          if (object && object.properties) {
            if ('route_id' in object.properties) {
              const routeId = (object as RouteFeature).properties.route_id;
              setHoveredRoute(null); // Clear hover immediately
              // Only reset to Summary if coming from no route (list/map view)
              if (!selectedRouteId) {
                setSelectedRouteTab('Summary');
              }
              setSelectedRouteId(routeId);
              setSelectedStopId(null);
            } else if ('stop_id' in object.properties) {
              const stopId = (object as StopFeature).properties.stop_id;
              setHoveredStop(null); // Clear hover immediately
              setSelectedStopId(stopId);
            }
          }
        }}
        style={{ position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' }}
      >
        <MapboxMap
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

      {/* Map Scale */}
      {(routeValueRange.max > 0 || stopValueRange.max > 0) && (
        <MapScale
          title={scaleTitle}
          min={(selectedRouteId || activeTab === 'stops') ? stopValueRange.min : routeValueRange.min}
          max={(selectedRouteId || activeTab === 'stops') ? stopValueRange.max : routeValueRange.max}
        />
      )}

      {/* Data Panel */}
      <div style={{
        position: 'fixed',
        top: '12px',
        bottom: '12px',
        left: isFiltersPanelOpen ? '340px' : '84px',
        width: '376px',
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '0 28px 28px 0',
        padding: '0 16px 0 16px',
        fontFamily: 'Inter, sans-serif',
        zIndex: 1001,
        overflowX: 'hidden',
        transition: 'left 300ms ease-in-out',
        border: '0.5px solid var(--border-default)',
        borderLeft: 'none',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {selectedTrip ? (
          /* Trip Detail View */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: '20px' }}>
            {/* Close Button and Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginTop: '0px',
              marginBottom: '4px',
              cursor: 'pointer',
              flexShrink: 0,
              color: 'var(--text-secondary)'
            }}
            onClick={() => {
              setSelectedTrip(null);
              setSelectedTripStops([]);
              setIsTripContentScrolled(false);
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3.80773 13.7071C3.41721 14.0976 2.78419 14.0976 2.39367 13.7071C2.00323 13.3166 2.00318 12.6835 2.39367 12.293L6.63684 8.05086L2.39367 3.80769C2.00328 3.41716 2.00319 2.78411 2.39367 2.39363C2.78416 2.00323 3.41723 2.00326 3.80773 2.39363L8.0509 6.6368L12.2931 2.39363C12.6836 2.00325 13.3167 2.00323 13.7071 2.39363C14.0976 2.78412 14.0976 3.41716 13.7071 3.80769L9.46496 8.05086L13.7071 12.293C14.0976 12.6835 14.0976 13.3166 13.7071 13.7071C13.3166 14.0976 12.6836 14.0976 12.2931 13.7071L8.0509 9.46492L3.80773 13.7071Z" fill="currentColor"/>
              </svg>
              <div className="heading-3">
                {formatTime12Hour(selectedTrip.start_time)}
              </div>
            </div>
            <div className="data-small" style={{ color: 'var(--text-tertiary)', marginLeft: '28px', marginTop: '-4px', fontWeight: 'normal' }}>
              {selectedTrip.headsign}
            </div>

            {/* Divider - only shown when scrolled */}
            <div style={{
              position: 'relative',
              marginLeft: '-16px',
              marginRight: '-16px',
              flexShrink: 0
            }}>
              <div style={{
                height: '0.5px',
                backgroundColor: 'var(--border-default)',
                marginLeft: '16px',
                marginRight: '16px',
                marginTop: '12px',
                opacity: isTripContentScrolled ? 1 : 0,
                transition: 'opacity 0.2s ease'
              }} />
            </div>

            {/* Trip Content */}
            <div
              style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: '24px', marginRight: '-8px', paddingRight: '8px' }}
              onScroll={(e) => {
                const target = e.target as HTMLDivElement;
                setIsTripContentScrolled(target.scrollTop > 0);
              }}
            >
              {/* Overall Trip Metric Card */}
              <MetricCard
                title={selectedMetric}
                value={selectedTrip.ridership}
              />

              {/* By Stop Card */}
              <div style={{
                padding: '16px',
                backgroundColor: 'var(--bg-elevated)',
                border: '0.5px solid var(--border-default)',
                borderRadius: '20px'
              }}>
                {/* Stop List with Timeline - different visualization for Load vs Boardings/Alightings/Activity */}
                {(selectedMetric === 'Average load' || selectedMetric === 'Maxload') ? (
                  /* Load metric: Colored line segments + black stops */
                  (() => {
                    // Build a map of fromStopId -> loadValue from segmentGeoms
                    const segmentLoadMap = new Map<string, number>();
                    segmentGeoms.forEach(seg => {
                      segmentLoadMap.set(seg.fromStopId, seg.loadValue);
                    });

                    return (
                      <div style={{ position: 'relative' }}>
                        {/* Stops */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          {selectedTripStops.map((stop, index) => {
                            const isLastStop = index === selectedTripStops.length - 1;
                            // Get the segment load value (load for segment starting at this stop)
                            const segmentLoad = segmentLoadMap.get(stop.id) || 0;
                            const segmentColor = valueToColor(segmentLoad, segmentValueRange.min, segmentValueRange.max);

                            const isSelected = hoveredSegment === index;

                            return (
                              <div
                                key={index}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '19px',
                                  position: 'relative',
                                  cursor: !isLastStop ? 'pointer' : 'default'
                                }}
                                onClick={() => {
                                  if (!isLastStop) {
                                    setHoveredSegment(hoveredSegment === index ? null : index);
                                  }
                                }}
                              >
                                {/* Glow layer behind segment line when selected */}
                                {!isLastStop && isSelected && (
                                  <div style={{
                                    position: 'absolute',
                                    left: '-5.5px',
                                    top: '-2px',
                                    width: '28px',
                                    height: 'calc(100% + 20px + 24px)',
                                    backgroundColor: `rgba(${segmentColor.join(',')}, 0.31)`,
                                    borderRadius: '14px',
                                    zIndex: 0
                                  }} />
                                )}
                                {/* Colored segment line to next stop - positioned absolutely */}
                                {!isLastStop && (
                                  <div style={{
                                    position: 'absolute',
                                    left: '4px',
                                    top: '12px',
                                    width: '9px',
                                    height: 'calc(100% + 24px - 12px + 14px)',
                                    backgroundColor: `rgb(${segmentColor.join(',')})`,
                                    opacity: hoveredSegment !== null && !isSelected ? 0.4 : 1,
                                    transition: 'opacity 0.2s',
                                    zIndex: 1
                                  }} />
                                )}

                                {/* Stop Circle - black with white border */}
                                <div style={{
                                  width: '17px',
                                  height: '17px',
                                  borderRadius: '50%',
                                  backgroundColor: 'black',
                                  border: '2.5px solid white',
                                  flexShrink: 0,
                                  zIndex: 1,
                                  marginTop: '2px'
                                }} />

                                {/* Stop Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 'var(--body-regular-size)', display: 'flex', gap: '6px', alignItems: 'baseline', position: 'relative' }}>
                                    <span
                                      style={{
                                        color: hoveredSegment !== null && index !== hoveredSegment && index !== hoveredSegment + 1 ? 'var(--text-disabled)' : 'var(--text-primary)',
                                        fontWeight: 'var(--font-semibold)',
                                        transition: 'color 0.2s',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        minWidth: 0
                                      }}
                                      onMouseEnter={(e) => {
                                        const target = e.currentTarget;
                                        tooltipTimerRef.current = setTimeout(() => {
                                          if (target.scrollWidth > target.clientWidth) {
                                            setTooltipStopIndex(index);
                                          }
                                        }, 1000);
                                      }}
                                      onMouseLeave={() => {
                                        if (tooltipTimerRef.current) {
                                          clearTimeout(tooltipTimerRef.current);
                                          tooltipTimerRef.current = null;
                                        }
                                        setTooltipStopIndex(null);
                                      }}
                                    >{stop.n}</span>
                                    {tooltipStopIndex === index && (
                                      <Tooltip text={stop.n}>
                                        {null}
                                      </Tooltip>
                                    )}
                                    <span style={{
                                      color: hoveredSegment !== null && index !== hoveredSegment && index !== hoveredSegment + 1 ? 'var(--text-disabled)' : 'var(--text-tertiary)',
                                      fontSize: '12px',
                                      transition: 'color 0.2s',
                                      flexShrink: 0,
                                      whiteSpace: 'nowrap'
                                    }}>{formatTime12Hour(stop.t)}</span>
                                  </div>
                                  <div style={{
                                    fontSize: 'var(--data-medium-size)',
                                    fontWeight: 'var(--data-medium-weight)',
                                    color: hoveredSegment !== null && index !== hoveredSegment ? 'var(--text-disabled)' : 'var(--text-primary)',
                                    marginTop: '4px',
                                    lineHeight: '1',
                                    transition: 'color 0.2s'
                                  }}>
                                    {segmentLoad}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  /* Boardings/Alightings/Activity metrics: Colored stops + beige line */
                  <div style={{ position: 'relative' }}>
                    {/* Vertical beige line */}
                    <div style={{
                      position: 'absolute',
                      left: '8px',
                      top: '8px',
                      height: selectedTripStops.length > 1 ? `calc(100% - 8px - 42px)` : '0px',
                      width: '4px',
                      backgroundColor: 'var(--border-default)'
                    }} />

                    {/* Stops */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {selectedTripStops.map((stop, index) => {
                        const stopValue = stopValueMap.get(stop.id) || 0;
                        const stopColor = valueToColor(stopValue, stopValueRange.min, stopValueRange.max);

                        const isStopSelected = selectedBoardingStop === stop.id;

                        return (
                          <div
                            key={index}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '16px',
                              cursor: 'pointer'
                            }}
                            onClick={() => {
                              setSelectedBoardingStop(selectedBoardingStop === stop.id ? null : stop.id);
                            }}
                          >
                            {/* Stop Circle with halo ring when selected */}
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              {/* Halo ring (shown when selected) */}
                              {isStopSelected && (
                                <div style={{
                                  position: 'absolute',
                                  top: '50%',
                                  left: '50%',
                                  transform: 'translate(-50%, -50%)',
                                  width: '44px',
                                  height: '44px',
                                  borderRadius: '50%',
                                  backgroundColor: `rgba(${stopColor.join(',')}, 0.5)`,
                                  zIndex: 0,
                                  marginTop: '2px'
                                }} />
                              )}
                              {/* Stop Circle - colored with white border and center dot */}
                              <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                backgroundColor: `rgb(${stopColor.join(',')})`,
                                border: '2px solid white',
                                zIndex: 1,
                                marginTop: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                                opacity: selectedBoardingStop !== null && !isStopSelected ? 0.4 : 1,
                                transition: 'opacity 0.2s'
                              }}>
                                <div style={{
                                  width: '4px',
                                  height: '4px',
                                  borderRadius: '50%',
                                  backgroundColor: 'white'
                                }} />
                              </div>
                            </div>

                            {/* Stop Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 'var(--body-regular-size)', display: 'flex', gap: '6px', alignItems: 'baseline', position: 'relative' }}>
                                <span
                                  style={{
                                    color: selectedBoardingStop !== null && !isStopSelected ? 'var(--text-disabled)' : 'var(--text-primary)',
                                    fontWeight: 'var(--font-semibold)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    minWidth: 0,
                                    transition: 'color 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    const target = e.currentTarget;
                                    tooltipTimerRef.current = setTimeout(() => {
                                      if (target.scrollWidth > target.clientWidth) {
                                        setTooltipStopIndex(index + 10000); // Offset to avoid collision with Load viz
                                      }
                                    }, 1000);
                                  }}
                                  onMouseLeave={() => {
                                    if (tooltipTimerRef.current) {
                                      clearTimeout(tooltipTimerRef.current);
                                      tooltipTimerRef.current = null;
                                    }
                                    setTooltipStopIndex(null);
                                  }}
                                >{stop.n}</span>
                                {tooltipStopIndex === index + 10000 && (
                                  <Tooltip text={stop.n}>
                                    {null}
                                  </Tooltip>
                                )}
                                <span style={{
                                  color: selectedBoardingStop !== null && !isStopSelected ? 'var(--text-disabled)' : 'var(--text-tertiary)',
                                  fontSize: '12px',
                                  flexShrink: 0,
                                  whiteSpace: 'nowrap',
                                  transition: 'color 0.2s'
                                }}>{formatTime12Hour(stop.t)}</span>
                              </div>
                              <div style={{
                                fontSize: 'var(--data-medium-size)',
                                fontWeight: 'var(--data-medium-weight)',
                                color: selectedBoardingStop !== null && !isStopSelected ? 'var(--text-disabled)' : 'var(--text-primary)',
                                marginTop: '4px',
                                lineHeight: '1',
                                transition: 'color 0.2s'
                              }}>
                                {stopValue}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : selectedRouteId || selectedStopId ? (
          /* Detail View for Selected Route/Stop */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: '20px' }}>
            {/* Back Button and Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginTop: '0px',
              marginBottom: '4px',
              cursor: 'pointer',
              flexShrink: 0,
              color: 'var(--text-secondary)'
            }}
            onClick={() => {
              setSelectedRouteId(null);
              setSelectedStopId(null);
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3.80773 13.7071C3.41721 14.0976 2.78419 14.0976 2.39367 13.7071C2.00323 13.3166 2.00318 12.6835 2.39367 12.293L6.63684 8.05086L2.39367 3.80769C2.00328 3.41716 2.00319 2.78411 2.39367 2.39363C2.78416 2.00323 3.41723 2.00326 3.80773 2.39363L8.0509 6.6368L12.2931 2.39363C12.6836 2.00325 13.3167 2.00323 13.7071 2.39363C14.0976 2.78412 14.0976 3.41716 13.7071 3.80769L9.46496 8.05086L13.7071 12.293C14.0976 12.6835 14.0976 13.3166 13.7071 13.7071C13.3166 14.0976 12.6836 14.0976 12.2931 13.7071L8.0509 9.46492L3.80773 13.7071Z" fill="currentColor"/>
              </svg>
              <div className="heading-3">
                {selectedRouteId ? (routesList.find((r) => r.id === selectedRouteId)?.name || `Route ${selectedRouteId}`) : (stopsList.find((s) => s.id === selectedStopId)?.name || 'Stop')}
              </div>
            </div>

            {/* Summary/Trips/Grid Tabs */}
            <div style={{
              position: 'relative',
              marginLeft: '-16px',
              marginRight: '-16px',
              flexShrink: 0
            }}>
              {/* Tabs */}
              <div style={{
                position: 'relative',
                display: 'flex',
                gap: '24px',
                paddingLeft: '16px'
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
                      fontSize: 'var(--data-small-size)',
                      fontWeight: 'var(--data-small-weight)',
                      color: selectedRouteTab === tab ? 'var(--text-secondary)' : 'var(--text-disabled)',
                      lineHeight: 'var(--data-small-line-height)',
                      transition: 'color 0.2s ease'
                    }}
                  >
                    {tab}
                    {/* Underline indicator for selected tab */}
                    {selectedRouteTab === tab && (
                      <div style={{
                        position: 'absolute',
                        bottom: '1px',
                        left: 0,
                        right: 0,
                        height: '2px',
                        backgroundColor: 'var(--text-secondary)',
                        borderTopLeftRadius: '2px',
                        borderTopRightRadius: '2px'
                      }} />
                    )}
                  </button>
                ))}
              </div>
              {/* Divider */}
              <div style={{
                height: '0.5px',
                backgroundColor: 'var(--border-default)',
                marginLeft: '16px',
                marginRight: '16px',
                marginTop: '-1px'
              }} />
            </div>

            {/* Tab Content */}
            {selectedRouteTab === 'Summary' ? (
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingTop: '12px', paddingBottom: '24px', marginRight: '-8px', paddingRight: '8px' }}>
                <MetricCard
                  title={selectedMetric}
                  value={selectedRouteId
                    ? (routesList.find((r) => r.id === selectedRouteId)?.value || 0)
                    : (stopsList.find((s) => s.id === selectedStopId)?.value || 0)
                  }
                />
                <ByDateChart data={chartDataByDate} gradientId="colorValue" metric={selectedMetric} />
                <ByDayChart data={mockDataByDay} average={averageDailyByDay} metric={selectedMetric} />
                <ByPeriodChart
                  data={mockDataByPeriod}
                  colors={PERIOD_COLORS}
                  activePieIndex={activePieIndex}
                  setActivePieIndex={setActivePieIndex}
                  metric={selectedMetric}
                />
              </div>
            ) : selectedRouteTab === 'Trips' ? (
              /* Trips View */
              (() => {
                // Filter and sort trips
                const filteredAndSortedRouteTrips = routeTrips
                  .filter(patternGroup => !selectedPattern || patternGroup.headsign === selectedPattern)
                  .map(patternGroup => {
                    let filteredTrips = patternGroup.trips;

                    // Apply ridership filter
                    if (appliedTripFilterMin !== null || appliedTripFilterMax !== null) {
                      filteredTrips = filteredTrips.filter(trip => {
                        const passes =
                          (appliedTripFilterMin === null || trip.ridership >= appliedTripFilterMin) &&
                          (appliedTripFilterMax === null || trip.ridership <= appliedTripFilterMax);
                        return passes;
                      });
                    }

                    // Apply sorting
                    const sortedTrips = [...filteredTrips].sort((a, b) => {
                      if (tripSortBy === 'ridership') {
                        return tripSortOrder === 'asc'
                          ? a.ridership - b.ridership
                          : b.ridership - a.ridership;
                      } else {
                        // Sort by time
                        return tripSortOrder === 'asc'
                          ? a.start_time.localeCompare(b.start_time)
                          : b.start_time.localeCompare(a.start_time);
                      }
                    });

                    return {
                      ...patternGroup,
                      trips: sortedTrips
                    };
                  })
                  .filter(patternGroup => patternGroup.trips.length > 0);

                // Calculate total and filtered counts
                const totalTripsCount = routeTrips
                  .filter(patternGroup => !selectedPattern || patternGroup.headsign === selectedPattern)
                  .reduce((sum, pg) => sum + pg.trips.length, 0);
                const filteredTripsCount = filteredAndSortedRouteTrips.reduce((sum, pg) => sum + pg.trips.length, 0);
                const isFiltered = appliedTripFilterMin !== null || appliedTripFilterMax !== null;

                return (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: 'hidden',
                    position: 'relative',
                    marginRight: '-50px',
                    paddingRight: '50px'
                  }}>
                    {/* Filter Bar */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '8px',
                      paddingBottom: '8px',
                      paddingLeft: '0px',
                      paddingRight: '0px',
                      flexShrink: 0,
                      backgroundColor: 'var(--bg-primary)',
                      zIndex: 20
                    }}>
                      {/* Trip Count */}
                      <div
                        className="data-small"
                        style={{
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {isFiltered
                          ? `${filteredTripsCount} of ${totalTripsCount} Trips`
                          : `${totalTripsCount} Trips`}
                      </div>

                      {/* Filter and Sort Buttons */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {/* Filter Button */}
                        <button
                          ref={tripFilterButtonRef}
                          type="button"
                          onClick={() => setIsTripFilterMenuOpen(!isTripFilterMenuOpen)}
                          onMouseEnter={() => setIsFilterButtonHovered(true)}
                          onMouseLeave={() => setIsFilterButtonHovered(false)}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            border: isTripFilterMenuOpen
                              ? '0.5px solid var(--border-focus)'
                              : isFilterButtonHovered
                                ? '0.5px solid var(--border-default)'
                                : '0.5px solid transparent',
                            backgroundColor: (isTripFilterMenuOpen || isFilterButtonHovered) ? 'var(--bg-elevated)' : 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.2s ease, border-color 0.2s ease',
                            position: 'relative'
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M7.3168 12.6501C7.07235 12.6501 6.86402 12.564 6.6918 12.3918C6.51958 12.2195 6.43346 12.0112 6.43346 11.7668C6.43346 11.5223 6.51958 11.314 6.6918 11.1418C6.86402 10.9695 7.07235 10.8834 7.3168 10.8834H8.70013C8.94458 10.8834 9.15291 10.9695 9.32513 11.1418C9.49735 11.314 9.58346 11.5223 9.58346 11.7668C9.58346 12.0112 9.49735 12.2195 9.32513 12.3918C9.15291 12.564 8.94458 12.6501 8.70013 12.6501H7.3168ZM4.4668 8.88343C4.22235 8.88343 4.01402 8.79732 3.8418 8.6251C3.66957 8.45288 3.58346 8.24454 3.58346 8.0001C3.58346 7.75565 3.66957 7.54732 3.8418 7.3751C4.01402 7.20288 4.22235 7.11676 4.4668 7.11676H11.5168C11.7612 7.11676 11.9696 7.20288 12.1418 7.3751C12.314 7.54732 12.4001 7.75565 12.4001 8.0001C12.4001 8.24454 12.314 8.45288 12.1418 8.6251C11.9696 8.79732 11.7612 8.88343 11.5168 8.88343H4.4668ZM2.35013 5.11676C2.10569 5.11676 1.89735 5.03065 1.72513 4.85843C1.55291 4.68621 1.4668 4.47788 1.4668 4.23343C1.4668 3.98899 1.55291 3.78065 1.72513 3.60843C1.89735 3.43621 2.10569 3.3501 2.35013 3.3501H13.6501C13.8946 3.3501 14.1029 3.43621 14.2751 3.60843C14.4474 3.78065 14.5335 3.98899 14.5335 4.23343C14.5335 4.47788 14.4474 4.68621 14.2751 4.85843C14.1029 5.03065 13.8946 5.11676 13.6501 5.11676H2.35013Z" fill="var(--text-secondary)"/>
                          </svg>
                          {(appliedTripFilterMin !== null || appliedTripFilterMax !== null) && (
                            <div style={{
                              position: 'absolute',
                              top: '1px',
                              right: '1px',
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--text-secondary)'
                            }} />
                          )}
                        </button>

                        {/* Sort Button */}
                        <button
                          ref={tripSortButtonRef}
                          type="button"
                          onClick={() => setIsTripSortMenuOpen(!isTripSortMenuOpen)}
                          onMouseEnter={() => setIsSortButtonHovered(true)}
                          onMouseLeave={() => setIsSortButtonHovered(false)}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            border: isTripSortMenuOpen
                              ? '0.5px solid var(--border-focus)'
                              : isSortButtonHovered
                                ? '0.5px solid var(--border-default)'
                                : '0.5px solid transparent',
                            backgroundColor: (isTripSortMenuOpen || isSortButtonHovered) ? 'var(--bg-elevated)' : 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.2s ease, border-color 0.2s ease'
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5.81667 8.76675C5.57222 8.76675 5.36389 8.68064 5.19167 8.50842C5.01944 8.33619 4.93333 8.12786 4.93333 7.88342V4.20008L4.01667 5.11675C3.85 5.28341 3.64444 5.36675 3.4 5.36675C3.15556 5.36675 2.94444 5.28341 2.76667 5.11675C2.58889 4.93897 2.5 4.73064 2.5 4.49175C2.5 4.25286 2.58889 4.04453 2.76667 3.86675L5.18333 1.43341C5.27222 1.34453 5.36944 1.27786 5.475 1.23341C5.58056 1.18897 5.69444 1.16675 5.81667 1.16675C5.93889 1.16675 6.05278 1.18897 6.15833 1.23341C6.26389 1.27786 6.36111 1.34453 6.45 1.43341L8.86667 3.86675C9.04444 4.04453 9.13056 4.25286 9.125 4.49175C9.11944 4.73064 9.02778 4.93897 8.85 5.11675C8.67222 5.28341 8.46667 5.36953 8.23333 5.37508C8 5.38064 7.79444 5.29453 7.61667 5.11675L6.7 4.20008V7.88342C6.7 8.12786 6.61389 8.33619 6.44167 8.50842C6.26944 8.68064 6.06111 8.76675 5.81667 8.76675ZM10.1833 14.8334C10.0611 14.8334 9.94722 14.8112 9.84167 14.7667C9.73611 14.7223 9.63889 14.6556 9.55 14.5667L7.13333 12.1334C6.95556 11.9556 6.86944 11.7473 6.875 11.5084C6.88056 11.2695 6.97222 11.0612 7.15 10.8834C7.32778 10.7167 7.53333 10.6306 7.76667 10.6251C8 10.6195 8.20556 10.7056 8.38333 10.8834L9.3 11.8001V8.11675C9.3 7.8723 9.38611 7.66397 9.55833 7.49175C9.73056 7.31953 9.93889 7.23342 10.1833 7.23342C10.4278 7.23342 10.6361 7.31953 10.8083 7.49175C10.9806 7.66397 11.0667 7.8723 11.0667 8.11675V11.8001L11.9833 10.8834C12.15 10.7167 12.3556 10.6334 12.6 10.6334C12.8444 10.6334 13.0556 10.7167 13.2333 10.8834C13.4111 11.0612 13.5 11.2695 13.5 11.5084C13.5 11.7473 13.4111 11.9556 13.2333 12.1334L10.8167 14.5667C10.7278 14.6556 10.6306 14.7223 10.525 14.7667C10.4194 14.8112 10.3056 14.8334 10.1833 14.8334Z" fill="var(--text-secondary)"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Trips List */}
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
                      {filteredAndSortedRouteTrips.length === 0 ? (
                        <div style={{
                          padding: '24px',
                          textAlign: 'center',
                          color: 'var(--text-tertiary)',
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 'var(--body-size)'
                        }}>
                          {routeTrips.length === 0 ? 'No trips available for this route' : 'No trips match the current filters'}
                        </div>
                      ) : (
                        filteredAndSortedRouteTrips.map((patternGroup, groupIndex) => {
                      const maxRidership = Math.max(...patternGroup.trips.map(t => t.ridership));

                      return (
                        <div
                          key={groupIndex}
                          style={{
                            marginTop: groupIndex > 0 ? '8px' : '0'
                          }}
                        >
                          {/* Pattern Title - Sticky wrapper with bg-primary to mask scrolling content */}
                          <div
                            data-pattern-index={groupIndex}
                            style={{
                              position: 'sticky',
                              top: '0px',
                              backgroundColor: 'var(--bg-primary)',
                              zIndex: 10
                            }}>
                            {/* Inner element with rounded corners and elevated background */}
                            <div
                              className="data-small"
                              style={{
                                backgroundColor: 'var(--bg-elevated)',
                                color: 'var(--text-primary)',
                                paddingTop: '12px',
                                paddingBottom: '11px',
                                paddingLeft: '12px',
                                paddingRight: '12px',
                                borderTop: '0.5px solid var(--border-default)',
                                borderLeft: '0.5px solid var(--border-default)',
                                borderRight: '0.5px solid var(--border-default)',
                                borderBottom: '0.5px solid var(--border-default)',
                                borderTopLeftRadius: '20px',
                                borderTopRightRadius: '20px'
                              }}>
                              {patternGroup.headsign}
                            </div>
                          </div>

                          {/* Trips List */}
                          <div style={{ position: 'relative', padding: '8px 16px 16px 16px', borderLeft: '0.5px solid var(--border-default)', borderRight: '0.5px solid var(--border-default)', borderBottom: '0.5px solid var(--border-default)', borderTop: 'none', borderBottomLeftRadius: '20px', borderBottomRightRadius: '20px', backgroundColor: 'var(--bg-elevated)' }}>
                            {/* Axis Labels */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              marginBottom: '8px',
                              gap: '16px'
                            }}>
                              {/* Empty space for time label column */}
                              <div style={{ minWidth: '52px', flexShrink: 0 }} />
                              {/* Axis labels container */}
                              <div style={{ flex: 1, position: 'relative', height: '16px' }}>
                                {[0, 25, 50, 75].map((percent, i) => (
                                  <span
                                    key={i}
                                    className="caption"
                                    style={{
                                      position: 'absolute',
                                      left: `${percent}%`,
                                      transform: 'translateX(-50%)',
                                      color: 'var(--text-tertiary)',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    {Math.round(maxRidership * percent / 100)}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Grid Lines Background */}
                            <div style={{
                              position: 'absolute',
                              top: 'calc(8px + 16px + 8px)', // padding + axis height + marginBottom (grid lines start with trips container)
                              bottom: '16px',
                              left: 'calc(16px + 52px + 16px)', // 16px padding + 52px (time label width) + 16px (gap)
                              right: '16px',
                              display: 'flex',
                              pointerEvents: 'none',
                              zIndex: 0
                            }}>
                              {/* Horizontal line at top - extends edge to edge */}
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 'calc(-52px - 16px - 16px)', // Extend to left edge (time label width + gap + container padding)
                                  right: '-16px', // Extend to right edge (container padding)
                                  height: '0.5px',
                                  backgroundColor: 'var(--border-default)',
                                  opacity: 0.5
                                }}
                              />
                              {[0, 25, 50, 75].map((percent, i) => (
                                <div
                                  key={i}
                                  style={{
                                    position: 'absolute',
                                    left: `${percent}%`,
                                    top: 0,
                                    bottom: 0,
                                    width: '0.5px',
                                    backgroundColor: 'var(--border-default)',
                                    opacity: 0.5
                                  }}
                                />
                              ))}
                            </div>

                            {/* Trips */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', zIndex: 1, paddingTop: '8px' }}>
                              {patternGroup.trips.map((trip, tripIndex) => {
                                const barWidth = (trip.ridership / maxRidership) * 100; // Full width bars
                                const tripKey = `${groupIndex}-${tripIndex}`;
                                const showTooltip = hoveredTrip === tripKey;

                                return (
                                  <div
                                    key={tripIndex}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '16px'
                                    }}
                                  >
                                    {/* Time Label */}
                                    <div className="caption" style={{
                                      color: 'var(--text-tertiary)',
                                      minWidth: '52px',
                                      flexShrink: 0,
                                      textAlign: 'right'
                                    }}>
                                      {formatTime12Hour(trip.start_time)}
                                    </div>

                                    {/* Bar Container - flex: 1 to match axis labels container */}
                                    <div style={{ flex: 1, position: 'relative' }}>
                                      <div
                                        style={{
                                          position: 'relative',
                                          height: '24px',
                                          width: `${barWidth}%`,
                                        }}
                                        onMouseEnter={(e) => {
                                          setHoveredTrip(tripKey);
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          setTripTooltip({
                                            show: true,
                                            time: formatTime12Hour(trip.start_time),
                                            ridership: trip.ridership,
                                            x: rect.left,
                                            y: rect.top
                                          });
                                        }}
                                        onMouseLeave={() => {
                                          setHoveredTrip(null);
                                          setTripTooltip(null);
                                        }}
                                        onClick={async () => {
                                          // Clear tooltip before navigating
                                          setHoveredTrip(null);
                                          setTripTooltip(null);
                                          setSelectedTrip(trip);
                                          // Load stop times for this trip
                                          const stops = await getTripStopTimes(trip.trip_id);
                                          if (stops) {
                                            setSelectedTripStops(stops);
                                          }
                                        }}
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
                                      </div>
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
                  </div>
                );
              })()
            ) : (
              /* Grid View - Placeholder */
              <div style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                paddingBottom: '24px',
                marginRight: '-8px',
                paddingRight: '8px'
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
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingTop: '20px', paddingBottom: '24px', marginRight: '-8px', paddingRight: '8px' }}>
            {/* Charts */}
            <MetricCard title={selectedMetric} value="8,973" />
            <ByDateChart data={chartDataByDate} gradientId="colorValueSystem" metric={selectedMetric} />
            <ByDayChart data={mockDataByDay} average={averageDailyByDay} metric={selectedMetric} />
            <ByPeriodChart
              data={mockDataByPeriod}
              colors={PERIOD_COLORS}
              activePieIndex={activePieIndex}
              setActivePieIndex={setActivePieIndex}
              metric={selectedMetric}
            />
          </div>
        ) : activeTab === 'components' ? (
          /* Components View - Showcase */
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingTop: '20px', paddingBottom: '24px', marginRight: '-8px', paddingRight: '8px' }}>
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
        ) : activeTab === 'stops' ? (
          /* Stops View with Filter/Sort */
          (() => {
            const isFiltered = appliedStopFilterMin !== null || appliedStopFilterMax !== null || appliedStopAmenityFilters.size > 0;

            return (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'hidden',
                position: 'relative',
                marginRight: '-50px',
                paddingRight: '50px'
              }}>
                {/* Filter Bar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '14px',
                  paddingBottom: '8px',
                  paddingLeft: '0px',
                  paddingRight: '0px',
                  flexShrink: 0,
                  backgroundColor: 'var(--bg-primary)',
                  zIndex: 20
                }}>
                  {/* Stop Count */}
                  <div
                    className="data-small"
                    style={{
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {isFiltered
                      ? `${filteredAndSortedStopsList.length} of ${stopsList.length} Stops`
                      : `${stopsList.length} Stops`}
                  </div>

                  {/* Filter and Sort Buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {/* Filter Button */}
                    <button
                      ref={stopFilterButtonRef}
                      type="button"
                      onClick={() => setIsStopFilterMenuOpen(!isStopFilterMenuOpen)}
                      onMouseEnter={() => setIsStopFilterButtonHovered(true)}
                      onMouseLeave={() => setIsStopFilterButtonHovered(false)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: isStopFilterMenuOpen
                          ? '0.5px solid var(--border-focus)'
                          : isStopFilterButtonHovered
                            ? '0.5px solid var(--border-default)'
                            : '0.5px solid transparent',
                        backgroundColor: isStopFilterMenuOpen || isStopFilterButtonHovered ? 'var(--bg-elevated)' : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        padding: 0,
                        position: 'relative'
                      }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      {isFiltered && (
                        <div style={{
                          position: 'absolute',
                          top: '1px',
                          right: '1px',
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--text-secondary)'
                        }} />
                      )}
                    </button>

                    {/* Sort Button */}
                    <button
                      ref={stopSortButtonRef}
                      type="button"
                      onClick={() => setIsStopSortMenuOpen(!isStopSortMenuOpen)}
                      onMouseEnter={() => setIsStopSortButtonHovered(true)}
                      onMouseLeave={() => setIsStopSortButtonHovered(false)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: isStopSortMenuOpen
                          ? '0.5px solid var(--border-focus)'
                          : isStopSortButtonHovered
                            ? '0.5px solid var(--border-default)'
                            : '0.5px solid transparent',
                        backgroundColor: isStopSortMenuOpen || isStopSortButtonHovered ? 'var(--bg-elevated)' : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        padding: 0
                      }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5.81667 8.76675C5.57222 8.76675 5.36389 8.68064 5.19167 8.50842C5.01944 8.33619 4.93333 8.12786 4.93333 7.88342V4.20008L4.01667 5.11675C3.85 5.28341 3.64444 5.36675 3.4 5.36675C3.15556 5.36675 2.94444 5.28341 2.76667 5.11675C2.58889 4.93897 2.5 4.73064 2.5 4.49175C2.5 4.25286 2.58889 4.04453 2.76667 3.86675L5.18333 1.43341C5.27222 1.34453 5.36944 1.27786 5.475 1.23341C5.58056 1.18897 5.69444 1.16675 5.81667 1.16675C5.93889 1.16675 6.05278 1.18897 6.15833 1.23341C6.26389 1.27786 6.36111 1.34453 6.45 1.43341L8.86667 3.86675C9.04444 4.04453 9.13056 4.25286 9.125 4.49175C9.11944 4.73064 9.02778 4.93897 8.85 5.11675C8.67222 5.28341 8.46667 5.36953 8.23333 5.37508C8 5.38064 7.79444 5.29453 7.61667 5.11675L6.7 4.20008V7.88342C6.7 8.12786 6.61389 8.33619 6.44167 8.50842C6.26944 8.68064 6.06111 8.76675 5.81667 8.76675ZM10.1833 14.8334C10.0611 14.8334 9.94722 14.8112 9.84167 14.7667C9.73611 14.7223 9.63889 14.6556 9.55 14.5667L7.13333 12.1334C6.95556 11.9556 6.86944 11.7473 6.875 11.5084C6.88056 11.2695 6.97222 11.0612 7.15 10.8834C7.32778 10.7167 7.53333 10.6306 7.76667 10.6251C8 10.6195 8.20556 10.7056 8.38333 10.8834L9.3 11.8001V8.11675C9.3 7.8723 9.38611 7.66397 9.55833 7.49175C9.73056 7.31953 9.93889 7.23342 10.1833 7.23342C10.4278 7.23342 10.6361 7.31953 10.8083 7.49175C10.9806 7.66397 11.0667 7.8723 11.0667 8.11675V11.8001L11.9833 10.8834C12.15 10.7167 12.3556 10.6334 12.6 10.6334C12.8444 10.6334 13.0556 10.7167 13.2333 10.8834C13.4111 11.0612 13.5 11.2695 13.5 11.5084C13.5 11.7473 13.4111 11.9556 13.2333 12.1334L10.8167 14.5667C10.7278 14.6556 10.6306 14.7223 10.525 14.7667C10.4194 14.8112 10.3056 14.8334 10.1833 14.8334Z" fill="#3D2817"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Divider - only shown when scrolled */}
                <div style={{
                  position: 'relative',
                  marginLeft: '-16px',
                  marginRight: '-16px',
                  flexShrink: 0
                }}>
                  <div style={{
                    height: '0.5px',
                    backgroundColor: 'var(--border-default)',
                    marginLeft: '16px',
                    marginRight: '16px',
                    marginTop: '4px',
                    opacity: isStopsListScrolled ? 1 : 0,
                    transition: 'opacity 0.1s ease'
                  }} />
                </div>

                {/* List Items */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0',
                    paddingBottom: '24px',
                    marginRight: '-8px',
                    paddingRight: '8px'
                  }}
                  onScroll={(e) => {
                    const target = e.target as HTMLDivElement;
                    setIsStopsListScrolled(target.scrollTop > 0);
                  }}
                >
                  {filteredAndSortedStopsList.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedStopId(item.id);
                      }}
                      style={{
                        cursor: 'pointer'
                      }}>
                      <MetricCard value={item.value} title={item.name} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })()
        ) : (
          /* Routes View - Simple List */
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingTop: '20px', paddingBottom: '24px', marginRight: '-8px', paddingRight: '8px' }}>
            {/* List Items */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0'
            }}>
              {routesList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedRouteId(item.id);
                    setSelectedRouteTab('Summary');
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

      {/* Trip Filter Menu */}
      {isTripFilterMenuOpen && tripFilterButtonRef.current && (() => {
        const buttonRect = tripFilterButtonRef.current.getBoundingClientRect();
        return createPortal(
          <div
            data-trip-filter-menu
            style={{
              position: 'fixed',
              top: `${buttonRect.bottom + 8}px`,
              left: `${buttonRect.left}px`,
              backgroundColor: 'var(--bg-elevated)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-large)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 10002,
              minWidth: '240px',
              overflowY: 'auto',
              padding: '16px'
            }}
          >
            <span className="button-small" style={{ color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '18px', display: 'block' }}>
              {selectedMetric}
            </span>
            <div style={{ marginBottom: '18px' }}>
              <Input
                type="number"
                label="More Than"
                value={stagedTripFilterMin ?? ''}
                onChange={(e) => setStagedTripFilterMin(e.target.value ? Number(e.target.value) : null)}
                placeholder="None"
                variant="elevated"
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <Input
                type="number"
                label="Less Than"
                value={stagedTripFilterMax ?? ''}
                onChange={(e) => setStagedTripFilterMax(e.target.value ? Number(e.target.value) : null)}
                placeholder="None"
                variant="elevated"
              />
            </div>
            <div style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end'
            }}>
              <Button
                variant="tertiary"
                size="medium"
                onClick={handleResetTripFilter}
                disabled={!hasTripFiltersToReset}
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                }}
                onMouseEnter={(e) => {
                  if (hasTripFiltersToReset) {
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
                onClick={handleApplyTripFilter}
                disabled={!hasTripFilterChanges}
              >
                Apply
              </Button>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Trip Sort Menu */}
      {isTripSortMenuOpen && tripSortButtonRef.current && (() => {
        const buttonRect = tripSortButtonRef.current.getBoundingClientRect();
        const sortOptions = [
          { sortBy: 'time' as const, order: 'asc' as const, label: 'Time (earliest first)' },
          { sortBy: 'time' as const, order: 'desc' as const, label: 'Time (latest first)' },
          { sortBy: 'ridership' as const, order: 'desc' as const, label: `${selectedMetric} (highest first)` },
          { sortBy: 'ridership' as const, order: 'asc' as const, label: `${selectedMetric} (lowest first)` }
        ];
        return createPortal(
          <div
            data-trip-sort-menu
            style={{
              position: 'fixed',
              top: `${buttonRect.bottom + 8}px`,
              left: `${buttonRect.left}px`,
              backgroundColor: 'var(--bg-elevated)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-large)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 10002,
              minWidth: '220px',
              overflowY: 'auto',
              paddingTop: '16px'
            }}
          >
            <div
              className="label text-text-tertiary"
              style={{
                padding: '0 16px 8px 16px'
              }}
            >
              Sort by
            </div>
            {sortOptions.map((option, index) => {
              const isSelected = tripSortBy === option.sortBy && tripSortOrder === option.order;
              return (
                <div
                  key={`${option.sortBy}-${option.order}`}
                  onClick={() => {
                    setTripSortBy(option.sortBy);
                    setTripSortOrder(option.order);
                    setIsTripSortMenuOpen(false);
                  }}
                  className="button-small"
                  style={{
                    padding: '12px 28px 12px 16px',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'background-color 0.2s ease',
                    backgroundColor: 'transparent',
                    margin: index === sortOptions.length - 1 ? '4px 0 12px 0' : '4px 0'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {isSelected && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                  <span style={{ marginLeft: isSelected ? '0' : '32px' }}>{option.label}</span>
                </div>
              );
            })}
          </div>,
          document.body
        );
      })()}

      {/* Stop Filter Menu */}
      {isStopFilterMenuOpen && stopFilterButtonRef.current && (() => {
        const buttonRect = stopFilterButtonRef.current.getBoundingClientRect();
        return createPortal(
          <div
            data-stop-filter-menu
            style={{
              position: 'fixed',
              top: `${buttonRect.bottom + 8}px`,
              left: `${buttonRect.left}px`,
              backgroundColor: 'var(--bg-elevated)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-large)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 10002,
              width: 'fit-content',
              maxHeight: '480px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Scrollable content area */}
            <div style={{
              overflowY: 'auto',
              padding: '16px',
              paddingBottom: '0'
            }}
            >
            <span className="button-small" style={{ color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '16px', display: 'block' }}>
              {selectedMetric}
            </span>
            <div style={{ marginBottom: '16px', width: '230px' }}>
              <Input
                type="number"
                label="More Than"
                value={stagedStopFilterMin ?? ''}
                onChange={(e) => setStagedStopFilterMin(e.target.value ? Number(e.target.value) : null)}
                placeholder="None"
                variant="elevated"
              />
            </div>
            <div style={{ marginBottom: '16px', width: '230px' }}>
              <Input
                type="number"
                label="Less Than"
                value={stagedStopFilterMax ?? ''}
                onChange={(e) => setStagedStopFilterMax(e.target.value ? Number(e.target.value) : null)}
                placeholder="None"
                variant="elevated"
              />
            </div>

            {/* Divider */}
            <div style={{
              height: '0.5px',
              backgroundColor: 'var(--border-default)',
              marginBottom: '16px'
            }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
              {STOP_AMENITIES.map(amenity => {
                const currentValue = stagedStopAmenityFilters.get(amenity);
                return (
                  <div key={amenity} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span className="button-small" style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{amenity}</span>
                    {/* Mini Split Control */}
                    <div style={{
                      display: 'flex',
                      gap: '0px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: '20px',
                      padding: '2px',
                      width: 'fit-content',
                      height: '40px'
                    }}>
                      <button
                        type="button"
                        onClick={() => {
                          const newFilters = new Map(stagedStopAmenityFilters);
                          newFilters.delete(amenity);
                          setStagedStopAmenityFilters(newFilters);
                        }}
                        style={{
                          padding: '0 16px',
                          height: '36px',
                          backgroundColor: currentValue === undefined ? 'var(--bg-elevated)' : 'transparent',
                          border: 'none',
                          borderRadius: '18px',
                          cursor: 'pointer',
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 'var(--label-size)',
                          fontWeight: 'var(--label-weight)',
                          color: currentValue === undefined ? 'var(--text-primary)' : 'var(--text-tertiary)',
                          lineHeight: 'var(--label-line-height)',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        Any
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newFilters = new Map(stagedStopAmenityFilters);
                          newFilters.set(amenity, true);
                          setStagedStopAmenityFilters(newFilters);
                        }}
                        style={{
                          padding: '0 16px',
                          height: '36px',
                          backgroundColor: currentValue === true ? 'var(--bg-elevated)' : 'transparent',
                          border: 'none',
                          borderRadius: '18px',
                          cursor: 'pointer',
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 'var(--label-size)',
                          fontWeight: 'var(--label-weight)',
                          color: currentValue === true ? 'var(--text-primary)' : 'var(--text-tertiary)',
                          lineHeight: 'var(--label-line-height)',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        Has
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newFilters = new Map(stagedStopAmenityFilters);
                          newFilters.set(amenity, false);
                          setStagedStopAmenityFilters(newFilters);
                        }}
                        style={{
                          padding: '0 16px',
                          height: '36px',
                          backgroundColor: currentValue === false ? 'var(--bg-elevated)' : 'transparent',
                          border: 'none',
                          borderRadius: '18px',
                          cursor: 'pointer',
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 'var(--label-size)',
                          fontWeight: 'var(--label-weight)',
                          color: currentValue === false ? 'var(--text-primary)' : 'var(--text-tertiary)',
                          lineHeight: 'var(--label-line-height)',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        Does Not Have
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            </div>

            {/* Sticky footer with buttons */}
            <div style={{
              padding: '16px',
              paddingTop: '16px',
              borderTop: '0.5px solid var(--border-default)',
              backgroundColor: 'var(--bg-elevated)',
              borderBottomLeftRadius: 'var(--radius-large)',
              borderBottomRightRadius: 'var(--radius-large)'
            }}>
              <div style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end'
              }}>
                <Button
                  variant="tertiary"
                  size="medium"
                  onClick={handleResetStopFilter}
                  disabled={!hasStopFiltersToReset}
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                  }}
                  onMouseEnter={(e) => {
                    if (hasStopFiltersToReset) {
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
                  onClick={handleApplyStopFilter}
                  disabled={!hasStopFilterChanges}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Stop Sort Menu */}
      {isStopSortMenuOpen && stopSortButtonRef.current && (() => {
        const buttonRect = stopSortButtonRef.current.getBoundingClientRect();
        const sortOptions = [
          { sortBy: 'name' as const, order: 'asc' as const, label: 'Name (A-Z)' },
          { sortBy: 'name' as const, order: 'desc' as const, label: 'Name (Z-A)' },
          { sortBy: 'ridership' as const, order: 'desc' as const, label: `${selectedMetric} (highest first)` },
          { sortBy: 'ridership' as const, order: 'asc' as const, label: `${selectedMetric} (lowest first)` }
        ];
        return createPortal(
          <div
            data-stop-sort-menu
            style={{
              position: 'fixed',
              top: `${buttonRect.bottom + 8}px`,
              left: `${buttonRect.left}px`,
              backgroundColor: 'var(--bg-elevated)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-large)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 10002,
              minWidth: '220px',
              overflowY: 'auto',
              paddingTop: '16px'
            }}
          >
            <div
              className="label text-text-tertiary"
              style={{
                padding: '0 16px 8px 16px'
              }}
            >
              Sort by
            </div>
            {sortOptions.map((option, index) => {
              const isSelected = stopSortBy === option.sortBy && stopSortOrder === option.order;
              return (
                <div
                  key={`${option.sortBy}-${option.order}`}
                  onClick={() => {
                    setStopSortBy(option.sortBy);
                    setStopSortOrder(option.order);
                    setIsStopSortMenuOpen(false);
                  }}
                  className="button-small"
                  style={{
                    padding: '12px 28px 12px 16px',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'background-color 0.2s ease',
                    backgroundColor: 'transparent',
                    margin: index === sortOptions.length - 1 ? '4px 0 12px 0' : '4px 0'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {isSelected && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                  <span style={{ marginLeft: isSelected ? '0' : '32px' }}>{option.label}</span>
                </div>
              );
            })}
          </div>,
          document.body
        );
      })()}

      {/* Trip Tooltip */}
      {tripTooltip && tripTooltip.show && (
        <div
          className="label"
          style={{
            position: 'fixed',
            left: `${tripTooltip.x}px`,
            top: `${tripTooltip.y - 8}px`,
            transform: 'translate(0, -100%)',
            backgroundColor: 'var(--btn-primary)',
            color: 'var(--text-btn-primary)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            whiteSpace: 'nowrap',
            zIndex: 10001,
            boxShadow: 'var(--shadow-lg)',
            pointerEvents: 'none'
          }}
        >
          <div>{tripTooltip.time}</div>
          <div>{tripTooltip.ridership} average daily boardings</div>
        </div>
      )}
    </div>
  );
}
