/**
 * Ridership Data Types
 *
 * Defines the shape of ridership data for API requests/responses.
 * Used throughout the app for type safety and autocomplete.
 */

// === FILTER TYPES ===

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Mon, 6=Sun

export type TimePeriod =
  | "early_am"   // 12:00 AM - 5:59 AM
  | "am_peak"    // 6:00 AM - 8:59 AM
  | "midday"     // 9:00 AM - 2:59 PM
  | "pm_peak"    // 3:00 PM - 6:59 PM
  | "evening"    // 7:00 PM - 9:59 PM
  | "night";     // 10:00 PM - 11:59 PM

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface RidershipFilters {
  dateRange: DateRange;
  daysOfWeek?: DayOfWeek[];
  timePeriods?: TimePeriod[];
  routeIds?: string[];
  directionId?: "0" | "1";
}

// === METRIC TYPES ===

export interface BaseMetrics {
  avgDailyBoardings: number;
  totalBoardings: number;
  avgDailyAlightings: number;
  totalAlightings: number;
  avgDailyActivity: number;
  totalActivity: number;
}

export interface LoadMetrics {
  avgLoad: number;
  maxLoad: number;
}

export interface SystemMetrics extends BaseMetrics, LoadMetrics {
  routeCount: number;
  tripCount: number;
  stopCount: number;
  daysInRange: number;
}

export interface RouteMetrics extends BaseMetrics, LoadMetrics {
  routeId: string;
  routeName: string;
  routeType: string;
  tripCount: number;
  stopCount: number;
  daysInRange: number;
}

export interface StopMetrics extends BaseMetrics {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  routeCount: number;
  tripCount: number;
  daysInRange: number;
}

export interface TripMetrics extends BaseMetrics, LoadMetrics {
  tripId: string;
  routeId: string;
  routeName: string;
  directionId: "0" | "1";
  headsign: string;
  startTime: string;
  timePeriod: TimePeriod;
  daysInRange: number;
}

// === BREAKDOWN TYPES ===

export interface RouteBreakdown {
  routeId: string;
  routeName: string;
  routeType: string;
  metrics: BaseMetrics & LoadMetrics;
  percentOfSystem: number;
}

export interface TimePeriodBreakdown {
  timePeriod: TimePeriod;
  metrics: BaseMetrics & LoadMetrics;
  percentOfTotal: number;
}

export interface DirectionBreakdown {
  directionId: "0" | "1";
  headsign: string;
  metrics: BaseMetrics & LoadMetrics;
  percentOfRoute: number;
}

export interface StopBreakdown extends BaseMetrics, Partial<LoadMetrics> {
  stopId: string;
  stopName: string;
  stopSequence: number;
  lat: number;
  lon: number;
}

export interface SegmentBreakdown {
  fromStopId: string;
  fromStopName: string;
  fromStopSequence: number;
  toStopId: string;
  toStopName: string;
  toStopSequence: number;
  avgLoad: number;
  maxLoad: number;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
}

export interface RouteStopBreakdown {
  routeId: string;
  routeName: string;
  metrics: BaseMetrics;
  percentOfStop: number;
}

// === RESPONSE TYPES ===

export interface SystemResponse {
  filters: RidershipFilters;
  metrics: SystemMetrics;
  byRoute: RouteBreakdown[];
  byTimePeriod: TimePeriodBreakdown[];
}

export interface RouteResponse {
  filters: RidershipFilters;
  metrics: RouteMetrics;
  byDirection: DirectionBreakdown[];
  byTimePeriod: TimePeriodBreakdown[];
}

export interface RouteStopsResponse {
  filters: RidershipFilters;
  routeId: string;
  routeName: string;
  stops: StopBreakdown[];
  maxBoardings: number;
  maxAlightings: number;
  maxActivity: number;
}

export interface RouteSegmentsResponse {
  filters: RidershipFilters;
  routeId: string;
  routeName: string;
  segments: SegmentBreakdown[];
  minLoad: number;
  maxLoad: number;
  avgLoad: number;
}

export interface TripResponse {
  filters: RidershipFilters;
  metrics: TripMetrics;
  stops: (StopBreakdown & { arrivalTime: string })[];
  segments: SegmentBreakdown[];
  maxStopBoardings: number;
  maxStopActivity: number;
  maxSegmentLoad: number;
}

export interface StopResponse {
  filters: RidershipFilters;
  metrics: StopMetrics;
  byRoute: RouteStopBreakdown[];
  byTimePeriod: TimePeriodBreakdown[];
}

export interface AllStopsResponse {
  filters: RidershipFilters;
  stops: {
    stopId: string;
    stopName: string;
    lat: number;
    lon: number;
    totalBoardings: number;
    totalAlightings: number;
    avgDailyActivity: number;
    routeCount: number;
  }[];
  maxBoardings: number;
  maxActivity: number;
}
