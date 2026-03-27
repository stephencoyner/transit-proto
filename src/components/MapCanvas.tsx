'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { accent, accent2, accentShimmer, ACCENT_UI_TEXT } from '@/lib/uiAccent';
import { createPortal } from 'react-dom';
import MapboxMap, { MapRef } from 'react-map-gl/mapbox';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer, TextLayer, IconLayer } from '@deck.gl/layers';
import { CompositeLayer, Layer } from '@deck.gl/core';
import { fetchShapesKCM, fetchStopsKCM, fetchRouteStopsMap, fetchPatternLookup, fetchRoutePatterns, PatternInfo, RoutePatternInfo, TripsByPattern, Trip, fetchRouteTrips, organizeTripsbyPattern, getTripStopTimes, TripStopTime, fetchTripStopTimes } from '@/lib/data/loaders';
import { WebMercatorViewport } from '@deck.gl/core';
import NavRail from '@/components/NavRail';
import { Button, Card, Input, Select, SearchableSelect, StatefulButton, SegmentedControl } from '@/components/ui';
import { Tooltip } from '@/components/ui/Tooltip';
import { MetricCard, ComparisonMetricCard, ByDateChart, ByDayChart, ByPeriodChart, ByPatternChart, ByRouteChart } from '@/components/charts';
import MapScale from '@/components/MapScale';
import { valueToColor, getValueRange } from '@/lib/utils/colorScale';
import { DATETIME_1_COLOR, DATETIME_2_COLOR, getComparisonColorRGB, POSITIVE_PILL_BG, POSITIVE_PILL_TEXT, NEGATIVE_PILL_BG, NEGATIVE_PILL_TEXT } from '@/utils/comparisonColors';
import { useSystemData, useSystemByDateData, useSystemByDayData, useRouteData, useRouteSegmentsData, useRouteByDateData, useRouteByDayData, useAllStopsData, useRouteStopsData, useStopData, useStopByDateData, useStopByDayData, useStopByPeriodData, useTripData, useRouteTripsData, useRouteGridData, setCachedData } from '@/hooks/useRidershipData';
import { useInsights } from '@/hooks/useInsights';
import { InsightsPanel } from '@/components/insights/InsightsPanel';
import type { ChatMessage } from '@/lib/chatHistory';
import { saveChatConversation, generateConversationId } from '@/lib/chatHistory';
import type { InsightCard as InsightCardType, WalkthroughFilterState } from '@/types/insights';
import { StoryModePanel } from '@/components/insights/StoryModePanel';
import type { FilterState } from '@/lib/utils/filterBuilder';
import { buildApiUrl, getCacheKey } from '@/lib/utils/filterBuilder';
import { Bookmark, BookmarkState, saveBookmark } from '@/lib/bookmarks';
import { calculateBounds as calculateBoundsUtil } from '@/lib/mapUtils';
import { MapThumbnailCapture } from '@/components/insights/MapThumbnailCapture';
import type { MapThumbnailCaptureHandle } from '@/components/insights/MapThumbnailCapture';
import BookmarksModal from '@/components/BookmarksModal';
import SaveBookmarkModal from '@/components/SaveBookmarkModal';

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

// Data range constraints - ridership data is only available for this period
const DATA_START_DATE = new Date(2025, 2, 21);  // March 21, 2025
const DATA_END_DATE = new Date(2025, 8, 30);    // September 30, 2025

// Helper to check if a date is within the valid data range
function isDateInDataRange(date: Date): boolean {
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return dateOnly >= DATA_START_DATE && dateOnly <= DATA_END_DATE;
}

// Helper to check if a month has any valid dates
function isMonthInDataRange(year: number, month: number): boolean {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0); // Last day of month
  return monthEnd >= DATA_START_DATE && monthStart <= DATA_END_DATE;
}

// Helper to check if a season is fully within the valid data range
function isSeasonInDataRange(season: 'winter' | 'spring' | 'summer' | 'fall', year: number): boolean {
  // Season date ranges (year parameter is the "service year" shown in UI)
  // Winter: Sep 21 of (year-1) to Mar 20 of year
  // Spring: Mar 21 to Jun 21 of year
  // Summer: Jun 22 to Sep 18 of year
  // Fall: Sep 19 of year to Mar 19 of (year+1)
  let seasonStart: Date;
  let seasonEnd: Date;

  switch (season) {
    case 'winter':
      seasonStart = new Date(year - 1, 8, 21); // Sep 21 of previous year
      seasonEnd = new Date(year, 2, 20); // Mar 20
      break;
    case 'spring':
      seasonStart = new Date(year, 2, 21); // Mar 21
      seasonEnd = new Date(year, 5, 21); // Jun 21
      break;
    case 'summer':
      seasonStart = new Date(year, 5, 22); // Jun 22
      seasonEnd = new Date(year, 8, 18); // Sep 18
      break;
    case 'fall':
      seasonStart = new Date(year, 8, 19); // Sep 19
      seasonEnd = new Date(year + 1, 2, 19); // Mar 19 of next year
      break;
  }

  // Check if entire season is within data range (not just overlapping)
  return seasonStart >= DATA_START_DATE && seasonEnd <= DATA_END_DATE;
}

// Helper to check if a year has any seasons with data
function isYearInDataRange(year: number): boolean {
  return isSeasonInDataRange('winter', year) ||
         isSeasonInDataRange('spring', year) ||
         isSeasonInDataRange('summer', year) ||
         isSeasonInDataRange('fall', year);
}

// Helper to match date range to a service season
function matchDatesToSeason(start: Date, end: Date): { season: 'winter' | 'spring' | 'summer' | 'fall'; year: number } | null {
  const startMonth = start.getMonth();
  const startDay = start.getDate();
  const endMonth = end.getMonth();
  const endDay = end.getDate();
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  // Spring: Mar 21 to Jun 21 (same year)
  if (startMonth === 2 && startDay === 21 && endMonth === 5 && endDay === 21 && startYear === endYear) {
    return { season: 'spring', year: startYear };
  }

  // Summer: Jun 22 to Sep 18 (same year)
  if (startMonth === 5 && startDay === 22 && endMonth === 8 && endDay === 18 && startYear === endYear) {
    return { season: 'summer', year: startYear };
  }

  // Winter: Sep 21 of prev year to Mar 20 of year
  if (startMonth === 8 && startDay === 21 && endMonth === 2 && endDay === 20 && endYear === startYear + 1) {
    return { season: 'winter', year: endYear };
  }

  // Fall: Sep 19 of year to Mar 19 of next year
  if (startMonth === 8 && startDay === 19 && endMonth === 2 && endDay === 19 && endYear === startYear + 1) {
    return { season: 'fall', year: startYear };
  }

  return null;
}

// Helper to check if a date range overlaps with the valid data range
function isRangeInDataRange(start: Date, end: Date): boolean {
  return end >= DATA_START_DATE && start <= DATA_END_DATE;
}

// Calculate UI padding dynamically based on visible panels
const getUIPadding = (isFiltersPanelOpen: boolean, navRailWidth: number = 72) => {
  // NavRail: 72px (default) or 60px (AI mode), Filters panel: 256px (when open), Data panel: 376px
  // Margins: 12px between panels, 12px from screen edges
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
  const ampm = hour >= 12 ? 'pm' : 'am';
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
  const [activeTab, setActiveTab] = useState<'home' | 'system' | 'routes' | 'stops' | 'components'>('home');
  const [isTabTransitioning, setIsTabTransitioning] = useState(false); // controls layout (panel positions)
  const [isTabContentHidden, setIsTabContentHidden] = useState(false); // controls opacity
  const pendingTabRef = useRef<string | null>(null);
  const [transitionToHome, setTransitionToHome] = useState(false); // true = growing to home, false = shrinking from home
  const [isBookmarksModalOpen, setIsBookmarksModalOpen] = useState(false);
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const [hoveredStop, setHoveredStop] = useState<string | null>(null);
  const [hoveredStopCoords, setHoveredStopCoords] = useState<{ x: number; y: number } | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null); // Index of hovered segment
  const [hoveredSegmentCoords, setHoveredSegmentCoords] = useState<{ x: number; y: number } | null>(null); // Screen coords for segment tooltip
  const [selectedBoardingStop, setSelectedBoardingStop] = useState<string | null>(null); // Selected stop in boardings card
  const [tooltipStopIndex, setTooltipStopIndex] = useState<number | null>(null); // Index of stop showing tooltip
  const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const selectedStopRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const selectedSegmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const mapRef = useRef<MapRef>(null);
  const thumbnailCaptureRef = useRef<MapThumbnailCaptureHandle>(null);
  const [openFilter, setOpenFilter] = useState<'date' | 'days' | 'compare' | 'date2' | 'days2' | null>(null);
  // Track when restoring a bookmark to skip auto-reset effects
  const isRestoringBookmarkRef = useRef(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [selectedRouteTab, setSelectedRouteTab] = useState<'Summary' | 'Trips' | 'Grid'>('Summary');
  const [selectedStopTab, setSelectedStopTab] = useState<'Summary' | 'Amenities'>('Summary');
  // Navigation back stack - stores previous contexts when drilling down (RDV -> SDV -> SDV -> ...)
  type NavStackItem =
    | { type: 'route'; routeId: string; routeTab: 'Summary' | 'Trips' | 'Grid' }
    | { type: 'stop'; stopId: string; stopTab: 'Summary' | 'Amenities' };
  const [navigationStack, setNavigationStack] = useState<NavStackItem[]>([]);
  const [isGridTransitioning, setIsGridTransitioning] = useState<boolean>(false);
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState<boolean>(false);
  const hasUserClosedFiltersRef = useRef<boolean>(false); // tracks if user explicitly closed filters
  const hasLeftHomeRef = useRef<boolean>(false); // tracks if user has navigated away from home at least once

  const [experimentalDetailViewNav] = useState<boolean>(true); // Always true - controls visibility of route/stop controls
  const [routeControlsTitleSemibold, setRouteControlsTitleSemibold] = useState<boolean>(false);
  const [differentiatedPanelBackgrounds, setDifferentiatedPanelBackgrounds] = useState<boolean>(false);
  const [aiMode, setAiMode] = useState<boolean>(true);
  // crossFadeAnimation is always on (tab transition animation)
  const [hoveredViewButton, setHoveredViewButton] = useState<'Summary' | 'Trips' | 'Grid' | null>(null);
  const [hoveredStopViewButton, setHoveredStopViewButton] = useState<'Summary' | 'Amenities' | null>(null);
  const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState<boolean>(false);
  const [isStopDropdownOpen, setIsStopDropdownOpen] = useState<boolean>(false);
  const [stopDropdownPosition, setStopDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const stopNameRef = useRef<HTMLDivElement>(null);
  const filterPanelJustClosedRef = useRef<boolean>(false);
  const [gridSize, setGridSize] = useState<'large' | 'medium' | 'small'>('large');
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
  const date2Ref = useRef<HTMLDivElement | null>(null);
  const days2Ref = useRef<HTMLDivElement | null>(null);
  // const metricRef = useRef<HTMLDivElement | null>(null);
  const compareRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const initialFittedViewRef = useRef<typeof INITIAL_VIEW_STATE | null>(null);
  const prevSelectedStopIdRef = useRef<string | null>(null);

  // State for panel position
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  // Track which pattern cards have sticky headers
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [stickyPatterns, setStickyPatterns] = useState<Set<number>>(new Set());

  // Track scroll position for smooth border radius animation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [scrollProgress, setScrollProgress] = useState(0);

  // Add hover state tracking for filters and button
  const [isDateHovered, setIsDateHovered] = useState(false);
  const [isDaysHovered, setIsDaysHovered] = useState(false);
  const [isCompareHovered, setIsCompareHovered] = useState(false);
  const [isDate2Hovered, setIsDate2Hovered] = useState(false);
  const [isDays2Hovered, setIsDays2Hovered] = useState(false);

  // Bookmark capture state
  const [isSaveBookmarkModalOpen, setIsSaveBookmarkModalOpen] = useState<boolean>(false);
  const [showBookmarkSavedToast, setShowBookmarkSavedToast] = useState<boolean>(false);
  const [pendingBookmarkImage, setPendingBookmarkImage] = useState<string | null>(null);
  const [isCapturingBookmark, setIsCapturingBookmark] = useState<boolean>(false);

  // Comparison mode state
  const [comparisonMode, setComparisonMode] = useState<boolean>(false);
  const [comparisonDateRange, setComparisonDateRange] = useState<{ start: Date | null, end: Date | null }>({ start: null, end: null });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [comparisonPreset, setComparisonPreset] = useState<'previous-period' | 'previous-year' | 'custom' | null>(null);
  const [comparisonSwapped, setComparisonSwapped] = useState<boolean>(false);

  // Date-time 2 picker state (comparison range)
  const [date2PickerMode, setDate2PickerMode] = useState<'shortcuts' | 'custom'>('shortcuts');
  const [selectedYear2, setSelectedYear2] = useState(2025);
  const [stagedSeason2, setStagedSeason2] = useState<{ season: 'winter' | 'spring' | 'summer' | 'fall'; year: number } | null>(null);
  const [stagedQuickPick2, setStagedQuickPick2] = useState<string | null>(null);
  const [calendarStartMonth2, setCalendarStartMonth2] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth());
  });
  const [stagedStartDate2, setStagedStartDate2] = useState<Date | null>(null);
  const [stagedEndDate2, setStagedEndDate2] = useState<Date | null>(null);
  const [originalSeason2, setOriginalSeason2] = useState<{ season: 'winter' | 'spring' | 'summer' | 'fall'; year: number } | null>(null);
  const [originalQuickPick2, setOriginalQuickPick2] = useState<string | null>(null);
  const [originalStartDate2, setOriginalStartDate2] = useState<Date | null>(null);
  const [originalEndDate2, setOriginalEndDate2] = useState<Date | null>(null);

  // Day/Time period picker state for Date-time 2
  const [appliedDaysMode2, setAppliedDaysMode2] = useState<'all' | 'weekdays' | 'weekends' | 'custom'>('all');
  const [appliedCustomDays2, setAppliedCustomDays2] = useState<string[]>([]);
  const [appliedTimeMode2, setAppliedTimeMode2] = useState<'all' | 'custom'>('all');
  const [appliedTimePeriods2, setAppliedTimePeriods2] = useState<string[]>([]);
  const [stagedDaysMode2, setStagedDaysMode2] = useState<'all' | 'weekdays' | 'weekends' | 'custom'>('all');
  const [stagedCustomDays2, setStagedCustomDays2] = useState<string[]>([]);
  const [stagedTimeMode2, setStagedTimeMode2] = useState<'all' | 'custom'>('all');

  const [stagedTimePeriods2, setStagedTimePeriods2] = useState<string[]>([]);
  const [originalDaysMode2, setOriginalDaysMode2] = useState<'all' | 'weekdays' | 'weekends' | 'custom'>('all');
  const [originalCustomDays2, setOriginalCustomDays2] = useState<string[]>([]);
  const [originalTimeMode2, setOriginalTimeMode2] = useState<'all' | 'custom'>('all');
  const [originalTimePeriods2, setOriginalTimePeriods2] = useState<string[]>([]);

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

  // Tooltip state for swap button
  const [showSwapTooltip, setShowSwapTooltip] = useState(false);
  const swapTooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const swapButtonRef = useRef<HTMLButtonElement | null>(null);

  // Tooltip state for exit comparison button
  const [showExitTooltip, setShowExitTooltip] = useState(false);
  const exitTooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const exitButtonRef = useRef<HTMLButtonElement | null>(null);

  // Tooltip state for Date-time 2 filters
  const [showDate2Tooltip, setShowDate2Tooltip] = useState(false);
  const date2TooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const date2TextRef = useRef<HTMLSpanElement | null>(null);

  const [showDays2Tooltip, setShowDays2Tooltip] = useState(false);
  const days2TooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const days2TextRef = useRef<HTMLSpanElement | null>(null);

  // Suppress unused variable warnings for future use
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hoveredTrip, setHoveredTrip] = useState<string | null>(null);

  // State for selected trip (for trip detail view)
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedTripStops, setSelectedTripStops] = useState<TripStopTime[]>([]);
  const [isTripContentScrolled, setIsTripContentScrolled] = useState(false);
  const [isRouteContentScrolled, setIsRouteContentScrolled] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isAmenitiesScrolled, setIsAmenitiesScrolled] = useState(false);

  // Tooltip state for trips
  const [tripTooltip, setTripTooltip] = useState<{
    show: boolean;
    time: string;
    ridership: number;
    ridership2?: number;
    isComparisonMode?: boolean;
    x: number;
    y: number;
  } | null>(null);

  // Ref for trips scroll container
  const tripsScrollRef = useRef<HTMLDivElement>(null);
  // Ref to preserve scroll position when entering/leaving trip detail view
  const tripsScrollPositionRef = useRef<number>(0);

  // Grid view state
  const [gridTripStops, setGridTripStops] = useState<{ [tripId: string]: TripStopTime[] }>({});
  const [isLoadingGridData, setIsLoadingGridData] = useState(false);
  const currentGridPatternIndexRef = useRef(0);
  const gridContentRef = useRef<HTMLDivElement>(null);
  const gridHeadsignRef = useRef<HTMLDivElement>(null);

  // NOTE: filteredGridTripsForHeader and currentGridPatternHeadsign are computed
  // after routeTripsWithRidership (around line 1260) to properly filter trips by time period in Grid view

  // Trip filtering and sorting state - Applied state (what's actually being used)
  const [appliedTripFilterMin, setAppliedTripFilterMin] = useState<number | null>(null);
  const [appliedTripFilterMax, setAppliedTripFilterMax] = useState<number | null>(null);
  // Staged state (temporary changes in the picker)
  const [stagedTripFilterMin, setStagedTripFilterMin] = useState<number | null>(null);
  const [stagedTripFilterMax, setStagedTripFilterMax] = useState<number | null>(null);
  // Original state when picker was opened (for Reset)
  const [originalTripFilterMin, setOriginalTripFilterMin] = useState<number | null>(null);
  const [originalTripFilterMax, setOriginalTripFilterMax] = useState<number | null>(null);

  const [tripSortBy, setTripSortBy] = useState<'ridership' | 'time' | 'largestIncrease' | 'largestDecrease' | 'largestChange'>('time');
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

  const [stopSortBy, setStopSortBy] = useState<'name' | 'ridership' | 'largestIncrease' | 'largestDecrease' | 'largestChange'>('ridership');
  const [stopSortOrder, setStopSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isStopFilterMenuOpen, setIsStopFilterMenuOpen] = useState(false);
  const [isStopSortMenuOpen, setIsStopSortMenuOpen] = useState(false);
  const [isStopFilterButtonHovered, setIsStopFilterButtonHovered] = useState(false);
  const [isStopSortButtonHovered, setIsStopSortButtonHovered] = useState(false);
  const [isStopsListScrolled, setIsStopsListScrolled] = useState(false);
  const stopFilterButtonRef = useRef<HTMLButtonElement>(null);
  const stopSortButtonRef = useRef<HTMLButtonElement>(null);

  // Route filter/sort state (for Routes tab)
  const [appliedRouteFilterMin, setAppliedRouteFilterMin] = useState<number | null>(null);
  const [appliedRouteFilterMax, setAppliedRouteFilterMax] = useState<number | null>(null);
  const [stagedRouteFilterMin, setStagedRouteFilterMin] = useState<number | null>(null);
  const [stagedRouteFilterMax, setStagedRouteFilterMax] = useState<number | null>(null);
  const [originalRouteFilterMin, setOriginalRouteFilterMin] = useState<number | null>(null);
  const [originalRouteFilterMax, setOriginalRouteFilterMax] = useState<number | null>(null);

  const [routeSortBy, setRouteSortBy] = useState<'name' | 'ridership' | 'largestIncrease' | 'largestDecrease' | 'largestChange'>('ridership');
  const [routeSortOrder, setRouteSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isRouteFilterMenuOpen, setIsRouteFilterMenuOpen] = useState(false);
  const [isRouteSortMenuOpen, setIsRouteSortMenuOpen] = useState(false);
  const [isRouteFilterButtonHovered, setIsRouteFilterButtonHovered] = useState(false);
  const [isRouteSortButtonHovered, setIsRouteSortButtonHovered] = useState(false);
  const [isRoutesListScrolled, setIsRoutesListScrolled] = useState(false);
  const [isSystemContentScrolled, setIsSystemContentScrolled] = useState(false);
  const routeFilterButtonRef = useRef<HTMLButtonElement>(null);
  const routeSortButtonRef = useRef<HTMLButtonElement>(null);

  // Date picker state - Applied state (what's actually being used)
  // Default to Summer 2025 (June 20 - Sept 21)
  const [appliedSeason, setAppliedSeason] = useState<{ season: 'winter' | 'spring' | 'summer' | 'fall'; year: number } | null>({ season: 'summer', year: 2025 });
  const [appliedQuickPick, setAppliedQuickPick] = useState<string | null>(null);
  const [appliedStartDate, setAppliedStartDate] = useState<Date | null>(null);  // null when using season
  const [appliedEndDate, setAppliedEndDate] = useState<Date | null>(null);      // null when using season

  // Staged state (temporary changes in the picker)
  const [datePickerMode, setDatePickerMode] = useState<'shortcuts' | 'custom'>('shortcuts');
  const [selectedYear, setSelectedYear] = useState(2025);
  const [stagedSeason, setStagedSeason] = useState<{ season: 'winter' | 'spring' | 'summer' | 'fall'; year: number } | null>({ season: 'summer', year: 2025 });
  const [stagedQuickPick, setStagedQuickPick] = useState<string | null>(null);
  const [calendarStartMonth, setCalendarStartMonth] = useState(() => {
    // Default to June 2025 (start of Summer)
    return new Date(2025, 5);
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

  // Placeholder for comparison chart data - will be populated from API data via useMemo hooks

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

  // State for stop amenities (mock data - not in ridership database)
  const [stopAmenities, setStopAmenities] = React.useState<{ [key: string]: { [amenity: string]: string | false } }>({});

  // Define available amenities
  const STOP_AMENITIES = useMemo(() => [
    'Advertisement',
    'Bike Rack',
    'Lighting',
    'Loud Speaker',
    'Real-time Display',
    'Seating',
    'Shelter',
    'Tactile Paving',
    'Trash Can',
    'Wheelchair Access'
  ], []);

  // Compute the effective date range for API calls based on applied filters
  const effectiveDateRange = useMemo(() => {
    // If explicit date range is set, use it
    if (appliedStartDate && appliedEndDate) {
      return { start: appliedStartDate, end: appliedEndDate };
    }

    // If quick pick is selected, compute dates
    if (appliedQuickPick) {
      const today = new Date();
      let startDate: Date;
      const endDate = today;

      switch (appliedQuickPick) {
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
          return { start: null, end: null };
      }
      return { start: startDate, end: endDate };
    }

    // If season is selected, compute dates (must match getSeasonDates function)
    if (appliedSeason) {
      const { season, year } = appliedSeason;
      const prevYear = year - 1;
      const today = new Date();
      let dates: { start: Date; end: Date };
      switch (season) {
        case 'winter':
          dates = { start: new Date(prevYear, 8, 21), end: new Date(year, 2, 20) }; // Sep 21 prev year - Mar 20
          break;
        case 'spring':
          dates = { start: new Date(year, 2, 21), end: new Date(year, 5, 21) }; // Mar 21 - Jun 21
          break;
        case 'summer':
          dates = { start: new Date(year, 5, 22), end: new Date(year, 8, 18) }; // Jun 22 - Sep 18
          break;
        case 'fall':
          // For current year fall, end at today
          if (year === today.getFullYear()) {
            dates = { start: new Date(year, 8, 19), end: today }; // Sep 19 - today
          } else {
            dates = { start: new Date(year, 8, 19), end: new Date(year + 1, 2, 19) }; // Sep 19 - Mar 19 next year
          }
          break;
        default:
          dates = { start: new Date(), end: new Date() };
      }
      return { start: dates.start, end: dates.end };
    }

    return { start: null, end: null };
  }, [appliedStartDate, appliedEndDate, appliedQuickPick, appliedSeason]);

  // Build filter state for API calls
  const filterState: FilterState = useMemo(() => ({
    startDate: effectiveDateRange.start,
    endDate: effectiveDateRange.end,
    daysMode: appliedDaysMode,
    customDays: appliedCustomDays,
    timeMode: appliedTimeMode,
    timePeriods: appliedTimePeriods,
  }), [effectiveDateRange.start, effectiveDateRange.end, appliedDaysMode, appliedCustomDays, appliedTimeMode, appliedTimePeriods]);

  // Build filter state for route-specific API calls (includes direction from selected pattern)
  const routeFilterState: FilterState = useMemo(() => {
    // Look up direction_id from selected pattern
    let directionId: '0' | '1' | undefined;
    if (selectedPattern && selectedRouteId && routePatterns[selectedRouteId]) {
      const patternInfo = routePatterns[selectedRouteId].patterns.find(p => p.headsign === selectedPattern);
      if (patternInfo) {
        directionId = patternInfo.direction_id as '0' | '1';
      }
    }
    return {
      startDate: effectiveDateRange.start,
      endDate: effectiveDateRange.end,
      daysMode: appliedDaysMode,
      customDays: appliedCustomDays,
      timeMode: appliedTimeMode,
      timePeriods: appliedTimePeriods,
      directionId,
    };
  }, [effectiveDateRange.start, effectiveDateRange.end, appliedDaysMode, appliedCustomDays, appliedTimeMode, appliedTimePeriods, selectedPattern, selectedRouteId, routePatterns]);

  // Build filter state for comparison period (Date-time 2)
  const filterState2: FilterState = useMemo(() => ({
    startDate: comparisonDateRange.start,
    endDate: comparisonDateRange.end,
    daysMode: appliedDaysMode2,
    customDays: appliedCustomDays2,
    timeMode: appliedTimeMode2,
    timePeriods: appliedTimePeriods2,
  }), [comparisonDateRange.start, comparisonDateRange.end, appliedDaysMode2, appliedCustomDays2, appliedTimeMode2, appliedTimePeriods2]);

  // Build route filter state for comparison period (Date-time 2) - includes direction from pattern selection
  const routeFilterState2: FilterState = useMemo(() => {
    // Look up direction_id from selected pattern (same as routeFilterState)
    let directionId: '0' | '1' | undefined;
    if (selectedPattern && selectedRouteId && routePatterns[selectedRouteId]) {
      const patternInfo = routePatterns[selectedRouteId].patterns.find(p => p.headsign === selectedPattern);
      if (patternInfo) {
        directionId = patternInfo.direction_id as '0' | '1';
      }
    }
    return {
      startDate: comparisonDateRange.start,
      endDate: comparisonDateRange.end,
      daysMode: appliedDaysMode2,
      customDays: appliedCustomDays2,
      timeMode: appliedTimeMode2,
      timePeriods: appliedTimePeriods2,
      directionId,
    };
  }, [comparisonDateRange.start, comparisonDateRange.end, appliedDaysMode2, appliedCustomDays2, appliedTimeMode2, appliedTimePeriods2, selectedPattern, selectedRouteId, routePatterns]);

  // Fetch ridership data from API
  const { data: systemData, isLoading: isSystemLoading } = useSystemData(filterState, !!effectiveDateRange.start);
  const { data: systemByDateData, isLoading: isByDateLoading } = useSystemByDateData(filterState, !!effectiveDateRange.start);
  const { data: systemByDayData, isLoading: isByDayLoading } = useSystemByDayData(filterState, !!effectiveDateRange.start);

  // Fetch comparison period data (Date-time 2)
  const { data: systemData2, isLoading: isSystemData2Loading } = useSystemData(filterState2, comparisonMode && !!comparisonDateRange.start);
  const { data: systemByDateData2, isLoading: isByDateData2Loading } = useSystemByDateData(filterState2, comparisonMode && !!comparisonDateRange.start);
  const { data: systemByDayData2, isLoading: isByDayData2Loading } = useSystemByDayData(filterState2, comparisonMode && !!comparisonDateRange.start);

  // Fetch all stops data for comparison period
  const { data: allStopsData2, isLoading: isAllStopsData2Loading } = useAllStopsData(filterState2, comparisonMode && !!comparisonDateRange.start);

  // Combined loading state for comparison data
  const isComparisonDataLoading = comparisonMode && (isSystemData2Loading || isByDateData2Loading || isByDayData2Loading || isAllStopsData2Loading);

  // Loading state for dimming (basic - without stops loading which is defined later)
  const isBasicRidershipLoading = isSystemLoading || isByDateLoading || isByDayLoading;

  // Helper function to get the correct metric value based on selected metric
  const getMetricValue = useCallback((metrics: {
    avgDailyBoardings?: number;
    totalBoardings?: number;
    avgDailyAlightings?: number;
    totalAlightings?: number;
    avgDailyActivity?: number;
    totalActivity?: number;
    avgLoad?: number;
    maxLoad?: number;
  }, metric: string): number => {
    switch (metric) {
      case 'Average daily boardings':
        return metrics.avgDailyBoardings || 0;
      case 'Total boardings':
        return metrics.totalBoardings || 0;
      case 'Average daily alightings':
        return metrics.avgDailyAlightings || 0;
      case 'Total alightings':
        return metrics.totalAlightings || 0;
      case 'Average daily activity':
        return metrics.avgDailyActivity || 0;
      case 'Total activity':
        return metrics.totalActivity || 0;
      case 'Average load':
        return metrics.avgLoad || 0;
      case 'Maxload':
        return metrics.maxLoad || 0;
      default:
        return metrics.avgDailyBoardings || 0;
    }
  }, []);

  // Transform API data to chart formats (respecting selected metric)
  const dataByDay = useMemo(() => {
    if (!systemByDayData?.data) return [];
    // For by-day data, we use the per-day values from the API
    // The API returns avgDailyBoardings which is total/dayCount
    return systemByDayData.data.map(d => {
      // Map the metric to the available fields in by-day response
      let value: number;
      switch (selectedMetric) {
        case 'Average daily boardings':
          value = d.avgDailyBoardings;
          break;
        case 'Total boardings':
          value = d.totalBoardings;
          break;
        case 'Average daily alightings':
          value = Math.round(d.totalAlightings / (d.dayCount || 1));
          break;
        case 'Average daily activity':
          value = Math.round((d.totalBoardings + d.totalAlightings) / (d.dayCount || 1));
          break;
        case 'Total activity':
          value = d.totalBoardings + d.totalAlightings;
          break;
        case 'Average load':
          value = d.avgLoad;
          break;
        case 'Maxload':
          value = d.maxLoad;
          break;
        default:
          value = d.avgDailyBoardings;
      }
      return { day: d.dayName, value };
    });
  }, [systemByDayData, selectedMetric]);

  const dataByPeriod = useMemo(() => {
    if (!systemData?.byTimePeriod) return [];
    const periodLabels: Record<string, string> = {
      'early_am': 'Early AM',
      'am_peak': 'AM Peak',
      'midday': 'Midday',
      'pm_peak': 'PM Peak',
      'evening': 'Evening',
      'night': 'Night',
    };
    return systemData.byTimePeriod.map(p => ({
      period: periodLabels[p.timePeriod] || p.timePeriod,
      value: getMetricValue(p.metrics, selectedMetric),
    }));
  }, [systemData, selectedMetric, getMetricValue]);

  const dataByDate = useMemo(() => {
    if (!systemByDateData?.data) return [];
    return systemByDateData.data.map(d => {
      // Map the metric to the available fields in by-date response
      let value: number;
      switch (selectedMetric) {
        case 'Average daily boardings':
        case 'Total boardings':
          value = d.totalBoardings;
          break;
        case 'Average daily alightings':
        case 'Total alightings':
          value = d.totalAlightings;
          break;
        case 'Average daily activity':
        case 'Total activity':
          value = d.totalBoardings + d.totalAlightings;
          break;
        case 'Average load':
          value = d.avgLoad;
          break;
        case 'Maxload':
          value = d.maxLoad;
          break;
        default:
          value = d.totalBoardings;
      }
      return { date: d.date, value };
    });
  }, [systemByDateData, selectedMetric]);

  // Calculate average for By Day chart
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const averageDailyByDay = useMemo(() => {
    if (dataByDay.length === 0) return 0;
    return dataByDay.reduce((sum, item) => sum + item.value, 0) / dataByDay.length;
  }, [dataByDay]);

  // Comparison chart data from API (Date-time 2)
  const comparisonDataByDay = useMemo(() => {
    if (!systemByDayData2?.data) return [];
    return systemByDayData2.data.map(d => {
      let value: number;
      switch (selectedMetric) {
        case 'Average daily boardings':
          value = d.avgDailyBoardings;
          break;
        case 'Total boardings':
          value = d.totalBoardings;
          break;
        case 'Average daily alightings':
          value = Math.round(d.totalAlightings / (d.dayCount || 1));
          break;
        case 'Average daily activity':
          value = Math.round((d.totalBoardings + d.totalAlightings) / (d.dayCount || 1));
          break;
        case 'Total activity':
          value = d.totalBoardings + d.totalAlightings;
          break;
        case 'Average load':
          value = d.avgLoad;
          break;
        case 'Maxload':
          value = d.maxLoad;
          break;
        default:
          value = d.avgDailyBoardings;
      }
      return { day: d.dayName, value };
    });
  }, [systemByDayData2, selectedMetric]);

  const comparisonDataByPeriod = useMemo(() => {
    if (!systemData2?.byTimePeriod) return [];
    const periodLabels: Record<string, string> = {
      'early_am': 'Early AM',
      'am_peak': 'AM Peak',
      'midday': 'Midday',
      'pm_peak': 'PM Peak',
      'evening': 'Evening',
      'night': 'Night',
    };
    return systemData2.byTimePeriod.map(p => ({
      period: periodLabels[p.timePeriod] || p.timePeriod,
      value: getMetricValue(p.metrics, selectedMetric),
    }));
  }, [systemData2, selectedMetric, getMetricValue]);

  const comparisonChartDataByDate = useMemo(() => {
    if (!systemByDateData2?.data) return [];
    return systemByDateData2.data.map(d => {
      let value: number;
      switch (selectedMetric) {
        case 'Average daily boardings':
        case 'Total boardings':
          value = d.totalBoardings;
          break;
        case 'Average daily alightings':
        case 'Total alightings':
          value = d.totalAlightings;
          break;
        case 'Average daily activity':
        case 'Total activity':
          value = d.totalBoardings + d.totalAlightings;
          break;
        case 'Average load':
          value = d.avgLoad;
          break;
        case 'Maxload':
          value = d.maxLoad;
          break;
        default:
          value = d.totalBoardings;
      }
      return { date: d.date, value };
    });
  }, [systemByDateData2, selectedMetric]);

  // Route ridership values from API (for map coloring) - respects selected metric
  const routeRidershipValues = useMemo(() => {
    if (!systemData?.byRoute) return {};
    const values: { [key: string]: number } = {};
    systemData.byRoute.forEach(r => {
      values[r.routeId] = getMetricValue(r.metrics, selectedMetric);
    });
    return values;
  }, [systemData, selectedMetric, getMetricValue]);

  // Fetch route-specific data when a route is selected (uses routeFilterState for pattern/direction filtering)
  const { data: routeData, isLoading: isRouteLoading } = useRouteData(selectedRouteId, routeFilterState, !!effectiveDateRange.start && !!selectedRouteId);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: routeSegmentsData, isLoading: isSegmentsLoading } = useRouteSegmentsData(selectedRouteId, routeFilterState, !!effectiveDateRange.start && !!selectedRouteId);
  const { data: routeByDateData, isLoading: isRouteByDateLoading } = useRouteByDateData(selectedRouteId, routeFilterState, !!effectiveDateRange.start && !!selectedRouteId);
  const { data: routeByDayData, isLoading: isRouteByDayLoading } = useRouteByDayData(selectedRouteId, routeFilterState, !!effectiveDateRange.start && !!selectedRouteId);

  // Fetch route-specific comparison data (Date-time 2)
  const { data: routeData2, isLoading: isRouteData2Loading } = useRouteData(selectedRouteId, routeFilterState2, comparisonMode && !!comparisonDateRange.start && !!selectedRouteId);
  const { data: routeByDateData2, isLoading: isRouteByDateData2Loading } = useRouteByDateData(selectedRouteId, routeFilterState2, comparisonMode && !!comparisonDateRange.start && !!selectedRouteId);
  const { data: routeByDayData2, isLoading: isRouteByDayData2Loading } = useRouteByDayData(selectedRouteId, routeFilterState2, comparisonMode && !!comparisonDateRange.start && !!selectedRouteId);

  // Fetch all stops data for stops view - only when on stops tab (this query is slow)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const needsAllStopsData = activeTab === 'stops' && !selectedRouteId && !selectedStopId;
  const { data: allStopsData, isLoading: isAllStopsLoading } = useAllStopsData(filterState, !!effectiveDateRange.start && needsAllStopsData);

  // Fetch stop-specific data when a stop is selected (for SDV charts)
  const { data: stopData, isLoading: isStopDataLoading } = useStopData(selectedStopId, filterState, !!effectiveDateRange.start && !!selectedStopId);
  const { data: stopByDateData, isLoading: isStopByDateLoading } = useStopByDateData(selectedStopId, filterState, !!effectiveDateRange.start && !!selectedStopId);
  const { data: stopByDayData, isLoading: isStopByDayLoading } = useStopByDayData(selectedStopId, filterState, !!effectiveDateRange.start && !!selectedStopId);
  const { data: stopByPeriodData, isLoading: isStopByPeriodLoading } = useStopByPeriodData(selectedStopId, filterState, !!effectiveDateRange.start && !!selectedStopId);

  // Fetch trip-specific data when a trip is selected (for TDV)
  const { data: tripData, isLoading: isTripLoading } = useTripData(selectedTrip?.trip_id || null, filterState, !!effectiveDateRange.start && !!selectedTrip);

  // Fetch trip-specific comparison data (Date-time 2) for TDV comparison mode
  const { data: tripData2, isLoading: isTripData2Loading } = useTripData(selectedTrip?.trip_id || null, filterState2, comparisonMode && !!comparisonDateRange.start && !!selectedTrip);

  // Route-specific comparison loading state
  const isRouteComparisonLoading = comparisonMode && selectedRouteId && (isRouteData2Loading || isRouteByDateData2Loading || isRouteByDayData2Loading);

  // Trip-specific comparison loading state
  const isTripComparisonLoading = comparisonMode && selectedTrip && isTripData2Loading;

  // Check if route data matches the selected route (handles stale cached data during route switch)
  const isRouteDataStale = selectedRouteId && routeData && routeData.metrics.routeId !== selectedRouteId;
  const isSegmentDataStale = selectedRouteId && routeSegmentsData && routeSegmentsData.routeId !== selectedRouteId;

  // Full loading state for dimming - includes view-specific loading states
  // Also consider "loading" if data is stale (from previous route)
  // When a trip is selected, only check trip loading (not route stale data)
  // In comparison mode with trip selected, also check isTripData2Loading for segment coloring
  const isRidershipLoading = isBasicRidershipLoading
    || (activeTab === 'stops' && isAllStopsLoading)
    || (selectedTrip ? (isTripLoading || (comparisonMode && isTripData2Loading)) : (selectedRouteId && (isRouteLoading || isSegmentsLoading || isRouteDataStale || isSegmentDataStale)));

  // Fetch route trips ridership data for trips list view (uses routeFilterState for pattern/direction filtering)
  const { data: routeTripsRidership, isLoading: isTripsLoading } = useRouteTripsData(selectedRouteId, routeFilterState, !!effectiveDateRange.start && !!selectedRouteId);

  // Check if trips data is stale (from a different route than currently selected)
  const isTripsDataStale = selectedRouteId && routeTripsRidership && routeTripsRidership.routeId !== selectedRouteId;

  // Fetch route stops ridership data for map stop coloring when route is selected (uses routeFilterState for pattern/direction filtering)
  const { data: routeStopsRidership } = useRouteStopsData(selectedRouteId, routeFilterState, !!effectiveDateRange.start && !!selectedRouteId);
  // Fetch comparison data for route stops (Date-time 2)
  const { data: routeStopsRidership2 } = useRouteStopsData(selectedRouteId, routeFilterState2, comparisonMode && !!comparisonDateRange.start && !!selectedRouteId);

  // Fetch route grid data for trips grid view (per-trip per-stop ridership)
  // Start fetching when route is selected (not waiting for Grid tab) to preload data in background
  // This query takes ~10s for large date ranges, so preloading hides latency while user browses Trips list
  const { data: routeGridData, isLoading: isGridDataLoading } = useRouteGridData(
    selectedRouteId,
    routeFilterState,
    !!effectiveDateRange.start && !!selectedRouteId
  );
  // Fetch comparison grid data (Date-time 2) for segment comparison
  const { data: routeGridData2, isLoading: isGridData2Loading } = useRouteGridData(
    selectedRouteId,
    routeFilterState2,
    comparisonMode && !!comparisonDateRange.start && !!selectedRouteId
  );

  // Check if grid data is stale (from a different route than currently selected)
  const isGridDataStale = selectedRouteId && routeGridData && routeGridData.routeId !== selectedRouteId;
  const isGridData2Stale = selectedRouteId && routeGridData2 && routeGridData2.routeId !== selectedRouteId;

  // Create a map of trip_id -> all metrics from the API data
  const tripMetricsMap = useMemo(() => {
    const map = new Map<string, {
      avgDailyBoardings: number;
      avgDailyAlightings: number;
      avgDailyActivity: number;
      totalBoardings: number;
      totalAlightings: number;
      totalActivity: number;
      avgLoad: number;
      maxLoad: number;
    }>();
    if (routeTripsRidership?.trips) {
      const daysInRange = filterState.startDate && filterState.endDate
        ? Math.ceil((filterState.endDate.getTime() - filterState.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
        : 30;
      for (const trip of routeTripsRidership.trips) {
        map.set(trip.tripId, {
          avgDailyBoardings: Math.round(trip.totalBoardings / daysInRange),
          avgDailyAlightings: Math.round(trip.totalAlightings / daysInRange),
          avgDailyActivity: Math.round((trip.totalBoardings + trip.totalAlightings) / daysInRange),
          totalBoardings: trip.totalBoardings,
          totalAlightings: trip.totalAlightings,
          totalActivity: trip.totalBoardings + trip.totalAlightings,
          avgLoad: Math.round(trip.avgLoad * 10) / 10,
          maxLoad: trip.maxLoad,
        });
      }
    }
    return map;
  }, [routeTripsRidership, filterState.startDate, filterState.endDate]);

  // Get the metric value for a trip based on selected metric
  const getTripMetricValue = useCallback((tripId: string, fallbackRidership: number): number => {
    const metrics = tripMetricsMap.get(tripId);
    if (!metrics) return fallbackRidership;

    switch (selectedMetric) {
      case 'Average daily boardings':
        return metrics.avgDailyBoardings;
      case 'Average daily alightings':
        return metrics.avgDailyAlightings;
      case 'Average daily activity':
        return metrics.avgDailyActivity;
      case 'Total boardings':
        return metrics.totalBoardings;
      case 'Total alightings':
        return metrics.totalAlightings;
      case 'Total activity':
        return metrics.totalActivity;
      case 'Average load':
        return metrics.avgLoad;
      case 'Maxload':
        return metrics.maxLoad;
      default:
        return metrics.avgDailyBoardings;
    }
  }, [tripMetricsMap, selectedMetric]);

  // Update routeTrips with real ridership data from API (based on selected metric)
  // When time periods are filtered, only show trips that run during the selected time periods
  const routeTripsWithRidership = useMemo(() => {
    // Map display labels to database keys for time period filtering
    const labelToKey: Record<string, string> = {
      'Early AM': 'early_am',
      'AM Peak': 'am_peak',
      'Midday': 'midday',
      'PM Peak': 'pm_peak',
      'Evening': 'evening',
      'Night': 'night',
    };

    // Check if time period filter is active (not "All day")
    const hasTimePeriodFilter = appliedTimeMode === 'custom' && appliedTimePeriods.length > 0 && appliedTimePeriods.length < 6;

    // Convert applied time period labels to database keys
    const selectedPeriodKeys = appliedTimePeriods.map(label => labelToKey[label]).filter(Boolean);

    // Debug: Log filtering info
    if (routeTrips.length > 0 && routeTrips[0].trips.length > 0) {
      const sampleTrip = routeTrips[0].trips[0];
      console.log(`[DEBUG] Time period filtering:
  appliedTimeMode: ${appliedTimeMode}
  appliedTimePeriods: ${JSON.stringify(appliedTimePeriods)}
  hasTimePeriodFilter: ${hasTimePeriodFilter}
  selectedPeriodKeys: ${JSON.stringify(selectedPeriodKeys)}
  sampleTrip.time_period: ${sampleTrip.time_period}
  sampleTrip.start_time: ${sampleTrip.start_time}`);
    }

    return routeTrips.map(pattern => ({
      ...pattern,
      trips: pattern.trips
        // Filter trips by time period (using trip.time_period from GTFS data)
        .filter(trip => !hasTimePeriodFilter || selectedPeriodKeys.includes(trip.time_period))
        .map(trip => ({
          ...trip,
          ridership: tripMetricsMap.size > 0 ? getTripMetricValue(trip.trip_id, trip.ridership) : trip.ridership
        }))
    })).filter(pattern => pattern.trips.length > 0); // Remove empty patterns
  }, [routeTrips, tripMetricsMap, getTripMetricValue, appliedTimeMode, appliedTimePeriods]);

  // Compute filtered trips based on pattern selection and ridership min/max filter
  // This is used for both the trips list UI AND for filtering map shapes/segments
  const filteredTripsData = useMemo(() => {
    // Apply pattern filter
    const patternFiltered = routeTripsWithRidership
      .filter(patternGroup => !selectedPattern || patternGroup.headsign === selectedPattern);

    // Apply ridership filter
    const ridershipFiltered = patternFiltered.map(patternGroup => {
      let filteredTrips = patternGroup.trips;

      if (appliedTripFilterMin !== null || appliedTripFilterMax !== null) {
        filteredTrips = filteredTrips.filter(trip => {
          const passes =
            (appliedTripFilterMin === null || trip.ridership >= appliedTripFilterMin) &&
            (appliedTripFilterMax === null || trip.ridership <= appliedTripFilterMax);
          return passes;
        });
      }

      return {
        ...patternGroup,
        trips: filteredTrips
      };
    }).filter(patternGroup => patternGroup.trips.length > 0);

    // Extract all filtered trips as a flat array
    const allFilteredTrips = ridershipFiltered.flatMap(pg => pg.trips);

    // Create a Set of filtered trip IDs for quick lookup
    const filteredTripIds = new Set(allFilteredTrips.map(t => t.trip_id));

    // Create a Set of shape IDs used by filtered trips
    const filteredShapeIds = new Set(allFilteredTrips.map(t => t.shape_id));

    // Check if any filter is actually active
    const isFilterActive = appliedTripFilterMin !== null || appliedTripFilterMax !== null;

    return {
      patterns: ridershipFiltered,
      trips: allFilteredTrips,
      tripIds: filteredTripIds,
      shapeIds: filteredShapeIds,
      isFilterActive,
      totalCount: routeTripsWithRidership
        .filter(pg => !selectedPattern || pg.headsign === selectedPattern)
        .reduce((sum, pg) => sum + pg.trips.length, 0),
      filteredCount: allFilteredTrips.length
    };
  }, [routeTripsWithRidership, selectedPattern, appliedTripFilterMin, appliedTripFilterMax]);

  // Compute segment load data from routeGridData (per-trip per-stop metrics)
  // This correctly builds segment keys based on pattern stop order
  // When a trip filter is active, only uses filtered trips; otherwise uses all trips
  const segmentLoadMapFromGrid = useMemo(() => {
    const segmentMap = new Map<string, { avgLoads: number[]; maxLoads: number[] }>();

    // Need grid data and pattern info
    if (!routeGridData?.data || !selectedRouteId || !routePatterns[selectedRouteId]) {
      return null;
    }

    // Get pattern info to know stop order for segments
    const patterns = routePatterns[selectedRouteId].patterns;

    // Filter patterns by selected pattern if any
    const relevantPatterns = selectedPattern
      ? patterns.filter(p => p.headsign === selectedPattern)
      : patterns;

    // Determine which trips to include
    const tripIdsToUse = filteredTripsData.isFilterActive
      ? filteredTripsData.tripIds
      : new Set(Object.keys(routeGridData.data));

    // For each trip, collect its segment load values
    for (const tripId of tripIdsToUse) {
      const tripStopData = routeGridData.data[tripId];
      if (!tripStopData) continue;

      // For each pattern, build segments from consecutive stops
      for (const pattern of relevantPatterns) {
        if (!pattern.stop_ids || pattern.stop_ids.length < 2) continue;

        for (let i = 0; i < pattern.stop_ids.length - 1; i++) {
          const fromStopId = pattern.stop_ids[i];
          const toStopId = pattern.stop_ids[i + 1];
          const segmentKey = `${fromStopId}-${toStopId}`;

          // Get load at the "from" stop (load leaving that stop toward next)
          const fromStopMetrics = tripStopData[fromStopId];
          if (fromStopMetrics) {
            if (!segmentMap.has(segmentKey)) {
              segmentMap.set(segmentKey, { avgLoads: [], maxLoads: [] });
            }
            const segment = segmentMap.get(segmentKey)!;
            segment.avgLoads.push(fromStopMetrics.avgLoad);
            segment.maxLoads.push(fromStopMetrics.maxLoad);
          }
        }
      }
    }

    // Aggregate: compute average of avgLoads and max of maxLoads for each segment
    const aggregatedMap = new Map<string, { avgLoad: number; maxLoad: number }>();
    for (const [key, data] of segmentMap) {
      const avgLoad = data.avgLoads.length > 0
        ? Math.round((data.avgLoads.reduce((a, b) => a + b, 0) / data.avgLoads.length) * 10) / 10
        : 0;
      const maxLoad = data.maxLoads.length > 0
        ? Math.max(...data.maxLoads)
        : 0;
      aggregatedMap.set(key, { avgLoad, maxLoad });
    }

    return aggregatedMap;
  }, [routeGridData, filteredTripsData.isFilterActive, filteredTripsData.tripIds, selectedRouteId, routePatterns, selectedPattern]);

  // Compute segment load data from comparison grid data (Date-time 2) for segment comparison
  const segmentLoadMapFromGrid2 = useMemo(() => {
    const segmentMap = new Map<string, { avgLoads: number[]; maxLoads: number[] }>();

    // Only compute in comparison mode with grid data
    if (!comparisonMode || !routeGridData2?.data || !selectedRouteId || !routePatterns[selectedRouteId]) {
      return null;
    }

    const patterns = routePatterns[selectedRouteId].patterns;
    const relevantPatterns = selectedPattern
      ? patterns.filter(p => p.headsign === selectedPattern)
      : patterns;

    // Use all trips from comparison grid data (no filtering for comparison)
    const tripIdsToUse = new Set(Object.keys(routeGridData2.data));

    for (const tripId of tripIdsToUse) {
      const tripStopData = routeGridData2.data[tripId];
      if (!tripStopData) continue;

      for (const pattern of relevantPatterns) {
        if (!pattern.stop_ids || pattern.stop_ids.length < 2) continue;

        for (let i = 0; i < pattern.stop_ids.length - 1; i++) {
          const fromStopId = pattern.stop_ids[i];
          const toStopId = pattern.stop_ids[i + 1];
          const segmentKey = `${fromStopId}-${toStopId}`;

          const fromStopMetrics = tripStopData[fromStopId];
          if (fromStopMetrics) {
            if (!segmentMap.has(segmentKey)) {
              segmentMap.set(segmentKey, { avgLoads: [], maxLoads: [] });
            }
            const segment = segmentMap.get(segmentKey)!;
            segment.avgLoads.push(fromStopMetrics.avgLoad);
            segment.maxLoads.push(fromStopMetrics.maxLoad);
          }
        }
      }
    }

    const aggregatedMap = new Map<string, { avgLoad: number; maxLoad: number }>();
    for (const [key, data] of segmentMap) {
      const avgLoad = data.avgLoads.length > 0
        ? Math.round((data.avgLoads.reduce((a, b) => a + b, 0) / data.avgLoads.length) * 10) / 10
        : 0;
      const maxLoad = data.maxLoads.length > 0
        ? Math.max(...data.maxLoads)
        : 0;
      aggregatedMap.set(key, { avgLoad, maxLoad });
    }

    return aggregatedMap;
  }, [comparisonMode, routeGridData2, selectedRouteId, routePatterns, selectedPattern]);

  // Compute filtered grid trips for the header (used when Grid tab is selected)
  // This uses routeTripsWithRidership to apply time period filtering
  const filteredGridTripsForHeader = useMemo(() => {
    if (selectedRouteTab !== 'Grid') return [];
    return routeTripsWithRidership
      .filter(patternGroup => !selectedPattern || patternGroup.headsign === selectedPattern)
      .filter(patternGroup => patternGroup.trips.length > 0);
  }, [selectedRouteTab, routeTripsWithRidership, selectedPattern]);

  // Get current headsign for grid (uses filtered data)
  const currentGridPatternHeadsign = filteredGridTripsForHeader.length > 0
    ? filteredGridTripsForHeader[0]?.headsign || ''
    : '';

  // Get the trip ridership value from API (falls back to mock value from selectedTrip)
  const tripRidershipValue = useMemo(() => {
    if (!tripData?.metrics) {
      // Fall back to the mock value from the Trip object if API data not yet loaded
      return selectedTrip?.ridership || 0;
    }
    return getMetricValue(tripData.metrics, selectedMetric);
  }, [tripData, selectedTrip, selectedMetric, getMetricValue]);

  // Stop ridership values from API (for map coloring and stops list)
  const stopRidershipValues = useMemo(() => {
    if (!allStopsData?.stops) return {};
    const values: { [key: string]: number } = {};
    allStopsData.stops.forEach(s => {
      // Map the metric to the available fields in stops response
      switch (selectedMetric) {
        case 'Average daily boardings':
          values[s.stopId] = Math.round(s.totalBoardings / (systemData?.metrics?.daysInRange || 1));
          break;
        case 'Total boardings':
          values[s.stopId] = s.totalBoardings;
          break;
        case 'Average daily alightings':
          values[s.stopId] = Math.round(s.totalAlightings / (systemData?.metrics?.daysInRange || 1));
          break;
        case 'Average daily activity':
          values[s.stopId] = s.avgDailyActivity;
          break;
        case 'Total activity':
          values[s.stopId] = s.totalBoardings + s.totalAlightings;
          break;
        default:
          values[s.stopId] = s.avgDailyActivity;
      }
    });
    return values;
  }, [allStopsData, selectedMetric, systemData?.metrics?.daysInRange]);

  // Trip-specific stop values (for map coloring when viewing a trip)
  const tripStopRidershipValues = useMemo(() => {
    if (!tripData?.stops) return {};
    const values: { [key: string]: number } = {};
    tripData.stops.forEach(s => {
      switch (selectedMetric) {
        case 'Average daily boardings':
          values[s.stopId] = s.avgDailyBoardings;
          break;
        case 'Total boardings':
          values[s.stopId] = s.totalBoardings;
          break;
        case 'Average daily alightings':
          values[s.stopId] = s.avgDailyAlightings;
          break;
        case 'Total alightings':
          values[s.stopId] = s.totalAlightings;
          break;
        case 'Average daily activity':
          values[s.stopId] = s.avgDailyActivity;
          break;
        case 'Total activity':
          values[s.stopId] = s.totalActivity;
          break;
        case 'Average load':
          values[s.stopId] = s.avgLoad || 0;
          break;
        case 'Maxload':
          values[s.stopId] = s.maxLoad || 0;
          break;
        default:
          values[s.stopId] = s.avgDailyBoardings;
      }
    });
    return values;
  }, [tripData, selectedMetric]);

  // Route-specific stop values (for map coloring when viewing a route)
  const routeStopRidershipValues = useMemo(() => {
    if (!routeStopsRidership?.stops) return {};
    const values: { [key: string]: number } = {};
    const daysInRange = routeData?.metrics?.daysInRange || 30;
    routeStopsRidership.stops.forEach(s => {
      switch (selectedMetric) {
        case 'Average daily boardings':
          values[s.stopId] = s.avgDailyBoardings;
          break;
        case 'Total boardings':
          values[s.stopId] = s.totalBoardings;
          break;
        case 'Average daily alightings':
          values[s.stopId] = s.avgDailyAlightings;
          break;
        case 'Total alightings':
          values[s.stopId] = s.totalAlightings;
          break;
        case 'Average daily activity':
          values[s.stopId] = s.avgDailyActivity;
          break;
        case 'Total activity':
          values[s.stopId] = s.totalActivity;
          break;
        case 'Average load':
          // Stops don't have load, use boardings as proxy
          values[s.stopId] = s.avgDailyBoardings;
          break;
        case 'Maxload':
          // Stops don't have maxload, use total boardings as proxy
          values[s.stopId] = Math.round(s.totalBoardings / daysInRange);
          break;
        default:
          values[s.stopId] = s.avgDailyBoardings;
      }
    });
    return values;
  }, [routeStopsRidership, selectedMetric, routeData?.metrics?.daysInRange]);

  // Grid-specific stop values (per-trip per-stop) from API data
  // This provides trip-specific ridership values for the trips grid
  const gridStopValues = useMemo(() => {
    if (!routeGridData?.data) return new Map<string, Map<string, number>>();
    const daysInRange = filterState.startDate && filterState.endDate
      ? Math.ceil((filterState.endDate.getTime() - filterState.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 30;
    const tripMap = new Map<string, Map<string, number>>();
    for (const [tripId, stops] of Object.entries(routeGridData.data)) {
      const stopMap = new Map<string, number>();
      for (const [stopId, metrics] of Object.entries(stops)) {
        let value: number;
        switch (selectedMetric) {
          case 'Average daily boardings':
            value = Math.round(metrics.totalBoardings / daysInRange);
            break;
          case 'Total boardings':
            value = metrics.totalBoardings;
            break;
          case 'Average daily alightings':
            value = Math.round(metrics.totalAlightings / daysInRange);
            break;
          case 'Total alightings':
            value = metrics.totalAlightings;
            break;
          case 'Average daily activity':
            value = Math.round((metrics.totalBoardings + metrics.totalAlightings) / daysInRange);
            break;
          case 'Total activity':
            value = metrics.totalBoardings + metrics.totalAlightings;
            break;
          case 'Average load':
            value = metrics.avgLoad;
            break;
          case 'Maxload':
            value = metrics.maxLoad;
            break;
          default:
            value = Math.round(metrics.totalBoardings / daysInRange);
        }
        stopMap.set(stopId, value);
      }
      tripMap.set(tripId, stopMap);
    }
    return tripMap;
  }, [routeGridData, selectedMetric, filterState.startDate, filterState.endDate]);

  // Transform route-specific data for charts (used in RDV) - respects selected metric
  const routeDataByPeriod = useMemo(() => {
    if (!routeData?.byTimePeriod) return [];
    const periodLabels: Record<string, string> = {
      'early_am': 'Early AM',
      'am_peak': 'AM Peak',
      'midday': 'Midday',
      'pm_peak': 'PM Peak',
      'evening': 'Evening',
      'night': 'Night',
    };
    return routeData.byTimePeriod.map(p => ({
      period: periodLabels[p.timePeriod] || p.timePeriod,
      value: getMetricValue(p.metrics, selectedMetric),
    }));
  }, [routeData, selectedMetric, getMetricValue]);

  // Transform route-specific comparison data by period (Date-time 2)
  const routeDataByPeriod2 = useMemo(() => {
    if (!routeData2?.byTimePeriod) return [];
    const periodLabels: Record<string, string> = {
      'early_am': 'Early AM',
      'am_peak': 'AM Peak',
      'midday': 'Midday',
      'pm_peak': 'PM Peak',
      'evening': 'Evening',
      'night': 'Night',
    };
    return routeData2.byTimePeriod.map(p => ({
      period: periodLabels[p.timePeriod] || p.timePeriod,
      value: getMetricValue(p.metrics, selectedMetric),
    }));
  }, [routeData2, selectedMetric, getMetricValue]);

  // Transform route-specific by-date data for charts (used in RDV)
  const routeDataByDate = useMemo(() => {
    if (!routeByDateData?.data) return [];
    return routeByDateData.data.map(d => {
      let value: number;
      switch (selectedMetric) {
        case 'Average daily boardings':
        case 'Total boardings':
          value = d.totalBoardings;
          break;
        case 'Average daily alightings':
        case 'Total alightings':
          value = d.totalAlightings;
          break;
        case 'Average daily activity':
        case 'Total activity':
          value = d.totalBoardings + d.totalAlightings;
          break;
        case 'Average load':
          value = d.avgLoad;
          break;
        case 'Maxload':
          value = d.maxLoad;
          break;
        default:
          value = d.totalBoardings;
      }
      return { date: d.date, value };
    });
  }, [routeByDateData, selectedMetric]);

  // Transform route-specific by-date comparison data for charts (Date-time 2)
  const routeDataByDate2 = useMemo(() => {
    if (!routeByDateData2?.data) return [];
    return routeByDateData2.data.map(d => {
      let value: number;
      switch (selectedMetric) {
        case 'Average daily boardings':
        case 'Total boardings':
          value = d.totalBoardings;
          break;
        case 'Average daily alightings':
        case 'Total alightings':
          value = d.totalAlightings;
          break;
        case 'Average daily activity':
        case 'Total activity':
          value = d.totalBoardings + d.totalAlightings;
          break;
        case 'Average load':
          value = d.avgLoad;
          break;
        case 'Maxload':
          value = d.maxLoad;
          break;
        default:
          value = d.totalBoardings;
      }
      return { date: d.date, value };
    });
  }, [routeByDateData2, selectedMetric]);

  // Transform route-specific by-day data for charts (used in RDV)
  const routeDataByDay = useMemo(() => {
    if (!routeByDayData?.data) return [];
    return routeByDayData.data.map(d => {
      let value: number;
      switch (selectedMetric) {
        case 'Average daily boardings':
          value = d.avgDailyBoardings;
          break;
        case 'Total boardings':
          value = d.totalBoardings;
          break;
        case 'Average daily alightings':
          value = Math.round(d.totalAlightings / (d.dayCount || 1));
          break;
        case 'Average daily activity':
          value = Math.round((d.totalBoardings + d.totalAlightings) / (d.dayCount || 1));
          break;
        case 'Total activity':
          value = d.totalBoardings + d.totalAlightings;
          break;
        case 'Average load':
          value = d.avgLoad;
          break;
        case 'Maxload':
          value = d.maxLoad;
          break;
        default:
          value = d.avgDailyBoardings;
      }
      return {
        day: d.dayName,
        value,
        dayOfWeek: d.dayOfWeek,
        dayCount: d.dayCount,
        totalBoardings: d.totalBoardings,
        totalAlightings: d.totalAlightings,
      };
    });
  }, [routeByDayData, selectedMetric]);

  // Transform route-specific by-day comparison data for charts (Date-time 2)
  const routeDataByDay2 = useMemo(() => {
    if (!routeByDayData2?.data) return [];
    return routeByDayData2.data.map(d => {
      let value: number;
      switch (selectedMetric) {
        case 'Average daily boardings':
          value = d.avgDailyBoardings;
          break;
        case 'Total boardings':
          value = d.totalBoardings;
          break;
        case 'Average daily alightings':
          value = Math.round(d.totalAlightings / (d.dayCount || 1));
          break;
        case 'Average daily activity':
          value = Math.round((d.totalBoardings + d.totalAlightings) / (d.dayCount || 1));
          break;
        case 'Total activity':
          value = d.totalBoardings + d.totalAlightings;
          break;
        case 'Average load':
          value = d.avgLoad;
          break;
        case 'Maxload':
          value = d.maxLoad;
          break;
        default:
          value = d.avgDailyBoardings;
      }
      return {
        day: d.dayName,
        value,
        dayOfWeek: d.dayOfWeek,
        dayCount: d.dayCount,
        totalBoardings: d.totalBoardings,
        totalAlightings: d.totalAlightings,
      };
    });
  }, [routeByDayData2, selectedMetric]);

  // Transform route data for ByPatternChart
  // Uses routePatterns for all patterns and distributes direction ridership proportionally
  // Aggregates patterns with the same headsign
  const routeDataByPattern = useMemo(() => {
    if (!selectedRouteId || !routePatterns[selectedRouteId]) return [];

    const patterns = routePatterns[selectedRouteId].patterns;
    if (!patterns || patterns.length === 0) return [];

    // If we have byDirection data, use it to distribute ridership to patterns
    if (routeData?.byDirection) {
      // Create a map of direction_id -> ridership value
      const directionValues = new Map<string, number>();
      routeData.byDirection.forEach(d => {
        directionValues.set(d.directionId, getMetricValue(d.metrics, selectedMetric));
      });

      // Group patterns by direction and calculate trip counts per direction
      const tripCountsByDirection = new Map<string, number>();
      patterns.forEach(p => {
        const current = tripCountsByDirection.get(p.direction_id) || 0;
        tripCountsByDirection.set(p.direction_id, current + p.trip_count);
      });

      // Calculate value for each pattern, then aggregate by headsign
      const headsignAggregates = new Map<string, { value: number; percentOfRoute: number }>();

      patterns.forEach(p => {
        const directionValue = directionValues.get(p.direction_id) || 0;
        const directionTripCount = tripCountsByDirection.get(p.direction_id) || 1;
        const patternProportion = p.trip_count / directionTripCount;
        const patternValue = Math.round(directionValue * patternProportion);

        const existing = headsignAggregates.get(p.headsign);
        if (existing) {
          // Aggregate: sum values and percentOfRoute for same headsign
          headsignAggregates.set(p.headsign, {
            value: existing.value + patternValue,
            percentOfRoute: existing.percentOfRoute + p.pct_of_route,
          });
        } else {
          headsignAggregates.set(p.headsign, {
            value: patternValue,
            percentOfRoute: p.pct_of_route,
          });
        }
      });

      // Convert map to array
      return Array.from(headsignAggregates.entries()).map(([headsign, data]) => ({
        headsign,
        value: data.value,
        percentOfRoute: data.percentOfRoute,
      }));
    }

    // Fallback: just use pct_of_route if no ridership data, aggregating by headsign
    const headsignAggregates = new Map<string, { value: number; percentOfRoute: number }>();
    patterns.forEach(p => {
      const existing = headsignAggregates.get(p.headsign);
      if (existing) {
        headsignAggregates.set(p.headsign, {
          value: 0,
          percentOfRoute: existing.percentOfRoute + p.pct_of_route,
        });
      } else {
        headsignAggregates.set(p.headsign, {
          value: 0,
          percentOfRoute: p.pct_of_route,
        });
      }
    });

    return Array.from(headsignAggregates.entries()).map(([headsign, data]) => ({
      headsign,
      value: data.value,
      percentOfRoute: data.percentOfRoute,
    }));
  }, [routeData, selectedMetric, getMetricValue, selectedRouteId, routePatterns]);

  // Transform comparison route data for ByPatternChart (same logic as routeDataByPattern but uses routeData2)
  const comparisonDataByPattern = useMemo(() => {
    if (!selectedRouteId || !routePatterns[selectedRouteId] || !routeData2) return [];

    const patterns = routePatterns[selectedRouteId].patterns;
    if (!patterns || patterns.length === 0) return [];

    // If we have byDirection data, use it to distribute ridership to patterns
    if (routeData2?.byDirection) {
      // Create a map of direction_id -> ridership value
      const directionValues = new Map<string, number>();
      routeData2.byDirection.forEach(d => {
        directionValues.set(d.directionId, getMetricValue(d.metrics, selectedMetric));
      });

      // Group patterns by direction and calculate trip counts per direction
      const tripCountsByDirection = new Map<string, number>();
      patterns.forEach(p => {
        const current = tripCountsByDirection.get(p.direction_id) || 0;
        tripCountsByDirection.set(p.direction_id, current + p.trip_count);
      });

      // Calculate value for each pattern, then aggregate by headsign
      const headsignAggregates = new Map<string, { value: number; percentOfRoute: number }>();

      patterns.forEach(p => {
        const directionValue = directionValues.get(p.direction_id) || 0;
        const directionTripCount = tripCountsByDirection.get(p.direction_id) || 1;
        const patternProportion = p.trip_count / directionTripCount;
        const patternValue = Math.round(directionValue * patternProportion);

        const existing = headsignAggregates.get(p.headsign);
        if (existing) {
          headsignAggregates.set(p.headsign, {
            value: existing.value + patternValue,
            percentOfRoute: existing.percentOfRoute + p.pct_of_route,
          });
        } else {
          headsignAggregates.set(p.headsign, {
            value: patternValue,
            percentOfRoute: p.pct_of_route,
          });
        }
      });

      return Array.from(headsignAggregates.entries()).map(([headsign, data]) => ({
        headsign,
        value: data.value,
        percentOfRoute: data.percentOfRoute,
      }));
    }

    return [];
  }, [routeData2, selectedMetric, getMetricValue, selectedRouteId, routePatterns]);

  // Transform stop-specific data for SDV charts
  const stopDataByDate = useMemo(() => {
    if (!stopByDateData?.data) return [];
    return stopByDateData.data.map(d => {
      // Stops don't have load metrics, so we use boardings-related metrics
      let value: number;
      switch (selectedMetric) {
        case 'Average daily boardings':
        case 'Total boardings':
          value = d.totalBoardings;
          break;
        case 'Average daily alightings':
        case 'Total alightings':
          value = d.totalAlightings;
          break;
        case 'Average daily activity':
        case 'Total activity':
          value = d.totalBoardings + d.totalAlightings;
          break;
        default:
          value = d.totalBoardings;
      }
      return { date: d.date, value };
    });
  }, [stopByDateData, selectedMetric]);

  const stopDataByDay = useMemo(() => {
    if (!stopByDayData?.data) return [];
    return stopByDayData.data.map(d => {
      // Map the metric to the available fields
      let value: number;
      switch (selectedMetric) {
        case 'Average daily boardings':
          value = d.avgDailyBoardings;
          break;
        case 'Total boardings':
          value = d.totalBoardings;
          break;
        case 'Average daily alightings':
          value = Math.round(d.totalAlightings / (d.dayCount || 1));
          break;
        case 'Average daily activity':
          value = Math.round((d.totalBoardings + d.totalAlightings) / (d.dayCount || 1));
          break;
        case 'Total activity':
          value = d.totalBoardings + d.totalAlightings;
          break;
        default:
          value = d.avgDailyBoardings;
      }
      return { day: d.dayName, value };
    });
  }, [stopByDayData, selectedMetric]);

  const stopDataByPeriod = useMemo(() => {
    if (!stopByPeriodData?.data) return [];
    const periodLabels: Record<string, string> = {
      'early_am': 'Early AM',
      'am_peak': 'AM Peak',
      'midday': 'Midday',
      'pm_peak': 'PM Peak',
      'evening': 'Evening',
      'night': 'Night',
    };
    const daysInRange = systemData?.metrics?.daysInRange || 1;
    return stopByPeriodData.data.map(p => {
      // Map the metric to the available fields
      let value: number;
      switch (selectedMetric) {
        case 'Average daily boardings':
          value = Math.round(p.totalBoardings / daysInRange);
          break;
        case 'Total boardings':
          value = p.totalBoardings;
          break;
        case 'Average daily alightings':
          value = Math.round(p.totalAlightings / daysInRange);
          break;
        case 'Average daily activity':
          value = Math.round((p.totalBoardings + p.totalAlightings) / daysInRange);
          break;
        case 'Total activity':
          value = p.totalBoardings + p.totalAlightings;
          break;
        default:
          value = Math.round(p.totalBoardings / daysInRange);
      }
      return {
        period: periodLabels[p.timePeriod] || p.timePeriod,
        value,
      };
    });
  }, [stopByPeriodData, selectedMetric, systemData?.metrics?.daysInRange]);

  // Use route-specific, stop-specific, or system data based on selection
  const activeDataByPeriod = selectedStopId ? stopDataByPeriod : (selectedRouteId ? routeDataByPeriod : dataByPeriod);
  const activeDataByDay = selectedStopId ? stopDataByDay : (selectedRouteId ? routeDataByDay : dataByDay);
  const activeDataByDate = selectedStopId ? stopDataByDate : (selectedRouteId ? routeDataByDate : dataByDate);

  // Comparison chart data - use route-specific data when route is selected
  const activeComparisonDataByDate = selectedRouteId ? routeDataByDate2 : comparisonChartDataByDate;
  const activeComparisonDataByDay = selectedRouteId ? routeDataByDay2 : comparisonDataByDay;
  const activeComparisonDataByPeriod = selectedRouteId ? routeDataByPeriod2 : comparisonDataByPeriod;

  // Active loading states based on context
  const isActiveByDateLoading = selectedStopId ? isStopByDateLoading : (selectedRouteId ? isRouteByDateLoading : isByDateLoading);
  const isActiveByDayLoading = selectedStopId ? isStopByDayLoading : (selectedRouteId ? isRouteByDayLoading : isByDayLoading);
  const isActiveByPeriodLoading = selectedStopId ? isStopByPeriodLoading : (selectedRouteId ? isRouteLoading : isSystemLoading);

  // Extract unique routes from shapes data with ridership values from API
  const routesList = React.useMemo(() => {
    const uniqueRoutes: { [key: string]: { id: string; name: string; value: number; shortName: string } } = {};

    shapes.forEach(shape => {
      const routeId = shape.properties.route_id;
      const routeShortName = shape.properties.route_short_name || routeId;
      if (!uniqueRoutes[routeId]) {
        // Use real ridership value from API, or 0 if not yet loaded
        const ridershipValue = routeRidershipValues[routeId] || 0;
        uniqueRoutes[routeId] = {
          id: routeId,
          name: `Route ${routeShortName}`,
          value: ridershipValue,
          shortName: routeShortName
        };
      }
    });

    const routes = Object.values(uniqueRoutes);

    // Sort by route short name number (convert to number for proper numeric sorting)
    return routes.sort((a, b) => {
      const aNum = parseInt(a.shortName, 10);
      const bNum = parseInt(b.shortName, 10);
      return aNum - bNum;
    });
  }, [shapes, routeRidershipValues]);

  // Extract stops data with real ridership values from API (amenities are still mock)
  const stopsList = React.useMemo(() => {
    const newAmenities: { [key: string]: { [amenity: string]: string | false } } = { ...stopAmenities };

    // Helper to generate a random date in the past 3 years (for mock amenities)
    const generateRandomDate = () => {
      const now = new Date();
      const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
      const randomTime = threeYearsAgo.getTime() + Math.random() * (now.getTime() - threeYearsAgo.getTime());
      const date = new Date(randomTime);
      return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    };

    const stopsWithValues = stops.map(stop => {
      const stopId = stop.properties.stop_id;
      // Use route-specific stop values if a route is selected, otherwise fall back to all stops data
      // Trip-specific values take precedence when a trip is selected
      const ridershipValue = selectedTrip
        ? (tripStopRidershipValues[stopId] || 0)
        : selectedRouteId
        ? (routeStopRidershipValues[stopId] || 0)
        : (stopRidershipValues[stopId] || 0);
      // Generate amenities if they don't exist (mock data)
      if (!newAmenities[stopId]) {
        newAmenities[stopId] = {};
        STOP_AMENITIES.forEach(amenity => {
          // ~60% chance of having each amenity, store date string if present
          newAmenities[stopId][amenity] = Math.random() > 0.4 ? generateRandomDate() : false;
        });
      }
      return {
        id: stopId,
        name: stop.properties.name,
        value: ridershipValue,
        amenities: newAmenities[stopId]
      };
    });

    // Update amenities state if new values were generated
    if (Object.keys(newAmenities).length !== Object.keys(stopAmenities).length) {
      setStopAmenities(newAmenities);
    }

    return stopsWithValues.sort((a, b) => b.value - a.value);
  }, [stops, stopRidershipValues, routeStopRidershipValues, tripStopRidershipValues, selectedRouteId, selectedTrip, stopAmenities, STOP_AMENITIES]);

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
        // Amenity values are date strings (truthy) if present, or false if not
        return Array.from(appliedStopAmenityFilters.entries()).every(([amenity, required]) => {
          const hasAmenity = stop.amenities[amenity] !== false;
          return hasAmenity === required;
        });
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      if (stopSortBy === 'name') {
        const comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
        return stopSortOrder === 'asc' ? comparison : -comparison;
      } else if (stopSortBy === 'largestIncrease' || stopSortBy === 'largestDecrease' || stopSortBy === 'largestChange') {
        // Sort by percent change - calculate inline since stopComparisonMap defined later
        // Get Date-time 2 values from allStopsData2
        const daysInRange2 = systemData2?.metrics?.daysInRange || 1;
        const getStopValue2 = (stopId: string) => {
          const stopData = allStopsData2?.stops?.find(s => s.stopId === stopId);
          if (!stopData) return 0;
          switch (selectedMetric) {
            case 'Average daily boardings':
              return Math.round(stopData.totalBoardings / daysInRange2);
            case 'Total boardings':
              return stopData.totalBoardings;
            case 'Average daily alightings':
              return Math.round(stopData.totalAlightings / daysInRange2);
            case 'Average daily activity':
              return stopData.avgDailyActivity;
            case 'Total activity':
              return stopData.totalBoardings + stopData.totalAlightings;
            default:
              return stopData.avgDailyActivity;
          }
        };
        const aValue2 = getStopValue2(a.id);
        const bValue2 = getStopValue2(b.id);
        const aChange = aValue2 !== 0 ? ((a.value - aValue2) / aValue2) * 100 : 0;
        const bChange = bValue2 !== 0 ? ((b.value - bValue2) / bValue2) * 100 : 0;
        // Apply swap if needed
        const aChangeFinal = comparisonSwapped ? -aChange : aChange;
        const bChangeFinal = comparisonSwapped ? -bChange : bChange;

        if (stopSortBy === 'largestIncrease') {
          // Highest positive % first
          return bChangeFinal - aChangeFinal;
        } else if (stopSortBy === 'largestDecrease') {
          // Most negative % first
          return aChangeFinal - bChangeFinal;
        } else {
          // largestChange: biggest absolute swing first
          return Math.abs(bChangeFinal) - Math.abs(aChangeFinal);
        }
      } else {
        // Sort by ridership
        return stopSortOrder === 'asc'
          ? a.value - b.value
          : b.value - a.value;
      }
    });

    return sorted;
  }, [stopsList, appliedStopFilterMin, appliedStopFilterMax, appliedStopAmenityFilters, stopSortBy, stopSortOrder, allStopsData2, systemData2, selectedMetric, comparisonSwapped]);

  // Create filtered and sorted routesList for display
  const filteredAndSortedRoutesList = React.useMemo(() => {
    let filtered = routesList;

    // Apply ridership filter
    if (appliedRouteFilterMin !== null || appliedRouteFilterMax !== null) {
      filtered = filtered.filter(route => {
        return (
          (appliedRouteFilterMin === null || route.value >= appliedRouteFilterMin) &&
          (appliedRouteFilterMax === null || route.value <= appliedRouteFilterMax)
        );
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      if (routeSortBy === 'name') {
        const comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
        return routeSortOrder === 'asc' ? comparison : -comparison;
      } else if (routeSortBy === 'largestIncrease' || routeSortBy === 'largestDecrease' || routeSortBy === 'largestChange') {
        // Sort by percent change - calculate inline since routeComparisonValueMap defined later
        // Get Date-time 2 values from systemData2
        const getRouteValue2 = (routeId: string) => {
          if (!systemData2?.byRoute) return 0;
          const routeData = systemData2.byRoute.find(r => r.routeId === routeId);
          if (!routeData) return 0;
          return getMetricValue(routeData.metrics, selectedMetric);
        };
        const aValue2 = getRouteValue2(a.id);
        const bValue2 = getRouteValue2(b.id);
        const aChange = aValue2 !== 0 ? ((a.value - aValue2) / aValue2) * 100 : 0;
        const bChange = bValue2 !== 0 ? ((b.value - bValue2) / bValue2) * 100 : 0;
        // Apply swap if needed
        const aChangeFinal = comparisonSwapped ? -aChange : aChange;
        const bChangeFinal = comparisonSwapped ? -bChange : bChange;

        if (routeSortBy === 'largestIncrease') {
          // Highest positive % first
          return bChangeFinal - aChangeFinal;
        } else if (routeSortBy === 'largestDecrease') {
          // Most negative % first
          return aChangeFinal - bChangeFinal;
        } else {
          // largestChange: biggest absolute swing first
          return Math.abs(bChangeFinal) - Math.abs(aChangeFinal);
        }
      } else {
        // Sort by ridership
        return routeSortOrder === 'asc'
          ? a.value - b.value
          : b.value - a.value;
      }
    });

    return sorted;
  }, [routesList, appliedRouteFilterMin, appliedRouteFilterMax, routeSortBy, routeSortOrder, systemData2, selectedMetric, getMetricValue, comparisonSwapped]);

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

      // Apply trip filter - only show shapes used by filtered trips
      if (filteredTripsData.isFilterActive && filteredTripsData.shapeIds.size > 0) {
        filtered = filtered.filter(shape =>
          filteredTripsData.shapeIds.has(shape.properties.shape_id)
        );
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
  }, [shapes, selectedRouteId, selectedPattern, patternLookup, selectedTrip, filteredTripsData.isFilterActive, filteredTripsData.shapeIds]);

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
      // If trip filter is active, only show stops from patterns that have filtered trips
      if (filteredTripsData.isFilterActive && routePatterns[selectedRouteId]) {
        // Get headsigns of patterns that have filtered trips
        const filteredHeadsigns = new Set(filteredTripsData.patterns.map(p => p.headsign));

        // Collect stop IDs from those patterns
        const filteredStopIds = new Set<string>();
        for (const pattern of routePatterns[selectedRouteId].patterns) {
          if (filteredHeadsigns.has(pattern.headsign) && pattern.stop_ids) {
            pattern.stop_ids.forEach(stopId => filteredStopIds.add(stopId));
          }
        }

        return stops.filter(stop => filteredStopIds.has(stop.properties.stop_id));
      }

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
  }, [stops, selectedStopId, selectedRouteId, selectedPattern, routeStopsMap, routePatterns, activeTab, selectedTrip, selectedTripStops, filteredAndSortedStopsList, filteredTripsData.isFilterActive, filteredTripsData.patterns]);

  // Check if we should show segment-based coloring (for load metrics in route detail view)
  const isLoadMetric = selectedMetric === 'Average load' || selectedMetric === 'Maxload';
  const showSegmentColoring = selectedRouteId && isLoadMetric;

  // Check if we're in stop-level view (stops tab or SDV) - load metrics not available
  const isStopLevelView = activeTab === 'stops' || selectedStopId !== null;

  // Check if we're in amenities view (SDV with Amenities tab selected) - show stops as black with white outline
  const isAmenitiesView = selectedStopId !== null && selectedStopTab === 'Amenities';

  // Auto-switch from load metrics when entering stop-level view
  useEffect(() => {
    if (isStopLevelView && isLoadMetric) {
      setSelectedMetric('Average daily boardings');
    }
  }, [isStopLevelView, isLoadMetric]);

  // Check if we're in Grid view (full screen data panel) - includes Reports tab
  const isGridView = !!(selectedRouteId && selectedRouteTab === 'Grid' && !selectedTrip);
  const isInsightsView = aiMode && activeTab === 'home';
  const isFullWidthPanel = isGridView || isInsightsView;

  // AI Insights — only fetches when user clicks Generate
  const { data: insightsData, isLoading: insightsLoading, error: insightsError, generate: generateInsights, refetch: refetchInsights, updateInsightImage } = useInsights();

  // Capture map thumbnails for insight cards after generation
  useEffect(() => {
    if (!insightsData?.insights?.length || !shapes.length) return;
    console.log('[MapCanvas] Thumbnail capture effect fired', { insightsCount: insightsData.insights.length, shapesCount: shapes.length });
    // Wait for the hidden thumbnail map to fully load before capturing
    const capture = async () => {
      const capturer = thumbnailCaptureRef.current;
      if (!capturer) {
        console.warn('[MapCanvas] ThumbnailCapture ref not available');
        return;
      }
      for (const insight of insightsData.insights) {
        if (insight.previewImage) continue; // already captured
        if (!insight.routeIds?.[0]) continue;
        const image = await capturer.captureRoute(insight, shapes);
        if (image) {
          updateInsightImage(insight.id, image);
        }
      }
    };
    // Longer delay to ensure the hidden Mapbox map has loaded tiles
    const timer = setTimeout(capture, 2000);
    return () => clearTimeout(timer);
  }, [insightsData?.insights?.length, shapes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chat state — lifted so it persists across tab changes
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatTitle, setChatTitle] = useState('');
  const [chatConvoId, setChatConvoId] = useState('');
  // Legend width measurement for story card alignment
  const legendRef = useRef<HTMLDivElement>(null);
  const [legendWidth, setLegendWidth] = useState(280);
  const [legendHeight, setLegendHeight] = useState(88);

  // Story mode walkthrough state
  const [isStoryMode, setIsStoryMode] = useState(false);
  const [storyModeInsight, setStoryModeInsight] = useState<InsightCardType | null>(null);
  const [storyModeStepIndex, setStoryModeStepIndex] = useState(0);
  const isStoryPanelVisible = isStoryMode && storyModeInsight !== null;
  const savedFilterStateRef = useRef<{
    activeTab: string;
    selectedRouteId: string | null;
    selectedRouteTab: string;
    selectedStopId: string | null;
    appliedStartDate: Date | null;
    appliedEndDate: Date | null;
    appliedSeason: { season: string; year: number } | null;
    appliedQuickPick: string | null;
    appliedDaysMode: string;
    appliedCustomDays: string[];
    appliedTimeMode: string;
    appliedTimePeriods: string[];
    comparisonMode: boolean;
    comparisonDateRange: { start: Date | null; end: Date | null };
    isFiltersPanelOpen: boolean;
    selectedMetric: string;
  } | null>(null);

  // Measure legend size for story card alignment
  useEffect(() => {
    if (!isStoryMode) return;
    const measure = () => {
      const el = document.querySelector('[data-map-scale]') as HTMLElement;
      if (el) {
        const rect = el.getBoundingClientRect();
        setLegendWidth(rect.width);
        setLegendHeight(rect.height);
      }
    };
    measure();
    // Re-measure when comparison mode changes legend size
    const timer = setInterval(measure, 500);
    return () => clearInterval(timer);
  }, [isStoryMode, comparisonMode]);

  // Save chat to localStorage whenever messages update
  useEffect(() => {
    if (chatMessages.length > 0 && chatConvoId) {
      saveChatConversation({
        id: chatConvoId,
        title: chatTitle || 'New Chat',
        messages: chatMessages,
        createdAt: chatConvoId.split('-')[1] ? new Date(parseInt(chatConvoId.split('-')[1])).toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }, [chatMessages, chatTitle, chatConvoId]);


  const applyWalkthroughStep = useCallback((filters: WalkthroughFilterState, { skipTab = false } = {}) => {
    // Tab & route — resolve short name (e.g. '62') to full route ID (e.g. '100264')
    if (!skipTab) {
      setActiveTab(filters.tab);
    }
    if (filters.routeId) {
      const match = routesList.find(r => r.shortName === filters.routeId || r.id === filters.routeId);
      setSelectedRouteId(match ? match.id : filters.routeId);
    } else {
      setSelectedRouteId(null);
    }
    if (filters.routeTab) setSelectedRouteTab(filters.routeTab);
    setSelectedStopId(filters.stopId ?? null);

    // Date range
    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate + 'T00:00:00');
      const end = new Date(filters.endDate + 'T00:00:00');
      setAppliedStartDate(start);
      setAppliedEndDate(end);
      setStagedStartDate(start);
      setStagedEndDate(end);
      setAppliedSeason(null);
      setStagedSeason(null);
      setAppliedQuickPick(null);
    }

    // Days
    const daysMode = filters.daysMode ?? 'all';
    setAppliedDaysMode(daysMode);
    setStagedDaysMode(daysMode);
    setAppliedCustomDays(filters.customDays ?? []);
    setStagedCustomDays(filters.customDays ?? []);

    // Time periods
    const timeMode = filters.timeMode ?? 'all';
    setAppliedTimeMode(timeMode);
    setStagedTimeMode(timeMode);
    setAppliedTimePeriods(filters.timePeriods ?? []);
    setStagedTimePeriods(filters.timePeriods ?? []);

    // Comparison
    setComparisonMode(filters.comparisonMode ?? false);
    if (filters.comparisonStartDate && filters.comparisonEndDate) {
      setComparisonDateRange({
        start: new Date(filters.comparisonStartDate + 'T00:00:00'),
        end: new Date(filters.comparisonEndDate + 'T00:00:00'),
      });
    } else {
      setComparisonDateRange({ start: null, end: null });
    }
  }, [routesList]);

  // Prefetch all walkthrough steps' data to warm the cache
  const prefetchWalkthroughData = useCallback((steps: import('@/types/insights').WalkthroughStep[]) => {
    steps.forEach((step) => {
      const filters = step.filters;
      const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00') : null;
      const endDate = filters.endDate ? new Date(filters.endDate + 'T00:00:00') : null;

      // Resolve route ID
      let resolvedRouteId: string | null = null;
      if (filters.routeId) {
        const match = routesList.find(r => r.shortName === filters.routeId || r.id === filters.routeId);
        resolvedRouteId = match ? match.id : filters.routeId;
      }

      const filterState: FilterState = {
        startDate,
        endDate,
        daysMode: filters.daysMode ?? 'all',
        customDays: filters.customDays ?? [],
        timeMode: filters.timeMode ?? 'all',
        timePeriods: filters.timePeriods ?? [],
      };

      // Determine which endpoints to prefetch based on tab/route
      const endpoints: string[] = [];
      if (filters.tab === 'system') {
        endpoints.push('system', 'system/by-date', 'system/by-day');
      } else if (filters.tab === 'routes' && resolvedRouteId) {
        endpoints.push(
          `route/${resolvedRouteId}`,
          `route/${resolvedRouteId}/by-date`,
          `route/${resolvedRouteId}/by-day`,
          `route/${resolvedRouteId}/stops`,
          `route/${resolvedRouteId}/segments`,
        );
      }

      // Fire prefetch requests and populate the in-memory cache
      endpoints.forEach((endpoint) => {
        const url = buildApiUrl(endpoint, filterState);
        const cacheKey = getCacheKey(endpoint, filterState);
        if (url && cacheKey) {
          fetch(url)
            .then(r => r.json())
            .then(data => setCachedData(cacheKey, data))
            .catch(() => {});
        }
      });

      // Also prefetch comparison data if needed
      if (filters.comparisonMode && filters.comparisonStartDate && filters.comparisonEndDate) {
        const compFilterState: FilterState = {
          startDate: new Date(filters.comparisonStartDate + 'T00:00:00'),
          endDate: new Date(filters.comparisonEndDate + 'T00:00:00'),
          daysMode: filters.daysMode ?? 'all',
          customDays: filters.customDays ?? [],
          timeMode: filters.timeMode ?? 'all',
          timePeriods: filters.timePeriods ?? [],
        };
        endpoints.forEach((endpoint) => {
          const url = buildApiUrl(endpoint, compFilterState);
          const cacheKey = getCacheKey(endpoint, compFilterState);
          if (url && cacheKey) {
            fetch(url)
              .then(r => r.json())
              .then(data => setCachedData(cacheKey, data))
              .catch(() => {});
          }
        });
      }
    });
  }, [routesList]);

  const handleAnalyzeInsight = useCallback((insight: InsightCardType) => {
    // If insight has walkthrough steps, enter story mode
    if (insight.walkthrough && insight.walkthrough.length > 0) {
      // Save current filter state for restore on close
      savedFilterStateRef.current = {
        activeTab, selectedRouteId, selectedRouteTab, selectedStopId,
        appliedStartDate, appliedEndDate, appliedSeason, appliedQuickPick,
        appliedDaysMode, appliedCustomDays, appliedTimeMode, appliedTimePeriods,
        comparisonMode, comparisonDateRange, isFiltersPanelOpen, selectedMetric,
      };

      // Prefetch all steps' data immediately
      prefetchWalkthroughData(insight.walkthrough!);

      // Phase 1: fade out home content (150ms CSS transition)
      setIsTabContentHidden(true);

      setTimeout(() => {
        // Phase 2: content is hidden — now swap to story mode (triggers 350ms panel width transition)
        setIsStoryMode(true);
        setStoryModeInsight(insight);
        setStoryModeStepIndex(0);
        applyWalkthroughStep(insight.walkthrough![0].filters, { skipTab: true });

        // Phase 3: wait for panel width transition to finish, then fade in
        setTimeout(() => {
          setIsTabContentHidden(false);
        }, 380);
      }, 180);
      return;
    }

    // Fallback: use existing deepLink behavior
    if (insight.deepLink?.routeId) {
      setActiveTab('routes');
      setSelectedRouteId(insight.deepLink.routeId);
      setSelectedRouteTab('Summary');
      if (insight.deepLink.startDate && insight.deepLink.endDate) {
        const newStart = new Date(insight.deepLink.startDate + 'T00:00:00');
        const newEnd = new Date(insight.deepLink.endDate + 'T00:00:00');
        setAppliedStartDate(newStart);
        setAppliedEndDate(newEnd);
        setStagedStartDate(newStart);
        setStagedEndDate(newEnd);
        setAppliedSeason(null);
        setStagedSeason(null);
      }
      if (insight.deepLink.periods && insight.deepLink.periods.length > 0) {
        setAppliedTimePeriods(insight.deepLink.periods);
        setAppliedTimeMode('custom');
      }
      if (insight.deepLink.days && insight.deepLink.days.length > 0) {
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const customDays = insight.deepLink.days.map(d => dayNames[d]);
        setAppliedCustomDays(customDays);
        setAppliedDaysMode('custom');
      }
    }
  }, [activeTab, selectedRouteId, selectedRouteTab, selectedStopId,
      appliedStartDate, appliedEndDate, appliedSeason, appliedQuickPick,
      appliedDaysMode, appliedCustomDays, appliedTimeMode, appliedTimePeriods,
      comparisonMode, comparisonDateRange, isFiltersPanelOpen, applyWalkthroughStep, prefetchWalkthroughData]);

  const handleStoryModeNext = useCallback(() => {
    if (!storyModeInsight?.walkthrough) return;
    const nextIndex = storyModeStepIndex + 1;
    if (nextIndex < storyModeInsight.walkthrough.length) {
      setStoryModeStepIndex(nextIndex);
      applyWalkthroughStep(storyModeInsight.walkthrough[nextIndex].filters, { skipTab: true });
    }
  }, [storyModeInsight, storyModeStepIndex, applyWalkthroughStep]);

  const handleStoryModePrev = useCallback(() => {
    if (!storyModeInsight?.walkthrough) return;
    const prevIndex = storyModeStepIndex - 1;
    if (prevIndex >= 0) {
      setStoryModeStepIndex(prevIndex);
      applyWalkthroughStep(storyModeInsight.walkthrough[prevIndex].filters, { skipTab: true });
    }
  }, [storyModeInsight, storyModeStepIndex, applyWalkthroughStep]);

  const handleStoryModeClose = useCallback(() => {
    setIsStoryMode(false);
    setStoryModeInsight(null);
    setStoryModeStepIndex(0);

    const saved = savedFilterStateRef.current;
    if (!saved) return;

    const restoreState = () => {
      setActiveTab(saved.activeTab as 'home' | 'system' | 'routes' | 'stops' | 'components');
      setSelectedRouteId(saved.selectedRouteId);
      setSelectedRouteTab(saved.selectedRouteTab as 'Summary' | 'Trips' | 'Grid');
      setSelectedStopId(saved.selectedStopId);
      setAppliedStartDate(saved.appliedStartDate);
      setAppliedEndDate(saved.appliedEndDate);
      setStagedStartDate(saved.appliedStartDate);
      setStagedEndDate(saved.appliedEndDate);
      setAppliedSeason(saved.appliedSeason as { season: 'winter' | 'spring' | 'summer' | 'fall'; year: number } | null);
      setStagedSeason(saved.appliedSeason as { season: 'winter' | 'spring' | 'summer' | 'fall'; year: number } | null);
      setAppliedQuickPick(saved.appliedQuickPick);
      setAppliedDaysMode(saved.appliedDaysMode as 'all' | 'weekdays' | 'weekends' | 'custom');
      setStagedDaysMode(saved.appliedDaysMode as 'all' | 'weekdays' | 'weekends' | 'custom');
      setAppliedCustomDays(saved.appliedCustomDays);
      setStagedCustomDays(saved.appliedCustomDays);
      setAppliedTimeMode(saved.appliedTimeMode as 'all' | 'custom');
      setStagedTimeMode(saved.appliedTimeMode as 'all' | 'custom');
      setAppliedTimePeriods(saved.appliedTimePeriods);
      setStagedTimePeriods(saved.appliedTimePeriods);
      setComparisonMode(saved.comparisonMode);
      setComparisonDateRange(saved.comparisonDateRange);
      setIsFiltersPanelOpen(saved.isFiltersPanelOpen);
      setSelectedMetric(saved.selectedMetric);
      savedFilterStateRef.current = null;
    };

    // Use animation when going back to Home
    const goingHome = saved.activeTab === 'home';
    if (goingHome && aiMode) {
      const animDuration = 350;
      pendingTabRef.current = 'home';
      setTransitionToHome(true);
      setIsTabTransitioning(true);
      setIsTabContentHidden(true);

      setTimeout(() => {
        restoreState();
        setTimeout(() => {
          setIsTabTransitioning(false);
          setTransitionToHome(false);
          setIsTabContentHidden(false);
          pendingTabRef.current = null;
        }, animDuration);
      }, 150);
    } else {
      restoreState();
    }
  }, [aiMode]);

  // Generate segments between consecutive stops with real API load values
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

    // Build a lookup map from segment data: "fromStopId-toStopId" -> load value
    // Priority: 1) trip-specific data, 2) grid-based segment data (works for both filtered and unfiltered)
    const segmentLoadMap = new Map<string, number>();
    if (selectedTrip && tripData?.segments) {
      // Use trip-specific segment data when viewing a single trip
      tripData.segments.forEach(seg => {
        const key = `${seg.fromStopId}-${seg.toStopId}`;
        const loadValue = selectedMetric === 'Maxload' ? seg.maxLoad : seg.avgLoad;
        segmentLoadMap.set(key, loadValue);
      });
    } else if (segmentLoadMapFromGrid) {
      // Use grid-based segment data (correctly keyed by pattern stop order)
      for (const [key, data] of segmentLoadMapFromGrid) {
        const loadValue = selectedMetric === 'Maxload' ? data.maxLoad : data.avgLoad;
        segmentLoadMap.set(key, loadValue);
      }
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

      // Get the shape for this pattern
      // When a trip is selected, filteredShapes only contains that trip's shape
      // So we need to check all shape_ids in the pattern, not just the first one
      let patternShape = null;
      for (const shapeId of (patternInfo.shape_ids || [])) {
        patternShape = filteredShapes.find(s => s.properties.shape_id === shapeId);
        if (patternShape) break;
      }

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

          // Use real load value from API, or 0 if not available yet
          const segmentKey = `${fromStopId}-${toStopId}`;
          const loadValue = segmentLoadMap.get(segmentKey) || 0;

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
  }, [showSegmentColoring, selectedPattern, selectedRouteId, routePatterns, filteredStops, filteredShapes, selectedTrip, tripData, selectedMetric, segmentLoadMapFromGrid]);

  // Calculate value range for segments
  const segmentValueRange = React.useMemo(() => {
    if (segmentGeoms.length === 0) return { min: 0, max: 100 };
    const values = segmentGeoms.map(s => s.loadValue);
    return getValueRange(values);
  }, [segmentGeoms]);

  // Create comparison data for segments (percent change) using real data
  const segmentComparisonMap = React.useMemo(() => {
    if (!comparisonMode || segmentGeoms.length === 0) return new Map<string, number>();
    if (!segmentLoadMapFromGrid || !segmentLoadMapFromGrid2) return new Map<string, number>();

    const map = new Map<string, number>();
    segmentGeoms.forEach(seg => {
      const segmentKey = `${seg.fromStopId}-${seg.toStopId}`;
      const data1 = segmentLoadMapFromGrid.get(segmentKey);
      const data2 = segmentLoadMapFromGrid2.get(segmentKey);

      if (data1 && data2) {
        const value1 = selectedMetric === 'Maxload' ? data1.maxLoad : data1.avgLoad;
        const value2 = selectedMetric === 'Maxload' ? data2.maxLoad : data2.avgLoad;

        // Calculate percent change: (value1 - value2) / value2 * 100
        // value1 is Date-time 1 (primary), value2 is Date-time 2 (comparison baseline)
        let percentChange = 0;
        if (value2 > 0) {
          percentChange = Math.round(((value1 - value2) / value2) * 100);
        } else if (value1 > 0) {
          percentChange = 100; // Went from 0 to something = 100% increase
        }

        // If swapped, negate the percent change
        map.set(segmentKey, comparisonSwapped ? -percentChange : percentChange);
      }
    });
    return map;
  }, [segmentGeoms, comparisonMode, comparisonSwapped, segmentLoadMapFromGrid, segmentLoadMapFromGrid2, selectedMetric]);

  // Get the range of segment comparison values
  const segmentComparisonRange = React.useMemo(() => {
    if (!comparisonMode || segmentComparisonMap.size === 0) return { min: 0, max: 0 };
    const allValues = [...segmentComparisonMap.values()];
    return {
      min: Math.min(...allValues),
      max: Math.max(...allValues)
    };
  }, [segmentComparisonMap, comparisonMode]);

  // Calculate value ranges for the color scale
  // This needs to be based on what's currently visible on the map
  const { routeValueRange, stopValueRange, scaleTitle } = React.useMemo(() => {
    // Determine which data to show based on view
    if (selectedRouteId || activeTab === 'stops' || selectedStopId) {
      // If showing segment coloring, use segment range
      if (showSegmentColoring) {
        return {
          routeValueRange: { min: 0, max: 0 },
          stopValueRange: segmentValueRange,
          scaleTitle: selectedMetric,
        };
      }

      // If a trip is selected, use trip-specific stop values for the range
      if (selectedTrip && Object.keys(tripStopRidershipValues).length > 0) {
        const tripStopValues = Object.values(tripStopRidershipValues);
        return {
          routeValueRange: { min: 0, max: 0 },
          stopValueRange: getValueRange(tripStopValues),
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
  }, [selectedRouteId, selectedStopId, activeTab, filteredShapes, filteredStops, routesList, stopsList, selectedMetric, showSegmentColoring, segmentValueRange, selectedTrip, tripStopRidershipValues]);

  // Calculate value range for grid view (uses trip-specific stop values)
  const gridValueRange = React.useMemo(() => {
    if (gridStopValues.size === 0) {
      return stopValueRange; // Fall back to route-level stop values
    }
    const allValues: number[] = [];
    for (const stopMap of gridStopValues.values()) {
      for (const value of stopMap.values()) {
        allValues.push(value);
      }
    }
    if (allValues.length === 0) {
      return stopValueRange;
    }
    return getValueRange(allValues);
  }, [gridStopValues, stopValueRange]);

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

  // Trip-specific stop value map (for map coloring when viewing a trip)
  const tripStopValueMap = React.useMemo(() => {
    const map = new Map<string, number>();
    Object.entries(tripStopRidershipValues).forEach(([stopId, value]) => {
      map.set(stopId, value);
    });
    return map;
  }, [tripStopRidershipValues]);

  // Create a map of route comparison values (Date-time 2 values) for routes list display
  const routeComparisonValueMap = React.useMemo(() => {
    if (!comparisonMode) return new Map<string, number>();
    const map = new Map<string, number>();
    if (systemData2?.byRoute) {
      systemData2.byRoute.forEach(r => {
        const value = getMetricValue(r.metrics, selectedMetric);
        map.set(r.routeId, value);
      });
    }
    return map;
  }, [comparisonMode, systemData2, selectedMetric, getMetricValue]);

  // Create comparison value maps (percent change from Date-time 2 to Date-time 1)
  // Uses real API data when available
  const routeComparisonMap = React.useMemo(() => {
    if (!comparisonMode) return new Map<string, number>();
    const map = new Map<string, number>();

    // Calculate percent change: ((value1 - value2) / value2) * 100
    routesList.forEach(route => {
      const value1 = route.value;
      const value2 = routeComparisonValueMap.get(route.id);

      if (value2 !== undefined && value2 !== 0) {
        const percentChange = Math.round(((value1 - value2) / value2) * 100);
        // If swapped, negate the percent change to reverse the color
        map.set(route.id, comparisonSwapped ? -percentChange : percentChange);
      } else {
        // No comparison data available, show 0% change
        map.set(route.id, 0);
      }
    });
    return map;
  }, [routesList, comparisonMode, comparisonSwapped, routeComparisonValueMap]);

  // Get the range of route-specific comparison values for color scaling
  const routeComparisonRange = React.useMemo(() => {
    if (!comparisonMode) return { min: 0, max: 0 };
    const values = [...routeComparisonMap.values()];
    if (values.length === 0) return { min: 0, max: 0 };
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    return {
      min: Number.isFinite(minVal) ? minVal : 0,
      max: Number.isFinite(maxVal) ? maxVal : 0
    };
  }, [routeComparisonMap, comparisonMode]);

  // Create a map of stop comparison values (Date-time 2 values) for stops list display
  // When a route is selected, use route-specific stop data for accurate comparison
  const stopComparisonValueMap = React.useMemo(() => {
    if (!comparisonMode) return new Map<string, number>();
    const map = new Map<string, number>();

    // Use route-specific data when a route is selected, otherwise use system-wide data
    if (selectedRouteId && routeStopsRidership2?.stops) {
      routeStopsRidership2.stops.forEach(s => {
        let value: number;
        switch (selectedMetric) {
          case 'Average daily boardings':
            value = s.avgDailyBoardings;
            break;
          case 'Total boardings':
            value = s.totalBoardings;
            break;
          case 'Average daily alightings':
            value = s.avgDailyAlightings;
            break;
          case 'Average daily activity':
            value = s.avgDailyActivity;
            break;
          case 'Total activity':
            value = s.totalActivity;
            break;
          default:
            value = s.avgDailyActivity;
        }
        map.set(s.stopId, value);
      });
    } else if (allStopsData2?.stops) {
      const daysInRange2 = systemData2?.metrics?.daysInRange || 1;
      allStopsData2.stops.forEach(s => {
        let value: number;
        switch (selectedMetric) {
          case 'Average daily boardings':
            value = Math.round(s.totalBoardings / daysInRange2);
            break;
          case 'Total boardings':
            value = s.totalBoardings;
            break;
          case 'Average daily alightings':
            value = Math.round(s.totalAlightings / daysInRange2);
            break;
          case 'Average daily activity':
            value = s.avgDailyActivity;
            break;
          case 'Total activity':
            value = s.totalBoardings + s.totalAlightings;
            break;
          default:
            value = s.avgDailyActivity;
        }
        map.set(s.stopId, value);
      });
    }
    return map;
  }, [comparisonMode, allStopsData2, systemData2, selectedMetric, selectedRouteId, routeStopsRidership2]);

  const stopComparisonMap = React.useMemo(() => {
    if (!comparisonMode) return new Map<string, number>();
    const map = new Map<string, number>();

    // Calculate percent change: ((value1 - value2) / value2) * 100
    stopsList.forEach(stop => {
      const value1 = stop.value;
      const value2 = stopComparisonValueMap.get(stop.id);

      if (value2 !== undefined && value2 !== 0) {
        const percentChange = Math.round(((value1 - value2) / value2) * 100);
        // If swapped, negate the percent change to reverse the color
        map.set(stop.id, comparisonSwapped ? -percentChange : percentChange);
      } else {
        // No comparison data available, show 0% change
        map.set(stop.id, 0);
      }
    });
    return map;
  }, [stopsList, comparisonMode, comparisonSwapped, stopComparisonValueMap]);

  // Get the range of stop-specific comparison values for color scaling
  const stopComparisonRange = React.useMemo(() => {
    if (!comparisonMode) return { min: 0, max: 0 };
    const values = [...stopComparisonMap.values()];
    if (values.length === 0) return { min: 0, max: 0 };
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    return {
      min: Number.isFinite(minVal) ? minVal : 0,
      max: Number.isFinite(maxVal) ? maxVal : 0
    };
  }, [stopComparisonMap, comparisonMode]);

  // Trip-specific stop comparison map for TDV comparison mode
  // Uses tripData and tripData2 instead of allStopsData
  const tripStopComparisonMap = React.useMemo(() => {
    if (!comparisonMode || !selectedTrip || !tripData?.stops || !tripData2?.stops) {
      return new Map<string, number>();
    }
    const map = new Map<string, number>();

    // Helper to get stop value based on metric
    const getStopValue = (s: { avgDailyBoardings: number; totalBoardings: number; avgDailyAlightings: number; totalAlightings: number; avgDailyActivity: number; totalActivity: number; avgLoad?: number; maxLoad?: number }) => {
      switch (selectedMetric) {
        case 'Average daily boardings':
          return s.avgDailyBoardings;
        case 'Total boardings':
          return s.totalBoardings;
        case 'Average daily alightings':
          return s.avgDailyAlightings;
        case 'Total alightings':
          return s.totalAlightings;
        case 'Average daily activity':
          return s.avgDailyActivity;
        case 'Total activity':
          return s.totalActivity;
        case 'Average load':
          return s.avgLoad || 0;
        case 'Maxload':
          return s.maxLoad || 0;
        default:
          return s.avgDailyBoardings;
      }
    };

    // Build a map of tripData2 stop values for quick lookup
    const tripData2ValueMap = new Map<string, number>();
    tripData2.stops.forEach(s => {
      tripData2ValueMap.set(s.stopId, getStopValue(s));
    });

    // Calculate percent change for each stop in tripData
    tripData.stops.forEach(s => {
      const value1 = getStopValue(s);
      const value2 = tripData2ValueMap.get(s.stopId);

      if (value2 !== undefined && value2 !== 0) {
        const percentChange = Math.round(((value1 - value2) / value2) * 100);
        map.set(s.stopId, comparisonSwapped ? -percentChange : percentChange);
      } else {
        map.set(s.stopId, 0);
      }
    });

    return map;
  }, [comparisonMode, selectedTrip, tripData, tripData2, selectedMetric, comparisonSwapped]);

  // Get the range of trip-specific stop comparison values for color scaling in TDV
  const tripStopComparisonRange = React.useMemo(() => {
    if (!comparisonMode || tripStopComparisonMap.size === 0) return { min: 0, max: 0 };
    const values = [...tripStopComparisonMap.values()];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    return {
      min: Number.isFinite(minVal) ? minVal : 0,
      max: Number.isFinite(maxVal) ? maxVal : 0
    };
  }, [tripStopComparisonMap, comparisonMode]);

  // Trip-specific segment comparison map for TDV comparison mode (load metrics)
  // Uses tripData.segments and tripData2.segments
  const tripSegmentComparisonMap = React.useMemo(() => {
    if (!comparisonMode || !selectedTrip || !tripData?.segments || !tripData2?.segments) {
      return new Map<string, number>();
    }
    const map = new Map<string, number>();

    // Helper to get segment load value based on metric
    const getSegmentValue = (seg: { avgLoad: number; maxLoad: number }) => {
      return selectedMetric === 'Maxload' ? seg.maxLoad : seg.avgLoad;
    };

    // Build a map of tripData2 segment values for quick lookup
    const tripData2SegmentMap = new Map<string, number>();
    tripData2.segments.forEach(seg => {
      const key = `${seg.fromStopId}-${seg.toStopId}`;
      tripData2SegmentMap.set(key, getSegmentValue(seg));
    });

    // Calculate percent change for each segment in tripData
    tripData.segments.forEach(seg => {
      const key = `${seg.fromStopId}-${seg.toStopId}`;
      const value1 = getSegmentValue(seg);
      const value2 = tripData2SegmentMap.get(key);

      if (value2 !== undefined && value2 !== 0) {
        const percentChange = Math.round(((value1 - value2) / value2) * 100);
        map.set(key, comparisonSwapped ? -percentChange : percentChange);
      } else {
        map.set(key, 0);
      }
    });

    return map;
  }, [comparisonMode, selectedTrip, tripData, tripData2, selectedMetric, comparisonSwapped]);

  // Get the range of trip segment comparison values
  const tripSegmentComparisonRange = React.useMemo(() => {
    if (!comparisonMode || tripSegmentComparisonMap.size === 0) return { min: 0, max: 0 };
    const allValues = [...tripSegmentComparisonMap.values()];
    return {
      min: Math.min(...allValues),
      max: Math.max(...allValues)
    };
  }, [tripSegmentComparisonMap, comparisonMode]);

  // Get the range of comparison values for color scaling
  const comparisonValueRange = React.useMemo(() => {
    if (!comparisonMode) return { min: 0, max: 0 };
    // Use trip-specific comparison values when a trip is selected
    const stopValues = selectedTrip && tripStopComparisonMap.size > 0
      ? [...tripStopComparisonMap.values()]
      : [...stopComparisonMap.values()];
    const allValues = [...routeComparisonMap.values(), ...stopValues];
    if (allValues.length === 0) return { min: 0, max: 0 };

    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);

    // Guard against Infinity/-Infinity and NaN
    return {
      min: Number.isFinite(minVal) ? minVal : 0,
      max: Number.isFinite(maxVal) ? maxVal : 0
    };
  }, [routeComparisonMap, stopComparisonMap, tripStopComparisonMap, selectedTrip, comparisonMode]);

  // Get the range of absolute difference values for number mode
  const comparisonDiffRange = React.useMemo(() => {
    if (!comparisonMode) return { min: 0, max: 0 };

    const allDiffs: number[] = [];

    // Calculate absolute differences for stops using actual values
    stopsList.forEach(stop => {
      const value1 = stop.value;
      const value2 = stopComparisonValueMap.get(stop.id) || value1;
      const diff = value1 - value2;
      allDiffs.push(diff);
    });

    // Calculate absolute differences for routes using actual values
    routesList.forEach(route => {
      const value1 = route.value;
      const value2 = routeComparisonValueMap.get(route.id) || value1;
      const diff = value1 - value2;
      allDiffs.push(diff);
    });

    if (allDiffs.length === 0) return { min: 0, max: 0 };

    const minVal = Math.min(...allDiffs);
    const maxVal = Math.max(...allDiffs);

    // Guard against Infinity/-Infinity and NaN
    return {
      min: Number.isFinite(minVal) ? minVal : 0,
      max: Number.isFinite(maxVal) ? maxVal : 0
    };
  }, [comparisonMode, stopsList, routesList, stopComparisonValueMap, routeComparisonValueMap]);

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
  // Keep routes/stops visible during tab transitions so they don't disappear mid-animation
  const showRoutes = ((activeTab === 'system' || activeTab === 'routes') || isTabContentHidden || isTabTransitioning || isStoryPanelVisible) && !selectedStopId;
  const showStops = ((activeTab === 'stops' || selectedStopId || selectedRouteId) || isTabContentHidden || isStoryPanelVisible) && activeTab !== 'components';

  // Use shared utility for bounding box calculation
  const calculateBounds = calculateBoundsUtil;

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
    try {
      const rawPadding = getUIPadding(isFiltersPanelOpen, aiMode ? 60 : 72);
      // Clamp padding so it never exceeds viewport dimensions (prevents fitBounds assertion)
      const maxHorizontalPadding = Math.max(width - 1, 0);
      const maxVerticalPadding = Math.max(height - 1, 0);
      const padding = {
        top: Math.min(rawPadding.top, maxVerticalPadding / 2),
        bottom: Math.min(rawPadding.bottom, maxVerticalPadding / 2),
        left: Math.min(rawPadding.left, maxHorizontalPadding * 0.75),
        right: Math.min(rawPadding.right, maxHorizontalPadding * 0.25),
      };
      const viewport = new WebMercatorViewport({ width, height });
      const { longitude, latitude, zoom } = viewport.fitBounds(bounds, {
        padding,
        maxZoom: MAX_ZOOM
      });
      return {
        longitude,
        latitude,
        zoom: Math.max(zoom, MIN_ZOOM),
        pitch: 0,
        bearing: 0,
        transitionDuration: 200
      };
    } catch (e) {
      console.warn('fitToBounds failed:', e);
      return null;
    }
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
    // Set timer to show tooltip after 0.5 seconds, but only if text is cut off and menu is not open
    daysTooltipTimerRef.current = setTimeout(() => {
      // Check if text is overflowing and menu is not open
      if (daysTextRef.current && openFilter !== 'days') {
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

  // Handlers for Date-time 2 date filter tooltip
  const handleDate2FilterMouseEnter = () => {
    setIsDate2Hovered(true);
    // Set timer to show tooltip after 0.5 seconds, but only if text is cut off
    date2TooltipTimerRef.current = setTimeout(() => {
      // Check if text is overflowing
      if (date2TextRef.current) {
        const isOverflowing = date2TextRef.current.scrollWidth > date2TextRef.current.clientWidth;
        if (isOverflowing) {
          setShowDate2Tooltip(true);
        }
      }
    }, 500);
  };

  const handleDate2FilterMouseLeave = () => {
    setIsDate2Hovered(false);
    // Clear timer and hide tooltip instantly
    if (date2TooltipTimerRef.current) {
      clearTimeout(date2TooltipTimerRef.current);
      date2TooltipTimerRef.current = null;
    }
    setShowDate2Tooltip(false);
  };

  // Handlers for Date-time 2 days filter tooltip
  const handleDays2FilterMouseEnter = () => {
    setIsDays2Hovered(true);
    // Set timer to show tooltip after 0.5 seconds, but only if text is cut off and menu is not open
    days2TooltipTimerRef.current = setTimeout(() => {
      // Check if text is overflowing and menu is not open
      if (days2TextRef.current && openFilter !== 'days2') {
        const isOverflowing = days2TextRef.current.scrollWidth > days2TextRef.current.clientWidth;
        if (isOverflowing) {
          setShowDays2Tooltip(true);
        }
      }
    }, 500);
  };

  const handleDays2FilterMouseLeave = () => {
    setIsDays2Hovered(false);
    // Clear timer and hide tooltip instantly
    if (days2TooltipTimerRef.current) {
      clearTimeout(days2TooltipTimerRef.current);
      days2TooltipTimerRef.current = null;
    }
    setShowDays2Tooltip(false);
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

  // Helper function to format date as "Mon DD, YYYY" or "Mon DD" (without year) or just "DD" (day only)
  const formatDate = (date: Date, options: { includeYear?: boolean; includeMonth?: boolean } = {}) => {
    const { includeYear = true, includeMonth = true } = options;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (!includeMonth) {
      // Just the day number
      return `${date.getDate()}`;
    }

    const formatted = `${months[date.getMonth()]} ${date.getDate()}`;
    return includeYear ? `${formatted}, ${date.getFullYear()}` : formatted;
  };

  // Helper function to format a date range intelligently
  const formatDateRange = (startDate: Date, endDate: Date) => {
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();

    if (sameMonth) {
      // Same month & year: "Nov 5 - 6, 2025"
      return `${formatDate(startDate, { includeYear: false })} - ${formatDate(endDate, { includeMonth: false })}, ${endDate.getFullYear()}`;
    } else if (sameYear) {
      // Different month, same year: "Oct 5 - Nov 6, 2025"
      return `${formatDate(startDate, { includeYear: false })} - ${formatDate(endDate, { includeYear: false })}, ${endDate.getFullYear()}`;
    } else {
      // Different year: "Dec 5, 2024 - Jan 6, 2025"
      return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    }
  };

  // Helper function to get actual Date objects for a season
  const getSeasonDates = (season: 'winter' | 'spring' | 'summer' | 'fall', year: number): { start: Date; end: Date } => {
    const prevYear = year - 1;
    const today = new Date();

    switch (season) {
      case 'winter':
        return {
          start: new Date(prevYear, 8, 21), // Sep 21 of previous year
          end: new Date(year, 2, 20) // Mar 20
        };
      case 'spring':
        return {
          start: new Date(year, 2, 21), // Mar 21
          end: new Date(year, 5, 21) // Jun 21
        };
      case 'summer':
        return {
          start: new Date(year, 5, 22), // Jun 22
          end: new Date(year, 8, 18) // Sep 18
        };
      case 'fall':
        // For current year fall, end at today
        if (year === today.getFullYear()) {
          return {
            start: new Date(year, 8, 19), // Sep 19
            end: today
          };
        }
        return {
          start: new Date(year, 8, 19), // Sep 19
          end: new Date(year + 1, 2, 19) // Mar 19 of next year
        };
      default:
        return { start: today, end: today };
    }
  };

  // Helper function to get actual Date objects for quick picks
  const getQuickPickDates = (quickPick: string): { start: Date; end: Date } | null => {
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
        return null;
    }

    return { start: startDate, end: endDate };
  };

  // Compute selected days for filtering charts
  const getEffectiveSelectedDays = (): string[] | null => {
    if (appliedDaysMode === 'all') {
      return null; // Show all days
    }
    if (appliedDaysMode === 'weekdays') {
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    }
    if (appliedDaysMode === 'weekends') {
      return ['Sat', 'Sun'];
    }
    if (appliedDaysMode === 'custom' && appliedCustomDays.length > 0) {
      return appliedCustomDays;
    }
    return null;
  };

  // Compute selected time periods for filtering charts
  const getEffectiveSelectedPeriods = (): string[] | null => {
    if (appliedTimeMode === 'all') {
      return null; // Show all periods
    }
    if (appliedTimeMode === 'custom' && appliedTimePeriods.length > 0) {
      return appliedTimePeriods;
    }
    return null;
  };

  const effectiveSelectedDays = getEffectiveSelectedDays();
  const effectiveSelectedPeriods = getEffectiveSelectedPeriods();

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

    return formatDateRange(startDate, endDate);
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
      return `${seasonLabels[appliedSeason.season]} ${appliedSeason.year}`;
    }
    if (appliedStartDate && appliedEndDate) {
      return formatDateRange(appliedStartDate, appliedEndDate);
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

    return `${daysText} · ${timeText}`;
  };

  // Calculate comparison date range based on preset
  const calculateComparisonDateRange = (preset: 'previous-period' | 'previous-year' | 'custom') => {
    // Get effective date range - either from explicit dates or from season/quickpick
    let effectiveStart = appliedStartDate;
    let effectiveEnd = appliedEndDate;

    // If no explicit dates, try to get from season or quick pick
    if (!effectiveStart || !effectiveEnd) {
      if (appliedQuickPick) {
        const quickDates = getQuickPickDates(appliedQuickPick);
        if (quickDates) {
          effectiveStart = quickDates.start;
          effectiveEnd = quickDates.end;
        }
      } else if (appliedSeason) {
        const seasonDates = getSeasonDates(appliedSeason.season, appliedSeason.year);
        effectiveStart = seasonDates.start;
        effectiveEnd = seasonDates.end;
      }
    }

    if (!effectiveStart || !effectiveEnd) {
      return { start: null, end: null };
    }

    if (preset === 'previous-period') {
      // Same duration, immediately before
      const duration = effectiveEnd.getTime() - effectiveStart.getTime();
      const comparisonEnd = new Date(effectiveStart.getTime() - 1); // day before current start
      const comparisonStart = new Date(comparisonEnd.getTime() - duration);
      return { start: comparisonStart, end: comparisonEnd };
    } else if (preset === 'previous-year') {
      // Same dates, 1 year prior
      const comparisonStart = new Date(effectiveStart);
      comparisonStart.setFullYear(effectiveStart.getFullYear() - 1);
      const comparisonEnd = new Date(effectiveEnd);
      comparisonEnd.setFullYear(effectiveEnd.getFullYear() - 1);
      return { start: comparisonStart, end: comparisonEnd };
    }
    // For custom, return current comparison dates (will be set separately)
    return comparisonDateRange;
  };

  // Helper to get the previous season
  const getPreviousSeason = (season: 'winter' | 'spring' | 'summer' | 'fall', year: number): { season: 'winter' | 'spring' | 'summer' | 'fall'; year: number } => {
    const seasonOrder: ('winter' | 'spring' | 'summer' | 'fall')[] = ['winter', 'spring', 'summer', 'fall'];
    const currentIndex = seasonOrder.indexOf(season);
    if (currentIndex === 0) {
      // Winter -> previous Fall (previous year)
      return { season: 'fall', year: year - 1 };
    }
    return { season: seasonOrder[currentIndex - 1], year };
  };

  // Handle comparison preset selection
  const handleComparisonPresetSelect = (preset: 'previous-period' | 'previous-year' | 'custom') => {
    setComparisonPreset(preset);
    const range = calculateComparisonDateRange(preset);
    setComparisonDateRange(range);

    // Set the staged season/quickpick for Date-time 2 based on the preset
    if (preset === 'previous-year') {
      // If Date-time 1 has a season, set Date-time 2 to the same season but previous year
      if (appliedSeason) {
        setStagedSeason2({ season: appliedSeason.season, year: appliedSeason.year - 1 });
        setStagedQuickPick2(null);
      } else if (appliedQuickPick) {
        // Quick picks like "Last 7 days" don't have a "previous year" equivalent, show raw dates
        setStagedSeason2(null);
        setStagedQuickPick2(null);
      }
    } else if (preset === 'previous-period') {
      // If Date-time 1 has a season, set Date-time 2 to the previous season
      if (appliedSeason) {
        const prevSeason = getPreviousSeason(appliedSeason.season, appliedSeason.year);
        setStagedSeason2(prevSeason);
        setStagedQuickPick2(null);
        // Also update the comparison date range to match the previous season's dates
        const seasonDates = getSeasonDates(prevSeason.season, prevSeason.year);
        setComparisonDateRange({ start: seasonDates.start, end: seasonDates.end });
      } else {
        // No season selected, show raw dates
        setStagedSeason2(null);
        setStagedQuickPick2(null);
      }
    } else {
      // Custom - reset to allow user selection
      setStagedSeason2(null);
      setStagedQuickPick2(null);
    }

    // For custom preset, don't enter comparison mode yet - wait for user to apply dates
    if (preset === 'custom') {
      setDate2PickerMode('shortcuts');
      // Initialize calendar to start of data range in case user switches to custom
      setCalendarStartMonth2(new Date(DATA_START_DATE.getFullYear(), DATA_START_DATE.getMonth()));
      // Reset staged dates so user starts fresh
      setStagedStartDate2(null);
      setStagedEndDate2(null);
      setOpenFilter('date2');
      // Don't enter comparison mode yet - will happen when user clicks Apply
    } else {
      // For previous-period and previous-year, enter comparison mode immediately
      // Reset Date-time 2 days/periods settings to defaults when entering comparison mode
      setAppliedDaysMode2('all');
      setAppliedCustomDays2([]);
      setAppliedTimeMode2('all');
      setAppliedTimePeriods2([]);

      setComparisonMode(true);
      setOpenFilter(null);

      // Reset exit tooltip state when entering comparison mode
      setShowExitTooltip(false);
      if (exitTooltipTimerRef.current) {
        clearTimeout(exitTooltipTimerRef.current);
        exitTooltipTimerRef.current = null;
      }
    }
  };

  // Exit comparison mode
  const exitComparisonMode = () => {
    setComparisonMode(false);
    setComparisonPreset(null);
    setComparisonDateRange({ start: null, end: null });
    setComparisonSwapped(false);

    // Reset exit tooltip state
    setShowExitTooltip(false);
    if (exitTooltipTimerRef.current) {
      clearTimeout(exitTooltipTimerRef.current);
      exitTooltipTimerRef.current = null;
    }
  };

  // Swap Date-time 1 and Date-time 2 display order
  // This doesn't refetch data - it just toggles which period is shown as "primary" vs "comparison"
  const swapDateRanges = () => {
    setComparisonSwapped(prev => !prev);
  };

  // Format comparison date range (handles null values)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formatComparisonDateRange = (start: Date | null, end: Date | null): string => {
    if (!start || !end) return '';
    return formatDateRange(start, end);
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

      // Default to the tab matching the current selection
      setDatePickerMode(appliedSeason ? 'shortcuts' : 'custom');
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

  // ===== DATE-TIME 2 HANDLERS (Comparison Range) =====

  // When date2 picker opens, capture the current comparison date range as original and staged
  useEffect(() => {
    if (openFilter === 'date2') {
      // Capture original state for Reset
      setOriginalSeason2(stagedSeason2);
      setOriginalQuickPick2(stagedQuickPick2);
      setOriginalStartDate2(comparisonDateRange.start);
      setOriginalEndDate2(comparisonDateRange.end);

      // Initialize staged state from comparison date range
      setStagedStartDate2(comparisonDateRange.start);
      setStagedEndDate2(comparisonDateRange.end);

      // Default to Seasons tab unless a custom date range is actively selected
      setDate2PickerMode(stagedSeason2 || (!comparisonDateRange.start && !comparisonDateRange.end) ? 'shortcuts' : 'custom');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFilter]);

  // Handle Apply button for Date-time 2 - copy staged state to comparison range and close picker
  const handleApplyDate2Filter = () => {
    setComparisonDateRange({ start: stagedStartDate2, end: stagedEndDate2 });

    // If not already in comparison mode (e.g., user selected "Custom" from compare dropdown),
    // enter comparison mode now that they've selected dates
    if (!comparisonMode) {
      // Reset Date-time 2 days/periods settings to defaults
      setAppliedDaysMode2('all');
      setAppliedCustomDays2([]);
      setAppliedTimeMode2('all');
      setAppliedTimePeriods2([]);

      setComparisonMode(true);

      // Reset exit tooltip state
      setShowExitTooltip(false);
      if (exitTooltipTimerRef.current) {
        clearTimeout(exitTooltipTimerRef.current);
        exitTooltipTimerRef.current = null;
      }
    }

    setOpenFilter(null);
  };

  // Handle Reset button for Date-time 2 - restore original state to staged
  const handleResetDate2Filter = () => {
    setStagedSeason2(originalSeason2);
    setStagedQuickPick2(originalQuickPick2);
    setStagedStartDate2(originalStartDate2);
    setStagedEndDate2(originalEndDate2);
  };

  // Check if there are changes for date2 picker
  const hasDate2Changes =
    JSON.stringify(stagedSeason2) !== JSON.stringify(originalSeason2) ||
    stagedQuickPick2 !== originalQuickPick2 ||
    stagedStartDate2?.getTime() !== originalStartDate2?.getTime() ||
    stagedEndDate2?.getTime() !== originalEndDate2?.getTime();

  // When days2 picker opens, capture the current applied state as both original and staged
  useEffect(() => {
    if (openFilter === 'days2') {
      // Capture original state for Reset
      setOriginalDaysMode2(appliedDaysMode2);
      setOriginalCustomDays2(appliedCustomDays2);
      setOriginalTimeMode2(appliedTimeMode2);
      setOriginalTimePeriods2(appliedTimePeriods2);

      // Initialize staged state from applied state
      setStagedDaysMode2(appliedDaysMode2);
      setStagedCustomDays2(appliedCustomDays2);
      setStagedTimeMode2(appliedTimeMode2);
      setStagedTimePeriods2(appliedTimePeriods2);
    }
  }, [openFilter, appliedDaysMode2, appliedCustomDays2, appliedTimeMode2, appliedTimePeriods2]);

  // Handle Apply button for Date-time 2 days filter
  const handleApplyDays2Filter = () => {
    setAppliedDaysMode2(stagedDaysMode2);
    setAppliedCustomDays2(stagedCustomDays2);
    setAppliedTimeMode2(stagedTimeMode2);
    setAppliedTimePeriods2(stagedTimePeriods2);
    setOpenFilter(null);
  };

  // Handle Reset button for Date-time 2 days filter
  const handleResetDays2Filter = () => {
    setStagedDaysMode2(originalDaysMode2);
    setStagedCustomDays2(originalCustomDays2);
    setStagedTimeMode2(originalTimeMode2);
    setStagedTimePeriods2(originalTimePeriods2);
  };

  // Check if there are changes for days2 picker
  const hasDays2Changes =
    stagedDaysMode2 !== originalDaysMode2 ||
    JSON.stringify(stagedCustomDays2) !== JSON.stringify(originalCustomDays2) ||
    stagedTimeMode2 !== originalTimeMode2 ||
    JSON.stringify(stagedTimePeriods2) !== JSON.stringify(originalTimePeriods2);

  // Helper function to get Date-time 2 date filter text
  const getDate2FilterText = (): string => {
    if (stagedQuickPick2) {
      return getQuickPickDateRange(stagedQuickPick2);
    }
    if (stagedSeason2) {
      const seasonLabels = {
        winter: 'Winter',
        spring: 'Spring',
        summer: 'Summer',
        fall: 'Fall'
      };
      return `${seasonLabels[stagedSeason2.season]} ${stagedSeason2.year}`;
    }
    if (comparisonDateRange.start && comparisonDateRange.end) {
      return formatDateRange(comparisonDateRange.start, comparisonDateRange.end);
    }
    return 'Select date range';
  };

  // Helper function to get Date-time 2 days filter text
  const getDays2FilterText = (): string => {
    let daysText = '';
    let timeText = '';

    // Days text
    if (appliedDaysMode2 === 'all') {
      daysText = 'All Days';
    } else if (appliedDaysMode2 === 'weekdays') {
      daysText = 'Weekdays';
    } else if (appliedDaysMode2 === 'weekends') {
      daysText = 'Weekends';
    } else if (appliedDaysMode2 === 'custom' && appliedCustomDays2.length > 0) {
      if (appliedCustomDays2.length === 7) {
        daysText = 'All Days';
      } else {
        daysText = appliedCustomDays2.join(', ');
      }
    }

    // Time text
    if (appliedTimeMode2 === 'all') {
      timeText = 'All Day';
    } else if (appliedTimeMode2 === 'custom' && appliedTimePeriods2.length > 0) {
      if (appliedTimePeriods2.length === 6) {
        timeText = 'All Day';
      } else {
        timeText = appliedTimePeriods2.join(', ');
      }
    }

    return `${daysText} · ${timeText}`;
  };

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

  // Track when filter panel closes to prevent stop dropdown from auto-opening
  useEffect(() => {
    if (!isFiltersPanelOpen) {
      filterPanelJustClosedRef.current = true;
      const timer = setTimeout(() => {
        filterPanelJustClosedRef.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isFiltersPanelOpen]);

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

  // Route filter handlers
  const handleApplyRouteFilter = () => {
    setAppliedRouteFilterMin(stagedRouteFilterMin);
    setAppliedRouteFilterMax(stagedRouteFilterMax);
    setIsRouteFilterMenuOpen(false);
  };

  const handleResetRouteFilter = () => {
    setStagedRouteFilterMin(null);
    setStagedRouteFilterMax(null);
    setAppliedRouteFilterMin(null);
    setAppliedRouteFilterMax(null);
    setIsRouteFilterMenuOpen(false);
  };

  const hasRouteFilterChanges =
    stagedRouteFilterMin !== originalRouteFilterMin ||
    stagedRouteFilterMax !== originalRouteFilterMax;

  const hasRouteFiltersToReset =
    stagedRouteFilterMin !== null || stagedRouteFilterMax !== null;

  // Function to update panel position based on which filter is open
  const updatePanelPosition = useCallback(() => {
    const GAP = 8; // 8px gap between filter and panel
    const BOTTOM_MARGIN = 24; // Minimum margin from bottom of viewport

    // For date2, use date2Ref when in comparison mode, otherwise compareRef (positioned below Compare button)
    const trigger =
      openFilter === 'date' ? dateRef.current :
      openFilter === 'days' ? daysRef.current :
      openFilter === 'date2' ? (date2Ref.current || compareRef.current) :
      openFilter === 'days2' ? days2Ref.current :
      null;

    if (!trigger) return setPanelPos(null);

    const rect = trigger.getBoundingClientRect(); // Get viewport coordinates
    const viewportHeight = window.innerHeight;

    // Estimate panel height based on filter type (date pickers are taller)
    const isDatePicker = openFilter === 'date' || openFilter === 'date2';
    const estimatedPanelHeight = isDatePicker ? 610 : 400;

    // Calculate default position (below trigger)
    let top = rect.bottom + GAP;

    // Only apply overflow detection for date picker 1, not date2 (compare picker)
    if (openFilter !== 'date2' && top + estimatedPanelHeight > viewportHeight - BOTTOM_MARGIN) {
      // Position so the bottom of the panel has BOTTOM_MARGIN from viewport bottom
      top = Math.max(BOTTOM_MARGIN, viewportHeight - estimatedPanelHeight - BOTTOM_MARGIN);
    }

    setPanelPos({
      top,
      left: rect.left,
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
      const target = event.target as Node;

      // Check if click is outside both the panel and the filter triggers
      if (
        openFilter &&
        openFilter !== 'compare' &&
        panelRef.current &&
        !panelRef.current.contains(target) &&
        dateRef.current &&
        !dateRef.current.contains(target) &&
        daysRef.current &&
        !daysRef.current.contains(target) &&
        (!date2Ref.current || !date2Ref.current.contains(target)) &&
        (!days2Ref.current || !days2Ref.current.contains(target))
      ) {
        setOpenFilter(null);
      }
    };

    if (openFilter && openFilter !== 'compare') {
      // Add listener with a slight delay to avoid immediate closing
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openFilter]);

  // Separate click-outside handler for compare dropdown
  useEffect(() => {
    const handleCompareClickOutside = (event: MouseEvent) => {
      if (compareRef.current && !compareRef.current.contains(event.target as Node)) {
        setOpenFilter(null);
      }
    };

    if (openFilter === 'compare') {
      // Use click event (fires after mousedown) to avoid race with button toggle
      document.addEventListener('click', handleCompareClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleCompareClickOutside);
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

      if (isRouteFilterMenuOpen && routeFilterButtonRef.current && !routeFilterButtonRef.current.contains(target)) {
        const filterMenus = document.querySelectorAll('[data-route-filter-menu]');
        let clickedInMenu = false;
        filterMenus.forEach(menu => {
          if (menu.contains(target)) {
            clickedInMenu = true;
          }
        });
        if (!clickedInMenu) {
          setIsRouteFilterMenuOpen(false);
        }
      }

      if (isRouteSortMenuOpen && routeSortButtonRef.current && !routeSortButtonRef.current.contains(target)) {
        const sortMenus = document.querySelectorAll('[data-route-sort-menu]');
        let clickedInMenu = false;
        sortMenus.forEach(menu => {
          if (menu.contains(target)) {
            clickedInMenu = true;
          }
        });
        if (!clickedInMenu) {
          setIsRouteSortMenuOpen(false);
        }
      }

    };

    if (isTripFilterMenuOpen || isTripSortMenuOpen || isStopFilterMenuOpen || isStopSortMenuOpen || isRouteFilterMenuOpen || isRouteSortMenuOpen) {
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTripFilterMenuOpen, isTripSortMenuOpen, isStopFilterMenuOpen, isStopSortMenuOpen, isRouteFilterMenuOpen, isRouteSortMenuOpen]);

  useEffect(() => {
    (async () => {
      try {
        // Fetch all static data in parallel for faster loading
        const [
          shapesFC,
          stopsFC,
          routeStopsData,
          patternLookupData,
          routePatternsData,
          tripsData
        ] = await Promise.all([
          fetchShapesKCM(),
          fetchStopsKCM(),
          fetchRouteStopsMap(),
          fetchPatternLookup(),
          fetchRoutePatterns(),
          fetchRouteTrips()
        ]);
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
  // Skip this when restoring a bookmark (filters are restored separately)
  useEffect(() => {
    if (isRestoringBookmarkRef.current) {
      return;
    }
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
    // Also reset saved scroll position
    tripsScrollPositionRef.current = 0;
  }, [selectedRouteId, selectedPattern]);

  // Restore scroll position when returning from trip detail view
  useEffect(() => {
    if (!selectedTrip && tripsScrollRef.current && tripsScrollPositionRef.current > 0) {
      tripsScrollRef.current.scrollTop = tripsScrollPositionRef.current;
    }
  }, [selectedTrip]);

  // Reset route content scroll state when switching tabs
  useEffect(() => {
    setIsRouteContentScrolled(false);
  }, [selectedRouteTab]);

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

  // Load trip stop times when Grid tab is selected
  useEffect(() => {
    if (selectedRouteTab === 'Grid' && routeTripsWithRidership.length > 0) {
      // Check if we already have grid data loaded for the current trips
      const relevantTrips = routeTripsWithRidership
        .filter(pg => !selectedPattern || pg.headsign === selectedPattern)
        .flatMap(pg => pg.trips);

      const hasAllData = relevantTrips.every(trip => gridTripStops[trip.trip_id]);

      // Only load if we don't have the data yet
      if (!hasAllData) {
        const loadGridData = async () => {
          setIsLoadingGridData(true);
          try {
            const allTripStopTimes = await fetchTripStopTimes();

            // Get all trip IDs from routeTripsWithRidership (filtered by pattern if selected)
            const relevantTrips = routeTripsWithRidership
              .filter(pg => !selectedPattern || pg.headsign === selectedPattern)
              .flatMap(pg => pg.trips);

            // Build a map of trip stops for relevant trips
            const tripStopsMap: { [tripId: string]: TripStopTime[] } = {};
            for (const trip of relevantTrips) {
              if (allTripStopTimes[trip.trip_id]) {
                tripStopsMap[trip.trip_id] = allTripStopTimes[trip.trip_id];
              }
            }

            setGridTripStops(tripStopsMap);
          } catch (error) {
            console.error('Failed to load grid data:', error);
          } finally {
            setIsLoadingGridData(false);
          }
        };

        loadGridData();
      }
    }
  }, [selectedRouteTab, routeTripsWithRidership, selectedPattern, gridTripStops]);

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
      // Only zoom/center on the stop if the stop actually changed (not just panel toggle)
      const stopChanged = selectedStopId !== prevSelectedStopIdRef.current;
      prevSelectedStopIdRef.current = selectedStopId;

      if (!stopChanged) {
        // Panel toggled but stop didn't change - don't recenter or zoom
        return;
      }

      // Find the actual selected stop
      const stop = stops.find(s => s.properties.stop_id === selectedStopId);
      if (!stop) return;
      const [stopLng, stopLat] = stop.geometry.coordinates as number[];

      // Calculate the center point accounting for the left panel offset
      const el = mapContainerRef.current;
      const width = el?.clientWidth ?? window.innerWidth;
      const height = el?.clientHeight ?? window.innerHeight;
      const padding = getUIPadding(isFiltersPanelOpen, aiMode ? 60 : 72);

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
      // Reset the previous stop ref when deselecting
      prevSelectedStopIdRef.current = null;
      // Reset to the originally fitted system view, not the hardcoded Gas Works view
      setViewState(initialFittedViewRef.current ?? INITIAL_VIEW_STATE);
    }
  }, [selectedRouteId, selectedStopId, shapes, stops, fitToBounds, isFiltersPanelOpen]);

  // Scroll selected stop into view in TDV
  useEffect(() => {
    if (selectedBoardingStop) {
      const element = selectedStopRefs.current.get(selectedBoardingStop);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedBoardingStop]);

  // Scroll selected segment into view in TDV load visualization
  useEffect(() => {
    if (hoveredSegment !== null) {
      const element = selectedSegmentRefs.current.get(hoveredSegment);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [hoveredSegment]);

  // Close route dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (isRouteDropdownOpen) {
        setIsRouteDropdownOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isRouteDropdownOpen]);

  // Memoize DeckGL accessor functions to prevent unnecessary recalculations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getStopPosition = React.useCallback((d: any) => d.geometry.coordinates, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getStopBorderColor = React.useCallback((d: any): [number, number, number, number] => {
    const stopId = d.properties.stop_id;

    // When loading stops data in stops tab, show gray
    if (activeTab === 'stops' && isAllStopsLoading) {
      return [180, 180, 180, 200] as [number, number, number, number];
    }

    // When loading trip data in trip detail view, show gray (check this BEFORE route check)
    // But if showing segment coloring (load metrics), don't gray out stops - only segments should be gray
    if (selectedTrip && isTripLoading && !showSegmentColoring) {
      return [180, 180, 180, 200] as [number, number, number, number];
    }

    // When loading route data in route detail view, show gray (includes stale data check)
    // Skip stale data check when a trip is selected (trip uses its own data, not route data)
    // But if showing segment coloring (load metrics), don't gray out stops - only segments should be gray
    if (selectedRouteId && !selectedTrip && !showSegmentColoring && (isRouteLoading || isSegmentsLoading || isRouteDataStale || isSegmentDataStale)) {
      return [180, 180, 180, 200] as [number, number, number, number];
    }

    // When showing segment coloring (load metrics) or amenities view, use white border
    // For load metrics, the comparison colors go on segments, not stops
    if (showSegmentColoring || isAmenitiesView) {
      return [255, 255, 255, 255] as [number, number, number, number];
    }

    // In comparison mode, use comparison colors (percent change) for non-load metrics
    // Use trip-specific comparison map when a trip is selected
    if (comparisonMode) {
      let percentChange: number;
      let rangeToUse: { min: number; max: number };
      if (selectedTrip) {
        // When a trip is selected, only use trip-specific comparison values
        // Don't fall back to system-wide stopComparisonMap as it would compare
        // trip-specific value1 with system-wide value2, causing incorrect colors
        percentChange = tripStopComparisonMap.get(stopId) ?? 0;
        rangeToUse = tripStopComparisonRange;
      } else {
        percentChange = stopComparisonMap.get(stopId) || 0;
        // Use stopComparisonRange when in route detail view to match the scale display
        rangeToUse = (selectedRouteId || activeTab === 'stops') ? stopComparisonRange : comparisonValueRange;
      }
      const color = getComparisonColorRGB(percentChange, rangeToUse.min, rangeToUse.max);
      return [color[0], color[1], color[2], 255] as [number, number, number, number];
    }

    // Otherwise use data-driven color
    // When a trip is selected, use trip-specific values; otherwise use system-wide values
    const value = (selectedTrip && tripStopValueMap.size > 0)
      ? (tripStopValueMap.get(stopId) || 0)
      : (stopValueMap.get(stopId) || 0);
    const color = valueToColor(value, stopValueRange.min, stopValueRange.max);
    const alpha = 200;
    return [...color, alpha] as [number, number, number, number];
  }, [stopValueMap, tripStopValueMap, selectedTrip, stopValueRange, showSegmentColoring, isAmenitiesView, comparisonMode, stopComparisonMap, tripStopComparisonMap, comparisonValueRange, stopComparisonRange, tripStopComparisonRange, activeTab, isAllStopsLoading, selectedRouteId, isRouteLoading, isSegmentsLoading, isTripLoading, isRouteDataStale, isSegmentDataStale]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  const getStopCenterColor = React.useCallback((_d: any): [number, number, number, number] => {
    // When showing segment coloring (load metrics) or amenities view, use black center
    if (showSegmentColoring || isAmenitiesView) {
      return [0, 0, 0, 255] as [number, number, number, number];
    }

    // Otherwise use white center
    const alpha = 255;
    return [255, 255, 255, alpha] as [number, number, number, number];
  }, [showSegmentColoring, isAmenitiesView]);

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
          // Use comparison colors when in comparison mode
          // Use trip-specific segment comparison map when a trip is selected
          let segColor: [number, number, number];
          if (comparisonMode) {
            const segmentKey = `${hoveredSeg.fromStopId}-${hoveredSeg.toStopId}`;
            const percentChange = (selectedTrip && tripSegmentComparisonMap.size > 0)
              ? (tripSegmentComparisonMap.get(segmentKey) || 0)
              : (segmentComparisonMap.get(segmentKey) || 0);
            const compRange = (selectedTrip && tripSegmentComparisonMap.size > 0)
              ? tripSegmentComparisonRange
              : segmentComparisonRange;
            const compColor = getComparisonColorRGB(percentChange, compRange.min, compRange.max);
            segColor = [compColor[0], compColor[1], compColor[2]];
          } else {
            segColor = valueToColor(hoveredSeg.loadValue, segmentValueRange.min, segmentValueRange.max);
          }

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
      // Determine if segments are still loading
      // When a trip is selected, only check trip loading (not route stale data)
      // When no trip selected, check route loading and stale data
      // Also check if data actually exists - if tripData has segments, we're not loading
      // In comparison mode with a trip selected, we need BOTH tripData and tripData2 segments
      // Check if grid data is loading (needed for segment coloring)
      const isGridSegmentDataLoading = isGridDataLoading || isGridDataStale || !routeGridData?.data;
      // In comparison mode, also check if comparison grid data is loading
      const isGridSegment2DataLoading = comparisonMode && (isGridData2Loading || isGridData2Stale || !routeGridData2?.data);

      const isSegmentDataLoading = selectedTrip
        ? (comparisonMode
            ? (isTripLoading || isTripData2Loading)
            : isTripLoading)
        : (isRouteLoading || isRouteDataStale || isGridSegmentDataLoading || isGridSegment2DataLoading);

      layers.push(
        new PathLayer({
          id: `route-segments-${isSegmentDataLoading ? 'loading' : 'loaded'}`,
          data: segmentsWithIndex,
          getPath: (d) => d.path,
          getWidth: 15,
          getColor: (d) => {
            // Show gray when loading segment data
            if (isSegmentDataLoading) {
              return [180, 180, 180, 200] as [number, number, number, number];
            }
            // Use comparison colors when in comparison mode
            if (comparisonMode) {
              const segmentKey = `${d.fromStopId}-${d.toStopId}`;
              // Use trip-specific comparison data when a trip is selected
              const percentChange = (selectedTrip && tripSegmentComparisonMap.size > 0)
                ? (tripSegmentComparisonMap.get(segmentKey) || 0)
                : (segmentComparisonMap.get(segmentKey) || 0);
              const compRange = (selectedTrip && tripSegmentComparisonMap.size > 0)
                ? tripSegmentComparisonRange
                : segmentComparisonRange;
              const compColor = getComparisonColorRGB(percentChange, compRange.min, compRange.max);
              const alpha = hoveredSegment !== null && d.index !== hoveredSegment ? 102 : 255;
              return [compColor[0], compColor[1], compColor[2], alpha];
            }
            const color = valueToColor(d.loadValue, segmentValueRange.min, segmentValueRange.max);
            // Reduce opacity of non-hovered segments when hovering
            const alpha = hoveredSegment !== null && d.index !== hoveredSegment ? 102 : 255; // 40% opacity = 102/255
            return [...color, alpha];
          },
          updateTriggers: {
            getColor: [segmentValueRange, hoveredSegment, comparisonMode, segmentComparisonMap, segmentComparisonRange, isRouteLoading, isTripLoading, isTripData2Loading, selectedTrip, isRouteDataStale, tripData, tripData2, tripSegmentComparisonMap, tripSegmentComparisonRange, isGridDataLoading, isGridDataStale, isGridData2Loading, isGridData2Stale, routeGridData, routeGridData2]
          },
          widthMinPixels: 5,
          widthMaxPixels: 25,
          pickable: !isSegmentDataLoading, // Disable hover while loading
          onHover: ({ object, x, y }) => {
            setHoveredSegment(object ? object.index : null);
            setHoveredSegmentCoords(object ? { x, y } : null);
            // Clear stop hover when hovering a segment
            if (object) {
              setHoveredStop(null);
              setHoveredStopCoords(null);
            }
          },
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
            // Show grey when loading ridership data
            if (isRidershipLoading) {
              return [186, 177, 169, 180]; // #BAB1A9 at medium opacity
            }
            // If a route is selected (detail view), use hardcoded light gray
            if (selectedRouteId) {
              return [186, 177, 169, 255]; // #BAB1A9 at full opacity
            }
            // In comparison mode, use comparison colors (percent change)
            if (comparisonMode) {
              const percentChange = routeComparisonMap.get(d.properties.route_id) || 0;
              const color = getComparisonColorRGB(percentChange, comparisonValueRange.min, comparisonValueRange.max);
              const opacity = hoveredRoute ? (d.properties.route_id === hoveredRoute ? 255 : 120) : 255;
              return [color[0], color[1], color[2], opacity];
            }
            // Otherwise use data-driven color from value
            const value = routeValueMap.get(d.properties.route_id) || 0;
            const color = valueToColor(value, routeValueRange.min, routeValueRange.max);
            const opacity = hoveredRoute ? (d.properties.route_id === hoveredRoute ? 200 : 80) : 200;
            return [...color, opacity];
          },
          updateTriggers: {
            getColor: [hoveredRoute, selectedRouteId, routeValueMap, routeValueRange, comparisonMode, routeComparisonMap, comparisonValueRange, isRidershipLoading]
          },
          widthMinPixels: 4.5,
          widthMaxPixels: 18,
          pickable: !selectedRouteId && !isRidershipLoading, // Disable hover in route detail view or while loading
        })
      );
    }

    // Hovered route layer (glowing effect) - only in system/routes view, NOT in segment coloring mode
    if (hoveredRoute && !showSegmentColoring) {
      const hoveredPaths = pathGeoms.filter(p => p.properties.route_id === hoveredRoute);
      if (hoveredPaths.length) {
        // Use comparison colors when in comparison mode
        let routeColor: [number, number, number];
        if (comparisonMode) {
          const percentChange = routeComparisonMap.get(hoveredRoute) || 0;
          const compColor = getComparisonColorRGB(percentChange, comparisonValueRange.min, comparisonValueRange.max);
          routeColor = [compColor[0], compColor[1], compColor[2]];
        } else {
          const value = routeValueMap.get(hoveredRoute) || 0;
          routeColor = valueToColor(value, routeValueRange.min, routeValueRange.max);
        }

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
      // Show grey when loading ridership data; otherwise use comparison or normal colors
      let color: [number, number, number];
      if (isRidershipLoading) {
        color = [186, 177, 169]; // Grey (#BAB1A9) to match loading route color
      } else if (comparisonMode) {
        const percentChange = routeComparisonMap.get(shape.properties.route_id) || 0;
        const compColor = getComparisonColorRGB(percentChange, comparisonValueRange.min, comparisonValueRange.max);
        color = [compColor[0], compColor[1], compColor[2]];
      } else {
        const value = routeValueMap.get(shape.properties.route_id) || 0;
        color = valueToColor(value, routeValueRange.min, routeValueRange.max);
      }

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
        // Use comparison colors when in comparison mode
        let selectedStopColor: [number, number, number];
        if (comparisonMode) {
          const percentChange = stopComparisonMap.get(selectedStopId) || 0;
          const compColor = getComparisonColorRGB(percentChange, comparisonValueRange.min, comparisonValueRange.max);
          selectedStopColor = [compColor[0], compColor[1], compColor[2]];
        } else {
          const value = stopValueMap.get(selectedStopId) || 0;
          selectedStopColor = valueToColor(value, stopValueRange.min, stopValueRange.max);
        }

        // Halo layer (12px larger than the stop, 50% opacity - or black 40% in amenities view)
        const haloColor = isAmenitiesView
          ? [0, 0, 0, 102] as [number, number, number, number]  // Black at 40% opacity
          : [...selectedStopColor, 128] as [number, number, number, number];  // 50% opacity

        layers.push(
          new ScatterplotLayer({
            id: 'selected-stop-halo',
            data: selectedStopData,
            getPosition: getStopPosition,
            getRadius: 24, // 12px (base) + 12px = 24px
            getFillColor: haloColor,
            radiusMinPixels: 18, // 6px (base min) + 12px = 18px
            radiusMaxPixels: 36, // 24px (base max) + 12px = 36px
          })
        );
      }
    }

    // Hovered stop halo (same style as selected stop, render before base layers)
    // Don't show halo for map hover when in segment coloring mode, but always show for selected boarding stop
    const stopToHalo = hoveredStop || selectedBoardingStop;
    // Show halo if: we have a stop to halo, it's not already selected, AND either:
    // - we're not in segment coloring mode (allow hover halo), OR
    // - the stop is the selectedBoardingStop (always show halo for explicitly clicked stops)
    if (stopToHalo && stopToHalo !== selectedStopId && (!showSegmentColoring || selectedBoardingStop === stopToHalo)) {
      // Use String() to ensure type-safe comparison between GeoJSON stop_id and selectedBoardingStop
      const hoveredStopData = filteredStops.filter(stop => String(stop.properties.stop_id) === String(stopToHalo));
      if (hoveredStopData.length > 0) {
        // Use comparison colors when in comparison mode
        // Use trip-specific comparison map when a trip is selected
        let hoveredStopColor: [number, number, number];
        if (comparisonMode) {
          const percentChange = (selectedTrip && tripStopComparisonMap.size > 0)
            ? (tripStopComparisonMap.get(stopToHalo) || 0)
            : (stopComparisonMap.get(stopToHalo) || 0);
          const compColor = getComparisonColorRGB(percentChange, comparisonValueRange.min, comparisonValueRange.max);
          hoveredStopColor = [compColor[0], compColor[1], compColor[2]];
        } else {
          const value = stopValueMap.get(stopToHalo) || 0;
          hoveredStopColor = valueToColor(value, stopValueRange.min, stopValueRange.max);
        }

        // Halo layer (12px larger than the stop, 50% opacity - or black 40% in amenities view)
        const hoveredHaloColor = isAmenitiesView
          ? [0, 0, 0, 102] as [number, number, number, number]  // Black at 40% opacity
          : [...hoveredStopColor, 128] as [number, number, number, number];  // 50% opacity

        layers.push(
          new ScatterplotLayer({
            id: 'hovered-stop-halo',
            data: hoveredStopData,
            getPosition: getStopPosition,
            getRadius: 24, // 12px (base) + 12px = 24px
            getFillColor: hoveredHaloColor,
            radiusMinPixels: 18, // 6px (base min) + 12px = 18px
            radiusMaxPixels: 36, // 24px (base max) + 12px = 36px
            updateTriggers: {
              getFillColor: [stopToHalo, comparisonMode, comparisonValueRange.min, comparisonValueRange.max]
            }
          })
        );
      }
    }

    // Base stops layers
    // Use simplified black/white styling for segment coloring mode OR amenities view
    const useSimplifiedStops = showSegmentColoring || isAmenitiesView;

    layers.push(
        // Colored border layer (outer ring)
        new ScatterplotLayer({
          id: 'stops-border',
          data: filteredStops,
          getPosition: getStopPosition,
          getRadius: useSimplifiedStops ? 10 : 12, // Smaller in simplified mode (4px border + 6px), normal size otherwise
          getFillColor: getStopBorderColor,
          radiusMinPixels: useSimplifiedStops ? 5 : 6,
          radiusMaxPixels: useSimplifiedStops ? 20 : 24,
          pickable: true, // Always pickable for hover tooltips
          visible: showSegmentColoring ? viewState.zoom >= 12 : true, // Hide stops when zoomed out in load visualization
          onHover: ({ object, x, y }) => {
            setHoveredStop(object ? (object as StopFeature).properties.stop_id : null);
            setHoveredStopCoords(object ? { x, y } : null);
            // Clear segment hover when hovering a stop
            if (object) {
              setHoveredSegment(null);
              setHoveredSegmentCoords(null);
            }
          },
          onClick: ({ object }) => {
            if (object) {
              const stopId = (object as StopFeature).properties.stop_id;
              setHoveredStop(null); // Clear hover immediately
              // Use navigation stack for drill-down in routes, system, or stops tab
              if (activeTab === 'routes' || activeTab === 'system' || activeTab === 'stops') {
                if (selectedRouteId) {
                  // Coming from RDV - push route context
                  setNavigationStack(prev => [...prev, { type: 'route', routeId: selectedRouteId, routeTab: selectedRouteTab }]);
                  setSelectedRouteId(null);
                  setSelectedStopTab('Summary');
                } else if (selectedStopId) {
                  // Coming from SDV - push stop context, preserve current tab
                  setNavigationStack(prev => [...prev, { type: 'stop', stopId: selectedStopId, stopTab: selectedStopTab }]);
                  // Don't reset selectedStopTab - preserve Amenities if that's where we are
                } else {
                  // Coming from root level - reset to Summary
                  setSelectedStopTab('Summary');
                }
              } else {
                // Coming from components tab
                setActiveTab('stops');
                setSelectedStopTab('Summary');
              }
              setSelectedStopId(stopId);
              // Zoom to the stop
              const stopFeature = stops.find(s => s.properties.stop_id === stopId);
              if (stopFeature && stopFeature.geometry.coordinates) {
                const [lng, lat] = stopFeature.geometry.coordinates;
                setViewState({
                  longitude: lng,
                  latitude: lat,
                  zoom: 16,
                  pitch: 0,
                  bearing: 0,
                  transitionDuration: 500
                });
              }
            }
          },
          updateTriggers: {
            getFillColor: [selectedStopId, showSegmentColoring, isAmenitiesView, comparisonMode, stopComparisonMap, tripStopComparisonMap, comparisonValueRange, selectedTrip, tripStopValueMap, activeTab, isAllStopsLoading, selectedRouteId, isRouteLoading, isSegmentsLoading, isTripLoading, isRouteDataStale, isSegmentDataStale], // Force recalculation when selection, coloring mode, amenities view, comparison mode, trip, or loading state changes
            getRadius: [showSegmentColoring, isAmenitiesView] // Update radius when mode changes
          }
        }),
        // Black/white center layer (inner circle)
        new ScatterplotLayer({
          id: 'stops-center',
          data: filteredStops,
          getPosition: getStopPosition,
          getRadius: useSimplifiedStops ? 8 : 4, // Larger in simplified mode (8px black), smaller otherwise (4px white)
          getFillColor: getStopCenterColor,
          radiusMinPixels: useSimplifiedStops ? 3 : 2,
          radiusMaxPixels: useSimplifiedStops ? 16 : 8,
          pickable: true, // Always pickable for hover tooltips
          visible: showSegmentColoring ? viewState.zoom >= 12 : true, // Hide stops when zoomed out in load visualization
          onHover: ({ object, x, y }) => {
            setHoveredStop(object ? (object as StopFeature).properties.stop_id : null);
            setHoveredStopCoords(object ? { x, y } : null);
            // Clear segment hover when hovering a stop
            if (object) {
              setHoveredSegment(null);
              setHoveredSegmentCoords(null);
            }
          },
          onClick: ({ object }) => {
            if (object) {
              const stopId = (object as StopFeature).properties.stop_id;
              setHoveredStop(null); // Clear hover immediately
              // Use navigation stack for drill-down in routes, system, or stops tab
              if (activeTab === 'routes' || activeTab === 'system' || activeTab === 'stops') {
                if (selectedRouteId) {
                  // Coming from RDV - push route context
                  setNavigationStack(prev => [...prev, { type: 'route', routeId: selectedRouteId, routeTab: selectedRouteTab }]);
                  setSelectedRouteId(null);
                  setSelectedStopTab('Summary');
                } else if (selectedStopId) {
                  // Coming from SDV - push stop context, preserve current tab
                  setNavigationStack(prev => [...prev, { type: 'stop', stopId: selectedStopId, stopTab: selectedStopTab }]);
                  // Don't reset selectedStopTab - preserve Amenities if that's where we are
                } else {
                  // Coming from root level - reset to Summary
                  setSelectedStopTab('Summary');
                }
              } else {
                // Coming from components tab
                setActiveTab('stops');
                setSelectedStopTab('Summary');
              }
              setSelectedStopId(stopId);
              // Zoom to the stop
              const stopFeature = stops.find(s => s.properties.stop_id === stopId);
              if (stopFeature && stopFeature.geometry.coordinates) {
                const [lng, lat] = stopFeature.geometry.coordinates;
                setViewState({
                  longitude: lng,
                  latitude: lat,
                  zoom: 16,
                  pitch: 0,
                  bearing: 0,
                  transitionDuration: 500
                });
              }
            }
          },
          updateTriggers: {
            getFillColor: [selectedStopId, showSegmentColoring, isAmenitiesView], // Force recalculation when selection, coloring mode, or amenities view changes
            getRadius: [showSegmentColoring, isAmenitiesView] // Update radius when mode changes
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
        width: isStoryPanelVisible
          ? (aiMode ? '492px' : '504px')
          : isFullWidthPanel ? 'calc(100% - 24px)' : ((isFiltersPanelOpen && !isInsightsView) ? (aiMode ? '692px' : '704px') : (aiMode ? '436px' : '448px')),
        boxShadow: 'var(--shadow-lg)',
        borderRadius: '28px',
        pointerEvents: 'none',
        zIndex: (isFullWidthPanel || isStoryPanelVisible) ? 1999 : 999,
        transition: `width 350ms ease-in-out, opacity 150ms ease`,
        opacity: isStoryPanelVisible ? 0 : 1,
      }} />

      {/* Nav Rail */}
      <div style={{
        width: aiMode ? '60px' : '72px',
        height: 'calc(100% - 24px)',
        position: 'fixed',
        left: '12px',
        top: '12px',
        zIndex: 1000
      }}>
        <NavRail
          activeTab={activeTab}
          onTabChange={(tab) => {
            // Only allow home tab when AI mode is on
            if (tab === 'home' && !aiMode) return;
            if (tab === activeTab || isTabTransitioning) return;

            const applyTab = (t: string) => {
              setActiveTab(t as typeof activeTab);
              if (t === 'home' && aiMode) {
                // No auto-close — only user action closes filters
              } else {
                // First time leaving Home: auto-open filters (unless user explicitly closed them)
                if (!hasLeftHomeRef.current && !hasUserClosedFiltersRef.current) {
                  setIsFiltersPanelOpen(true);
                  hasLeftHomeRef.current = true;
                }
                setSelectedRouteId(null);
                setSelectedStopId(null);
                setSelectedTrip(null);
                setSelectedTripStops([]);
                setSelectedStopTab('Summary');
                setSelectedRouteTab('Summary');
                setNavigationStack([]);
              }
            };

            // Only use phased transition when switching to/from Home (panel resizes)
            const isHomeTransition = activeTab === 'home' || tab === 'home';
            if (isHomeTransition && aiMode) {
              const goingHome = tab === 'home';
              const animDuration = 350;

              pendingTabRef.current = tab;
              setTransitionToHome(goingHome);
              setIsTabTransitioning(true);
              setIsTabContentHidden(true); // fade out content

              setTimeout(() => {
                applyTab(tab);

                setTimeout(() => {
                  setIsTabTransitioning(false);
                  setTransitionToHome(false);
                  setIsTabContentHidden(false);
                  pendingTabRef.current = null;
                }, animDuration);
              }, 150);
            } else {
              applyTab(tab);
            }
          }}
          userInitial="S"
          isFiltersPanelOpen={isFiltersPanelOpen}
          onToggleFiltersPanel={() => {
            if (!(aiMode && activeTab === 'home')) {
              const newState = !isFiltersPanelOpen;
              if (!newState) hasUserClosedFiltersRef.current = true;
              setIsFiltersPanelOpen(newState);
            }
          }}
          routeControlsTitleSemibold={routeControlsTitleSemibold}
          onRouteControlsTitleSemiboldChange={setRouteControlsTitleSemibold}
          differentiatedPanelBackgrounds={differentiatedPanelBackgrounds}
          onDifferentiatedPanelBackgroundsChange={setDifferentiatedPanelBackgrounds}
          aiMode={aiMode}
          onAiModeChange={(value) => {
            setAiMode(value);
            if (value) {
              // Switching to AI mode: go to home tab
              setActiveTab('home');
            } else {
              // Switching off AI mode: go to system tab, open filters
              if (activeTab === 'home') setActiveTab('system');
              setIsFiltersPanelOpen(true);
            }
          }}
          onOpenBookmarks={() => setIsBookmarksModalOpen(true)}
          showBookmarkSavedToast={showBookmarkSavedToast}
        />
      </div>

      {/* Left Panel - Filter Section */}
      <div
        id="filters-panel"
        style={{
          width: (isFiltersPanelOpen && !isInsightsView && !isStoryPanelVisible) ? '256px' : '0px',
          height: 'calc(100% - 24px)',
          backgroundColor: differentiatedPanelBackgrounds ? 'var(--bg-secondary)' : 'var(--bg-primary)',
          borderTop: '0.5px solid var(--border-default)',
          borderBottom: '0.5px solid var(--border-default)',
          borderRight: (isFiltersPanelOpen && !isInsightsView && !isTabContentHidden && !isTabTransitioning) ? '0.5px solid var(--border-default)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          left: aiMode ? '72px' : '84px',
          top: '12px',
          zIndex: 1000,
          overflow: 'hidden',
          transition: `width ${'350ms'} ease-in-out`,
          borderRadius: '0',
        }}>
        {/* Filter Section */}
        <div style={{
          padding: '20px 16px 24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          width: '256px',
          minWidth: '256px',
          height: '100%',
          overflow: 'auto',
          opacity: isTabContentHidden ? 0 : 1,
          transition: 'opacity 150ms ease',
        }}>
          {/* Filters heading */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="data-small" style={{ color: 'var(--text-secondary)' }}>Filters</div>
            <button
              type="button"
              onClick={() => { hasUserClosedFiltersRef.current = true; setIsFiltersPanelOpen(false); }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor">
                <path d="M660-368v-224q0-14-12-19t-22 5l-98 98q-12 12-12 28t12 28l98 98q10 10 22 5t12-19ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm120-80v-560H200v560h120Zm80 0h360v-560H400v560Zm-80 0H200h120Z"/>
              </svg>
            </button>
          </div>

          {/* Date-time Section */}
          <div>
            {!comparisonMode ? (
              <>
                {/* Normal Mode */}

                {/* Date Range Filter */}
                <div ref={dateRef} style={{ marginBottom: '8px', position: 'relative' }}>
                  <div
                    onClick={() => setOpenFilter(openFilter === 'date' ? null : 'date')}
                    onMouseEnter={handleDateFilterMouseEnter}
                    onMouseLeave={handleDateFilterMouseLeave}
                    className="button-small h-10 px-4 flex items-center justify-between cursor-pointer transition-colors rounded-full border"
                    style={{
                      borderWidth: 'var(--border-width)',
                      backgroundColor: openFilter === 'date' ? 'var(--bg-elevated)' : (isDateHovered ? 'var(--bg-elevated)' : (differentiatedPanelBackgrounds ? 'var(--bg-secondary)' : 'var(--bg-primary)')),
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
                      backgroundColor: openFilter === 'days' ? 'var(--bg-elevated)' : (isDaysHovered ? 'var(--bg-elevated)' : (differentiatedPanelBackgrounds ? 'var(--bg-secondary)' : 'var(--bg-primary)')),
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
                  {showDaysTooltip && openFilter !== 'days' && (
                    <Tooltip text={getDaysFilterText()} containerRef={daysRef as React.RefObject<HTMLElement>}>
                      {null}
                    </Tooltip>
                  )}
                </div>

                {/* Compare Button - Opens date picker directly */}
                <div
                  ref={compareRef}
                  style={{ alignSelf: 'flex-start', marginTop: '8px', position: 'relative' }}
                >
                  <div
                    style={{
                      position: 'relative',
                      display: 'inline-flex',
                    }}
                    onMouseEnter={() => { if (openFilter !== 'date2') setIsCompareHovered(true); }}
                    onMouseLeave={() => setIsCompareHovered(false)}
                  >
                    {/* Layer 1: Sharp inner ring */}
                    <div style={{
                      position: 'absolute',
                      inset: '-2px',
                      borderRadius: '9999px',
                      overflow: 'hidden',
                      opacity: isCompareHovered ? 1 : 0,
                      transition: 'opacity 0.3s ease',
                      pointerEvents: 'none',
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: '200px',
                        height: '200px',
                        marginTop: '-100px',
                        marginLeft: '-100px',
                        background: 'conic-gradient(#EC503A 0deg, #EC503A 30deg, #F06848 40deg, #F06848 65deg, #F48060 75deg, #F48060 100deg, #F0C030 110deg, #F0C030 140deg, #60E0B0 150deg, #60E0B0 180deg, #45C898 190deg, #45C898 220deg, #35B088 230deg, #35B088 260deg, #F0C030 270deg, #F0C030 310deg, #EC503A 330deg, #EC503A 360deg)',
                        animation: 'compare-border-spin 7s linear infinite',
                      }} />
                    </div>
                    {/* Layer 2: Blurred outer glow — identical gradient for alignment */}
                    <div style={{
                      position: 'absolute',
                      inset: '-8px',
                      borderRadius: '9999px',
                      opacity: isCompareHovered ? 0.35 : 0,
                      transition: 'opacity 0.3s ease',
                      pointerEvents: 'none',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: '200px',
                        height: '200px',
                        marginTop: '-100px',
                        marginLeft: '-100px',
                        background: 'conic-gradient(#EC503A 0deg, #EC503A 30deg, #F06848 40deg, #F06848 65deg, #F48060 75deg, #F48060 100deg, #F0C030 110deg, #F0C030 140deg, #60E0B0 150deg, #60E0B0 180deg, #45C898 190deg, #45C898 220deg, #35B088 230deg, #35B088 260deg, #F0C030 270deg, #F0C030 310deg, #EC503A 330deg, #EC503A 360deg)',
                        animation: 'compare-border-spin 7s linear infinite',
                        filter: 'blur(6px)',
                      }} />
                    </div>
                    <button
                      className="rounded-full transition-colors duration-200 cursor-pointer bg-bg-elevated text-text-primary hover:bg-bg-primary button-small h-7 px-4"
                      onClick={() => {
                        setIsCompareHovered(false);
                        setDate2PickerMode('shortcuts');
                        setCalendarStartMonth2(new Date(DATA_START_DATE.getFullYear(), DATA_START_DATE.getMonth()));
                        setStagedStartDate2(null);
                        setStagedEndDate2(null);
                        setStagedSeason2(null);
                        setStagedQuickPick2(null);
                        setOpenFilter('date2');
                      }}
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        backgroundColor: isCompareHovered ? 'var(--bg-elevated)' : 'var(--bg-primary)',
                        border: isCompareHovered ? '0.5px solid transparent' : '0.5px solid var(--border-default)',
                        boxShadow: isCompareHovered ? '0 2px 8px rgba(0, 0, 0, 0.12)' : 'none',
                        transition: 'box-shadow 0.3s ease',
                      }}
                    >
                      Compare
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Comparison Mode - Dual Date-time Display */}

                {/* Date-time 1 (Primary Range) - colors stay fixed, dates swap when comparisonSwapped */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: DATETIME_1_COLOR,
                        flexShrink: 0
                      }} />
                      <label className="label text-text-tertiary">Date-time 1</label>
                    </div>
                    {/* Swap Date Ranges Button */}
                    <div style={{ position: 'relative' }}>
                      <button
                        ref={swapButtonRef}
                        onClick={swapDateRanges}
                        onMouseEnter={() => {
                          swapTooltipTimerRef.current = setTimeout(() => {
                            setShowSwapTooltip(true);
                          }, 500);
                        }}
                        onMouseLeave={() => {
                          if (swapTooltipTimerRef.current) {
                            clearTimeout(swapTooltipTimerRef.current);
                            swapTooltipTimerRef.current = null;
                          }
                          setShowSwapTooltip(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-tertiary)',
                          padding: '4px'
                        }}
                      >
                        {/* Same sort icon as stops tab list, rotated 90deg for horizontal swap */}
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: 'rotate(90deg)' }}>
                          <path d="M5.81667 8.76675C5.57222 8.76675 5.36389 8.68064 5.19167 8.50842C5.01944 8.33619 4.93333 8.12786 4.93333 7.88342V4.20008L4.01667 5.11675C3.85 5.28341 3.64444 5.36675 3.4 5.36675C3.15556 5.36675 2.94444 5.28341 2.76667 5.11675C2.58889 4.93897 2.5 4.73064 2.5 4.49175C2.5 4.25286 2.58889 4.04453 2.76667 3.86675L5.18333 1.43341C5.27222 1.34453 5.36944 1.27786 5.475 1.23341C5.58056 1.18897 5.69444 1.16675 5.81667 1.16675C5.93889 1.16675 6.05278 1.18897 6.15833 1.23341C6.26389 1.27786 6.36111 1.34453 6.45 1.43341L8.86667 3.86675C9.04444 4.04453 9.13056 4.25286 9.125 4.49175C9.11944 4.73064 9.02778 4.93897 8.85 5.11675C8.67222 5.28341 8.46667 5.36953 8.23333 5.37508C8 5.38064 7.79444 5.29453 7.61667 5.11675L6.7 4.20008V7.88342C6.7 8.12786 6.61389 8.33619 6.44167 8.50842C6.26944 8.68064 6.06111 8.76675 5.81667 8.76675ZM10.1833 14.8334C10.0611 14.8334 9.94722 14.8112 9.84167 14.7667C9.73611 14.7223 9.63889 14.6556 9.55 14.5667L7.13333 12.1334C6.95556 11.9556 6.86944 11.7473 6.875 11.5084C6.88056 11.2695 6.97222 11.0612 7.15 10.8834C7.32778 10.7167 7.53333 10.6306 7.76667 10.6251C8 10.6195 8.20556 10.7056 8.38333 10.8834L9.3 11.8001V8.11675C9.3 7.8723 9.38611 7.66397 9.55833 7.49175C9.73056 7.31953 9.93889 7.23342 10.1833 7.23342C10.4278 7.23342 10.6361 7.31953 10.8083 7.49175C10.9806 7.66397 11.0667 7.8723 11.0667 8.11675V11.8001L11.9833 10.8834C12.15 10.7167 12.3556 10.6334 12.6 10.6334C12.8444 10.6334 13.0556 10.7167 13.2333 10.8834C13.4111 11.0612 13.5 11.2695 13.5 11.5084C13.5 11.7473 13.4111 11.9556 13.2333 12.1334L10.8167 14.5667C10.7278 14.6556 10.6306 14.7223 10.525 14.7667C10.4194 14.8112 10.3056 14.8334 10.1833 14.8334Z" fill="currentColor"/>
                        </svg>
                      </button>
                      {showSwapTooltip && (
                        <Tooltip text="Swap date-time ranges" position="below" containerRef={swapButtonRef as React.RefObject<HTMLElement>}>
                          {null}
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Date Range Filter for Date-time 1 */}
                  <div ref={dateRef} style={{ marginBottom: '8px', position: 'relative' }}>
                    <div
                      onClick={() => setOpenFilter(openFilter === 'date' ? null : 'date')}
                      onMouseEnter={handleDateFilterMouseEnter}
                      onMouseLeave={handleDateFilterMouseLeave}
                      className="button-small h-10 px-4 flex items-center justify-between cursor-pointer transition-colors rounded-full border"
                      style={{
                        borderWidth: 'var(--border-width)',
                        backgroundColor: openFilter === 'date' ? 'var(--bg-elevated)' : (isDateHovered ? 'var(--bg-elevated)' : (differentiatedPanelBackgrounds ? 'var(--bg-secondary)' : 'var(--bg-primary)')),
                        borderColor: openFilter === 'date' ? 'var(--border-focus)' : 'var(--border-default)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <span
                        ref={dateTextRef}
                        className="flex-grow overflow-hidden text-ellipsis whitespace-nowrap mr-2"
                      >
                        {comparisonSwapped ? getDate2FilterText() : getDateFilterText()}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                        <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
                      </svg>
                    </div>
                    {showDateTooltip && (
                      <Tooltip text={comparisonSwapped ? getDate2FilterText() : getDateFilterText()} containerRef={dateRef as React.RefObject<HTMLElement>}>
                        {null}
                      </Tooltip>
                    )}
                  </div>

                  {/* Days/Time Filter for Date-time 1 */}
                  <div ref={daysRef} style={{ position: 'relative' }}>
                    <div
                      onClick={() => setOpenFilter(openFilter === 'days' ? null : 'days')}
                      onMouseEnter={handleDaysFilterMouseEnter}
                      onMouseLeave={handleDaysFilterMouseLeave}
                      className="button-small h-10 px-4 flex items-center justify-between cursor-pointer transition-colors rounded-full border"
                      style={{
                        borderWidth: 'var(--border-width)',
                        backgroundColor: openFilter === 'days' ? 'var(--bg-elevated)' : (isDaysHovered ? 'var(--bg-elevated)' : (differentiatedPanelBackgrounds ? 'var(--bg-secondary)' : 'var(--bg-primary)')),
                        borderColor: openFilter === 'days' ? 'var(--border-focus)' : 'var(--border-default)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <span
                        ref={daysTextRef}
                        className="flex-grow overflow-hidden text-ellipsis whitespace-nowrap mr-2"
                      >
                        {comparisonSwapped ? getDays2FilterText() : getDaysFilterText()}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                        <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
                      </svg>
                    </div>
                    {showDaysTooltip && openFilter !== 'days' && (
                      <Tooltip text={comparisonSwapped ? getDays2FilterText() : getDaysFilterText()} containerRef={daysRef as React.RefObject<HTMLElement>}>
                        {null}
                      </Tooltip>
                    )}
                  </div>
                </div>

                {/* Date-time 2 (Comparison Range) - colors stay fixed, dates swap when comparisonSwapped */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: DATETIME_2_COLOR,
                        flexShrink: 0
                      }} />
                      <label className="label text-text-tertiary">Date-time 2</label>
                    </div>
                    {/* Exit Comparison Mode Button */}
                    <div style={{ position: 'relative' }}>
                      <button
                        ref={exitButtonRef}
                        onClick={exitComparisonMode}
                        onMouseEnter={() => {
                          exitTooltipTimerRef.current = setTimeout(() => {
                            setShowExitTooltip(true);
                          }, 500);
                        }}
                        onMouseLeave={() => {
                          if (exitTooltipTimerRef.current) {
                            clearTimeout(exitTooltipTimerRef.current);
                            exitTooltipTimerRef.current = null;
                          }
                          setShowExitTooltip(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-tertiary)',
                          padding: '4px'
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      {showExitTooltip && (
                        <Tooltip text="Exit comparison mode" containerRef={exitButtonRef as React.RefObject<HTMLElement>}>
                          {null}
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Date Range Filter for Date-time 2 */}
                  <div ref={date2Ref} style={{ marginBottom: '8px', position: 'relative' }}>
                    <div
                      onClick={() => setOpenFilter(openFilter === 'date2' ? null : 'date2')}
                      onMouseEnter={handleDate2FilterMouseEnter}
                      onMouseLeave={handleDate2FilterMouseLeave}
                      className="button-small h-10 px-4 flex items-center justify-between cursor-pointer transition-colors rounded-full border"
                      style={{
                        borderWidth: 'var(--border-width)',
                        backgroundColor: openFilter === 'date2' ? 'var(--bg-elevated)' : (isDate2Hovered ? 'var(--bg-elevated)' : (differentiatedPanelBackgrounds ? 'var(--bg-secondary)' : 'var(--bg-primary)')),
                        borderColor: openFilter === 'date2' ? 'var(--border-focus)' : 'var(--border-default)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <span
                        ref={date2TextRef}
                        className="flex-grow overflow-hidden text-ellipsis whitespace-nowrap mr-2"
                      >
                        {comparisonSwapped ? getDateFilterText() : getDate2FilterText()}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                        <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
                      </svg>
                    </div>
                    {showDate2Tooltip && (
                      <Tooltip text={comparisonSwapped ? getDateFilterText() : getDate2FilterText()} containerRef={date2Ref as React.RefObject<HTMLElement>}>
                        {null}
                      </Tooltip>
                    )}
                  </div>

                  {/* Days/Time Filter for Date-time 2 */}
                  <div ref={days2Ref} style={{ position: 'relative' }}>
                    <div
                      onClick={() => setOpenFilter(openFilter === 'days2' ? null : 'days2')}
                      onMouseEnter={handleDays2FilterMouseEnter}
                      onMouseLeave={handleDays2FilterMouseLeave}
                      className="button-small h-10 px-4 flex items-center justify-between cursor-pointer transition-colors rounded-full border"
                      style={{
                        borderWidth: 'var(--border-width)',
                        backgroundColor: openFilter === 'days2' ? 'var(--bg-elevated)' : (isDays2Hovered ? 'var(--bg-elevated)' : (differentiatedPanelBackgrounds ? 'var(--bg-secondary)' : 'var(--bg-primary)')),
                        borderColor: openFilter === 'days2' ? 'var(--border-focus)' : 'var(--border-default)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <span
                        ref={days2TextRef}
                        className="flex-grow overflow-hidden text-ellipsis whitespace-nowrap mr-2"
                      >
                        {comparisonSwapped ? getDaysFilterText() : getDays2FilterText()}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                        <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
                      </svg>
                    </div>
                    {showDays2Tooltip && openFilter !== 'days2' && (
                      <Tooltip text={comparisonSwapped ? getDaysFilterText() : getDays2FilterText()} containerRef={days2Ref as React.RefObject<HTMLElement>}>
                        {null}
                      </Tooltip>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Metric Section */}
          <div>
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
                { value: 'divider-1', label: '', isDivider: true },
                { value: 'Average daily alightings', label: 'Average daily alightings' },
                { value: 'Total alightings', label: 'Total alightings' },
                { value: 'divider-2', label: '', isDivider: true },
                { value: 'Average daily activity', label: 'Average daily activity' },
                { value: 'Total activity', label: 'Total activity' },
                { value: 'divider-3', label: '', isDivider: true },
                { value: 'Average load', label: 'Average load', disabled: isStopLevelView },
                { value: 'Maxload', label: 'Maxload', disabled: isStopLevelView }
              ]}
              background={differentiatedPanelBackgrounds ? 'var(--bg-secondary)' : 'var(--bg-primary)'}
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
                  backgroundColor: 'var(--border-default)'
                }} />

                {/* Route Controls Section - Only show when experimental mode is on */}
                {experimentalDetailViewNav && (
                  <div>
                    <div className="data-small" style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                      Route Controls
                    </div>
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      width: '100%'
                    }}>
                      {(['Summary', 'Trips', 'Grid'] as const).map(view => (
                        <button
                          key={view}
                          type="button"
                          onClick={() => {
                            const wasGrid = selectedRouteTab === 'Grid';
                            const willBeGrid = view === 'Grid';

                            // Clear trip selection when switching tabs
                            if (selectedTrip) {
                              setSelectedTrip(null);
                              setSelectedTripStops([]);
                            }

                            // Update tab immediately for instant panel expansion
                            setSelectedRouteTab(view);

                            // Then handle transition state
                            if (wasGrid !== willBeGrid) {
                              setIsGridTransitioning(true);
                              setTimeout(() => setIsGridTransitioning(false), 300);
                            }
                          }}
                          onMouseEnter={() => setHoveredViewButton(view)}
                          onMouseLeave={() => setHoveredViewButton(null)}
                          className="button-small"
                          style={{
                            flex: 1,
                            height: '40px',
                            borderRadius: 'var(--radius-large)',
                            backgroundColor: selectedRouteTab === view
                              ? 'var(--accent-ui-subtle)'
                              : (hoveredViewButton === view ? 'var(--bg-elevated)' : 'transparent'),
                            color: selectedRouteTab === view ? 'var(--accent-ui-text)' : 'var(--text-secondary)',
                            border: selectedRouteTab === view ? '0.5px solid transparent' : '0.5px solid var(--border-default)',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s ease, border-color 0.2s ease',
                            padding: '0 12px'
                          }}
                        >
                          {view}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Route Filter */}
                <div>
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
                    background={differentiatedPanelBackgrounds ? 'var(--bg-secondary)' : 'var(--bg-primary)'}
                  />
                </div>

                {/* Pattern Filter - Hidden when trip is selected */}
                {!selectedTrip && (
                  <div>
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
                      background={differentiatedPanelBackgrounds ? 'var(--bg-secondary)' : 'var(--bg-primary)'}
                    />
                  </div>
                )}

                {/* Trip Filter - Only shown when a trip is selected */}
                {selectedTrip && (
                  <div>
                    <label className="label text-text-tertiary block mb-1">Trip</label>
                    <Select
                      value={selectedTrip.trip_id}
                      onChange={async (value) => {
                        // Find the trip from routeTripsWithRidership
                        for (const pattern of routeTripsWithRidership) {
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
                      options={routeTripsWithRidership.flatMap(pattern =>
                        pattern.trips.map(trip => ({
                          value: trip.trip_id,
                          label: formatTime12Hour(trip.start_time),
                          description: trip.headsign,
                          sortKey: trip.start_time
                        }))
                      ).sort((a, b) => (a as { sortKey: string }).sortKey.localeCompare((b as { sortKey: string }).sortKey))
                       // eslint-disable-next-line @typescript-eslint/no-unused-vars
                       .map(({ sortKey, ...rest }) => rest as { value: string; label: string; description: string })}
                      background={differentiatedPanelBackgrounds ? 'var(--bg-secondary)' : 'var(--bg-primary)'}
                    />
                  </div>
                )}
              </>
            );
          })()}

          {/* Stop Controls - Only show when a stop is selected */}
          {selectedStopId && (
            <>
              {/* Divider */}
              <div style={{
                width: '100%',
                height: '0.5px',
                backgroundColor: 'var(--border-default)'
              }} />

              {/* Stop Controls Section */}
              <div>
                <div className="data-small" style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Stop Controls
                </div>
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  width: '100%'
                }}>
                  {(['Summary', 'Amenities'] as const).map(view => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setSelectedStopTab(view)}
                      onMouseEnter={() => setHoveredStopViewButton(view)}
                      onMouseLeave={() => setHoveredStopViewButton(null)}
                      className="button-small"
                      style={{
                        height: '40px',
                        borderRadius: 'var(--radius-large)',
                        backgroundColor: selectedStopTab === view
                          ? 'var(--accent-ui-subtle)'
                          : (hoveredStopViewButton === view ? 'var(--bg-elevated)' : 'transparent'),
                        color: selectedStopTab === view ? 'var(--accent-ui-text)' : 'var(--text-secondary)',
                        border: selectedStopTab === view ? '0.5px solid transparent' : '0.5px solid var(--border-default)',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s ease, border-color 0.2s ease',
                        padding: '0 12px'
                      }}
                    >
                      {view}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stop Filter */}
              <div>
                <SearchableSelect
                  value={selectedStopId}
                  onChange={(value) => {
                    // Preserve current tab (e.g., Amenities) when changing stops via filter
                    setSelectedStopId(value);
                  }}
                  options={stopsList.map(stop => ({
                    value: stop.id,
                    label: stop.name
                  }))}
                  searchPlaceholder="Search stops..."
                  maxHeight={300}
                  background={differentiatedPanelBackgrounds ? 'var(--bg-secondary)' : 'var(--bg-primary)'}
                />
              </div>
            </>
          )}

          {/* Close Filters Panel Button - only in AI mode (non-AI mode has hamburger toggle) */}
          {aiMode && (
            <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
              <button
                onClick={() => { hasUserClosedFiltersRef.current = true; setIsFiltersPanelOpen(false); }}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'var(--border-width) solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '8px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Close Filters
              </button>
            </div>
          )}
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
            width: (openFilter === 'date' || openFilter === 'date2') ? '462px' : (openFilter === 'days' || openFilter === 'days2') ? '420px' : '300px',
          }}
        >
          {openFilter === 'date' ? (
            <div>
              {/* Segmented Control */}
              <SegmentedControl
                options={[{ value: 'shortcuts', label: 'Seasons' }, { value: 'custom', label: 'Custom' }]}
                value={datePickerMode}
                onChange={(v) => setDatePickerMode(v as 'shortcuts' | 'custom')}
                style={{ margin: '0 auto 24px auto' }}
              />

              {datePickerMode === 'shortcuts' ? (
                <div>
                  {/* Year Navigation */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '32px',
                    marginBottom: '24px',
                    paddingLeft: '54px',
                    paddingRight: '54px'
                  }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isYearInDataRange(selectedYear - 1)) {
                          setSelectedYear(selectedYear - 1);
                        }
                      }}
                      disabled={!isYearInDataRange(selectedYear - 1)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: '0.5px solid var(--border-default)',
                        backgroundColor: !isYearInDataRange(selectedYear - 1) ? '#F5F5F5' : 'var(--bg-elevated)',
                        cursor: !isYearInDataRange(selectedYear - 1) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        opacity: !isYearInDataRange(selectedYear - 1) ? 0.5 : 1
                      }}
                    >
                      <img
                        src={ChevronLeftIcon.src}
                        alt="Previous year"
                        style={{
                          width: '24px',
                          height: '24px',
                          filter: !isYearInDataRange(selectedYear - 1) ? 'none' : 'brightness(0)'
                        }}
                      />
                    </button>
                    <div style={{
                      fontSize: 'var(--heading-3-size)',
                      fontWeight: 'var(--heading-3-weight)',
                      color: 'var(--text-primary)',
                      textAlign: 'center',
                      lineHeight: 'var(--heading-3-line-height)',
                      letterSpacing: 'var(--heading-3-letter-spacing)'
                    }}>
                      {`Seasons of ${selectedYear}`}
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
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '12px',
                    marginBottom: '24px'
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

                      // Only Spring and Summer 2025 have data available
                      const isSeasonDisabled = !(
                        selectedYear === 2025 &&
                        (season.key === 'spring' || season.key === 'summer')
                      );

                      switch(season.key) {
                        case 'winter':
                          dateRange = `Sep 21, ${prevYear} - Mar 20, ${selectedYear}`;
                          break;
                        case 'spring':
                          dateRange = `Mar 21 - Jun 21, ${selectedYear}`;
                          break;
                        case 'summer':
                          dateRange = `Jun 22 - Sep 18, ${selectedYear}`;
                          break;
                        case 'fall':
                          dateRange = `Sep 19 - Dec 20, ${selectedYear}`;
                          break;
                      }

                      return (
                      <button
                        key={season.key}
                        type="button"
                        disabled={isSeasonDisabled}
                        onClick={() => {
                          if (!isSeasonDisabled) {
                            setStagedSeason({ season: season.key as 'winter' | 'spring' | 'summer' | 'fall', year: displayYear });
                            setStagedQuickPick(null);
                            setStagedStartDate(null);
                            setStagedEndDate(null);
                          }
                        }}
                        onMouseEnter={() => !isSeasonDisabled && setHoveredSeason(season.key)}
                        onMouseLeave={() => setHoveredSeason(null)}
                        style={{
                          paddingTop: '16px',
                          paddingBottom: '16px',
                          paddingLeft: '16px',
                          paddingRight: '16px',
                          backgroundColor: stagedSeason?.season === season.key && stagedSeason?.year === displayYear ? 'var(--bg-primary)' : (hoveredSeason === season.key && !isSeasonDisabled ? 'var(--bg-primary)' : 'var(--bg-elevated)'),
                          border: '0.5px solid var(--border-default)',
                          boxShadow: stagedSeason?.season === season.key && stagedSeason?.year === displayYear ? 'inset 0 0 0 0.5px var(--border-focus)' : 'none',
                          borderRadius: '20px',
                          cursor: isSeasonDisabled ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          opacity: 1,
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
                            opacity: 0.87
                          }}
                        />
                        <div style={{
                          fontSize: 'var(--button-small-size)',
                          fontWeight: 'var(--button-small-weight)',
                          color: 'var(--text-primary)',
                          fontFamily: 'Inter, sans-serif',
                          lineHeight: 'var(--button-small-line-height)'
                        }}>
                          {season.label}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 'var(--nav-label-weight)',
                          color: 'var(--text-tertiary)',
                          fontFamily: 'Inter, sans-serif',
                          textAlign: 'center',
                          lineHeight: '16px'
                        }}>
                          {dateRange}
                        </div>
                      </button>
                      );
                    })}
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
                    paddingLeft: '30px',
                    paddingRight: '30px'
                  }}>
                    <button
                      type="button"
                      onClick={() => {
                        const prevMonth = calendarStartMonth.getMonth() - 1;
                        const prevYear = prevMonth < 0 ? calendarStartMonth.getFullYear() - 1 : calendarStartMonth.getFullYear();
                        const normalizedMonth = prevMonth < 0 ? 11 : prevMonth;
                        if (isMonthInDataRange(prevYear, normalizedMonth)) {
                          setCalendarStartMonth(new Date(prevYear, normalizedMonth));
                        }
                      }}
                      disabled={!isMonthInDataRange(
                        calendarStartMonth.getMonth() === 0 ? calendarStartMonth.getFullYear() - 1 : calendarStartMonth.getFullYear(),
                        calendarStartMonth.getMonth() === 0 ? 11 : calendarStartMonth.getMonth() - 1
                      )}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: '0.5px solid var(--border-default)',
                        backgroundColor: !isMonthInDataRange(
                          calendarStartMonth.getMonth() === 0 ? calendarStartMonth.getFullYear() - 1 : calendarStartMonth.getFullYear(),
                          calendarStartMonth.getMonth() === 0 ? 11 : calendarStartMonth.getMonth() - 1
                        ) ? '#F5F5F5' : 'var(--bg-elevated)',
                        cursor: !isMonthInDataRange(
                          calendarStartMonth.getMonth() === 0 ? calendarStartMonth.getFullYear() - 1 : calendarStartMonth.getFullYear(),
                          calendarStartMonth.getMonth() === 0 ? 11 : calendarStartMonth.getMonth() - 1
                        ) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        opacity: !isMonthInDataRange(
                          calendarStartMonth.getMonth() === 0 ? calendarStartMonth.getFullYear() - 1 : calendarStartMonth.getFullYear(),
                          calendarStartMonth.getMonth() === 0 ? 11 : calendarStartMonth.getMonth() - 1
                        ) ? 0.5 : 1
                      }}
                    >
                      <img
                        src={ChevronLeftIcon.src}
                        alt="Previous month"
                        style={{
                          width: '24px',
                          height: '24px',
                          filter: !isMonthInDataRange(
                            calendarStartMonth.getMonth() === 0 ? calendarStartMonth.getFullYear() - 1 : calendarStartMonth.getFullYear(),
                            calendarStartMonth.getMonth() === 0 ? 11 : calendarStartMonth.getMonth() - 1
                          ) ? 'none' : 'brightness(0)'
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
                        const nextMonth = calendarStartMonth.getMonth() + 1;
                        const nextYear = nextMonth > 11 ? calendarStartMonth.getFullYear() + 1 : calendarStartMonth.getFullYear();
                        const normalizedMonth = nextMonth > 11 ? 0 : nextMonth;
                        if (isMonthInDataRange(nextYear, normalizedMonth)) {
                          setCalendarStartMonth(new Date(nextYear, normalizedMonth));
                        }
                      }}
                      disabled={!isMonthInDataRange(
                        calendarStartMonth.getMonth() === 11 ? calendarStartMonth.getFullYear() + 1 : calendarStartMonth.getFullYear(),
                        calendarStartMonth.getMonth() === 11 ? 0 : calendarStartMonth.getMonth() + 1
                      )}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: '0.5px solid var(--border-default)',
                        backgroundColor: !isMonthInDataRange(
                          calendarStartMonth.getMonth() === 11 ? calendarStartMonth.getFullYear() + 1 : calendarStartMonth.getFullYear(),
                          calendarStartMonth.getMonth() === 11 ? 0 : calendarStartMonth.getMonth() + 1
                        ) ? '#F5F5F5' : 'var(--bg-elevated)',
                        cursor: !isMonthInDataRange(
                          calendarStartMonth.getMonth() === 11 ? calendarStartMonth.getFullYear() + 1 : calendarStartMonth.getFullYear(),
                          calendarStartMonth.getMonth() === 11 ? 0 : calendarStartMonth.getMonth() + 1
                        ) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        opacity: !isMonthInDataRange(
                          calendarStartMonth.getMonth() === 11 ? calendarStartMonth.getFullYear() + 1 : calendarStartMonth.getFullYear(),
                          calendarStartMonth.getMonth() === 11 ? 0 : calendarStartMonth.getMonth() + 1
                        ) ? 0.5 : 1
                      }}
                    >
                      <img
                        src={ChevronRightIcon.src}
                        alt="Next month"
                        style={{
                          width: '24px',
                          height: '24px',
                          filter: !isMonthInDataRange(
                            calendarStartMonth.getMonth() === 11 ? calendarStartMonth.getFullYear() + 1 : calendarStartMonth.getFullYear(),
                            calendarStartMonth.getMonth() === 11 ? 0 : calendarStartMonth.getMonth() + 1
                          ) ? 'none' : 'brightness(0)'
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

                              // Check if date is within valid data range
                              const isDisabled = !isDateInDataRange(day);

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
                                    background: isSelected ? 'var(--bg-secondary)' : (isInRange ? 'var(--bg-primary)' : 'transparent'),
                                    borderRadius: wrapperBorderRadius,
                                    zIndex: backgroundZIndex
                                  }} />
                                  <button
                                    disabled={isDisabled}
                                    onClick={() => {
                                      if (isDisabled) return;
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
                                      background: isDisabled ? 'transparent' : (isSelected ? 'var(--bg-secondary)' : 'transparent'),
                                      border: isSelected && !isDisabled ? '1px solid var(--border-focus)' : 'none',
                                      borderRadius: buttonBorderRadius,
                                      color: isDisabled ? 'var(--text-disabled)' : 'var(--text-primary)',
                                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                                      width: '48px',
                                      height: '48px',
                                      fontSize: 'var(--body-regular-size)',
                                      fontWeight: 'var(--body-regular-weight)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'all 0.2s ease',
                                      opacity: isDisabled ? 0.4 : 1
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isSelected && !isInRange && !isDisabled) {
                                        e.currentTarget.style.background = 'var(--bg-secondary)';
                                        e.currentTarget.style.borderRadius = '50%';
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isSelected && !isInRange && !isDisabled) {
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
                marginTop: 0,
                marginLeft: '-24px',
                marginRight: '-24px'
              }} />

              {/* Footer with action buttons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                padding: '20px 0 0 0',
                justifyContent: 'flex-end',
                alignItems: 'center'
              }}>
                {/* Data availability info - commented out for demo
                <div style={{
                  fontSize: 'var(--label-size)',
                  color: 'var(--text-secondary)'
                }}>
                  Dates available:<br />March–August, 2025
                </div>
                */}

                {/* Action Buttons */}
                <div style={{
                  display: 'flex',
                  gap: '12px'
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
                {/* Container to align segmented control and custom options */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {/* Segmented Control */}
                  <SegmentedControl
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'weekdays', label: 'Weekdays' },
                      { value: 'weekends', label: 'Weekends' },
                      { value: 'custom', label: 'Custom' },
                    ]}
                    value={stagedDaysMode}
                    onChange={(v) => {
                      const mode = v as 'all' | 'weekdays' | 'weekends' | 'custom';
                      setStagedDaysMode(mode);
                      if (mode === 'weekdays') setStagedCustomDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
                      else if (mode === 'weekends') setStagedCustomDays(['Sat', 'Sun']);
                    }}
                  />

                  {/* Custom day selector */}
                  {stagedDaysMode === 'custom' && (
                    <>
                      {/* Divider */}
                      <div style={{
                        borderTop: 'var(--border-width) solid var(--border-default)',
                        marginTop: '12px',
                        marginBottom: '12px',
                        width: '100%'
                      }} />
                      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
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
                              flex: 1,
                              height: '40px',
                              borderRadius: '20px',
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
                {/* Segmented Control */}
                <SegmentedControl
                  options={[{ value: 'all', label: 'All' }, { value: 'custom', label: 'By Period' }]}
                  value={stagedTimeMode}
                  onChange={(v) => {
                    const mode = v as 'all' | 'custom';
                    setStagedTimeMode(mode);
                    if (mode === 'all') setStagedTimePeriods([]);
                  }}
                  style={{ margin: '0 auto 12px auto' }}
                />

                {/* Custom time periods */}
                {stagedTimeMode === 'custom' && (
                  <>
                    {/* Divider */}
                    <div style={{
                      borderTop: 'var(--border-width) solid var(--border-default)',
                      marginTop: '12px',
                      marginBottom: '12px'
                    }} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {[
                      { label: 'Early AM', time: '12am - 6am' },
                      { label: 'AM Peak', time: '6am - 9am' },
                      { label: 'Midday', time: '9am - 3pm' },
                      { label: 'PM Peak', time: '3pm - 7pm' },
                      { label: 'Evening', time: '7pm - 10pm' },
                      { label: 'Night', time: '10pm - 12am' }
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
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderRadius: '100px',
                            width: 'calc(50% - 4px)',
                            paddingLeft: '16px',
                            paddingRight: '16px'
                          }}
                        >
                          <span>{label}</span>
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{time}</span>
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
          ) : openFilter === 'date2' ? (
            <div>
              {/* Date-time 2 Date Picker - Same as date picker but for comparison range */}
              {/* Segmented Control */}
              <SegmentedControl
                options={[{ value: 'shortcuts', label: 'Seasons' }, { value: 'custom', label: 'Custom' }]}
                value={date2PickerMode}
                onChange={(v) => setDate2PickerMode(v as 'shortcuts' | 'custom')}
                style={{ margin: '0 auto 24px auto' }}
              />

              {date2PickerMode === 'shortcuts' ? (
                <div>
                  {/* Year Navigation */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '32px',
                    marginBottom: '24px',
                    paddingLeft: '54px',
                    paddingRight: '54px'
                  }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isYearInDataRange(selectedYear2 - 1)) {
                          setSelectedYear2(selectedYear2 - 1);
                        }
                      }}
                      disabled={!isYearInDataRange(selectedYear2 - 1)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: '0.5px solid var(--border-default)',
                        backgroundColor: !isYearInDataRange(selectedYear2 - 1) ? '#F5F5F5' : 'var(--bg-elevated)',
                        cursor: !isYearInDataRange(selectedYear2 - 1) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        opacity: !isYearInDataRange(selectedYear2 - 1) ? 0.5 : 1
                      }}
                    >
                      <img
                        src={ChevronLeftIcon.src}
                        alt="Previous year"
                        style={{
                          width: '24px',
                          height: '24px',
                          filter: !isYearInDataRange(selectedYear2 - 1) ? 'none' : 'brightness(0)'
                        }}
                      />
                    </button>
                    <div style={{
                      fontSize: 'var(--heading-3-size)',
                      fontWeight: 'var(--heading-3-weight)',
                      color: 'var(--text-primary)',
                      textAlign: 'center',
                      lineHeight: 'var(--heading-3-line-height)',
                      letterSpacing: 'var(--heading-3-letter-spacing)'
                    }}>
                      {`Seasons of ${selectedYear2}`}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedYear2 < 2025) {
                          setSelectedYear2(selectedYear2 + 1);
                        }
                      }}
                      disabled={selectedYear2 >= 2025}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: '0.5px solid var(--border-default)',
                        backgroundColor: selectedYear2 >= 2025 ? '#F5F5F5' : 'var(--bg-elevated)',
                        cursor: selectedYear2 >= 2025 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        opacity: selectedYear2 >= 2025 ? 0.5 : 1
                      }}
                    >
                      <img
                        src={ChevronRightIcon.src}
                        alt="Next year"
                        style={{
                          width: '24px',
                          height: '24px',
                          filter: selectedYear2 >= 2025 ? 'none' : 'brightness(0)'
                        }}
                      />
                    </button>
                  </div>

                  {/* Season Cards */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '12px',
                    marginBottom: '24px'
                  }}>
                    {[
                      { key: 'winter', label: 'Winter', icon: WinterIcon },
                      { key: 'spring', label: 'Spring', icon: SpringIcon },
                      { key: 'summer', label: 'Summer', icon: SummerIcon },
                      { key: 'fall', label: 'Fall', icon: FallIcon },
                    ].map((season) => {
                      const prevYear = selectedYear2 - 1;
                      const nextYear = selectedYear2 + 1;
                      const displayYear = season.key === 'winter' ? prevYear : selectedYear2;

                      // Check if this season has data
                      const isDisabled = !isSeasonInDataRange(season.key as 'winter' | 'spring' | 'summer' | 'fall', selectedYear2);

                      let dateRange = '';
                      switch(season.key) {
                        case 'winter':
                          dateRange = `Sep 21, ${prevYear} - Mar 20, ${selectedYear2}`;
                          break;
                        case 'spring':
                          dateRange = `Mar 21 - Jun 21, ${selectedYear2}`;
                          break;
                        case 'summer':
                          dateRange = `Jun 22 - Sep 18, ${selectedYear2}`;
                          break;
                        case 'fall':
                          dateRange = `Sep 19 - Dec 20, ${selectedYear2}`;
                          break;
                      }

                      return (
                        <button
                          key={season.key}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return;
                            setStagedSeason2({ season: season.key as 'winter' | 'spring' | 'summer' | 'fall', year: displayYear });
                            setStagedQuickPick2(null);
                            // Calculate actual dates for the season
                            const seasonDates = getSeasonDates(season.key as 'winter' | 'spring' | 'summer' | 'fall', displayYear);
                            setStagedStartDate2(seasonDates.start);
                            setStagedEndDate2(seasonDates.end);
                          }}
                          onMouseEnter={() => !isDisabled && setHoveredSeason(season.key)}
                          onMouseLeave={() => setHoveredSeason(null)}
                          style={{
                            paddingTop: '16px',
                            paddingBottom: '16px',
                            paddingLeft: '16px',
                            paddingRight: '16px',
                            backgroundColor: stagedSeason2?.season === season.key && stagedSeason2?.year === displayYear ? 'var(--bg-primary)' : (hoveredSeason === season.key && !isDisabled ? 'var(--bg-primary)' : 'var(--bg-elevated)'),
                            border: '0.5px solid var(--border-default)',
                            boxShadow: stagedSeason2?.season === season.key && stagedSeason2?.year === displayYear ? 'inset 0 0 0 0.5px var(--border-focus)' : 'none',
                            borderRadius: '20px',
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            opacity: 1,
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
                              opacity: 0.87
                            }}
                          />
                          <div style={{
                            fontSize: 'var(--button-small-size)',
                            fontWeight: 'var(--button-small-weight)',
                            color: 'var(--text-primary)',
                            fontFamily: 'Inter, sans-serif',
                            lineHeight: 'var(--button-small-line-height)'
                          }}>
                            {season.label}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            fontWeight: 'var(--nav-label-weight)',
                            color: 'var(--text-tertiary)',
                            fontFamily: 'Inter, sans-serif',
                            textAlign: 'center',
                            lineHeight: '16px'
                          }}>
                            {dateRange}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                </div>
              ) : (
                // Custom Date Picker for Date-time 2
                <div style={{ paddingLeft: '24px', paddingRight: '24px', paddingBottom: '24px' }}>
                  {/* Calendar Navigation */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '24px',
                    paddingLeft: '30px',
                    paddingRight: '30px'
                  }}>
                    <button
                      type="button"
                      onClick={() => {
                        const prevMonth = calendarStartMonth2.getMonth() - 1;
                        const prevYear = prevMonth < 0 ? calendarStartMonth2.getFullYear() - 1 : calendarStartMonth2.getFullYear();
                        const normalizedMonth = prevMonth < 0 ? 11 : prevMonth;
                        if (isMonthInDataRange(prevYear, normalizedMonth)) {
                          setCalendarStartMonth2(new Date(prevYear, normalizedMonth));
                        }
                      }}
                      disabled={!isMonthInDataRange(
                        calendarStartMonth2.getMonth() === 0 ? calendarStartMonth2.getFullYear() - 1 : calendarStartMonth2.getFullYear(),
                        calendarStartMonth2.getMonth() === 0 ? 11 : calendarStartMonth2.getMonth() - 1
                      )}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: '0.5px solid var(--border-default)',
                        backgroundColor: !isMonthInDataRange(
                          calendarStartMonth2.getMonth() === 0 ? calendarStartMonth2.getFullYear() - 1 : calendarStartMonth2.getFullYear(),
                          calendarStartMonth2.getMonth() === 0 ? 11 : calendarStartMonth2.getMonth() - 1
                        ) ? '#F5F5F5' : 'var(--bg-elevated)',
                        cursor: !isMonthInDataRange(
                          calendarStartMonth2.getMonth() === 0 ? calendarStartMonth2.getFullYear() - 1 : calendarStartMonth2.getFullYear(),
                          calendarStartMonth2.getMonth() === 0 ? 11 : calendarStartMonth2.getMonth() - 1
                        ) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        opacity: !isMonthInDataRange(
                          calendarStartMonth2.getMonth() === 0 ? calendarStartMonth2.getFullYear() - 1 : calendarStartMonth2.getFullYear(),
                          calendarStartMonth2.getMonth() === 0 ? 11 : calendarStartMonth2.getMonth() - 1
                        ) ? 0.5 : 1
                      }}
                    >
                      <img
                        src={ChevronLeftIcon.src}
                        alt="Previous month"
                        style={{
                          width: '24px',
                          height: '24px',
                          filter: !isMonthInDataRange(
                            calendarStartMonth2.getMonth() === 0 ? calendarStartMonth2.getFullYear() - 1 : calendarStartMonth2.getFullYear(),
                            calendarStartMonth2.getMonth() === 0 ? 11 : calendarStartMonth2.getMonth() - 1
                          ) ? 'none' : 'brightness(0)'
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
                      {calendarStartMonth2.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextMonth = calendarStartMonth2.getMonth() + 1;
                        const nextYear = nextMonth > 11 ? calendarStartMonth2.getFullYear() + 1 : calendarStartMonth2.getFullYear();
                        const normalizedMonth = nextMonth > 11 ? 0 : nextMonth;
                        if (isMonthInDataRange(nextYear, normalizedMonth)) {
                          setCalendarStartMonth2(new Date(nextYear, normalizedMonth));
                        }
                      }}
                      disabled={!isMonthInDataRange(
                        calendarStartMonth2.getMonth() === 11 ? calendarStartMonth2.getFullYear() + 1 : calendarStartMonth2.getFullYear(),
                        calendarStartMonth2.getMonth() === 11 ? 0 : calendarStartMonth2.getMonth() + 1
                      )}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: '0.5px solid var(--border-default)',
                        backgroundColor: !isMonthInDataRange(
                          calendarStartMonth2.getMonth() === 11 ? calendarStartMonth2.getFullYear() + 1 : calendarStartMonth2.getFullYear(),
                          calendarStartMonth2.getMonth() === 11 ? 0 : calendarStartMonth2.getMonth() + 1
                        ) ? '#F5F5F5' : 'var(--bg-elevated)',
                        cursor: !isMonthInDataRange(
                          calendarStartMonth2.getMonth() === 11 ? calendarStartMonth2.getFullYear() + 1 : calendarStartMonth2.getFullYear(),
                          calendarStartMonth2.getMonth() === 11 ? 0 : calendarStartMonth2.getMonth() + 1
                        ) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        opacity: !isMonthInDataRange(
                          calendarStartMonth2.getMonth() === 11 ? calendarStartMonth2.getFullYear() + 1 : calendarStartMonth2.getFullYear(),
                          calendarStartMonth2.getMonth() === 11 ? 0 : calendarStartMonth2.getMonth() + 1
                        ) ? 0.5 : 1
                      }}
                    >
                      <img
                        src={ChevronRightIcon.src}
                        alt="Next month"
                        style={{
                          width: '24px',
                          height: '24px',
                          filter: !isMonthInDataRange(
                            calendarStartMonth2.getMonth() === 11 ? calendarStartMonth2.getFullYear() + 1 : calendarStartMonth2.getFullYear(),
                            calendarStartMonth2.getMonth() === 11 ? 0 : calendarStartMonth2.getMonth() + 1
                          ) ? 'none' : 'brightness(0)'
                        }}
                      />
                    </button>
                  </div>

                  {/* Single Month Calendar for Date-time 2 */}
                  <div>
                    {(() => {
                      const year = calendarStartMonth2.getFullYear();
                      const month = calendarStartMonth2.getMonth();
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const firstDayOfMonth = new Date(year, month, 1).getDay();
                      const days: (Date | null)[] = [];
                      for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
                      for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));

                      return (
                        <div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 48px)', columnGap: '0', marginBottom: '8px', marginTop: '8px', justifyContent: 'center' }}>
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                              <div key={idx} style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--text-tertiary)', textAlign: 'center', padding: '8px 0', letterSpacing: 'var(--label-letter-spacing)' }}>{day}</div>
                            ))}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 48px)', rowGap: '4px', columnGap: '0', justifyContent: 'center' }}>
                            {days.map((day, idx) => {
                              if (!day) {
                                return <div key={`empty-${idx}`} />;
                              }

                              // Check if date is within valid data range
                              const isDisabled = !isDateInDataRange(day);

                              const isStart = stagedStartDate2 && day.getTime() === stagedStartDate2.getTime();
                              const isEnd = stagedEndDate2 && day.getTime() === stagedEndDate2.getTime();
                              const isInRange = stagedStartDate2 && stagedEndDate2 &&
                                day.getTime() > stagedStartDate2.getTime() &&
                                day.getTime() < stagedEndDate2.getTime();
                              const isSelected = isStart || isEnd;

                              // Check if this date is at the start or end of a week row
                              const dayOfWeek = day.getDay(); // 0 = Sunday, 6 = Saturday
                              const isRowStart = dayOfWeek === 0; // Sunday
                              const isRowEnd = dayOfWeek === 6; // Saturday

                              // Determine border radius for wrapper background
                              let wrapperBorderRadius = '0';
                              let buttonBorderRadius = '8px';
                              const isActive = isSelected || isInRange;

                              // Check if adjacent to selected dates
                              const prevIsSelected = idx > 0 && days[idx - 1] && stagedStartDate2 && stagedEndDate2 && (
                                days[idx - 1]!.getTime() === stagedStartDate2.getTime() ||
                                days[idx - 1]!.getTime() === stagedEndDate2.getTime()
                              );
                              const nextIsSelected = idx < days.length - 1 && days[idx + 1] && stagedStartDate2 && stagedEndDate2 && (
                                days[idx + 1]!.getTime() === stagedStartDate2.getTime() ||
                                days[idx + 1]!.getTime() === stagedEndDate2.getTime()
                              );

                              // Margins to extend backgrounds into adjacent cells
                              let wrapperMarginLeft = '0';
                              let wrapperMarginRight = '0';
                              let backgroundZIndex = 0;

                              if (isActive) {
                                if (isSelected) {
                                  wrapperBorderRadius = '50%';
                                  buttonBorderRadius = '50%';
                                  backgroundZIndex = 2;
                                } else if (isInRange) {
                                  if (prevIsSelected) {
                                    wrapperMarginLeft = '-24px';
                                  }
                                  if (nextIsSelected) {
                                    wrapperMarginRight = '-24px';
                                  }

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
                                  backgroundZIndex = 1;
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
                                    background: isSelected ? 'var(--bg-secondary)' : (isInRange ? 'var(--bg-primary)' : 'transparent'),
                                    borderRadius: wrapperBorderRadius,
                                    zIndex: backgroundZIndex
                                  }} />
                                  <button
                                    disabled={isDisabled}
                                    onClick={() => {
                                      if (isDisabled) return;
                                      setStagedQuickPick2(null);
                                      setStagedSeason2(null);

                                      if (!stagedStartDate2 || (stagedStartDate2 && stagedEndDate2)) {
                                        setStagedStartDate2(day);
                                        setStagedEndDate2(null);
                                      } else if (day.getTime() > stagedStartDate2.getTime()) {
                                        setStagedEndDate2(day);
                                      } else {
                                        setStagedEndDate2(stagedStartDate2);
                                        setStagedStartDate2(day);
                                      }
                                    }}
                                    style={{
                                      position: 'relative',
                                      zIndex: 3,
                                      background: isDisabled ? 'transparent' : (isSelected ? 'var(--bg-secondary)' : 'transparent'),
                                      border: isSelected && !isDisabled ? '1px solid var(--border-focus)' : 'none',
                                      borderRadius: buttonBorderRadius,
                                      color: isDisabled ? 'var(--text-disabled)' : 'var(--text-primary)',
                                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                                      width: '48px',
                                      height: '48px',
                                      fontSize: 'var(--body-regular-size)',
                                      fontWeight: 'var(--body-regular-weight)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'all 0.2s ease',
                                      opacity: isDisabled ? 0.4 : 1
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isSelected && !isInRange && !isDisabled) {
                                        e.currentTarget.style.background = 'var(--bg-secondary)';
                                        e.currentTarget.style.borderRadius = '50%';
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isSelected && !isInRange && !isDisabled) {
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
                marginTop: 0,
                marginLeft: '-24px',
                marginRight: '-24px'
              }} />

              {/* Footer with action buttons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                padding: '20px 0 0 0',
                justifyContent: 'flex-end',
                alignItems: 'center'
              }}>
                {/* Data availability info - commented out for demo
                <div style={{
                  fontSize: 'var(--label-size)',
                  color: 'var(--text-secondary)'
                }}>
                  Dates available:<br />March–September, 2025
                </div>
                */}

                {/* Action Buttons */}
                <div style={{
                  display: 'flex',
                  gap: '12px'
                }}>
                  <Button
                    variant="tertiary"
                    size="medium"
                    onClick={handleResetDate2Filter}
                    disabled={!hasDate2Changes}
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                    }}
                    onMouseEnter={(e) => {
                      if (hasDate2Changes) {
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
                    onClick={handleApplyDate2Filter}
                    disabled={!hasDate2Changes}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          ) : openFilter === 'days2' ? (
            <div>
              {/* Days of the week section for Date-time 2 */}
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
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <SegmentedControl
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'weekdays', label: 'Weekdays' },
                      { value: 'weekends', label: 'Weekends' },
                      { value: 'custom', label: 'Custom' },
                    ]}
                    value={stagedDaysMode2}
                    onChange={(v) => {
                      const mode = v as 'all' | 'weekdays' | 'weekends' | 'custom';
                      setStagedDaysMode2(mode);
                      if (mode === 'weekdays') setStagedCustomDays2(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
                      else if (mode === 'weekends') setStagedCustomDays2(['Sat', 'Sun']);
                    }}
                  />

                  {stagedDaysMode2 === 'custom' && (
                    <>
                      <div style={{ borderTop: 'var(--border-width) solid var(--border-default)', marginTop: '12px', marginBottom: '12px', width: '100%' }} />
                      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                          const isSelected = stagedCustomDays2.includes(day);
                          const shortDay = day === 'Mon' ? 'M' : day === 'Tue' ? 'T' : day === 'Wed' ? 'W' : day === 'Thu' ? 'T' : day === 'Fri' ? 'F' : day === 'Sat' ? 'Sa' : 'Su';
                          return (
                            <StatefulButton
                              key={day}
                              size="medium"
                              selected={isSelected}
                              onToggle={() => {
                                if (isSelected) {
                                  setStagedCustomDays2(stagedCustomDays2.filter(d => d !== day));
                                } else {
                                  setStagedCustomDays2([...stagedCustomDays2, day]);
                                }
                              }}
                              style={{ flex: 1, height: '40px', borderRadius: '20px', padding: 0 }}
                            >
                              {shortDay}
                            </StatefulButton>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Time of day section for Date-time 2 */}
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
                {/* Segmented Control */}
                <SegmentedControl
                  options={[{ value: 'all', label: 'All' }, { value: 'custom', label: 'By Period' }]}
                  value={stagedTimeMode2}
                  onChange={(v) => {
                    const mode = v as 'all' | 'custom';
                    setStagedTimeMode2(mode);
                    if (mode === 'all') setStagedTimePeriods2([]);
                  }}
                  style={{ margin: '0 auto 12px auto' }}
                />

                {/* Custom time periods */}
                {stagedTimeMode2 === 'custom' && (
                    <>
                      {/* Divider */}
                      <div style={{
                        borderTop: 'var(--border-width) solid var(--border-default)',
                        marginTop: '12px',
                        marginBottom: '12px'
                      }} />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {[
                        { label: 'Early AM', time: '12am - 6am' },
                        { label: 'AM Peak', time: '6am - 9am' },
                        { label: 'Midday', time: '9am - 3pm' },
                        { label: 'PM Peak', time: '3pm - 7pm' },
                        { label: 'Evening', time: '7pm - 10pm' },
                        { label: 'Night', time: '10pm - 12am' }
                      ].map(({ label, time }) => {
                        const isSelected = stagedTimePeriods2.includes(label);
                        return (
                          <StatefulButton
                            key={label}
                            size="medium"
                            selected={isSelected}
                            onToggle={() => {
                              if (isSelected) {
                                setStagedTimePeriods2(stagedTimePeriods2.filter(p => p !== label));
                              } else {
                                setStagedTimePeriods2([...stagedTimePeriods2, label]);
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              borderRadius: '100px',
                              width: 'calc(50% - 4px)',
                              paddingLeft: '16px',
                              paddingRight: '16px'
                            }}
                          >
                            <span>{label}</span>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{time}</span>
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

              {/* Footer with Reset/Apply */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '20px 0 0 0' }}>
                <Button
                  variant="tertiary"
                  size="medium"
                  onClick={handleResetDays2Filter}
                  disabled={!hasDays2Changes}
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                  }}
                  onMouseEnter={(e) => {
                    if (hasDays2Changes) {
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
                  onClick={handleApplyDays2Filter}
                  disabled={!hasDays2Changes}
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
        onHover={({ object, x, y }) => {
          if (object && object.properties) {
            if ('route_id' in object.properties) {
              setHoveredRoute((object as RouteFeature).properties.route_id);
              setHoveredStop(null);
              setHoveredStopCoords(null);
            } else if ('stop_id' in object.properties) {
              setHoveredStop((object as StopFeature).properties.stop_id);
              setHoveredStopCoords({ x, y });
              setHoveredRoute(null);
            }
          } else {
            setHoveredRoute(null);
            setHoveredStop(null);
            setHoveredStopCoords(null);
          }
        }}
        onClick={({ object }) => {
          if (object && object.properties) {
            if ('route_id' in object.properties) {
              const routeId = (object as RouteFeature).properties.route_id;
              setHoveredRoute(null); // Clear hover immediately
              // Stay in current tab (system or routes) - don't switch tabs
              // Only reset to Summary if coming from no route (list/map view)
              if (!selectedRouteId) {
                setSelectedRouteTab('Summary');
              }
              setSelectedRouteId(routeId);
              setSelectedStopId(null);
            }
            // Note: Stop clicks are handled by ScatterplotLayer onClick handlers
            // to avoid double-firing of navigation stack pushes
          }
        }}
        style={{ position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' }}
      >
        <MapboxMap
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/stephencoynerseattle/cmgifl16g001u01s6699hg7iv"
          style={{ position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' }}
          preserveDrawingBuffer={true}
          onError={(e) => {
            console.warn('Map error:', e);
          }}
          onLoad={() => {
            console.log('Custom map style loaded successfully');
            const map = mapRef.current?.getMap();
            if (map) {
              // Debug: log available sources and layers
              const style = map.getStyle();
              console.log('Available sources:', Object.keys(style?.sources || {}));
              console.log('Available layers:', style?.layers?.map(l => ({ id: l.id, type: l.type, source: (l as { source?: string }).source, sourceLayer: (l as { 'source-layer'?: string })['source-layer'] })));

              // Add schools layer - all schools appear at same zoom level
              // Include all school types: school, college, university
              const schoolsFilter = [
                'any',
                ['==', ['get', 'class'], 'school'],
                ['==', ['get', 'class'], 'college'],
                ['==', ['get', 'maki'], 'school'],
                ['==', ['get', 'maki'], 'college'],
                // Match names containing school-related keywords
                ['in', 'School', ['get', 'name']],
                ['in', 'Elementary', ['get', 'name']],
                ['in', 'Middle School', ['get', 'name']],
                ['in', 'High School', ['get', 'name']],
                ['in', 'Academy', ['get', 'name']]
              ];
              try {
                // Create a school icon as an SVG data URL
                const schoolIconSvg = `
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="14" fill="#3D2817" stroke="#ffffff" stroke-width="2"/>
                    <path d="M16 8L9 12V14H23V12L16 8Z" fill="#ffffff"/>
                    <rect x="10" y="14" width="12" height="8" fill="#ffffff"/>
                    <rect x="12" y="16" width="3" height="3" fill="#3D2817"/>
                    <rect x="17" y="16" width="3" height="3" fill="#3D2817"/>
                    <rect x="14" y="19" width="4" height="3" fill="#3D2817"/>
                  </svg>
                `;
                const schoolIconDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(schoolIconSvg);

                // Load the school icon image
                const img = new Image();
                img.onload = () => {
                  map.addImage('school-icon', img);

                  // Add schools layer with icon
                  map.addLayer({
                    id: 'schools',
                    type: 'symbol',
                    source: 'composite',
                    'source-layer': 'poi_label',
                    minzoom: 11, // All schools appear at zoom 11
                    filter: schoolsFilter,
                    layout: {
                      'icon-image': 'school-icon',
                      'icon-size': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        11, 0.5,   // At zoom 11: 0.5x
                        13, 0.7,   // At zoom 13: 0.7x
                        16, 1.0    // At zoom 16: 1x
                      ],
                      'icon-allow-overlap': true
                    }
                  });

                  // Add school labels layer
                  map.addLayer({
                    id: 'schools-labels',
                    type: 'symbol',
                    source: 'composite',
                    'source-layer': 'poi_label',
                    minzoom: 11, // Labels appear at same zoom as icons
                    filter: schoolsFilter,
                    layout: {
                      'text-field': ['get', 'name'],
                      'text-size': 11,
                      'text-offset': [0, 1.5],
                      'text-anchor': 'top',
                      'text-max-width': 8
                    },
                    paint: {
                      'text-color': '#333333',
                      'text-halo-color': '#ffffff',
                      'text-halo-width': 1.5
                    }
                  });
                  console.log('Schools layer added successfully');
                };
                img.src = schoolIconDataUrl;
              } catch (e) {
                console.error('Error adding schools layer:', e);
              }
            }
          }}
        />
      </DeckGL>

      {/* Loading Spinner Overlay - positioned over the visible map area */}
      {/* Show spinner when loading ridership data OR when loading grid data for segment coloring in route detail view */}
      {/* In comparison mode, also show spinner when comparison grid data is loading */}
      {(isRidershipLoading || (selectedRouteId && !selectedTrip && showSegmentColoring && (isGridDataLoading || isGridDataStale || (comparisonMode && (isGridData2Loading || isGridData2Stale))))) && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: isFiltersPanelOpen ? '716px' : '460px',
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            zIndex: 500,
            pointerEvents: 'none',
            transition: 'left 300ms ease-in-out',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              border: '4px solid var(--border-default)',
              borderTopColor: 'var(--text-secondary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes shimmer {
              0% { background-position: -200% 0; }
              100% { background-position: 200% 0; }
            }
          `}</style>
        </div>
      )}

      {/* Stop Tooltip - shows when hovering stops in amenities view, stops tab, or SDV drill-down from routes/system tab at zoom >= 12 */}
      {(isAmenitiesView || activeTab === 'stops' || ((activeTab === 'routes' || activeTab === 'system') && selectedStopId)) && hoveredStop && hoveredStopCoords && viewState.zoom >= 12 && (() => {
        const hoveredStopData = stops.find(s => s.properties.stop_id === hoveredStop);
        const hoveredStopAmenities = stopAmenities[hoveredStop] || {};
        const amenitiesWithDates = Object.entries(hoveredStopAmenities)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          .filter(([_, value]) => value !== false)
          .map(([amenity]) => amenity);
        const ridership = stopValueMap.get(hoveredStop) || 0;

        if (!hoveredStopData) return null;
        // In amenities view, only show if there are amenities
        if (isAmenitiesView && amenitiesWithDates.length === 0) return null;

        const iconMap: { [key: string]: string } = {
          'Advertisement': '/icons/Advertisement.svg',
          'Bike Rack': '/icons/Bike-Rack.svg',
          'Lighting': '/icons/Lighting.svg',
          'Loud Speaker': '/icons/Loud-Speaker.svg',
          'Real-time Display': '/icons/Real-Time-Display.svg',
          'Seating': '/icons/Seating.svg',
          'Shelter': '/icons/Shelter.svg',
          'Tactile Paving': '/icons/Pavement.svg',
          'Trash Can': '/icons/Trash.svg',
          'Wheelchair Access': '/icons/Wheelchair.svg'
        };

        return (
          <div
            style={{
              position: 'fixed',
              left: hoveredStopCoords.x,
              top: hoveredStopCoords.y - 20,
              transform: 'translate(-50%, -100%)',
              backgroundColor: 'white',
              borderRadius: 'var(--radius-default)',
              boxShadow: 'var(--shadow-lg)',
              padding: '12px',
              zIndex: 10000,
              pointerEvents: 'none',
              minWidth: '120px',
              maxWidth: '200px'
            }}
          >
            {/* Stop Name */}
            <div
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: activeTab === 'stops' || amenitiesWithDates.length > 0 ? '2px' : '0',
                wordWrap: 'break-word',
                lineHeight: '16px'
              }}
            >
              {hoveredStopData.properties.name}
            </div>
            {/* Ridership - only in stops tab, not in amenities view */}
            {activeTab === 'stops' && !isAmenitiesView && (
              <div
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '12px',
                  color: 'var(--text-secondary)'
                }}
              >
                {ridership.toLocaleString()} {selectedMetric.toLowerCase()}
              </div>
            )}
            {/* Divider - above amenities */}
            {amenitiesWithDates.length > 0 && (
              <div
                style={{
                  height: '0.5px',
                  backgroundColor: 'var(--border-default)',
                  margin: '8px 0'
                }}
              />
            )}
            {/* Amenity Icons */}
            {amenitiesWithDates.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px'
                }}
              >
                {amenitiesWithDates.map((amenity) => (
                  <img
                    key={amenity}
                    src={iconMap[amenity]}
                    alt={amenity}
                    width="16"
                    height="16"
                    title={amenity}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Route Detail View Tooltip - shows stop/segment info when hovering on map in route detail view */}
      {selectedRouteId && !selectedTrip && (() => {
        // Stop tooltip in route detail view (for any metric)
        if (hoveredStop && hoveredStopCoords && viewState.zoom >= 12) {
          const hoveredStopData = stops.find(s => s.properties.stop_id === hoveredStop);
          if (!hoveredStopData) return null;

          // Get stop ridership from route stops data
          const stopMetrics = routeStopsRidership?.stops?.find(s => s.stopId === hoveredStop);
          const stopMetrics2 = routeStopsRidership2?.stops?.find(s => s.stopId === hoveredStop);

          const getStopMetricValue = (metrics: typeof stopMetrics): number => {
            if (!metrics) return 0;
            const value = selectedMetric === 'Maxload' ? metrics.maxLoad :
              selectedMetric === 'Average load' ? metrics.avgLoad :
              selectedMetric === 'Average daily boardings' ? metrics.avgDailyBoardings :
              selectedMetric === 'Total boardings' ? metrics.totalBoardings :
              selectedMetric === 'Average daily alightings' ? metrics.avgDailyAlightings :
              selectedMetric === 'Average daily activity' ? metrics.avgDailyActivity :
              selectedMetric === 'Total activity' ? metrics.totalActivity :
              metrics.avgDailyBoardings;
            return value ?? 0;
          };

          const ridership = getStopMetricValue(stopMetrics) || 0;
          const ridership2 = getStopMetricValue(stopMetrics2) || 0;

          // Calculate percent change for comparison mode
          let percentChange: number | null = null;
          if (comparisonMode && ridership2 > 0) {
            percentChange = Math.round(((ridership - ridership2) / ridership2) * 100);
            if (comparisonSwapped) percentChange = -percentChange;
          } else if (comparisonMode && ridership > 0) {
            percentChange = 100;
            if (comparisonSwapped) percentChange = -percentChange;
          }

          return (
            <div
              style={{
                position: 'fixed',
                left: hoveredStopCoords.x,
                top: hoveredStopCoords.y - 20,
                transform: 'translate(-50%, -100%)',
                backgroundColor: 'white',
                borderRadius: 'var(--radius-default)',
                boxShadow: 'var(--shadow-lg)',
                padding: '12px',
                zIndex: 10000,
                pointerEvents: 'none',
                minWidth: '120px',
                maxWidth: '240px'
              }}
            >
              <div
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: 'var(--text-secondary)',
                  marginBottom: '4px',
                  wordWrap: 'break-word',
                  lineHeight: '16px'
                }}
              >
                {hoveredStopData.properties.name}
              </div>
              {comparisonMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {/* Date-time 1 row with percent change pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: DATETIME_1_COLOR,
                      flexShrink: 0
                    }} />
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {(comparisonSwapped ? ridership2 : ridership).toLocaleString()}
                    </span>
                    {percentChange !== null && (
                      <span style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: percentChange > 0 ? POSITIVE_PILL_TEXT : percentChange < 0 ? NEGATIVE_PILL_TEXT : 'var(--text-secondary)',
                        backgroundColor: percentChange > 0 ? POSITIVE_PILL_BG : percentChange < 0 ? NEGATIVE_PILL_BG : 'var(--bg-secondary)',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        marginLeft: '8px'
                      }}>
                        {percentChange > 0 ? '+' : ''}{percentChange}%
                      </span>
                    )}
                  </div>
                  {/* Date-time 2 row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: DATETIME_2_COLOR,
                      flexShrink: 0
                    }} />
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {(comparisonSwapped ? ridership : ridership2).toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)'
                  }}
                >
                  {(ridership || 0).toLocaleString()} {selectedMetric.toLowerCase()}
                </div>
              )}
            </div>
          );
        }

        // Segment tooltip in route detail view (only for load metrics since segments only have load data)
        if (showSegmentColoring && hoveredSegment !== null && hoveredSegmentCoords && segmentGeoms[hoveredSegment]) {
          const seg = segmentGeoms[hoveredSegment];
          const fromStop = stops.find(s => s.properties.stop_id === seg.fromStopId);
          const toStop = stops.find(s => s.properties.stop_id === seg.toStopId);

          return (
            <div
              style={{
                position: 'fixed',
                left: hoveredSegmentCoords.x,
                top: hoveredSegmentCoords.y - 20,
                transform: 'translate(-50%, -100%)',
                backgroundColor: 'white',
                borderRadius: 'var(--radius-default)',
                boxShadow: 'var(--shadow-lg)',
                padding: '12px',
                zIndex: 10000,
                pointerEvents: 'none',
                minWidth: '140px',
                maxWidth: '240px'
              }}
            >
              {/* Stop connection diagram */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* From stop row */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
                  <div style={{ width: '6px', flexShrink: 0, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '5px', left: 0, width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'black', zIndex: 1 }} />
                    <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '8px', bottom: 0, width: '1px', backgroundColor: 'black' }} />
                  </div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)', wordWrap: 'break-word', lineHeight: '16px', flex: 1 }}>
                    {fromStop?.properties.name || seg.fromStopId}
                  </div>
                </div>
                {/* Spacer with connecting line */}
                <div style={{ height: '8px', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '3px', transform: 'translateX(-50%)', top: 0, bottom: 0, width: '1px', backgroundColor: 'black' }} />
                </div>
                {/* To stop row */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
                  <div style={{ width: '6px', flexShrink: 0, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 0, height: '8px', width: '1px', backgroundColor: 'black' }} />
                    <div style={{ position: 'absolute', top: '5px', left: 0, width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'black', zIndex: 1 }} />
                  </div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)', wordWrap: 'break-word', lineHeight: '16px', flex: 1 }}>
                    {toStop?.properties.name || seg.toStopId}
                  </div>
                </div>
              </div>
              {/* Load value */}
              <div style={{ marginTop: '8px', paddingLeft: '12px' }}>
                {comparisonMode ? (() => {
                  const segmentKey = `${seg.fromStopId}-${seg.toStopId}`;
                  const data1 = segmentLoadMapFromGrid?.get(segmentKey);
                  const data2 = segmentLoadMapFromGrid2?.get(segmentKey);
                  const value1 = data1 ? (selectedMetric === 'Maxload' ? data1.maxLoad : data1.avgLoad) : 0;
                  const value2 = data2 ? (selectedMetric === 'Maxload' ? data2.maxLoad : data2.avgLoad) : 0;

                  let percentChange: number | null = null;
                  if (value2 > 0) {
                    percentChange = Math.round(((value1 - value2) / value2) * 100);
                    if (comparisonSwapped) percentChange = -percentChange;
                  } else if (value1 > 0) {
                    percentChange = 100;
                    if (comparisonSwapped) percentChange = -percentChange;
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {/* Date-time 1 row with percent change pill */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: DATETIME_1_COLOR,
                          flexShrink: 0
                        }} />
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {(comparisonSwapped ? value2 : value1).toLocaleString()}
                        </span>
                        {percentChange !== null && (
                          <span style={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: percentChange > 0 ? POSITIVE_PILL_TEXT : percentChange < 0 ? NEGATIVE_PILL_TEXT : 'var(--text-secondary)',
                            backgroundColor: percentChange > 0 ? POSITIVE_PILL_BG : percentChange < 0 ? NEGATIVE_PILL_BG : 'var(--bg-secondary)',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            marginLeft: '8px'
                          }}>
                            {percentChange > 0 ? '+' : ''}{percentChange}%
                          </span>
                        )}
                      </div>
                      {/* Date-time 2 row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: DATETIME_2_COLOR,
                          flexShrink: 0
                        }} />
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {(comparisonSwapped ? value1 : value2).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })() : (
                  <div
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-primary)'
                    }}
                  >
                    {seg.loadValue.toLocaleString()} {selectedMetric.toLowerCase()}
                  </div>
                )}
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* Trip Detail View Tooltip - shows stop/segment info when hovering on map in trip detail view */}
      {selectedTrip && (() => {
        // Stop tooltip in trip detail view (for boarding metrics)
        if (!showSegmentColoring && hoveredStop && hoveredStopCoords && viewState.zoom >= 12) {
          const hoveredStopData = stops.find(s => s.properties.stop_id === hoveredStop);
          if (!hoveredStopData) return null;

          // Get stop ridership from trip-specific data
          const stopMetrics = tripData?.stops?.find(s => s.stopId === hoveredStop);
          const stopMetrics2 = tripData2?.stops?.find(s => s.stopId === hoveredStop);

          const getStopMetricValue = (metrics: typeof stopMetrics): number => {
            if (!metrics) return 0;
            const value = selectedMetric === 'Average daily boardings' ? metrics.avgDailyBoardings :
              selectedMetric === 'Total boardings' ? metrics.totalBoardings :
              selectedMetric === 'Average daily alightings' ? metrics.avgDailyAlightings :
              selectedMetric === 'Average daily activity' ? metrics.avgDailyActivity :
              selectedMetric === 'Total activity' ? metrics.totalActivity :
              metrics.avgDailyBoardings;
            return value ?? 0;
          };

          const ridership = getStopMetricValue(stopMetrics) || 0;
          const ridership2 = getStopMetricValue(stopMetrics2) || 0;

          // Calculate percent change for comparison mode
          let percentChange: number | null = null;
          if (comparisonMode && ridership2 > 0) {
            percentChange = Math.round(((ridership - ridership2) / ridership2) * 100);
            if (comparisonSwapped) percentChange = -percentChange;
          } else if (comparisonMode && ridership > 0) {
            percentChange = 100;
            if (comparisonSwapped) percentChange = -percentChange;
          }

          return (
            <div
              style={{
                position: 'fixed',
                left: hoveredStopCoords.x,
                top: hoveredStopCoords.y - 20,
                transform: 'translate(-50%, -100%)',
                backgroundColor: 'white',
                borderRadius: 'var(--radius-default)',
                boxShadow: 'var(--shadow-lg)',
                padding: '12px',
                zIndex: 10000,
                pointerEvents: 'none',
                minWidth: '120px',
                maxWidth: '240px'
              }}
            >
              <div
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: 'var(--text-secondary)',
                  marginBottom: '4px',
                  wordWrap: 'break-word',
                  lineHeight: '16px'
                }}
              >
                {hoveredStopData.properties.name}
              </div>
              {comparisonMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {/* Date-time 1 row with percent change pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: DATETIME_1_COLOR,
                      flexShrink: 0
                    }} />
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {(comparisonSwapped ? ridership2 : ridership).toLocaleString()}
                    </span>
                    {percentChange !== null && (
                      <span style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: percentChange > 0 ? POSITIVE_PILL_TEXT : percentChange < 0 ? NEGATIVE_PILL_TEXT : 'var(--text-secondary)',
                        backgroundColor: percentChange > 0 ? POSITIVE_PILL_BG : percentChange < 0 ? NEGATIVE_PILL_BG : 'var(--bg-secondary)',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        marginLeft: '8px'
                      }}>
                        {percentChange > 0 ? '+' : ''}{percentChange}%
                      </span>
                    )}
                  </div>
                  {/* Date-time 2 row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: DATETIME_2_COLOR,
                      flexShrink: 0
                    }} />
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {(comparisonSwapped ? ridership : ridership2).toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)'
                  }}
                >
                  {(ridership || 0).toLocaleString()} {selectedMetric.toLowerCase()}
                </div>
              )}
            </div>
          );
        }

        // Segment tooltip in trip detail view (only for load metrics)
        if (showSegmentColoring && hoveredSegment !== null && hoveredSegmentCoords && selectedTripStops[hoveredSegment] && selectedTripStops[hoveredSegment + 1]) {
          const fromStop = selectedTripStops[hoveredSegment];
          const toStop = selectedTripStops[hoveredSegment + 1];

          // Get segment data from trip-specific API data
          const tripSegment = tripData?.segments?.find(s => s.fromStopId === fromStop.id && s.toStopId === toStop.id);
          const tripSegment2 = tripData2?.segments?.find(s => s.fromStopId === fromStop.id && s.toStopId === toStop.id);

          const loadValue = tripSegment ? (selectedMetric === 'Maxload' ? tripSegment.maxLoad : tripSegment.avgLoad) : 0;
          const loadValue2 = tripSegment2 ? (selectedMetric === 'Maxload' ? tripSegment2.maxLoad : tripSegment2.avgLoad) : 0;

          // Calculate percent change for comparison mode
          let percentChange: number | null = null;
          if (comparisonMode && loadValue2 > 0) {
            percentChange = Math.round(((loadValue - loadValue2) / loadValue2) * 100);
            if (comparisonSwapped) percentChange = -percentChange;
          } else if (comparisonMode && loadValue > 0) {
            percentChange = 100;
            if (comparisonSwapped) percentChange = -percentChange;
          }

          return (
            <div
              style={{
                position: 'fixed',
                left: hoveredSegmentCoords.x,
                top: hoveredSegmentCoords.y - 20,
                transform: 'translate(-50%, -100%)',
                backgroundColor: 'white',
                borderRadius: 'var(--radius-default)',
                boxShadow: 'var(--shadow-lg)',
                padding: '12px',
                zIndex: 10000,
                pointerEvents: 'none',
                minWidth: '140px',
                maxWidth: '240px'
              }}
            >
              {/* Stop connection diagram */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* From stop row */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
                  <div style={{ width: '6px', flexShrink: 0, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '5px', left: 0, width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'black', zIndex: 1 }} />
                    <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '8px', bottom: 0, width: '1px', backgroundColor: 'black' }} />
                  </div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)', wordWrap: 'break-word', lineHeight: '16px', flex: 1 }}>
                    {fromStop.n}
                  </div>
                </div>
                {/* Spacer with connecting line */}
                <div style={{ height: '8px', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '3px', transform: 'translateX(-50%)', top: 0, bottom: 0, width: '1px', backgroundColor: 'black' }} />
                </div>
                {/* To stop row */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
                  <div style={{ width: '6px', flexShrink: 0, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 0, height: '8px', width: '1px', backgroundColor: 'black' }} />
                    <div style={{ position: 'absolute', top: '5px', left: 0, width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'black', zIndex: 1 }} />
                  </div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)', wordWrap: 'break-word', lineHeight: '16px', flex: 1 }}>
                    {toStop.n}
                  </div>
                </div>
              </div>
              {/* Load value */}
              <div style={{ marginTop: '8px', paddingLeft: '12px' }}>
                {comparisonMode ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {/* Date-time 1 row with percent change pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: DATETIME_1_COLOR,
                        flexShrink: 0
                      }} />
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {(comparisonSwapped ? loadValue2 : loadValue).toLocaleString()}
                      </span>
                      {percentChange !== null && (
                        <span style={{
                          fontFamily: 'Inter, sans-serif',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: percentChange > 0 ? POSITIVE_PILL_TEXT : percentChange < 0 ? NEGATIVE_PILL_TEXT : 'var(--text-secondary)',
                          backgroundColor: percentChange > 0 ? POSITIVE_PILL_BG : percentChange < 0 ? NEGATIVE_PILL_BG : 'var(--bg-secondary)',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          marginLeft: '8px'
                        }}>
                          {percentChange > 0 ? '+' : ''}{percentChange}%
                        </span>
                      )}
                    </div>
                    {/* Date-time 2 row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: DATETIME_2_COLOR,
                        flexShrink: 0
                      }} />
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {(comparisonSwapped ? loadValue : loadValue2).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-primary)'
                    }}
                  >
                    {loadValue.toLocaleString()} {selectedMetric.toLowerCase()}
                  </div>
                )}
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* Capture Bookmark Button */}
      <button
          onClick={async () => {
            // Show scrim and modal simultaneously - no delay
            setIsCapturingBookmark(true);
            setIsSaveBookmarkModalOpen(true);

            // Allow React to render both scrim and modal before starting capture
            await new Promise(resolve => setTimeout(resolve, 0));

            try {
              const map = mapRef.current?.getMap();
              if (!map) throw new Error('No map instance');

              // Save current view state to restore after capture
              const originalViewState = { ...viewState };

              // Calculate bounds for current selection
              let bounds: LngLatBoundsLike | null = null;
              if (selectedRouteId) {
                const routeShapes = shapes.filter(shape => shape.properties.route_id === selectedRouteId);
                if (routeShapes.length > 0) {
                  bounds = calculateBounds(routeShapes);
                }
              } else if (selectedStopId) {
                const stop = stops.find(s => s.properties.stop_id === selectedStopId);
                if (stop) {
                  const [lng, lat] = stop.geometry.coordinates;
                  bounds = [[lng - 0.01, lat - 0.01], [lng + 0.01, lat + 0.01]] as LngLatBoundsLike;
                }
              } else {
                // System view - fit to all shapes
                if (shapes.length > 0) {
                  bounds = calculateBounds(shapes);
                }
              }

              // If we have bounds, fit to them and wait for render
              if (bounds) {
                const el = mapContainerRef.current;
                const width = el?.clientWidth ?? window.innerWidth;
                const height = el?.clientHeight ?? window.innerHeight;
                const fittedView = fitToBounds(bounds, { width, height });

                if (fittedView) {
                  // Jump to fitted view instantly (no transition)
                  setViewState({
                    ...fittedView,
                    transitionDuration: 0
                  });

                  // Wait for map to finish rendering
                  await new Promise<void>((resolve) => {
                    const onIdle = () => {
                      map.off('idle', onIdle);
                      resolve();
                    };
                    map.on('idle', onIdle);
                    // Fallback timeout in case idle doesn't fire
                    setTimeout(() => {
                      map.off('idle', onIdle);
                      resolve();
                    }, 500);
                  });
                }
              }

              // Now capture the screenshot
              const mapCanvas = map.getCanvas();
              const container = mapContainerRef.current;
              const deckCanvas = container?.querySelector('canvas:not(.mapboxgl-canvas)') as HTMLCanvasElement | null;

              // The data panel takes up the left side of the screen
              // NavRail: 60px (AI) or 72px (default), Filters panel: 256px (when open), Data panel: 376px, gaps: 12px each
              const dpr = window.devicePixelRatio || 1;
              const navRailWidth = aiMode ? 60 : 72;
              const filtersPanelWidth = isFiltersPanelOpen ? 256 : 0;
              const dataPanelWidth = 376;
              const gaps = 12 + (isFiltersPanelOpen ? 12 : 0); // gap after nav rail + gap after filters if open
              const totalPanelWidth = (navRailWidth + filtersPanelWidth + dataPanelWidth + gaps) * dpr;

              // Calculate the visible map area (right of the panel)
              const visibleMapLeft = totalPanelWidth;
              const visibleMapWidth = mapCanvas.width - totalPanelWidth;
              const visibleMapHeight = mapCanvas.height;

              // Capture the entire canvas (the floating panel will cover the left side anyway)
              const cropX = 0;
              const cropY = 0;
              const cropWidth = mapCanvas.width;
              const cropHeight = mapCanvas.height;
              // Output at same aspect ratio, scaled to reasonable size
              const maxDimension = 1920;
              const scale = Math.min(maxDimension / cropWidth, maxDimension / cropHeight, 1);
              const outputWidth = Math.round(cropWidth * scale);
              const outputHeight = Math.round(cropHeight * scale);

              const compositeCanvas = document.createElement('canvas');
              compositeCanvas.width = outputWidth;
              compositeCanvas.height = outputHeight;
              const ctx = compositeCanvas.getContext('2d');
              if (!ctx) throw new Error('Could not get 2d context');

              // Draw cropped Mapbox canvas first (base map)
              ctx.drawImage(
                mapCanvas,
                cropX, cropY, cropWidth, cropHeight,
                0, 0, outputWidth, outputHeight
              );

              // Draw cropped DeckGL canvas on top (routes/stops overlay)
              if (deckCanvas) {
                ctx.drawImage(
                  deckCanvas,
                  cropX, cropY, cropWidth, cropHeight,
                  0, 0, outputWidth, outputHeight
                );
              }

              const dataUrl = compositeCanvas.toDataURL('image/jpeg', 0.8);
              setPendingBookmarkImage(dataUrl);

              // Restore original view state
              setViewState({
                ...originalViewState,
                transitionDuration: 0
              });
            } catch (err) {
              console.error('Failed to capture map screenshot:', err);
              setPendingBookmarkImage(null);
            }
          }}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-elevated)',
            border: '0.5px solid var(--border-default)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            boxShadow: 'var(--shadow-sm)',
            transition: 'background-color 0.15s ease, transform 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          aria-label="Create Bookmark"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.0001 18.2211L7.97337 19.9434C7.21504 20.2625 6.49604 20.1992 5.81637 19.7534C5.13671 19.3077 4.79688 18.677 4.79688 17.8614V5.07163C4.79688 4.44196 5.01863 3.90538 5.46213 3.46188C5.90563 3.01838 6.44221 2.79663 7.07188 2.79663H11.8326C12.152 2.79663 12.4214 2.90638 12.6409 3.12588C12.8604 3.34555 12.9701 3.61496 12.9701 3.93413C12.9701 4.2533 12.8604 4.52271 12.6409 4.74238C12.4214 4.96188 12.152 5.07163 11.8326 5.07163H7.07188V17.8424L12.0001 15.7281L16.9284 17.8424V12.1254C16.9284 11.8062 17.0381 11.5369 17.2576 11.3174C17.4773 11.0977 17.7467 10.9879 18.0659 10.9879C18.385 10.9879 18.6545 11.0977 18.8741 11.3174C19.0936 11.5369 19.2034 11.8062 19.2034 12.1254V17.8614C19.2034 18.677 18.8635 19.3077 18.1839 19.7534C17.5042 20.1992 16.7852 20.2625 16.0269 19.9434L12.0001 18.2211ZM12.0001 5.07163H7.07188H12.9701H12.0001ZM16.9701 6.98788H16.0599C15.7512 6.98788 15.4925 6.88213 15.2836 6.67063C15.0746 6.45896 14.9701 6.19955 14.9701 5.89238C14.9701 5.58505 15.076 5.32655 15.2876 5.11688C15.4993 4.90738 15.7587 4.80263 16.0659 4.80263H16.9701V3.89238C16.9701 3.58355 17.076 3.32471 17.2876 3.11588C17.4993 2.90705 17.7587 2.80263 18.0659 2.80263C18.3732 2.80263 18.6316 2.90705 18.8411 3.11588C19.0508 3.32471 19.1556 3.58355 19.1556 3.89238V4.80263H20.0659C20.3745 4.80263 20.6334 4.90705 20.8424 5.11588C21.0512 5.32471 21.1556 5.58355 21.1556 5.89238C21.1556 6.19955 21.0512 6.45896 20.8424 6.67063C20.6334 6.88213 20.3745 6.98788 20.0659 6.98788H19.1556V7.89813C19.1556 8.20696 19.0512 8.4658 18.8424 8.67463C18.6334 8.88346 18.3745 8.98788 18.0659 8.98788C17.7587 8.98788 17.4993 8.88213 17.2876 8.67063C17.076 8.45896 16.9701 8.19955 16.9701 7.89238V6.98788Z" fill="currentColor"/>
          </svg>
      </button>

      {/* Map Scale - hide in amenities view since we're not showing map data */}
      {(routeValueRange.max > 0 || stopValueRange.max > 0) && !isAmenitiesView && (
        <MapScale
          title={comparisonMode ? `Change in ${scaleTitle.toLowerCase()}` : scaleTitle}
          min={comparisonMode
            ? (showSegmentColoring
                ? (selectedTrip ? tripSegmentComparisonRange.min : segmentComparisonRange.min)
                : (selectedTrip
                    ? tripStopComparisonRange.min
                    : ((selectedRouteId || activeTab === 'stops') ? stopComparisonRange.min : routeComparisonRange.min)))
            : ((selectedRouteId || activeTab === 'stops') ? stopValueRange.min : routeValueRange.min)}
          max={comparisonMode
            ? (showSegmentColoring
                ? (selectedTrip ? tripSegmentComparisonRange.max : segmentComparisonRange.max)
                : (selectedTrip
                    ? tripStopComparisonRange.max
                    : ((selectedRouteId || activeTab === 'stops') ? stopComparisonRange.max : routeComparisonRange.max)))
            : ((selectedRouteId || activeTab === 'stops') ? stopValueRange.max : routeValueRange.max)}
          comparisonMode={comparisonMode}
        />
      )}

      {/* Data Panel */}
      <div style={{
        position: 'fixed',
        top: '12px',
        bottom: '12px',
        left: isStoryPanelVisible
          ? (aiMode ? '72px' : '84px')
          : (isFiltersPanelOpen && !isInsightsView) ? (aiMode ? '328px' : '340px') : (aiMode ? '72px' : '84px'),
        width: isStoryPanelVisible
          ? '432px'
          : isFullWidthPanel
            ? `calc(100% - ${(isFiltersPanelOpen && !isInsightsView) ? (aiMode ? '328px' : '340px') : (aiMode ? '72px' : '84px')} - 12px)`
            : '376px',
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '0 28px 28px 0',
        padding: (isInsightsView || isStoryPanelVisible) ? '0' : '0 16px 0 16px',
        fontFamily: 'Inter, sans-serif',
        zIndex: (isFullWidthPanel || isStoryPanelVisible) ? 2000 : 1001,
        overflowX: 'hidden',
        transition: `left ${'350ms'} ease-in-out, width ${'350ms'} ease-in-out`,
        border: '0.5px solid var(--border-default)',
        borderLeft: 'none',
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Open Filters Pill - shown when filters panel is closed and not in insights/story view */}
        {!isFiltersPanelOpen && !isInsightsView && !isStoryPanelVisible && (
          <button
            onClick={() => setIsFiltersPanelOpen(true)}
            style={{
              flexShrink: 0,
              width: '100%',
              height: '36px',
              marginTop: '12px',
              marginBottom: '4px',
              backgroundColor: 'var(--accent-ui-subtle)',
              color: 'var(--accent-ui-text)',
              border: 'none',
              borderRadius: '100px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor" style={{ position: 'absolute', left: '16px' }}>
              <path d="M500-592v224q0 14 12 19t22-5l98-98q12-12 12-28t-12-28l-98-98q-10-10-22-5t-12 19ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm120-80v-560H200v560h120Zm80 0h360v-560H400v560Zm-80 0H200h120Z"/>
            </svg>
            {getDateFilterText()} · {getDaysFilterText()}
          </button>
        )}

        {/* Content wrapper with fade transition */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          opacity: isTabContentHidden ? 0 : 1,
          transition: 'opacity 150ms ease',
        }}>
        {/* Story Mode Panel */}
        {isStoryPanelVisible ? (
          <StoryModePanel
            insight={storyModeInsight!}
            stepIndex={storyModeStepIndex}
            onStepChange={(index: number) => {
              setStoryModeStepIndex(index);
              applyWalkthroughStep(storyModeInsight!.walkthrough![index].filters, { skipTab: true });
            }}
            onClose={handleStoryModeClose}
            isContentHidden={isTabContentHidden}
            onMetricChange={(metric: string) => setSelectedMetric(metric)}
          />
        ) : isInsightsView ? (
          <InsightsPanel
            data={insightsData}
            isLoading={insightsLoading}
            error={insightsError}
            onClose={() => setActiveTab('system')}
            onAnalyze={handleAnalyzeInsight}
            onGenerate={generateInsights}
            onRefresh={refetchInsights}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            chatTitle={chatTitle}
            setChatTitle={setChatTitle}
            chatConvoId={chatConvoId}
            setChatConvoId={setChatConvoId}
          />
        ) : selectedTrip ? (
          /* Trip Detail View */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: isFiltersPanelOpen ? '20px' : '8px' }}>
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
              setSelectedBoardingStop(null);
              setHoveredSegment(null);
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

            {/* Summary/Trips/Grid Tabs - Show in trip detail view to allow navigation back */}
            {!experimentalDetailViewNav && (
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
                      onClick={() => {
                        // Clear trip selection and navigate to the selected tab
                        setSelectedTrip(null);
                        setSelectedTripStops([]);
                        setIsTripContentScrolled(false);
                        setSelectedBoardingStop(null);
                        setHoveredSegment(null);
                        setSelectedRouteTab(tab);

                        // Handle grid transition
                        if (tab === 'Grid') {
                          setIsGridTransitioning(true);
                          setTimeout(() => setIsGridTransitioning(false), 300);
                        }
                      }}
                      style={{
                        position: 'relative',
                        padding: '12px 0',
                        border: 'none',
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 'var(--data-small-size)',
                        fontWeight: 'var(--data-small-weight)',
                        color: tab === 'Trips' ? 'var(--accent-ui-text)' : 'var(--text-disabled)',
                        lineHeight: 'var(--data-small-line-height)',
                        transition: 'color 0.2s ease'
                      }}
                    >
                      {tab}
                      {/* Underline indicator - Trips is active when viewing a trip */}
                      {tab === 'Trips' && (
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
            )}

            {/* Divider - only shown when scrolled (for experimental mode) */}
            {experimentalDetailViewNav && (
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
            )}

            {/* Trip Content */}
            <div
              style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: '24px', marginRight: '-8px', paddingRight: '8px' }}
              onScroll={(e) => {
                const target = e.target as HTMLDivElement;
                setIsTripContentScrolled(target.scrollTop > 0);
              }}
            >
              {/* Overall Trip Metric Card */}
              {comparisonMode ? (
                (() => {
                  const value1 = tripRidershipValue;
                  // Use actual trip-specific comparison data from tripData2
                  const value2 = tripData2?.metrics ? getMetricValue(tripData2.metrics, selectedMetric) : 0;
                  return (
                    <ComparisonMetricCard
                      title={selectedMetric}
                      value1={value1}
                      value2={value2}
                      swapped={comparisonSwapped}
                      loading={!!isTripComparisonLoading}
                    />
                  );
                })()
              ) : (
                <MetricCard
                  title={selectedMetric}
                  value={tripRidershipValue}
                />
              )}

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
                    // Build a map of fromStopId -> loadValue using trip-specific API data when available
                    const segmentLoadMap = new Map<string, number>();

                    // Use trip-specific segment data from API if available
                    if (tripData?.segments && tripData.segments.length > 0) {
                      tripData.segments.forEach(seg => {
                        const loadValue = selectedMetric === 'Maxload' ? seg.maxLoad : seg.avgLoad;
                        segmentLoadMap.set(seg.fromStopId, loadValue);
                      });
                    } else {
                      // Fall back to route-level segment data
                      segmentGeoms.forEach(seg => {
                        segmentLoadMap.set(seg.fromStopId, seg.loadValue);
                      });
                    }

                    return (
                      <div style={{ position: 'relative' }}>
                        {/* Stops */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          {selectedTripStops.map((stop, index) => {
                            const isLastStop = index === selectedTripStops.length - 1;
                            // Get the segment load value (load for segment starting at this stop)
                            const segmentLoad = segmentLoadMap.get(stop.id) || 0;

                            // Get segment percent change for comparison mode
                            // Key format is fromStopId-toStopId
                            const nextStop = !isLastStop ? selectedTripStops[index + 1] : null;
                            const segmentKey = nextStop ? `${stop.id}-${nextStop.id}` : '';
                            const segmentPercentChange = segmentKey ? (tripSegmentComparisonMap.get(segmentKey) || 0) : 0;

                            // Use comparison colors in comparison mode, otherwise normal colors
                            // For trip detail view, use tripSegmentComparisonRange for proper color scaling
                            const segmentColor = comparisonMode
                              ? getComparisonColorRGB(segmentPercentChange, tripSegmentComparisonRange.min, tripSegmentComparisonRange.max)
                              : valueToColor(segmentLoad, segmentValueRange.min, segmentValueRange.max);

                            const isSelected = hoveredSegment === index;

                            // Determine if this stop should be dimmed (not part of selected segment)
                            const isStopDimmed = hoveredSegment !== null && index !== hoveredSegment && index !== hoveredSegment + 1;
                            // Fade to light gray instead of using opacity
                            const stopCircleColor = isStopDimmed ? 'rgb(180, 180, 180)' : 'black';

                            return (
                              <div
                                key={index}
                                ref={(el) => {
                                  if (el && !isLastStop) {
                                    selectedSegmentRefs.current.set(index, el);
                                  } else {
                                    selectedSegmentRefs.current.delete(index);
                                  }
                                }}
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
                                    height: 'calc(100% + 20px + 14.5px)',
                                    backgroundColor: `rgba(${segmentColor.slice(0, 3).join(',')}, 0.31)`,
                                    borderRadius: '14px',
                                    zIndex: 0
                                  }} />
                                )}
                                {/* Colored segment line to next stop - positioned absolutely */}
                                {!isLastStop && (
                                  <div style={{
                                    position: 'absolute',
                                    left: '4px',
                                    top: '10.5px',
                                    width: '9px',
                                    height: 'calc(100% + 20px)',
                                    backgroundColor: `rgb(${segmentColor.slice(0, 3).join(',')})`,
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
                                  backgroundColor: stopCircleColor,
                                  border: '2.5px solid white',
                                  flexShrink: 0,
                                  zIndex: 1,
                                  marginTop: '2px',
                                  transition: 'background-color 0.2s'
                                }} />

                                {/* Stop Info */}
                                <div style={{ flex: 1, minWidth: 0, marginTop: '2px' }}>
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
                                      fontSize: '14px',
                                      transition: 'color 0.2s',
                                      flexShrink: 0,
                                      whiteSpace: 'nowrap'
                                    }}>{formatTime12Hour(stop.t)}</span>
                                  </div>
                                  {/* Hide load for last stop - no segment after it */}
                                  {!isLastStop && (
                                    <div style={{
                                      fontSize: 'var(--data-medium-size)',
                                      fontWeight: 'var(--data-medium-weight)',
                                      color: hoveredSegment !== null && index !== hoveredSegment ? 'var(--text-disabled)' : 'var(--text-primary)',
                                      marginTop: '4px',
                                      lineHeight: '1',
                                      transition: 'color 0.2s'
                                    }}>
                                      {comparisonMode
                                        ? `${segmentPercentChange > 0 ? '+' : ''}${segmentPercentChange}%`
                                        : segmentLoad}
                                    </div>
                                  )}
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
                  (() => {
                    // Build trip-specific stop values from API data when available
                    const tripStopValueMap = new Map<string, number>();
                    if (tripData?.stops && tripData.stops.length > 0) {
                      tripData.stops.forEach(s => {
                        let value: number;
                        switch (selectedMetric) {
                          case 'Average daily boardings':
                            value = s.avgDailyBoardings;
                            break;
                          case 'Total boardings':
                            value = s.totalBoardings;
                            break;
                          case 'Average daily alightings':
                            value = s.avgDailyAlightings;
                            break;
                          case 'Average daily activity':
                            value = s.avgDailyActivity;
                            break;
                          case 'Total activity':
                            value = s.totalActivity;
                            break;
                          default:
                            value = s.avgDailyBoardings;
                        }
                        tripStopValueMap.set(s.stopId, value);
                      });
                    }

                    return (
                      <div style={{ position: 'relative' }}>
                        {/* Vertical beige line */}
                        <div style={{
                          position: 'absolute',
                          left: '8px',
                          top: '12px',
                          height: selectedTripStops.length > 1 ? `calc(100% - 12px - 32px)` : '0px',
                          width: '4px',
                          backgroundColor: 'var(--border-default)'
                        }} />

                        {/* Stops */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          {selectedTripStops.map((stop, index) => {
                            // Use trip-specific stop value from API, fall back to stopValueMap
                            const stopValue = tripStopValueMap.get(stop.id) ?? stopValueMap.get(stop.id) ?? 0;

                        // Get comparison percent change for this stop
                        // Use trip-specific comparison map only (don't fall back to stopComparisonMap
                        // as it would compare trip-specific values with system-wide values)
                        const stopPercentChange = tripStopComparisonMap.get(stop.id) ?? 0;

                        // Use comparison colors in comparison mode, otherwise normal colors
                        const stopColor = comparisonMode
                          ? getComparisonColorRGB(stopPercentChange, comparisonValueRange.min, comparisonValueRange.max)
                          : valueToColor(stopValue, stopValueRange.min, stopValueRange.max);

                        const isStopSelected = selectedBoardingStop === stop.id;

                        // Fade color by blending towards a light gray instead of using opacity
                        const fadedStopColor = selectedBoardingStop !== null && !isStopSelected
                          ? stopColor.map(c => Math.round(c + (230 - c) * 0.6)) // Blend 60% towards light gray (230)
                          : stopColor;

                        return (
                          <div
                            key={index}
                            ref={(el) => {
                              if (el) {
                                selectedStopRefs.current.set(stop.id, el);
                              } else {
                                selectedStopRefs.current.delete(stop.id);
                              }
                            }}
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
                                  backgroundColor: `rgba(${stopColor.slice(0, 3).join(',')}, 0.5)`,
                                  zIndex: 0,
                                  marginTop: '1px'
                                }} />
                              )}
                              {/* Stop Circle - colored with white border and center dot */}
                              <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                backgroundColor: `rgb(${fadedStopColor.join(',')})`,
                                border: '2px solid white',
                                zIndex: 1,
                                marginTop: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                                transition: 'background-color 0.2s'
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
                            <div style={{ flex: 1, minWidth: 0, marginTop: '2px' }}>
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
                                  fontSize: '14px',
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
                                {comparisonMode
                                  ? `${stopPercentChange > 0 ? '+' : ''}${stopPercentChange}%`
                                  : stopValue}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
            </div>
          </div>
        ) : selectedStopId ? (
          /* Stop Detail View (SDV) */
          (() => {
            // Get amenities for the selected stop
            const selectedStopAmenities = stopAmenities[selectedStopId] || {};
            const amenitiesList = STOP_AMENITIES.filter(amenity => selectedStopAmenities[amenity]);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: isFiltersPanelOpen ? '20px' : '8px' }}>
                {/* Back Button and Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginTop: '0px',
                  marginBottom: '4px',
                  flexShrink: 0,
                  position: 'relative'
                }}>
                  {/* Left side: Back button and Stop name */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ cursor: 'pointer', marginTop: '4px', flexShrink: 0 }}
                      onClick={() => {
                        setIsStopDropdownOpen(false);

                        // Pop from navigation stack
                        if (navigationStack.length > 0) {
                          const prevContext = navigationStack[navigationStack.length - 1];
                          setNavigationStack(prev => prev.slice(0, -1));

                          if (prevContext.type === 'route') {
                            setSelectedStopId(null);
                            setSelectedStopTab('Summary');
                            setSelectedRouteId(prevContext.routeId);
                            setSelectedRouteTab(prevContext.routeTab);
                          } else {
                            // prevContext.type === 'stop'
                            setSelectedStopId(prevContext.stopId);
                            setSelectedStopTab(prevContext.stopTab);
                          }
                        } else {
                          // No stack - just close SDV
                          setSelectedStopId(null);
                          setSelectedStopTab('Summary');
                        }
                      }}
                    >
                      <path d="M3.80773 13.7071C3.41721 14.0976 2.78419 14.0976 2.39367 13.7071C2.00323 13.3166 2.00318 12.6835 2.39367 12.293L6.63684 8.05086L2.39367 3.80769C2.00328 3.41716 2.00319 2.78411 2.39367 2.39363C2.78416 2.00323 3.41723 2.00326 3.80773 2.39363L8.0509 6.6368L12.2931 2.39363C12.6836 2.00325 13.3167 2.00323 13.7071 2.39363C14.0976 2.78412 14.0976 3.41716 13.7071 3.80769L9.46496 8.05086L13.7071 12.293C14.0976 12.6835 14.0976 13.3166 13.7071 13.7071C13.3166 14.0976 12.6836 14.0976 12.2931 13.7071L8.0509 9.46492L3.80773 13.7071Z" fill="currentColor"/>
                    </svg>
                    <div
                      ref={stopNameRef}
                      className="data-small"
                      style={{
                        color: 'var(--text-secondary)',
                        cursor: !isFiltersPanelOpen ? 'pointer' : 'default'
                      }}
                      onClick={(e) => {
                        if (!isFiltersPanelOpen && !filterPanelJustClosedRef.current && stopNameRef.current) {
                          e.stopPropagation();
                          if (!isStopDropdownOpen) {
                            const rect = stopNameRef.current.getBoundingClientRect();
                            setStopDropdownPosition({
                              top: rect.bottom + 8,
                              left: rect.left
                            });
                          }
                          setIsStopDropdownOpen(!isStopDropdownOpen);
                        }
                      }}
                    >
                      {stopsList.find((s) => s.id === selectedStopId)?.name || 'Stop'}
                    </div>
                    {!isFiltersPanelOpen && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          marginTop: '6px',
                          flexShrink: 0
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (filterPanelJustClosedRef.current) return;
                          if (!isStopDropdownOpen && stopNameRef.current) {
                            const rect = stopNameRef.current.getBoundingClientRect();
                            setStopDropdownPosition({
                              top: rect.bottom + 8,
                              left: rect.left
                            });
                          }
                          setIsStopDropdownOpen(!isStopDropdownOpen);
                        }}
                      >
                        <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
                      </svg>
                    )}
                  </div>
                  {/* Stop Dropdown - uses menuOnly mode with portal */}
                  <SearchableSelect
                    menuOnly
                    isOpen={isStopDropdownOpen && !isFiltersPanelOpen}
                    onClose={() => setIsStopDropdownOpen(false)}
                    menuPosition={stopDropdownPosition || undefined}
                    value={selectedStopId}
                    onChange={(value) => {
                      setSelectedStopId(value);
                      setIsStopDropdownOpen(false);
                    }}
                    options={stopsList.map(stop => ({
                      value: stop.id,
                      label: stop.name
                    }))}
                    searchPlaceholder="Search stops..."
                    maxHeight={300}
                  />
                </div>

                {/* Scroll-based divider */}
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
                    opacity: isRouteContentScrolled ? 1 : 0,
                    transition: 'opacity 0.2s ease'
                  }} />
                </div>

                {/* Stop Content - Summary or Amenities */}
                {selectedStopTab === 'Summary' ? (
                  <div
                    style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingTop: '0px', paddingBottom: '24px', marginRight: '-8px', paddingRight: '8px' }}
                    onScroll={(e) => {
                      const target = e.target as HTMLDivElement;
                      setIsRouteContentScrolled(target.scrollTop > 0);
                    }}
                  >
                    {comparisonMode ? (
                      (() => {
                        const value1 = stopsList.find((s) => s.id === selectedStopId)?.value || 0;
                        const value2 = stopComparisonValueMap.get(selectedStopId || '') || 0;
                        return (
                          <ComparisonMetricCard
                            title={selectedMetric}
                            value1={value1}
                            value2={value2}
                            swapped={comparisonSwapped}
                            loading={isComparisonDataLoading}
                          />
                        );
                      })()
                    ) : (
                      <MetricCard
                        title={selectedMetric}
                        value={stopsList.find((s) => s.id === selectedStopId)?.value || 0}
                        loading={isActiveByPeriodLoading}
                      />
                    )}
                    <ByRouteChart
                      data={(stopData?.byRoute || []).map(r => ({
                        routeId: r.routeId,
                        routeName: r.routeName,
                        value: selectedMetric === 'Average daily boardings' ? r.metrics.avgDailyBoardings : selectedMetric === 'Average daily alightings' ? r.metrics.avgDailyAlightings : r.metrics.avgDailyActivity,
                        percentOfStop: r.percentOfStop
                      }))}
                      metric={selectedMetric}
                      loading={isStopDataLoading}
                    />
                    <ByDateChart
                      data={activeDataByDate}
                      comparisonData={comparisonMode ? activeComparisonDataByDate : undefined}
                      gradientId="colorValueStop"
                      metric={selectedMetric}
                      startDate={effectiveDateRange.start}
                      endDate={effectiveDateRange.end}
                      comparisonStartDate={comparisonDateRange.start}
                      comparisonEndDate={comparisonDateRange.end}
                      swapped={comparisonSwapped}
                      loading={isActiveByDateLoading}
                    />
                    <ByDayChart
                      data={activeDataByDay}
                      comparisonData={comparisonMode ? activeComparisonDataByDay : undefined}
                      metric={selectedMetric}
                      selectedDays={effectiveSelectedDays}
                      swapped={comparisonSwapped}
                      loading={isActiveByDayLoading}
                    />
                    <ByPeriodChart
                      data={activeDataByPeriod}
                      comparisonData={comparisonMode ? activeComparisonDataByPeriod : undefined}
                      colors={PERIOD_COLORS}
                      activePieIndex={activePieIndex}
                      setActivePieIndex={setActivePieIndex}
                      metric={selectedMetric}
                      swapped={comparisonSwapped}
                      selectedPeriods={effectiveSelectedPeriods}
                      loading={isActiveByPeriodLoading}
                    />
                  </div>
                ) : (
                  /* Amenities View */
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Static divider - fixed at top */}
                    <div style={{
                      width: 'calc(100% + 16px)',
                      marginLeft: '-16px',
                      height: '0.5px',
                      backgroundColor: 'var(--border-default)',
                      flexShrink: 0
                    }} />
                    {/* Scrollable content */}
                    <div
                      style={{
                        flex: 1,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        paddingBottom: '24px',
                        marginRight: '-8px',
                        paddingRight: '8px'
                      }}
                    >
                      {/* Amenity Count */}
                      <div
                        className="data-small"
                        style={{
                          color: 'var(--text-secondary)',
                          height: '44px',
                          display: 'flex',
                          alignItems: 'center',
                          flexShrink: 0
                        }}
                      >
                        {amenitiesList.length} {amenitiesList.length === 1 ? 'Amenity' : 'Amenities'}
                      </div>
                      {amenitiesList.length === 0 ? (
                        <div style={{
                          padding: '24px',
                          textAlign: 'center',
                          color: 'var(--text-tertiary)',
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 'var(--body-size)'
                        }}>
                          No amenities available for this stop
                        </div>
                      ) : (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}>
                          {amenitiesList.map((amenity) => {
                            const addedDate = selectedStopAmenities[amenity];
                            // Amenity icon mapping - uses custom SVG icons
                            const getAmenityIcon = (name: string) => {
                              const iconMap: { [key: string]: string } = {
                                'Advertisement': '/icons/Advertisement.svg',
                                'Bike Rack': '/icons/Bike-Rack.svg',
                                'Lighting': '/icons/Lighting.svg',
                                'Loud Speaker': '/icons/Loud-Speaker.svg',
                                'Real-time Display': '/icons/Real-Time-Display.svg',
                                'Seating': '/icons/Seating.svg',
                                'Shelter': '/icons/Shelter.svg',
                                'Tactile Paving': '/icons/Pavement.svg',
                                'Trash Can': '/icons/Trash.svg',
                                'Wheelchair Access': '/icons/Wheelchair.svg'
                              };

                              const iconPath = iconMap[name];
                              if (iconPath) {
                                return <img src={iconPath} alt={name} width="20" height="20" />;
                              }

                              // Fallback icon for unknown amenities
                              return (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M12 8v4" />
                                  <path d="M12 16h.01" />
                                </svg>
                              );
                            };

                            return (
                              <div
                                key={amenity}
                                style={{
                                  backgroundColor: 'var(--bg-elevated)',
                                  borderRadius: 'var(--radius-default)',
                                  boxShadow: 'inset 0 0 0 var(--border-width) var(--border-default)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  padding: '16px'
                                }}
                              >
                                {/* Amenity Icon */}
                                <div style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '50%',
                                  backgroundColor: 'var(--bg-primary)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  color: 'var(--text-secondary)'
                                }}>
                                  {getAmenityIcon(amenity)}
                                </div>
                                {/* Amenity Name and Date */}
                                <div style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '2px'
                                }}>
                                  <div style={{
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'var(--text-primary)'
                                  }}>
                                    {amenity}
                                  </div>
                                  {addedDate && (
                                    <div style={{
                                      fontFamily: 'Inter, sans-serif',
                                      fontSize: '12px',
                                      color: 'var(--text-tertiary)'
                                    }}>
                                      Added {addedDate}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        ) : selectedRouteId ? (
          /* Route Detail View (RDV) */
          (() => {
            // Grid size configuration - defined at top level so it's available for shadow divider
            const gridSizeConfig = {
              large: { cellWidth: 90, cellHeight: 48, labelWidth: 280, timeFont: 14, ampmFont: 12, labelFont: 14, dataFont: 16 },
              medium: { cellWidth: 74, cellHeight: 44, labelWidth: 260, timeFont: 13, ampmFont: 11, labelFont: 13, dataFont: 14 },
              small: { cellWidth: 64, cellHeight: 40, labelWidth: 240, timeFont: 12, ampmFont: 10, labelFont: 12, dataFont: 13 }
            };
            const config = gridSizeConfig[gridSize];
            const LABEL_WIDTH = config.labelWidth;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: isFiltersPanelOpen ? '20px' : '8px', position: 'relative' }}>
                {/* Pattern headsign - positioned in header area, centered over grid section */}
                {selectedRouteTab === 'Grid' && currentGridPatternHeadsign && (
              <div style={{
                position: 'absolute',
                top: experimentalDetailViewNav ? '20px' : '32px',
                left: '280px',
                right: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: 40,
                opacity: isGridTransitioning ? 0 : 1,
                transition: isGridTransitioning ? 'none' : 'opacity 150ms ease-in-out 300ms'
              }}>
                <div
                  ref={gridHeadsignRef}
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 'var(--data-3-size)',
                    fontWeight: 600,
                    lineHeight: 'var(--data-3-line-height)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  {currentGridPatternHeadsign}
                </div>
                {/* Grid sizing controls - positioned to the right */}
                <div style={{
                  position: 'absolute',
                  right: '0px',
                  display: 'flex',
                  gap: '8px',
                  pointerEvents: 'auto'
                }}>
                  {/* Decrease size button */}
                  <button
                    onClick={() => {
                      if (gridSize === 'large') setGridSize('medium');
                      else if (gridSize === 'medium') setGridSize('small');
                    }}
                    disabled={gridSize === 'small'}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: gridSize === 'small' ? 'not-allowed' : 'pointer',
                      backgroundColor: 'transparent',
                      borderWidth: 'var(--border-width)',
                      borderStyle: 'solid',
                      borderColor: 'transparent',
                      opacity: gridSize === 'small' ? 0.5 : 1,
                      transition: 'all 0.2s ease',
                      padding: 0
                    }}
                    onMouseEnter={(e) => {
                      if (gridSize !== 'small') {
                        e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                        e.currentTarget.style.borderColor = 'var(--border-default)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1.05084 9.05009C0.498554 9.05009 0.0509454 8.60249 0.0509454 8.0502C0.0510121 7.49797 0.498595 7.05031 1.05084 7.05031H15.0507C15.6029 7.05039 16.0506 7.49802 16.0506 8.0502C16.0506 8.60243 15.6029 9.05001 15.0507 9.05009H1.05084Z" fill="currentColor"/>
                    </svg>
                  </button>
                  {/* Increase size button */}
                  <button
                    onClick={() => {
                      if (gridSize === 'small') setGridSize('medium');
                      else if (gridSize === 'medium') setGridSize('large');
                    }}
                    disabled={gridSize === 'large'}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: gridSize === 'large' ? 'not-allowed' : 'pointer',
                      backgroundColor: 'transparent',
                      borderWidth: 'var(--border-width)',
                      borderStyle: 'solid',
                      borderColor: 'transparent',
                      opacity: gridSize === 'large' ? 0.5 : 1,
                      transition: 'all 0.2s ease',
                      padding: 0
                    }}
                    onMouseEnter={(e) => {
                      if (gridSize !== 'large') {
                        e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                        e.currentTarget.style.borderColor = 'var(--border-default)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1.05087 9.05023C0.498583 9.05023 0.0509737 8.60262 0.050974 8.05034C0.0510406 7.49811 0.498623 7.05044 1.05087 7.05044L7.05092 7.05113L7.05092 1.05039C7.05102 0.498193 7.49859 0.0505002 8.05081 0.0505002C8.60298 0.0505629 9.0506 0.498231 9.0507 1.05039L9.0507 7.05113L15.0508 7.05044C15.6029 7.05053 16.0506 7.49816 16.0506 8.05034C16.0506 8.60257 15.603 9.05014 15.0508 9.05023L9.0507 9.05092V15.0503C9.0507 15.6025 8.60304 16.0501 8.05081 16.0502C7.49853 16.0502 7.05092 15.6026 7.05092 15.0503L7.05092 9.05092L1.05087 9.05023Z" fill="currentColor"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
            {/* Shadow divider for Grid view - extends full height of panel */}
            {selectedRouteTab === 'Grid' && (
              <div style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${LABEL_WIDTH - 16}px`,
                width: '8px',
                background: 'linear-gradient(to right, rgba(0, 0, 0, 0.12), transparent)',
                zIndex: 102,
                pointerEvents: 'none',
                opacity: isGridTransitioning ? 0 : 1,
                transition: isGridTransitioning ? 'none' : 'opacity 150ms ease-in-out 300ms'
              }} />
            )}
            {/* Back Button and Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '0px',
              marginBottom: '4px',
              flexShrink: 0
            }}>
              {/* Left side: Back button and Route name */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
                onClick={() => {
                  // Open filter panel when leaving grid view
                  if (selectedRouteTab === 'Grid') {
                    setIsFiltersPanelOpen(true);
                  }
                  setSelectedRouteId(null);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3.80773 13.7071C3.41721 14.0976 2.78419 14.0976 2.39367 13.7071C2.00323 13.3166 2.00318 12.6835 2.39367 12.293L6.63684 8.05086L2.39367 3.80769C2.00328 3.41716 2.00319 2.78411 2.39367 2.39363C2.78416 2.00323 3.41723 2.00326 3.80773 2.39363L8.0509 6.6368L12.2931 2.39363C12.6836 2.00325 13.3167 2.00323 13.7071 2.39363C14.0976 2.78412 14.0976 3.41716 13.7071 3.80769L9.46496 8.05086L13.7071 12.293C14.0976 12.6835 14.0976 13.3166 13.7071 13.7071C13.3166 14.0976 12.6836 14.0976 12.2931 13.7071L8.0509 9.46492L3.80773 13.7071Z" fill="currentColor"/>
                </svg>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    position: 'relative'
                  }}
                >
                  <div
                    className="data-small"
                    style={{
                      color: 'var(--text-secondary)',
                      cursor: !isFiltersPanelOpen && selectedRouteId ? 'pointer' : 'default'
                    }}
                    onClick={(e) => {
                      if (!isFiltersPanelOpen && !filterPanelJustClosedRef.current && selectedRouteId) {
                        e.stopPropagation();
                        setIsRouteDropdownOpen(!isRouteDropdownOpen);
                      }
                    }}
                  >
                    {routesList.find((r) => r.id === selectedRouteId)?.name || `Route ${selectedRouteId}`}
                  </div>
                  {!isFiltersPanelOpen && selectedRouteId && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{
                        cursor: 'pointer',
                        color: 'var(--text-secondary)'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (filterPanelJustClosedRef.current) return;
                        setIsRouteDropdownOpen(!isRouteDropdownOpen);
                      }}
                    >
                      <path d="M1.3252 5.87686C0.891707 5.44966 0.891515 4.75706 1.3252 4.32998C1.75895 3.90299 2.46275 3.90296 2.89648 4.32998L7.99609 9.35342L13.1045 4.32217C13.5382 3.89551 14.2411 3.8955 14.6748 4.32217C15.1085 4.74929 15.1084 5.44186 14.6748 5.86904L8.87695 11.58C8.8496 11.6143 8.82019 11.648 8.78809 11.6796C8.57123 11.8931 8.28713 11.9999 8.00293 11.9999C7.7139 12.0036 7.42367 11.8977 7.20313 11.6806C7.1676 11.6456 7.13517 11.6085 7.10547 11.5702L1.3252 5.87686Z" fill="currentColor"/>
                    </svg>
                  )}
                  {/* Route Dropdown */}
                  {isRouteDropdownOpen && !isFiltersPanelOpen && selectedRouteId && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: '8px',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '0.5px solid var(--border-default)',
                        borderRadius: 'var(--radius-large)',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 1000,
                        minWidth: '200px',
                        maxHeight: '640px',
                        overflowY: 'auto'
                      }}
                    >
                      {routesList.map((route, index) => {
                        const isSelected = route.id === selectedRouteId;
                        return (
                          <div
                            key={route.id}
                            className="button-small"
                            style={{
                              padding: '12px 28px 12px 16px',
                              cursor: 'pointer',
                              color: 'var(--text-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              transition: 'background-color 0.2s ease',
                              margin: index === 0 ? '12px 0 4px 0' : (index === routesList.length - 1 ? '4px 0 12px 0' : '4px 0')
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRouteId(route.id);
                              setIsRouteDropdownOpen(false);
                            }}
                          >
                            {isSelected && (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            )}
                            <span style={{ marginLeft: isSelected ? '0' : '32px' }}>
                              {route.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Scroll-based divider - Only show when experimental mode is on */}
            {experimentalDetailViewNav && (
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
                  opacity: isRouteContentScrolled ? 1 : 0,
                  transition: 'opacity 0.2s ease'
                }} />
              </div>
            )}

            {/* Summary/Trips/Grid Tabs - Only show when experimental mode is off */}
            {!experimentalDetailViewNav && (
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
                      onClick={() => {
                        const wasGrid = selectedRouteTab === 'Grid';
                        const willBeGrid = tab === 'Grid';

                        // Clear trip selection when switching tabs
                        if (selectedTrip) {
                          setSelectedTrip(null);
                          setSelectedTripStops([]);
                        }

                        // Update tab immediately for instant panel expansion
                        setSelectedRouteTab(tab);

                        // Open filter panel when leaving grid view
                        if (wasGrid && !willBeGrid) {
                          setIsFiltersPanelOpen(true);
                        }

                        // Then handle transition state
                        if (wasGrid !== willBeGrid) {
                          setIsGridTransitioning(true);
                          setTimeout(() => setIsGridTransitioning(false), 300);
                        }
                      }}
                      style={{
                        position: 'relative',
                        padding: '12px 0',
                        border: 'none',
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 'var(--data-small-size)',
                        fontWeight: 'var(--data-small-weight)',
                        color: selectedRouteTab === tab ? 'var(--accent-ui-text)' : 'var(--text-disabled)',
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
            )}

            {/* Tab Content */}
            {selectedRouteTab === 'Summary' ? (
              <div
                style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingTop: experimentalDetailViewNav ? '0px' : '12px', paddingBottom: '24px', marginRight: '-8px', paddingRight: '8px', opacity: isGridTransitioning ? 0 : 1, transition: isGridTransitioning ? 'none' : 'opacity 150ms ease-in-out 300ms' }}
                onScroll={(e) => {
                  if (experimentalDetailViewNav) {
                    const target = e.target as HTMLDivElement;
                    setIsRouteContentScrolled(target.scrollTop > 0);
                  }
                }}
              >
                {comparisonMode ? (
                  (() => {
                    const value1 = routeData?.metrics ? getMetricValue(routeData.metrics, selectedMetric) : routesList.find((r) => r.id === selectedRouteId)?.value || 0;
                    const value2 = routeData2?.metrics ? getMetricValue(routeData2.metrics, selectedMetric) : 0;
                    return (
                      <ComparisonMetricCard
                        title={selectedMetric}
                        value1={value1}
                        value2={value2}
                        swapped={comparisonSwapped}
                        loading={!!isRouteComparisonLoading}
                      />
                    );
                  })()
                ) : (
                  <MetricCard
                    title={selectedMetric}
                    value={routeData?.metrics ? getMetricValue(routeData.metrics, selectedMetric) : routesList.find((r) => r.id === selectedRouteId)?.value || 0}
                    loading={isActiveByPeriodLoading}
                  />
                )}
                {/* Pattern Chart - only show when not filtering by pattern and there are multiple patterns */}
                {!selectedPattern && routeDataByPattern.length > 1 && (
                  <ByPatternChart
                    data={routeDataByPattern}
                    comparisonData={comparisonMode ? comparisonDataByPattern : undefined}
                    metric={selectedMetric}
                    loading={isRouteLoading}
                    onPatternClick={(headsign) => setSelectedPattern(headsign === 'all' ? null : headsign)}
                    selectedPattern={selectedPattern}
                    swapped={comparisonSwapped}
                  />
                )}
                <ByDateChart
                  data={activeDataByDate}
                  comparisonData={comparisonMode ? activeComparisonDataByDate : undefined}
                  gradientId="colorValue"
                  metric={selectedMetric}
                  startDate={effectiveDateRange.start}
                  endDate={effectiveDateRange.end}
                  comparisonStartDate={comparisonDateRange.start}
                  comparisonEndDate={comparisonDateRange.end}
                  swapped={comparisonSwapped}
                  loading={isActiveByDateLoading}
                />
                <ByDayChart
                  data={activeDataByDay}
                  comparisonData={comparisonMode ? activeComparisonDataByDay : undefined}
                  metric={selectedMetric}
                  selectedDays={effectiveSelectedDays}
                  swapped={comparisonSwapped}
                  loading={isActiveByDayLoading}
                />
                <ByPeriodChart
                  data={activeDataByPeriod}
                  comparisonData={comparisonMode ? activeComparisonDataByPeriod : undefined}
                  colors={PERIOD_COLORS}
                  swapped={comparisonSwapped}
                  activePieIndex={activePieIndex}
                  setActivePieIndex={setActivePieIndex}
                  metric={selectedMetric}
                  selectedPeriods={effectiveSelectedPeriods}
                  loading={isActiveByPeriodLoading}
                />
              </div>
            ) : selectedRouteTab === 'Trips' ? (
              /* Trips View */
              (() => {
                // Filter and sort trips
                const filteredAndSortedRouteTrips = routeTripsWithRidership
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
                      } else if (tripSortBy === 'largestIncrease' || tripSortBy === 'largestDecrease' || tripSortBy === 'largestChange') {
                        // Sort by percent change (comparison mode)
                        const routeValue1 = routesList.find(r => r.id === selectedRouteId)?.value || 1;
                        const routeValue2 = routeComparisonValueMap.get(selectedRouteId || '') || 0;
                        const getComparisonValue = (ridership: number) =>
                          routeValue1 > 0 ? Math.round(ridership * (routeValue2 / routeValue1)) : 0;

                        const aValue2 = getComparisonValue(a.ridership);
                        const bValue2 = getComparisonValue(b.ridership);
                        const aChange = aValue2 !== 0 ? ((a.ridership - aValue2) / aValue2) * 100 : 0;
                        const bChange = bValue2 !== 0 ? ((b.ridership - bValue2) / bValue2) * 100 : 0;
                        // Apply swap if needed
                        const aChangeFinal = comparisonSwapped ? -aChange : aChange;
                        const bChangeFinal = comparisonSwapped ? -bChange : bChange;

                        if (tripSortBy === 'largestIncrease') {
                          // Highest positive % first
                          return bChangeFinal - aChangeFinal;
                        } else if (tripSortBy === 'largestDecrease') {
                          // Most negative % first
                          return aChangeFinal - bChangeFinal;
                        } else {
                          // largestChange: biggest absolute swing first
                          return Math.abs(bChangeFinal) - Math.abs(aChangeFinal);
                        }
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
                const totalTripsCount = routeTripsWithRidership
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
                    paddingRight: '50px',
                    opacity: isGridTransitioning ? 0 : 1,
                    transition: isGridTransitioning ? 'none' : 'opacity 150ms ease-in-out 300ms'
                  }}>
                    {/* Static divider */}
                    <div style={{
                      width: '100%',
                      height: '0.5px',
                      backgroundColor: 'var(--border-default)',
                      flexShrink: 0
                    }} />

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
                      {isTripsLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <style>{`
                            @keyframes shimmer {
                              0% { background-position: -200% 0; }
                              100% { background-position: 200% 0; }
                            }
                          `}</style>
                          {/* Skeleton pattern header - matches actual pattern header */}
                          <div style={{
                            position: 'sticky',
                            top: '0px',
                            backgroundColor: 'var(--bg-primary)',
                            zIndex: 10
                          }}>
                            <div style={{
                              backgroundColor: 'var(--bg-elevated)',
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
                              <div style={{
                                height: 20,
                                width: 120,
                                borderRadius: 2,
                                background: accentShimmer(),
                                backgroundSize: '200% 100%',
                                animation: 'shimmer 1.5s infinite ease-in-out',
                                opacity: 0.5
                              }} />
                            </div>
                          </div>
                          {/* Skeleton trips container - matches actual trips list container */}
                          <div style={{
                            position: 'relative',
                            padding: '8px 16px 16px 16px',
                            borderLeft: '0.5px solid var(--border-default)',
                            borderRight: '0.5px solid var(--border-default)',
                            borderBottom: '0.5px solid var(--border-default)',
                            borderTop: 'none',
                            borderBottomLeftRadius: '20px',
                            borderBottomRightRadius: '20px',
                            backgroundColor: 'var(--bg-elevated)'
                          }}>
                            {/* Skeleton axis labels row */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              marginBottom: '8px',
                              gap: '16px'
                            }}>
                              <div style={{ minWidth: '52px', flexShrink: 0 }} />
                              <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '16px' }}>
                                {[0, 1, 2, 3].map((i) => (
                                  <div key={i} style={{
                                    height: 10,
                                    width: 24,
                                    borderRadius: 2,
                                    background: accentShimmer(),
                                    backgroundSize: '200% 100%',
                                    animation: 'shimmer 1.5s infinite ease-in-out',
                                    animationDelay: `${i * 0.1}s`,
                                    opacity: 0.5
                                  }} />
                                ))}
                              </div>
                            </div>
                            {/* Divider line below axis labels */}
                            <div style={{
                              height: '0.5px',
                              backgroundColor: 'var(--border-default)',
                              opacity: 0.5,
                              marginLeft: '-16px',
                              marginRight: '-16px'
                            }} />
                            {/* Skeleton trip rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '8px' }}>
                              {[0.7, 0.55, 0.85, 0.4, 0.65, 0.5, 0.75, 0.45, 0.6, 0.8, 0.35, 0.72, 0.58, 0.9, 0.42, 0.68, 0.52, 0.78, 0.48, 0.62, 0.7, 0.55, 0.85, 0.4].map((width, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '16px'
                                  }}
                                >
                                  {/* Time label skeleton */}
                                  <div style={{
                                    height: 12,
                                    width: 52,
                                    borderRadius: 2,
                                    flexShrink: 0,
                                    background: accentShimmer(),
                                    backgroundSize: '200% 100%',
                                    animation: 'shimmer 1.5s infinite ease-in-out',
                                    animationDelay: `${i * 0.05}s`,
                                    opacity: 0.5
                                  }} />
                                  {/* Bar skeleton */}
                                  <div style={{ flex: 1, height: 24 }}>
                                    <div style={{
                                      height: '100%',
                                      width: `${width * 100}%`,
                                      borderRadius: 4,
                                      background: accentShimmer(),
                                      backgroundSize: '200% 100%',
                                      animation: 'shimmer 1.5s infinite ease-in-out',
                                      animationDelay: `${i * 0.05}s`,
                                      opacity: 0.5
                                    }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : filteredAndSortedRouteTrips.length === 0 ? (
                        <div style={{
                          padding: '24px',
                          textAlign: 'center',
                          color: 'var(--text-tertiary)',
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 'var(--body-size)'
                        }}>
                          {routeTripsWithRidership.length === 0 ? 'No trips available for this route' : 'No trips match the current filters'}
                        </div>
                      ) : (
                        filteredAndSortedRouteTrips.map((patternGroup, groupIndex) => {
                      // In comparison mode, calculate max ridership including comparison values using actual values
                      const getComparisonRidership = (ridership: number) => {
                        const routeValue1 = routesList.find(r => r.id === selectedRouteId)?.value || 1;
                        const routeValue2 = routeComparisonValueMap.get(selectedRouteId || '') || 0;
                        return routeValue1 > 0 ? Math.round(ridership * (routeValue2 / routeValue1)) : 0;
                      };
                      const maxRidership = comparisonMode
                        ? Math.max(
                            ...patternGroup.trips.map(t => t.ridership),
                            ...patternGroup.trips.map(t => getComparisonRidership(t.ridership))
                          )
                        : Math.max(...patternGroup.trips.map(t => t.ridership));

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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: comparisonMode ? '8px' : '4px', position: 'relative', zIndex: 1, paddingTop: '8px' }}>
                              {patternGroup.trips.map((trip, tripIndex) => {
                                const rawValue1 = trip.ridership;
                                const rawValue2 = getComparisonRidership(trip.ridership);
                                // Swap values and colors when comparisonSwapped is true
                                const value1 = comparisonSwapped ? rawValue2 : rawValue1;
                                const value2 = comparisonSwapped ? rawValue1 : rawValue2;
                                // Handle division by zero when maxRidership is 0
                                const barWidth1 = maxRidership > 0 ? (value1 / maxRidership) * 100 : 0;
                                const barWidth2 = maxRidership > 0 ? (value2 / maxRidership) * 100 : 0;
                                const tripKey = `${groupIndex}-${tripIndex}`;

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
                                      {comparisonMode ? (
                                        /* Comparison mode: Two bars stacked */
                                        <div
                                          className="trip-bar-hover"
                                          style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '2px',
                                            cursor: 'pointer',
                                            width: '100%',
                                            borderRadius: '4px'
                                          }}
                                          onMouseEnter={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setTripTooltip({
                                              show: true,
                                              time: formatTime12Hour(trip.start_time),
                                              ridership: value1,
                                              ridership2: value2,
                                              isComparisonMode: true,
                                              x: rect.left,
                                              y: rect.top
                                            });
                                          }}
                                          onMouseLeave={() => {
                                            setTripTooltip(null);
                                          }}
                                          onClick={async () => {
                                            // Save scroll position before entering trip detail
                                            if (tripsScrollRef.current) {
                                              tripsScrollPositionRef.current = tripsScrollRef.current.scrollTop;
                                            }
                                            setTripTooltip(null);
                                            setSelectedTrip(trip);
                                            const stops = await getTripStopTimes(trip.trip_id);
                                            if (stops) {
                                              setSelectedTripStops(stops);
                                            }
                                          }}
                                        >
                                          {/* Date-time 1 bar */}
                                          <div
                                            style={{
                                              height: '12px',
                                              width: barWidth1 === 0 ? '2px' : `${barWidth1}%`,
                                              minWidth: barWidth1 === 0 ? '2px' : '3px',
                                              backgroundColor: accent(0.4),
                                              borderRadius: barWidth1 === 0 ? '1px' : '4px',
                                              transition: 'width 0.3s ease'
                                            }}
                                          />
                                          {/* Date-time 2 bar */}
                                          <div
                                            style={{
                                              height: '12px',
                                              width: barWidth2 === 0 ? '2px' : `${barWidth2}%`,
                                              minWidth: barWidth2 === 0 ? '2px' : '3px',
                                              backgroundColor: accent2(0.4),
                                              borderRadius: barWidth2 === 0 ? '1px' : '4px',
                                              transition: 'width 0.3s ease'
                                            }}
                                          />
                                        </div>
                                      ) : (
                                        /* Normal mode: Single bar */
                                        <div
                                          className="trip-bar-hover"
                                          style={{
                                            position: 'relative',
                                            height: '24px',
                                            width: '100%',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                          }}
                                          onMouseEnter={(e) => {
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
                                            setTripTooltip(null);
                                          }}
                                          onClick={async () => {
                                            // Save scroll position before entering trip detail
                                            if (tripsScrollRef.current) {
                                              tripsScrollPositionRef.current = tripsScrollRef.current.scrollTop;
                                            }
                                            setTripTooltip(null);
                                            setSelectedTrip(trip);
                                            const stops = await getTripStopTimes(trip.trip_id);
                                            if (stops) {
                                              setSelectedTripStops(stops);
                                            }
                                          }}
                                        >
                                          <div
                                            style={{
                                              height: '100%',
                                              width: barWidth1 === 0 ? '2px' : `${barWidth1}%`,
                                              minWidth: barWidth1 === 0 ? '2px' : '3px',
                                              backgroundColor: accent(0.35),
                                              borderRadius: barWidth1 === 0 ? '1px' : '4px',
                                              transition: 'width 0.3s ease'
                                            }}
                                          />
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
                  </div>
                );
              })()
            ) : (
              /* Grid View */
              (() => {
                // Filter trips by pattern AND time period (uses routeTripsWithRidership which has time period filtering applied)
                const filteredGridTrips = routeTripsWithRidership
                  .filter(patternGroup => !selectedPattern || patternGroup.headsign === selectedPattern)
                  .map(patternGroup => ({
                    ...patternGroup,
                    trips: [...patternGroup.trips].sort((a, b) => a.start_time.localeCompare(b.start_time))
                  }))
                  .filter(patternGroup => patternGroup.trips.length > 0);

                // Use grid size config from outer scope
                // Increase cell width in comparison mode to fit both values side by side
                const CELL_WIDTH = comparisonMode ? config.cellWidth + 40 : config.cellWidth;
                const CELL_HEIGHT = config.cellHeight;

                // Pre-compute neutral color for 0-0 cells in comparison mode
                const neutralColor = getComparisonColorRGB(0, comparisonValueRange.min, comparisonValueRange.max);

                // Handle scroll for updating current pattern - directly manipulates DOM for instant update
                const handleGridScroll = (e: React.UIEvent<HTMLDivElement>) => {
                  const scrollTop = e.currentTarget.scrollTop;
                  if (filteredGridTrips.length <= 1) return;

                  // Calculate cumulative heights to find pattern boundaries
                  let accumulatedHeight = 0;
                  let newIndex = 0;
                  for (let i = 0; i < filteredGridTrips.length; i++) {
                    const pattern = filteredGridTrips[i];
                    const firstTrip = pattern.trips[0];
                    const stops = gridTripStops[firstTrip?.trip_id] || [];
                    // Height = Start Time row + stop rows (no Trip Total, no margin)
                    const patternHeight = CELL_HEIGHT * (1 + stops.length);

                    // Switch to next pattern only when its Start Time row reaches the top
                    if (scrollTop < accumulatedHeight + patternHeight) {
                      newIndex = i;
                      break;
                    }
                    accumulatedHeight += patternHeight;
                    newIndex = i;
                  }

                  // Directly update DOM if index changed - bypasses React render cycle
                  if (currentGridPatternIndexRef.current !== newIndex) {
                    currentGridPatternIndexRef.current = newIndex;
                    if (gridHeadsignRef.current) {
                      gridHeadsignRef.current.textContent = filteredGridTrips[newIndex]?.headsign || '';
                    }
                  }
                };

                return (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    opacity: isGridTransitioning ? 0 : 1,
                    transition: isGridTransitioning ? 'none' : 'opacity 150ms ease-in-out 300ms',
                    marginRight: '-16px'
                  }}>
                    {/* Static divider */}
                    <div style={{
                      width: 'calc(100% + 16px)',
                      height: '0.5px',
                      backgroundColor: 'var(--border-default)',
                      flexShrink: 0,
                      marginLeft: '-16px'
                    }} />

                    {isLoadingGridData || isTripsLoading || isTripsDataStale || isGridDataLoading || isGridDataStale ? (
                      <div style={{
                        flex: 1,
                        overflow: 'hidden',
                        marginLeft: '-16px',
                        marginRight: '-16px'
                      }}>
                        <div style={{ display: 'inline-block', minWidth: '100%' }}>
                          {/* Skeleton Header Row */}
                          <div style={{
                            display: 'flex',
                            flexDirection: 'row',
                            borderBottom: '0.5px solid var(--border-default)'
                          }}>
                            {/* Stop Name Label */}
                            <div style={{
                              width: `${config.labelWidth}px`,
                              flexShrink: 0,
                              height: `${config.cellHeight}px`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              paddingLeft: '16px',
                              paddingRight: '12px',
                              backgroundColor: 'var(--bg-primary)',
                              borderRight: '0.5px solid var(--border-default)'
                            }}>
                              <div style={{
                                height: 14,
                                width: 80,
                                borderRadius: 4,
                                background: accentShimmer(),
                                backgroundSize: '200% 100%',
                                animation: 'shimmer 1.5s infinite ease-in-out',
                                opacity: 0.5
                              }} />
                            </div>
                            {/* Time column headers - 16 columns */}
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => (
                              <div
                                key={i}
                                style={{
                                  width: `${config.cellWidth}px`,
                                  flexShrink: 0,
                                  height: `${config.cellHeight}px`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: 'var(--bg-primary)',
                                  borderRight: '0.5px solid var(--border-default)'
                                }}
                              >
                                <div style={{
                                  height: 14,
                                  width: 50,
                                  borderRadius: 4,
                                  background: accentShimmer(),
                                  backgroundSize: '200% 100%',
                                  animation: 'shimmer 1.5s infinite ease-in-out',
                                  animationDelay: `${i * 0.05}s`,
                                  opacity: 0.5
                                }} />
                              </div>
                            ))}
                          </div>
                          {/* Skeleton Stop Rows - 20 rows */}
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((rowIndex) => (
                            <div
                              key={rowIndex}
                              style={{
                                display: 'flex',
                                flexDirection: 'row',
                                borderBottom: '0.5px solid var(--border-default)'
                              }}
                            >
                              {/* Stop Name */}
                              <div style={{
                                width: `${config.labelWidth}px`,
                                flexShrink: 0,
                                height: `${config.cellHeight}px`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-start',
                                paddingLeft: '16px',
                                paddingRight: '8px',
                                backgroundColor: 'var(--bg-primary)',
                                borderRight: '0.5px solid var(--border-default)'
                              }}>
                                <div style={{
                                  height: 14,
                                  width: `${100 + (rowIndex % 5) * 20}px`,
                                  borderRadius: 4,
                                  background: accentShimmer(),
                                  backgroundSize: '200% 100%',
                                  animation: 'shimmer 1.5s infinite ease-in-out',
                                  animationDelay: `${rowIndex * 0.03}s`,
                                  opacity: 0.5
                                }} />
                              </div>
                              {/* Data cells - 16 columns */}
                              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((colIndex) => (
                                <div
                                  key={colIndex}
                                  style={{
                                    width: `${config.cellWidth}px`,
                                    flexShrink: 0,
                                    height: `${config.cellHeight}px`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: 'var(--bg-primary)',
                                    borderRight: '0.5px solid var(--border-default)'
                                  }}
                                >
                                  <div style={{
                                    height: 16,
                                    width: 32,
                                    borderRadius: 4,
                                    background: accentShimmer(),
                                    backgroundSize: '200% 100%',
                                    animation: 'shimmer 1.5s infinite ease-in-out',
                                    animationDelay: `${(rowIndex * 16 + colIndex) * 0.01}s`,
                                    opacity: 0.5
                                  }} />
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : filteredGridTrips.length === 0 ? (
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-tertiary)',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 'var(--body-size)'
                      }}>
                        {routeTripsWithRidership.length === 0 ? 'No trips available for this route' : 'No trips match the current pattern filter'}
                      </div>
                    ) : (
                      <>
                        {/* Single Scroll Container - both directions */}
                        <div
                          ref={gridContentRef}
                          onScroll={handleGridScroll}
                          style={{
                            flex: 1,
                            overflow: 'auto',
                            marginLeft: '-16px',
                            marginRight: '-16px'
                          }}
                        >
                          <div style={{ display: 'inline-block', minWidth: '100%' }}>
                            {filteredGridTrips.map((patternGroup, groupIndex) => {
                              // Get stops from first trip in pattern
                              const firstTrip = patternGroup.trips[0];
                              const tripStops = gridTripStops[firstTrip?.trip_id] || [];

                              return (
                                <div key={groupIndex}>
                                  {/* Start Time Row - Sticky top */}
                                  <div style={{
                                    position: 'sticky',
                                    top: 0,
                                    backgroundColor: 'var(--bg-primary)',
                                    zIndex: 101,
                                    display: 'flex',
                                    flexDirection: 'row',
                                    boxShadow: 'inset 0 -0.5px 0 var(--border-default)'
                                  }}>
                                    {/* Start Time Label - Sticky left */}
                                    <div style={{
                                      position: 'sticky',
                                      left: 0,
                                      width: `${LABEL_WIDTH}px`,
                                      flexShrink: 0,
                                      height: `${CELL_HEIGHT}px`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'flex-start',
                                      paddingLeft: '16px',
                                      paddingRight: '12px',
                                      fontFamily: 'Inter, sans-serif',
                                      fontSize: `${config.labelFont}px`,
                                      fontWeight: 600,
                                      color: 'var(--text-secondary)',
                                      backgroundColor: 'var(--bg-primary)',
                                      zIndex: 101,
                                      borderBottom: '0.5px solid var(--border-default)'
                                    }}>
                                      Stop Name
                                    </div>
                                    {/* Start Time Cells */}
                                    {patternGroup.trips.map((trip, tripIndex) => {
                                      const formattedTime = formatTime12Hour(trip.start_time);
                                      const [timePart, ampmPart] = formattedTime.split(' ');

                                      return (
                                        <div
                                          key={trip.trip_id}
                                          style={{
                                            width: `${CELL_WIDTH}px`,
                                            flexShrink: 0,
                                            height: `${CELL_HEIGHT}px`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontFamily: 'Inter, sans-serif',
                                            fontSize: `${config.timeFont}px`,
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                            backgroundColor: 'var(--bg-primary)',
                                            borderLeft: tripIndex === 0 ? '0.5px solid var(--border-default)' : 'none',
                                            borderRight: '0.5px solid var(--border-default)',
                                            borderBottom: '0.5px solid var(--border-default)'
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                                            <span>{timePart}</span>
                                            <span style={{ fontSize: `${config.ampmFont}px` }}>{ampmPart}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Stop Rows */}
                                  {tripStops.map((stop, stopIndex) => (
                                    <div
                                      key={stop.id}
                                      style={{
                                        display: 'flex',
                                        flexDirection: 'row'
                                      }}
                                    >
                                      {/* Stop Name Label - Sticky left */}
                                      <div style={{
                                        position: 'sticky',
                                        left: 0,
                                        width: `${LABEL_WIDTH}px`,
                                        flexShrink: 0,
                                        height: `${CELL_HEIGHT}px`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-start',
                                        paddingLeft: '16px',
                                        paddingRight: '8px',
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize: `${config.labelFont}px`,
                                        color: 'var(--text-primary)',
                                        backgroundColor: 'var(--bg-primary)',
                                        borderBottom: '0.5px solid var(--border-default)',
                                        zIndex: 100
                                      }}>
                                        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                                          <span
                                            style={{
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                              display: 'block'
                                            }}
                                            onMouseEnter={(e) => {
                                              const target = e.currentTarget;
                                              tooltipTimerRef.current = setTimeout(() => {
                                                if (target.scrollWidth > target.clientWidth) {
                                                  setTooltipStopIndex(stopIndex + 20000); // Offset to avoid collision with TDV
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
                                          >
                                            {stop.n}
                                          </span>
                                          {tooltipStopIndex === stopIndex + 20000 && (
                                            <Tooltip text={stop.n}>
                                              {null}
                                            </Tooltip>
                                          )}
                                        </div>
                                      </div>
                                      {/* Stop Value Cells */}
                                      {patternGroup.trips.map((trip, tripIndex) => {
                                        const tripStopTimes = gridTripStops[trip.trip_id] || [];
                                        const stopTime = tripStopTimes.find(st => st.id === stop.id);
                                        // Use trip-specific stop value from grid data, fall back to route-level stopValueMap
                                        const tripStopData = gridStopValues.get(trip.trip_id);
                                        const stopValue = stopTime
                                          ? (tripStopData?.get(stop.id) ?? stopValueMap.get(stop.id) ?? 0)
                                          : 0;
                                        const stopPercentChange = stopComparisonMap.get(stop.id) || 0;
                                        // Get actual value2 from comparison data instead of back-calculating
                                        const rawValue2ForCell = stopComparisonValueMap.get(stop.id) || 0;
                                        // Apply swapped display order
                                        const displayValue1 = comparisonSwapped ? rawValue2ForCell : stopValue;
                                        const displayValue2 = comparisonSwapped ? stopValue : rawValue2ForCell;
                                        // If both values are 0, use pre-computed neutral color
                                        const cellColor = comparisonMode
                                          ? (stopValue === 0 && rawValue2ForCell === 0 ? neutralColor : getComparisonColorRGB(stopPercentChange, comparisonValueRange.min, comparisonValueRange.max))
                                          : valueToColor(stopValue, gridValueRange.min, gridValueRange.max);

                                        return (
                                          <div
                                            key={trip.trip_id}
                                            style={{
                                              width: `${CELL_WIDTH}px`,
                                              flexShrink: 0,
                                              height: `${CELL_HEIGHT}px`,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              fontFamily: 'Inter, sans-serif',
                                              fontSize: `${config.dataFont}px`,
                                              fontWeight: 600,
                                              color: '#fff',
                                              backgroundColor: `rgb(${cellColor[0]}, ${cellColor[1]}, ${cellColor[2]})`,
                                              borderLeft: tripIndex === 0 ? '0.5px solid var(--border-default)' : 'none',
                                              borderRight: '0.5px solid var(--border-default)',
                                              borderBottom: '0.5px solid var(--border-default)',
                                              cursor: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cg clip-path='url(%23clip0_248_2004)'%3E%3Cpath d='M12 1C14.3771 1 16.4795 1.8429 18.2656 3.49023C20.1092 5.19067 21 7.46492 21 10.2002C20.9999 12.1341 20.2327 14.141 18.8408 16.1982C17.4469 18.2583 15.3703 20.4456 12.6484 22.7617L12 23.3135L11.3516 22.7617C8.6297 20.4456 6.55307 18.2583 5.15918 16.1982C3.76727 14.141 3.00005 12.1341 3 10.2002C3 7.46492 3.89078 5.19067 5.73438 3.49023C7.52053 1.8429 9.62291 1 12 1ZM12 9C11.7173 9 11.5005 9.0893 11.2949 9.29492C11.0893 9.50055 11 9.71732 11 10C11 10.2827 11.0893 10.4995 11.2949 10.7051C11.5005 10.9107 11.7173 11 12 11C12.2827 11 12.4995 10.9107 12.7051 10.7051C12.9107 10.4995 13 10.2827 13 10C13 9.71732 12.9107 9.50055 12.7051 9.29492C12.4995 9.0893 12.2827 9 12 9Z' fill='%23FAF9F5' stroke='%233D2817' stroke-width='2'/%3E%3C/g%3E%3Cdefs%3E%3CclipPath id='clip0_248_2004'%3E%3Crect width='24' height='24' fill='white'/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E") 12 12, pointer`
                                            }}
                                            onClick={async () => {
                                              // Set the selected trip and load its stop times
                                              setSelectedTrip(trip);
                                              const stopTimes = await getTripStopTimes(trip.trip_id);
                                              if (stopTimes) {
                                                setSelectedTripStops(stopTimes);
                                              }

                                              // Highlight based on metric type
                                              if (isLoadMetric) {
                                                // For load metrics, highlight the segment (stopIndex represents the segment)
                                                setHoveredSegment(stopIndex);
                                                // Clear boarding stop selection
                                                setSelectedBoardingStop(null);
                                              } else {
                                                // For boarding metrics, highlight the stop
                                                setSelectedBoardingStop(stop.id);
                                                // Clear segment selection
                                                setHoveredSegment(null);
                                              }

                                              // Find the full stop object from the stops array to get coordinates
                                              const fullStop = stops.find(s => s.properties.stop_id === stop.id);
                                              if (!fullStop) return;

                                              // Center the map on the clicked stop
                                              const stopCoordinates = fullStop.geometry.coordinates as number[];
                                              const [stopLng, stopLat] = stopCoordinates;

                                              // Calculate the center point accounting for the left panel offset
                                              const el = mapContainerRef.current;
                                              const width = el?.clientWidth ?? window.innerWidth;
                                              const height = el?.clientHeight ?? window.innerHeight;
                                              const padding = getUIPadding(isFiltersPanelOpen, aiMode ? 60 : 72);

                                              // Create a viewport at zoom 13 centered on the stop
                                              const viewport = new WebMercatorViewport({
                                                width,
                                                height,
                                                longitude: stopLng,
                                                latitude: stopLat,
                                                zoom: 13
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
                                                zoom: 13,
                                                pitch: 0,
                                                bearing: 0,
                                                transitionDuration: 200
                                              });
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.boxShadow = 'inset 0 0 0 4px rgba(0,0,0,0.2)';
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.boxShadow = 'none';
                                            }}
                                          >
                                            {comparisonMode ? (
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', lineHeight: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: DATETIME_1_COLOR, flexShrink: 0 }} />
                                                  <span style={{ fontSize: `${config.dataFont - 2}px` }}>{displayValue1}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: DATETIME_2_COLOR, flexShrink: 0 }} />
                                                  <span style={{ fontSize: `${config.dataFont - 2}px` }}>{displayValue2}</span>
                                                </div>
                                              </div>
                                            ) : stopValue}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        );
      })()
    ) : activeTab === 'system' ? (
          /* System View - Aggregated Charts */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'hidden', position: 'relative' }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              paddingTop: isFiltersPanelOpen ? '20px' : '14px',
              paddingBottom: '14px',
              flexShrink: 0,
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '0 28px 0 0',
              zIndex: 20
            }}>
              <div className="data-small" style={{ color: 'var(--text-secondary)' }}>Full System</div>
            </div>

            {/* Divider - only shown when scrolled */}
            <div style={{ position: 'relative', marginLeft: '-16px', marginRight: '-16px', flexShrink: 0 }}>
              <div style={{
                height: '0.5px',
                backgroundColor: 'var(--border-default)',
                marginLeft: '16px',
                marginRight: '16px',
                marginTop: '4px',
                opacity: isSystemContentScrolled ? 1 : 0,
                transition: 'opacity 0.1s ease'
              }} />
            </div>

            {/* Scrollable charts */}
            <div
              style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: '24px', marginRight: '-8px', paddingRight: '8px' }}
              onScroll={(e) => setIsSystemContentScrolled((e.target as HTMLDivElement).scrollTop > 0)}
            >
            {/* Charts */}
            {comparisonMode ? (
              (() => {
                // For average/max metrics, use system-wide value directly; for totals, sum route values
                const isAverageMetric = selectedMetric === 'Average load' || selectedMetric === 'Maxload';
                const value1 = isAverageMetric
                  ? (systemData?.metrics ? getMetricValue(systemData.metrics, selectedMetric) : 0)
                  : routesList.reduce((sum, r) => sum + r.value, 0);
                // Calculate value2 from comparison data - use actual values instead of back-calculation
                const value2 = isAverageMetric
                  ? (systemData2?.metrics ? getMetricValue(systemData2.metrics, selectedMetric) : 0)
                  : routesList.reduce((sum, r) => sum + (routeComparisonValueMap.get(r.id) || 0), 0);
                return (
                  <ComparisonMetricCard
                    title={selectedMetric}
                    value1={value1}
                    value2={value2}
                    swapped={comparisonSwapped}
                    loading={isComparisonDataLoading}
                  />
                );
              })()
            ) : (
              (() => {
                // For average/max metrics, use system-wide value directly; for totals, sum route values
                const isAverageMetric = selectedMetric === 'Average load' || selectedMetric === 'Maxload';
                const value = isAverageMetric
                  ? (systemData?.metrics ? getMetricValue(systemData.metrics, selectedMetric) : 0)
                  : routesList.reduce((sum, r) => sum + r.value, 0);
                return <MetricCard title={selectedMetric} value={value.toLocaleString()} loading={isSystemLoading} />;
              })()
            )}
            <ByDateChart
              data={dataByDate}
              comparisonData={comparisonMode ? comparisonChartDataByDate : undefined}
              gradientId="colorValueSystem"
              metric={selectedMetric}
              startDate={effectiveDateRange.start}
              endDate={effectiveDateRange.end}
              comparisonStartDate={comparisonDateRange.start}
              comparisonEndDate={comparisonDateRange.end}
              swapped={comparisonSwapped}
              loading={isByDateLoading}
            />
            <ByDayChart
              data={dataByDay}
              comparisonData={comparisonMode ? comparisonDataByDay : undefined}
              metric={selectedMetric}
              selectedDays={effectiveSelectedDays}
              swapped={comparisonSwapped}
              loading={isByDayLoading}
            />
            <ByPeriodChart
              data={dataByPeriod}
              comparisonData={comparisonMode ? comparisonDataByPeriod : undefined}
              colors={PERIOD_COLORS}
              activePieIndex={activePieIndex}
              setActivePieIndex={setActivePieIndex}
              metric={selectedMetric}
              selectedPeriods={effectiveSelectedPeriods}
              swapped={comparisonSwapped}
              loading={isSystemLoading}
            />
            </div>{/* end scrollable charts */}
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
                  {filteredAndSortedStopsList.map((item) => {
                    // Get actual value2 from comparison data instead of back-calculating
                    const value2 = stopComparisonValueMap.get(item.id) || 0;

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (!isAllStopsLoading) {
                            setSelectedStopId(item.id);
                            setSelectedStopTab('Summary');
                          }
                        }}
                        style={{
                          cursor: isAllStopsLoading ? 'default' : 'pointer'
                        }}>
                        {comparisonMode ? (
                          <ComparisonMetricCard value1={item.value} value2={value2} title={item.name} swapped={comparisonSwapped} loading={isComparisonDataLoading} />
                        ) : (
                          <MetricCard value={item.value} title={item.name} valueLoading={isAllStopsLoading} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        ) : (
          /* Routes View with Filter/Sort */
          (() => {
            const isFiltered = appliedRouteFilterMin !== null || appliedRouteFilterMax !== null;

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
                  {/* Route Count */}
                  <div
                    className="data-small"
                    style={{
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {isFiltered
                      ? `${filteredAndSortedRoutesList.length} of ${routesList.length} Routes`
                      : `${routesList.length} Routes`}
                  </div>

                  {/* Filter and Sort Buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {/* Filter Button */}
                    <button
                      ref={routeFilterButtonRef}
                      type="button"
                      onClick={() => {
                        if (!isRouteFilterMenuOpen) {
                          // Opening the menu - save current state as original
                          setOriginalRouteFilterMin(appliedRouteFilterMin);
                          setOriginalRouteFilterMax(appliedRouteFilterMax);
                          // Stage current values
                          setStagedRouteFilterMin(appliedRouteFilterMin);
                          setStagedRouteFilterMax(appliedRouteFilterMax);
                        }
                        setIsRouteFilterMenuOpen(!isRouteFilterMenuOpen);
                      }}
                      onMouseEnter={() => setIsRouteFilterButtonHovered(true)}
                      onMouseLeave={() => setIsRouteFilterButtonHovered(false)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: isRouteFilterMenuOpen
                          ? '0.5px solid var(--border-focus)'
                          : isRouteFilterButtonHovered
                            ? '0.5px solid var(--border-default)'
                            : '0.5px solid transparent',
                        backgroundColor: isRouteFilterMenuOpen || isRouteFilterButtonHovered ? 'var(--bg-elevated)' : 'transparent',
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
                      ref={routeSortButtonRef}
                      type="button"
                      onClick={() => setIsRouteSortMenuOpen(!isRouteSortMenuOpen)}
                      onMouseEnter={() => setIsRouteSortButtonHovered(true)}
                      onMouseLeave={() => setIsRouteSortButtonHovered(false)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: isRouteSortMenuOpen
                          ? '0.5px solid var(--border-focus)'
                          : isRouteSortButtonHovered
                            ? '0.5px solid var(--border-default)'
                            : '0.5px solid transparent',
                        backgroundColor: isRouteSortMenuOpen || isRouteSortButtonHovered ? 'var(--bg-elevated)' : 'transparent',
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
                    opacity: isRoutesListScrolled ? 1 : 0,
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
                    setIsRoutesListScrolled(target.scrollTop > 0);
                  }}
                >
                  {filteredAndSortedRoutesList.map((item) => {
                    // Get actual value2 from the comparison value map (real API data)
                    const value2 = routeComparisonValueMap.get(item.id) || 0;

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedRouteId(item.id);
                          setSelectedRouteTab('Summary');
                        }}
                        style={{
                          cursor: 'pointer'
                        }}>
                        {comparisonMode ? (
                          <ComparisonMetricCard value1={item.value} value2={value2} title={item.name} swapped={comparisonSwapped} loading={isComparisonDataLoading} />
                        ) : (
                          <MetricCard value={item.value} title={item.name} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        )}
      </div>

      </div>{/* end opacity wrapper */}

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
        const sortOptions: { sortBy: 'time' | 'ridership' | 'largestIncrease' | 'largestDecrease' | 'largestChange'; order: 'asc' | 'desc'; label: string }[] = [
          { sortBy: 'time', order: 'asc', label: 'Time (earliest first)' },
          { sortBy: 'time', order: 'desc', label: 'Time (latest first)' },
          { sortBy: 'ridership', order: 'desc', label: `${selectedMetric} (highest first)` },
          { sortBy: 'ridership', order: 'asc', label: `${selectedMetric} (lowest first)` },
          // Add percent change options only in comparison mode
          ...(comparisonMode ? [
            { sortBy: 'largestIncrease' as const, order: 'desc' as const, label: 'Largest increase first' },
            { sortBy: 'largestDecrease' as const, order: 'desc' as const, label: 'Largest decrease first' },
            { sortBy: 'largestChange' as const, order: 'desc' as const, label: 'Largest change first' }
          ] : [])
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
            <span
              className="button-small"
              style={{
                padding: '0 16px 8px 16px',
                color: 'var(--text-secondary)',
                fontWeight: '500',
                display: 'block'
              }}
            >
              Sort by
            </span>
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
                    gap: '16px',
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
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>
                      <path d="M6.36682 9.86655L12.0002 4.23322C12.1789 4.05544 12.3875 3.96655 12.626 3.96655C12.8643 3.96655 13.0724 4.05427 13.2502 4.22972C13.4279 4.40516 13.5168 4.6135 13.5168 4.85472C13.5168 5.09594 13.4279 5.30544 13.2502 5.48322L6.98349 11.7499C6.80771 11.9277 6.60266 12.0166 6.36832 12.0166C6.13399 12.0166 5.92793 11.9277 5.75016 11.7499L2.78349 8.78322C2.60571 8.60844 2.5196 8.40083 2.52515 8.16039C2.53071 7.92005 2.62121 7.711 2.79665 7.53322C2.9721 7.35544 3.18043 7.26655 3.42165 7.26655C3.66288 7.26655 3.87238 7.35544 4.05015 7.53322L6.36682 9.86655Z" fill="currentColor"/>
                    </svg>
                  )}
                  <span style={{ marginLeft: isSelected ? '0' : '36px' }}>{option.label}</span>
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
        const sortOptions: { sortBy: 'name' | 'ridership' | 'largestIncrease' | 'largestDecrease' | 'largestChange'; order: 'asc' | 'desc'; label: string }[] = [
          { sortBy: 'name', order: 'asc', label: 'Name (A-Z)' },
          { sortBy: 'name', order: 'desc', label: 'Name (Z-A)' },
          { sortBy: 'ridership', order: 'desc', label: `${selectedMetric} (highest first)` },
          { sortBy: 'ridership', order: 'asc', label: `${selectedMetric} (lowest first)` },
          // Add percent change options only in comparison mode
          ...(comparisonMode ? [
            { sortBy: 'largestIncrease' as const, order: 'desc' as const, label: 'Largest increase first' },
            { sortBy: 'largestDecrease' as const, order: 'desc' as const, label: 'Largest decrease first' },
            { sortBy: 'largestChange' as const, order: 'desc' as const, label: 'Largest change first' }
          ] : [])
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
            <span
              className="button-small"
              style={{
                padding: '0 16px 8px 16px',
                color: 'var(--text-secondary)',
                fontWeight: '500',
                display: 'block'
              }}
            >
              Sort by
            </span>
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
                    gap: '16px',
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
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>
                      <path d="M6.36682 9.86655L12.0002 4.23322C12.1789 4.05544 12.3875 3.96655 12.626 3.96655C12.8643 3.96655 13.0724 4.05427 13.2502 4.22972C13.4279 4.40516 13.5168 4.6135 13.5168 4.85472C13.5168 5.09594 13.4279 5.30544 13.2502 5.48322L6.98349 11.7499C6.80771 11.9277 6.60266 12.0166 6.36832 12.0166C6.13399 12.0166 5.92793 11.9277 5.75016 11.7499L2.78349 8.78322C2.60571 8.60844 2.5196 8.40083 2.52515 8.16039C2.53071 7.92005 2.62121 7.711 2.79665 7.53322C2.9721 7.35544 3.18043 7.26655 3.42165 7.26655C3.66288 7.26655 3.87238 7.35544 4.05015 7.53322L6.36682 9.86655Z" fill="currentColor"/>
                    </svg>
                  )}
                  <span style={{ marginLeft: isSelected ? '0' : '36px' }}>{option.label}</span>
                </div>
              );
            })}
          </div>,
          document.body
        );
      })()}

      {/* Route Filter Menu */}
      {isRouteFilterMenuOpen && routeFilterButtonRef.current && (() => {
        const buttonRect = routeFilterButtonRef.current.getBoundingClientRect();
        return createPortal(
          <div
            data-route-filter-menu
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
                value={stagedRouteFilterMin ?? ''}
                onChange={(e) => setStagedRouteFilterMin(e.target.value ? Number(e.target.value) : null)}
                placeholder="None"
                variant="elevated"
              />
            </div>
            <div style={{ marginBottom: '16px', width: '230px' }}>
              <Input
                type="number"
                label="Less Than"
                value={stagedRouteFilterMax ?? ''}
                onChange={(e) => setStagedRouteFilterMax(e.target.value ? Number(e.target.value) : null)}
                placeholder="None"
                variant="elevated"
              />
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
                  onClick={handleResetRouteFilter}
                  disabled={!hasRouteFiltersToReset}
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                  }}
                  onMouseEnter={(e) => {
                    if (hasRouteFiltersToReset) {
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
                  onClick={handleApplyRouteFilter}
                  disabled={!hasRouteFilterChanges}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Route Sort Menu */}
      {isRouteSortMenuOpen && routeSortButtonRef.current && (() => {
        const buttonRect = routeSortButtonRef.current.getBoundingClientRect();
        const sortOptions: { sortBy: 'name' | 'ridership' | 'largestIncrease' | 'largestDecrease' | 'largestChange'; order: 'asc' | 'desc'; label: string }[] = [
          { sortBy: 'name', order: 'asc', label: 'Name (A-Z)' },
          { sortBy: 'name', order: 'desc', label: 'Name (Z-A)' },
          { sortBy: 'ridership', order: 'desc', label: `${selectedMetric} (highest first)` },
          { sortBy: 'ridership', order: 'asc', label: `${selectedMetric} (lowest first)` },
          // Add percent change options only in comparison mode
          ...(comparisonMode ? [
            { sortBy: 'largestIncrease' as const, order: 'desc' as const, label: 'Largest increase first' },
            { sortBy: 'largestDecrease' as const, order: 'desc' as const, label: 'Largest decrease first' },
            { sortBy: 'largestChange' as const, order: 'desc' as const, label: 'Largest change first' }
          ] : [])
        ];
        return createPortal(
          <div
            data-route-sort-menu
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
            <span
              className="button-small"
              style={{
                padding: '0 16px 8px 16px',
                color: 'var(--text-secondary)',
                fontWeight: '500',
                display: 'block'
              }}
            >
              Sort by
            </span>
            {sortOptions.map((option, index) => {
              const isSelected = routeSortBy === option.sortBy && routeSortOrder === option.order;
              return (
                <div
                  key={`${option.sortBy}-${option.order}`}
                  onClick={() => {
                    setRouteSortBy(option.sortBy);
                    setRouteSortOrder(option.order);
                    setIsRouteSortMenuOpen(false);
                  }}
                  className="button-small"
                  style={{
                    padding: '12px 28px 12px 16px',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
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
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>
                      <path d="M6.36682 9.86655L12.0002 4.23322C12.1789 4.05544 12.3875 3.96655 12.626 3.96655C12.8643 3.96655 13.0724 4.05427 13.2502 4.22972C13.4279 4.40516 13.5168 4.6135 13.5168 4.85472C13.5168 5.09594 13.4279 5.30544 13.2502 5.48322L6.98349 11.7499C6.80771 11.9277 6.60266 12.0166 6.36832 12.0166C6.13399 12.0166 5.92793 11.9277 5.75016 11.7499L2.78349 8.78322C2.60571 8.60844 2.5196 8.40083 2.52515 8.16039C2.53071 7.92005 2.62121 7.711 2.79665 7.53322C2.9721 7.35544 3.18043 7.26655 3.42165 7.26655C3.66288 7.26655 3.87238 7.35544 4.05015 7.53322L6.36682 9.86655Z" fill="currentColor"/>
                    </svg>
                  )}
                  <span style={{ marginLeft: isSelected ? '0' : '36px' }}>{option.label}</span>
                </div>
              );
            })}
          </div>,
          document.body
        );
      })()}

      {/* Trip Tooltip */}
      {tripTooltip && tripTooltip.show && (
        tripTooltip.isComparisonMode ? (
          /* Comparison mode tooltip */
          (() => {
            const value1 = tripTooltip.ridership;
            const value2 = tripTooltip.ridership2 ?? 0;
            const percentChange = value2 !== 0 ? ((value1 - value2) / value2) * 100 : 0;
            const isPositive = percentChange > 0;
            const isNegative = percentChange < 0;
            return (
              <div
                className="label"
                style={{
                  position: 'fixed',
                  left: `${tripTooltip.x}px`,
                  top: `${tripTooltip.y - 8}px`,
                  transform: 'translate(0, -100%)',
                  backgroundColor: 'white',
                  color: 'var(--text-tertiary)',
                  border: '0.5px solid var(--border-default)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  whiteSpace: 'nowrap',
                  zIndex: 10001,
                  boxShadow: 'var(--shadow-lg)',
                  pointerEvents: 'none',
                  minWidth: '120px'
                }}
              >
                <div style={{ marginBottom: '2px', fontWeight: 600, color: 'var(--text-secondary)' }}>{tripTooltip.time}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: DATETIME_1_COLOR,
                    flexShrink: 0
                  }} />
                  <span style={{ color: 'var(--text-tertiary)' }}>{value1.toLocaleString()}</span>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '1px 6px',
                    borderRadius: '12px',
                    backgroundColor: isPositive ? '#dcfce7' : isNegative ? '#fee2e2' : 'var(--bg-secondary)',
                    color: isPositive ? '#166534' : isNegative ? '#991b1b' : 'var(--text-secondary)',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    marginLeft: '2px'
                  }}>
                    {isPositive ? '+' : ''}{percentChange.toFixed(1)}%
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: DATETIME_2_COLOR,
                    flexShrink: 0
                  }} />
                  <span style={{ color: 'var(--text-tertiary)' }}>{value2.toLocaleString()}</span>
                </div>
              </div>
            );
          })()
        ) : (
          /* Normal mode tooltip */
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
            <div>{tripTooltip.ridership.toLocaleString()} {selectedMetric.toLowerCase()}</div>
          </div>
        )
      )}

      {/* Bookmark Capture Scrim - hides the map while we manipulate it for capture */}
      {isCapturingBookmark && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--bg-primary)',
            zIndex: 9998,
          }}
        />
      )}

      {/* Save Bookmark Modal - conditionally render standard or full-screen version */}
      {(() => {
        const bookmarkModalProps = {
          isOpen: isSaveBookmarkModalOpen,
          onClose: () => {
            setIsSaveBookmarkModalOpen(false);
            setIsCapturingBookmark(false);
            setPendingBookmarkImage(null);
          },
          bookmarkImage: pendingBookmarkImage,
          contextTitle: selectedRouteId
            ? (() => {
                const routeName = routesList.find(r => r.id === selectedRouteId)?.name || `Route ${selectedRouteId}`;
                if (selectedTrip) {
                  return `${routeName} (${formatTime12Hour(selectedTrip.start_time)} · ${selectedPattern || selectedTrip.headsign})`;
                } else if (selectedPattern) {
                  return `${routeName} (${selectedPattern})`;
                } else {
                  return routeName;
                }
              })()
            : selectedStopId
            ? stops.find(s => s.properties.stop_id === selectedStopId)?.properties.name || `Stop ${selectedStopId}`
            : activeTab === 'routes' ? 'Routes'
            : activeTab === 'stops' ? 'Stops'
            : 'System',
          contextType: (selectedRouteId ? 'route' : selectedStopId ? 'stop' : activeTab === 'routes' ? 'routes' : activeTab === 'stops' ? 'stops' : 'system') as 'system' | 'routes' | 'stops' | 'route' | 'stop',
          contextSubtitle: (() => {
            // Use season label if a season is selected, otherwise use date range
            let dateStr: string;
            if (appliedSeason) {
              const seasonLabels = { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' };
              dateStr = `${seasonLabels[appliedSeason.season]} ${appliedSeason.year}`;
            } else {
              const start = effectiveDateRange.start;
              const end = effectiveDateRange.end;
              if (!start || !end) return '';

              const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
              dateStr = start.getTime() === end.getTime()
                ? formatDate(start)
                : `${formatDate(start)} - ${formatDate(end)}, ${end.getFullYear()}`;
            }

            const daysStr = appliedDaysMode === 'all' ? 'All Days'
              : appliedDaysMode === 'weekdays' ? 'Weekdays'
              : appliedDaysMode === 'weekends' ? 'Weekends'
              : appliedCustomDays.join(', ');

            const periodsStr = appliedTimePeriods.length === 0 || appliedTimePeriods.length === 5
              ? 'All Day'
              : appliedTimePeriods.join(', ');

            return `${dateStr} (${daysStr} · ${periodsStr})`;
          })(),
          contextFilters: (() => {
            const filters: string[] = [];

            // Helper to format ridership filter
            const formatRidershipFilter = (min: number | null, max: number | null) => {
              if (min !== null && max !== null) {
                return `Boardings: ${min.toLocaleString()} - ${max.toLocaleString()}`;
              } else if (min !== null) {
                return `Boardings >${min.toLocaleString()}`;
              } else if (max !== null) {
                return `Boardings <${max.toLocaleString()}`;
              }
              return null;
            };

            // Check ridership filters based on active tab/selection
            if (selectedTrip) {
              // Trip detail view - no ridership filters shown
            } else if (selectedRouteId) {
              // Route detail view - trip filters
              const ridershipStr = formatRidershipFilter(appliedTripFilterMin, appliedTripFilterMax);
              if (ridershipStr) filters.push(ridershipStr);
            } else if (selectedStopId) {
              // Stop detail view - no ridership filters shown
            } else if (activeTab === 'routes') {
              // Routes list - route filters
              const ridershipStr = formatRidershipFilter(appliedRouteFilterMin, appliedRouteFilterMax);
              if (ridershipStr) filters.push(ridershipStr);
            } else if (activeTab === 'stops') {
              // Stops list - stop filters
              const ridershipStr = formatRidershipFilter(appliedStopFilterMin, appliedStopFilterMax);
              if (ridershipStr) filters.push(ridershipStr);
              // Amenity filters - show "Has X" or "No X" based on filter value
              const amenityFilters = Array.from(appliedStopAmenityFilters.entries())
                .map(([amenity, required]) => required ? amenity : `No ${amenity.toLowerCase()}`);
              if (amenityFilters.length > 0) {
                filters.push(...amenityFilters);
              }
            }

            return filters.length > 0 ? filters.join(' · ') : undefined;
          })(),
          // Comparison mode date labels
          comparisonMode,
          primaryDateLabel: comparisonMode ? (() => {
            // Build primary date label with days/periods
            let dateStr: string;
            if (appliedSeason) {
              const seasonLabels = { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' };
              dateStr = `${seasonLabels[appliedSeason.season]} ${appliedSeason.year}`;
            } else {
              const start = effectiveDateRange.start;
              const end = effectiveDateRange.end;
              if (!start || !end) return '';
              const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
              dateStr = start.getTime() === end.getTime()
                ? formatDate(start)
                : `${formatDate(start)} - ${formatDate(end)}, ${end.getFullYear()}`;
            }
            const daysStr = appliedDaysMode === 'all' ? 'All Days'
              : appliedDaysMode === 'weekdays' ? 'Weekdays'
              : appliedDaysMode === 'weekends' ? 'Weekends'
              : appliedCustomDays.join(', ');
            const periodsStr = appliedTimePeriods.length === 0 || appliedTimePeriods.length === 5
              ? 'All Day'
              : appliedTimePeriods.join(', ');
            return `${dateStr} (${daysStr} · ${periodsStr})`;
          })() : undefined,
          comparisonDateLabel: comparisonMode && comparisonDateRange.start && comparisonDateRange.end ? (() => {
            // Build comparison date label with days/periods
            const start = comparisonDateRange.start;
            const end = comparisonDateRange.end;

            // Check if comparison date range matches a season
            const matchSeason = (): { season: string; year: number } | null => {
              const startMonth = start.getMonth();
              const startDay = start.getDate();
              const endMonth = end.getMonth();
              const endDay = end.getDate();
              const startYear = start.getFullYear();
              const endYear = end.getFullYear();

              // Winter: Sep 21 prev year - Mar 20 year
              if (startMonth === 8 && startDay === 21 && endMonth === 2 && endDay === 20 && endYear === startYear + 1) {
                return { season: 'Winter', year: endYear };
              }
              // Spring: Mar 21 - Jun 21 same year
              if (startMonth === 2 && startDay === 21 && endMonth === 5 && endDay === 21 && startYear === endYear) {
                return { season: 'Spring', year: startYear };
              }
              // Summer: Jun 22 - Sep 18 same year
              if (startMonth === 5 && startDay === 22 && endMonth === 8 && endDay === 18 && startYear === endYear) {
                return { season: 'Summer', year: startYear };
              }
              // Fall: Sep 19 year - Mar 19 next year
              if (startMonth === 8 && startDay === 19 && endMonth === 2 && endDay === 19 && endYear === startYear + 1) {
                return { season: 'Fall', year: startYear };
              }
              return null;
            };

            const seasonMatch = matchSeason();
            let dateStr: string;
            if (seasonMatch) {
              dateStr = `${seasonMatch.season} ${seasonMatch.year}`;
            } else {
              const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
              dateStr = start.getTime() === end.getTime()
                ? formatDate(start)
                : `${formatDate(start)} - ${formatDate(end)}, ${end.getFullYear()}`;
            }

            const daysStr = appliedDaysMode2 === 'all' ? 'All Days'
              : appliedDaysMode2 === 'weekdays' ? 'Weekdays'
              : appliedDaysMode2 === 'weekends' ? 'Weekends'
              : appliedCustomDays2.join(', ');
            const periodsStr = appliedTimePeriods2.length === 0 || appliedTimePeriods2.length === 5
              ? 'All Day'
              : appliedTimePeriods2.join(', ');
            return `${dateStr} (${daysStr} · ${periodsStr})`;
          })() : undefined,
          onSave: (name: string, description: string) => {
          // Capture current state
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const getDaysFromMode = (mode: string, customDays: string[]) => {
            if (mode === 'all') return [0, 1, 2, 3, 4, 5, 6];
            if (mode === 'weekdays') return [1, 2, 3, 4, 5];
            if (mode === 'weekends') return [0, 6];
            return customDays.map(d => dayNames.indexOf(d)).filter(i => i >= 0);
          };

          const bookmarkState: BookmarkState = {
            activeTab,
            selectedRouteId,
            selectedRouteName: selectedRouteId ? routesList.find(r => r.id === selectedRouteId)?.name || null : null,
            selectedStopId,
            selectedStopName: selectedStopId ? stops.find(s => s.properties.stop_id === selectedStopId)?.properties.name || null : null,
            selectedTrip: selectedTrip ? {
              trip_id: selectedTrip.trip_id,
              route_id: selectedTrip.route_id,
              shape_id: selectedTrip.shape_id,
              headsign: selectedTrip.headsign,
              direction_id: selectedTrip.direction_id,
              start_time: selectedTrip.start_time,
              time_period: selectedTrip.time_period,
              ridership: selectedTrip.ridership,
            } : null,
            selectedPattern,
            selectedMetric,
            selectedRouteTab,
            tripFilterMin: appliedTripFilterMin,
            tripFilterMax: appliedTripFilterMax,
            tripSortBy,
            tripSortOrder,
            stopFilterMin: appliedStopFilterMin,
            stopFilterMax: appliedStopFilterMax,
            stopSortBy,
            stopSortOrder,
            stopAmenityFilters: Object.fromEntries(appliedStopAmenityFilters),
            routeFilterMin: appliedRouteFilterMin,
            routeFilterMax: appliedRouteFilterMax,
            routeSortBy,
            routeSortOrder,
            dateRange: {
              start: effectiveDateRange.start?.toISOString() || null,
              end: effectiveDateRange.end?.toISOString() || null,
            },
            selectedDays: getDaysFromMode(appliedDaysMode, appliedCustomDays),
            selectedPeriods: appliedTimePeriods,
            selectedDirection: null, // Direction is derived from pattern
            comparisonMode,
            comparisonDateRange: {
              start: comparisonDateRange.start?.toISOString() || null,
              end: comparisonDateRange.end?.toISOString() || null,
            },
            comparisonDays: getDaysFromMode(appliedDaysMode2, appliedCustomDays2),
            comparisonPeriods: appliedTimePeriods2,
            comparisonDirection: null,
            comparisonSwapped,
            viewState: {
              longitude: viewState.longitude,
              latitude: viewState.latitude,
              zoom: viewState.zoom,
            },
          };

          saveBookmark({
            name,
            description,
            state: bookmarkState,
            ...(pendingBookmarkImage && { image: pendingBookmarkImage }),
          });

          // Clear the pending image and hide scrim
          setPendingBookmarkImage(null);
          setIsCapturingBookmark(false);

            // Show toast notification
            setShowBookmarkSavedToast(true);
            setTimeout(() => setShowBookmarkSavedToast(false), 3000);

            // Refresh bookmarks modal if it's using window.refreshBookmarks
            const refreshFn = (window as unknown as { refreshBookmarks?: () => void }).refreshBookmarks;
            if (refreshFn) refreshFn();
          },
        };

        return <SaveBookmarkModal {...bookmarkModalProps} />;
      })()}

      {/* Bookmarks Modal */}
      <BookmarksModal
        isOpen={isBookmarksModalOpen}
        onClose={() => setIsBookmarksModalOpen(false)}
        onViewBookmark={(bookmark) => {
          // Restore state from bookmark
          const state = bookmark.state;

          // Mark that we're restoring a bookmark to skip auto-reset effects
          isRestoringBookmarkRef.current = true;

          // Set view state
          setActiveTab(state.activeTab as 'home' | 'system' | 'routes' | 'stops' | 'components');
          setSelectedRouteId(state.selectedRouteId);
          setSelectedStopId(state.selectedStopId);
          // Restore route tab (with backwards compatibility for older bookmarks)
          setSelectedRouteTab(state.selectedRouteTab || 'Summary');
          // Restore trip - we now store the full trip object in bookmarks
          // Handle backwards compatibility: older bookmarks may have just trip_id as string
          if (state.selectedTrip && typeof state.selectedTrip === 'object') {
            setSelectedTrip(state.selectedTrip as Trip);
            // Load the trip stop times (async)
            getTripStopTimes(state.selectedTrip.trip_id).then(stopTimes => {
              if (stopTimes) {
                setSelectedTripStops(stopTimes);
              }
            });
          } else {
            setSelectedTrip(null);
          }
          setSelectedPattern(state.selectedPattern);
          setSelectedMetric(state.selectedMetric);

          // Restore trip tab filters (with backwards compatibility)
          setAppliedTripFilterMin(state.tripFilterMin ?? null);
          setAppliedTripFilterMax(state.tripFilterMax ?? null);
          setStagedTripFilterMin(state.tripFilterMin ?? null);
          setStagedTripFilterMax(state.tripFilterMax ?? null);
          setTripSortBy(state.tripSortBy || 'time');
          setTripSortOrder(state.tripSortOrder || 'asc');

          // Restore stops tab filters (with backwards compatibility)
          setAppliedStopFilterMin(state.stopFilterMin ?? null);
          setAppliedStopFilterMax(state.stopFilterMax ?? null);
          setStagedStopFilterMin(state.stopFilterMin ?? null);
          setStagedStopFilterMax(state.stopFilterMax ?? null);
          setStopSortBy(state.stopSortBy || 'ridership');
          setStopSortOrder(state.stopSortOrder || 'desc');
          if (state.stopAmenityFilters) {
            setAppliedStopAmenityFilters(new Map(Object.entries(state.stopAmenityFilters)));
            setStagedStopAmenityFilters(new Map(Object.entries(state.stopAmenityFilters)));
          } else {
            setAppliedStopAmenityFilters(new Map());
            setStagedStopAmenityFilters(new Map());
          }

          // Restore routes tab filters (with backwards compatibility)
          setAppliedRouteFilterMin(state.routeFilterMin ?? null);
          setAppliedRouteFilterMax(state.routeFilterMax ?? null);
          setStagedRouteFilterMin(state.routeFilterMin ?? null);
          setStagedRouteFilterMax(state.routeFilterMax ?? null);
          setRouteSortBy(state.routeSortBy || 'ridership');
          setRouteSortOrder(state.routeSortOrder || 'desc');

          // Restore date range - check if it matches a season first
          if (state.dateRange.start && state.dateRange.end) {
            const startDate = new Date(state.dateRange.start);
            const endDate = new Date(state.dateRange.end);

            // Check if dates match a service season
            const matchedSeason = matchDatesToSeason(startDate, endDate);
            if (matchedSeason) {
              setAppliedSeason(matchedSeason);
              setAppliedStartDate(null);
              setAppliedEndDate(null);
              setAppliedQuickPick(null);
            } else {
              setAppliedStartDate(startDate);
              setAppliedEndDate(endDate);
              setAppliedSeason(null);
              setAppliedQuickPick(null);
            }
          }

          // Restore day/period filters
          const daysToMode = (days: number[]) => {
            if (days.length === 0 || days.length === 7) return 'all';
            if (days.length === 5 && [1,2,3,4,5].every(d => days.includes(d))) return 'weekdays';
            if (days.length === 2 && [0,6].every(d => days.includes(d))) return 'weekends';
            return 'custom';
          };
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          setAppliedDaysMode(daysToMode(state.selectedDays));
          setAppliedCustomDays(state.selectedDays.map(d => dayNames[d]));
          setAppliedTimeMode(state.selectedPeriods.length === 0 ? 'all' : 'custom');
          setAppliedTimePeriods(state.selectedPeriods);

          // Restore comparison mode
          setComparisonMode(state.comparisonMode);
          // Reset exit tooltip state to prevent stale tooltip from showing
          setShowExitTooltip(false);
          if (exitTooltipTimerRef.current) {
            clearTimeout(exitTooltipTimerRef.current);
            exitTooltipTimerRef.current = null;
          }
          if (state.comparisonMode && state.comparisonDateRange.start && state.comparisonDateRange.end) {
            const compStart = new Date(state.comparisonDateRange.start);
            const compEnd = new Date(state.comparisonDateRange.end);

            // Check if comparison dates match a service season
            const matchedCompSeason = matchDatesToSeason(compStart, compEnd);
            if (matchedCompSeason) {
              setStagedSeason2(matchedCompSeason);
              setComparisonDateRange({ start: compStart, end: compEnd });
            } else {
              setStagedSeason2(null);
              setComparisonDateRange({ start: compStart, end: compEnd });
            }

            setAppliedDaysMode2(daysToMode(state.comparisonDays));
            setAppliedCustomDays2(state.comparisonDays.map(d => dayNames[d]));
            setAppliedTimeMode2(state.comparisonPeriods.length === 0 ? 'all' : 'custom');
            setAppliedTimePeriods2(state.comparisonPeriods);
            setComparisonSwapped(state.comparisonSwapped);
          }

          // Restore map view
          setViewState(prev => ({
            ...prev,
            longitude: state.viewState.longitude,
            latitude: state.viewState.latitude,
            zoom: state.viewState.zoom
          }));

          // Open filter panel
          setIsFiltersPanelOpen(true);

          // Clear the restoring flag after all state updates are scheduled
          // Use setTimeout to ensure effects have run
          setTimeout(() => {
            isRestoringBookmarkRef.current = false;
          }, 0);
        }}
      />
      {/* Hidden off-screen map for capturing insight card thumbnails */}
      <MapThumbnailCapture ref={thumbnailCaptureRef} />
    </div>
  );
}
