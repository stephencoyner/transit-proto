/**
 * Ridership API Route Handler
 *
 * Endpoints:
 * GET /api/ridership/system     - System-wide metrics
 * GET /api/ridership/route/[id] - Route-level metrics
 * GET /api/ridership/route/[id]/stops - Route stop metrics
 * GET /api/ridership/route/[id]/segments - Route segment load
 * GET /api/ridership/trip/[id]  - Trip-level metrics
 * GET /api/ridership/stop/[id]  - Stop-level metrics (disaggregated)
 * GET /api/ridership/stops      - All stops for map
 *
 * Query params (all endpoints):
 * - startDate: YYYY-MM-DD (required)
 * - endDate: YYYY-MM-DD (required)
 * - days: comma-separated day numbers (0=Mon, 6=Sun)
 * - periods: comma-separated time periods
 * - routes: comma-separated route IDs (where applicable)
 * - direction: 0 or 1
 */

import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import type {
  RidershipFilters,
  DayOfWeek,
  TimePeriod,
  SystemResponse,
  RouteResponse,
  RouteStopsResponse,
  RouteSegmentsResponse,
  TripResponse,
  StopResponse,
  AllStopsResponse,
} from "@/types/ridership";
import * as queries from "@/lib/ridership-queries";

// ============================================================================
// DATABASE CONNECTION (Singleton pattern for performance)
// ============================================================================
// Open DB once at module load to avoid file I/O on every request.
// Use process.cwd() to find the file correctly in Next.js production/Vercel.
// IMPORTANT: DB file should be in /data (not /public) to prevent client download.
// ============================================================================

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.cwd(), "data/ridership.db");
    db = new Database(dbPath, { readonly: true });

    // Optimize for read-heavy workloads (readonly-safe pragmas only)
    db.pragma("cache_size = -64000"); // 64MB cache
  }
  return db;
}

// Parse filters from query params
function parseFilters(searchParams: URLSearchParams): RidershipFilters {
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    throw new Error("startDate and endDate are required");
  }

  const filters: RidershipFilters = {
    dateRange: { startDate, endDate },
  };

  const days = searchParams.get("days");
  if (days) {
    filters.daysOfWeek = days.split(",").map(d => parseInt(d, 10) as DayOfWeek);
  }

  const periods = searchParams.get("periods");
  if (periods) {
    filters.timePeriods = periods.split(",") as TimePeriod[];
  }

  const routes = searchParams.get("routes");
  if (routes) {
    filters.routeIds = routes.split(",");
  }

  const direction = searchParams.get("direction");
  if (direction === "0" || direction === "1") {
    filters.directionId = direction;
  }

  return filters;
}

// Calculate derived metrics
function calculateDerivedMetrics(
  totalBoardings: number,
  totalAlightings: number,
  daysInRange: number
) {
  return {
    avgDailyBoardings: Math.round(totalBoardings / daysInRange),
    totalBoardings,
    avgDailyAlightings: Math.round(totalAlightings / daysInRange),
    totalAlightings,
    avgDailyActivity: Math.round((totalBoardings + totalAlightings) / daysInRange),
    totalActivity: totalBoardings + totalAlightings,
  };
}

// === SYSTEM ENDPOINT ===

export async function getSystem(request: NextRequest): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const db = getDb();
    const daysInRange = queries.getDaysInRange(filters);

    // Get system metrics
    const metricsQuery = queries.querySystemMetrics(filters);
    const metricsRow = db.prepare(metricsQuery.sql).get(...metricsQuery.params) as Record<string, unknown>;

    // Get by route
    const byRouteQuery = queries.querySystemByRoute(filters);
    const byRouteRows = db.prepare(byRouteQuery.sql).all(...byRouteQuery.params) as Record<string, unknown>[];

    // Get by time period
    const byPeriodQuery = queries.querySystemByTimePeriod(filters);
    const byPeriodRows = db.prepare(byPeriodQuery.sql).all(...byPeriodQuery.params) as Record<string, unknown>[];

    // Get stop count
    const stopCountQuery = queries.queryAllStops(filters);
    const stopRows = db.prepare(stopCountQuery.sql).all(...stopCountQuery.params) as Record<string, unknown>[];

    const response: SystemResponse = {
      filters,
      metrics: {
        ...calculateDerivedMetrics(metricsRow.total_boardings as number, metricsRow.total_alightings as number, daysInRange),
        avgLoad: Math.round((metricsRow.avg_load as number) * 10) / 10,
        maxLoad: metricsRow.max_load as number,
        routeCount: metricsRow.route_count as number,
        tripCount: metricsRow.trip_count as number,
        stopCount: stopRows.length,
        daysInRange,
      },
      byRoute: byRouteRows.map(row => ({
        routeId: row.route_id as string,
        routeName: row.route_name as string,
        routeType: row.route_type as string,
        metrics: {
          ...calculateDerivedMetrics(row.total_boardings as number, row.total_alightings as number, daysInRange),
          avgLoad: Math.round((row.avg_load as number) * 10) / 10,
          maxLoad: row.max_load as number,
        },
        percentOfSystem: Math.round(((row.total_boardings as number) / (metricsRow.total_boardings as number)) * 1000) / 10,
      })),
      byTimePeriod: byPeriodRows.map(row => ({
        timePeriod: row.time_period as TimePeriod,
        metrics: {
          ...calculateDerivedMetrics(row.total_boardings as number, row.total_alightings as number, daysInRange),
          avgLoad: Math.round((row.avg_load as number) * 10) / 10,
          maxLoad: row.max_load as number,
        },
        percentOfTotal: Math.round(((row.total_boardings as number) / (metricsRow.total_boardings as number)) * 1000) / 10,
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

// === ROUTE ENDPOINT ===

export async function getRoute(
  request: NextRequest,
  routeId: string
): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const db = getDb();
    const daysInRange = queries.getDaysInRange(filters);

    // Get route metrics
    const metricsQuery = queries.queryRouteMetrics(filters, routeId);
    const metricsRow = db.prepare(metricsQuery.sql).get(...metricsQuery.params) as Record<string, unknown> | undefined;

    if (!metricsRow) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    // Get by direction
    const byDirQuery = queries.queryRouteByDirection(filters, routeId);
    const byDirRows = db.prepare(byDirQuery.sql).all(...byDirQuery.params) as Record<string, unknown>[];

    const response: RouteResponse = {
      filters,
      metrics: {
        routeId: metricsRow.route_id as string,
        routeName: metricsRow.route_name as string,
        routeType: metricsRow.route_type as string,
        tripCount: metricsRow.trip_count as number,
        stopCount: metricsRow.stop_count as number,
        daysInRange,
        ...calculateDerivedMetrics(metricsRow.total_boardings as number, metricsRow.total_alightings as number, daysInRange),
        avgLoad: Math.round((metricsRow.avg_load as number) * 10) / 10,
        maxLoad: metricsRow.max_load as number,
      },
      byDirection: byDirRows.map(row => ({
        directionId: row.direction_id as "0" | "1",
        headsign: row.direction_id === "1" ? "Inbound" : "Outbound",
        metrics: {
          ...calculateDerivedMetrics(row.total_boardings as number, row.total_alightings as number, daysInRange),
          avgLoad: Math.round((row.avg_load as number) * 10) / 10,
          maxLoad: row.max_load as number,
        },
        percentOfRoute: Math.round(((row.total_boardings as number) / (metricsRow.total_boardings as number)) * 1000) / 10,
      })),
      byTimePeriod: [], // TODO: Add time period breakdown
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

// === ROUTE STOPS ENDPOINT ===

export async function getRouteStops(
  request: NextRequest,
  routeId: string
): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const db = getDb();
    const daysInRange = queries.getDaysInRange(filters);

    // Get route name
    const routeRow = db.prepare("SELECT route_name FROM routes WHERE route_id = ?").get(routeId) as Record<string, unknown> | undefined;
    if (!routeRow) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    // Get stops
    const stopsQuery = queries.queryRouteStops(filters, routeId);
    const stopsRows = db.prepare(stopsQuery.sql).all(...stopsQuery.params) as Record<string, unknown>[];

    const stops = stopsRows.map(row => ({
      stopId: row.stop_id as string,
      stopName: row.stop_name as string,
      stopSequence: row.stop_sequence as number,
      lat: row.lat as number,
      lon: row.lon as number,
      ...calculateDerivedMetrics(row.total_boardings as number, row.total_alightings as number, daysInRange),
    }));

    const response: RouteStopsResponse = {
      filters,
      routeId,
      routeName: routeRow.route_name as string,
      stops,
      maxBoardings: Math.max(...stops.map(s => s.totalBoardings)),
      maxAlightings: Math.max(...stops.map(s => s.totalAlightings)),
      maxActivity: Math.max(...stops.map(s => s.totalActivity)),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

// === ROUTE SEGMENTS ENDPOINT ===

export async function getRouteSegments(
  request: NextRequest,
  routeId: string
): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const db = getDb();

    // Get route name
    const routeRow = db.prepare("SELECT route_name FROM routes WHERE route_id = ?").get(routeId) as Record<string, unknown> | undefined;
    if (!routeRow) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    // Get segments
    const segmentsQuery = queries.queryRouteSegments(filters, routeId);
    const segmentsRows = db.prepare(segmentsQuery.sql).all(...segmentsQuery.params) as Record<string, unknown>[];

    const segments = segmentsRows.map(row => ({
      fromStopId: row.from_stop_id as string,
      fromStopName: row.from_stop_name as string,
      fromStopSequence: row.from_stop_sequence as number,
      toStopId: row.to_stop_id as string,
      toStopName: row.to_stop_name as string,
      toStopSequence: row.to_stop_sequence as number,
      avgLoad: Math.round((row.avg_load as number) * 10) / 10,
      maxLoad: row.max_load as number,
      fromLat: row.from_lat as number,
      fromLon: row.from_lon as number,
      toLat: row.to_lat as number,
      toLon: row.to_lon as number,
    }));

    const loads = segments.map(s => s.avgLoad);

    const response: RouteSegmentsResponse = {
      filters,
      routeId,
      routeName: routeRow.route_name as string,
      segments,
      minLoad: Math.min(...loads),
      maxLoad: Math.max(...segments.map(s => s.maxLoad)),
      avgLoad: Math.round((loads.reduce((a, b) => a + b, 0) / loads.length) * 10) / 10,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

// === TRIP ENDPOINT ===

export async function getTrip(
  request: NextRequest,
  tripId: string
): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const db = getDb();
    const daysInRange = queries.getDaysInRange(filters);

    // Get trip metrics
    const metricsQuery = queries.queryTripMetrics(filters, tripId);
    const metricsRow = db.prepare(metricsQuery.sql).get(...metricsQuery.params) as Record<string, unknown> | undefined;

    if (!metricsRow) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // Get stops
    const stopsQuery = queries.queryTripStops(filters, tripId);
    const stopsRows = db.prepare(stopsQuery.sql).all(...stopsQuery.params) as Record<string, unknown>[];

    const stops = stopsRows.map(row => ({
      stopId: row.stop_id as string,
      stopName: row.stop_name as string,
      stopSequence: row.stop_sequence as number,
      arrivalTime: "", // Could be derived from GTFS if needed
      lat: row.lat as number,
      lon: row.lon as number,
      ...calculateDerivedMetrics(row.total_boardings as number, row.total_alightings as number, daysInRange),
    }));

    // Get segments (derived from stop_ridership using stop_sequence)
    const segmentsQuery = queries.queryTripSegments(filters, tripId);
    const segmentsRows = db.prepare(segmentsQuery.sql).all(...segmentsQuery.params) as Record<string, unknown>[];

    const segments = segmentsRows.map(row => ({
      fromStopId: row.from_stop_id as string,
      fromStopName: row.from_stop_name as string,
      fromStopSequence: row.from_stop_sequence as number,
      toStopId: row.to_stop_id as string,
      toStopName: row.to_stop_name as string,
      toStopSequence: row.to_stop_sequence as number,
      avgLoad: Math.round((row.avg_load as number) * 10) / 10,
      maxLoad: row.max_load as number,
      fromLat: row.from_lat as number,
      fromLon: row.from_lon as number,
      toLat: row.to_lat as number,
      toLon: row.to_lon as number,
    }));

    const response: TripResponse = {
      filters,
      metrics: {
        tripId: metricsRow.trip_id as string,
        routeId: metricsRow.route_id as string,
        routeName: metricsRow.route_name as string,
        directionId: metricsRow.direction_id as "0" | "1",
        headsign: metricsRow.direction_id === "1" ? "Inbound" : "Outbound",
        startTime: metricsRow.start_time as string,
        timePeriod: metricsRow.time_period as TimePeriod,
        daysInRange: metricsRow.days_in_range as number,
        ...calculateDerivedMetrics(metricsRow.total_boardings as number, metricsRow.total_alightings as number, daysInRange),
        avgLoad: Math.round((metricsRow.avg_load as number) * 10) / 10,
        maxLoad: metricsRow.max_load as number,
      },
      stops,
      segments,
      // For color scaling on maps
      maxStopBoardings: Math.max(...stops.map(s => s.totalBoardings), 0),
      maxStopActivity: Math.max(...stops.map(s => s.totalActivity), 0),
      maxSegmentLoad: Math.max(...segments.map(s => s.maxLoad), 0),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

// === STOP ENDPOINT (DISAGGREGATED) ===

export async function getStop(
  request: NextRequest,
  stopId: string
): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const db = getDb();
    const daysInRange = queries.getDaysInRange(filters);

    // Get stop metrics
    const metricsQuery = queries.queryStopMetrics(filters, stopId);
    const metricsRow = db.prepare(metricsQuery.sql).get(...metricsQuery.params) as Record<string, unknown> | undefined;

    if (!metricsRow) {
      return NextResponse.json({ error: "Stop not found" }, { status: 404 });
    }

    // Get by route
    const byRouteQuery = queries.queryStopByRoute(filters, stopId);
    const byRouteRows = db.prepare(byRouteQuery.sql).all(...byRouteQuery.params) as Record<string, unknown>[];

    const response: StopResponse = {
      filters,
      metrics: {
        stopId: metricsRow.stop_id as string,
        stopName: metricsRow.stop_name as string,
        lat: metricsRow.lat as number,
        lon: metricsRow.lon as number,
        routeCount: metricsRow.route_count as number,
        tripCount: metricsRow.trip_count as number,
        daysInRange,
        ...calculateDerivedMetrics(metricsRow.total_boardings as number, metricsRow.total_alightings as number, daysInRange),
      },
      byRoute: byRouteRows.map(row => ({
        routeId: row.route_id as string,
        routeName: row.route_name as string,
        metrics: calculateDerivedMetrics(row.total_boardings as number, row.total_alightings as number, daysInRange),
        percentOfStop: Math.round(((row.total_boardings as number) / (metricsRow.total_boardings as number)) * 1000) / 10,
      })),
      byTimePeriod: [], // TODO: Add time period breakdown
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

// === ALL STOPS ENDPOINT ===

export async function getAllStops(request: NextRequest): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const db = getDb();
    const daysInRange = queries.getDaysInRange(filters);

    const stopsQuery = queries.queryAllStops(filters);
    const stopsRows = db.prepare(stopsQuery.sql).all(...stopsQuery.params) as Record<string, unknown>[];

    const stops = stopsRows.map(row => ({
      stopId: row.stop_id as string,
      stopName: row.stop_name as string,
      lat: row.lat as number,
      lon: row.lon as number,
      totalBoardings: row.total_boardings as number,
      totalAlightings: row.total_alightings as number,
      avgDailyActivity: Math.round(((row.total_boardings as number) + (row.total_alightings as number)) / daysInRange),
      routeCount: row.route_count as number,
    }));

    const response: AllStopsResponse = {
      filters,
      stops,
      maxBoardings: Math.max(...stops.map(s => s.totalBoardings)),
      maxActivity: Math.max(...stops.map(s => s.avgDailyActivity)),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

// === SYSTEM BY DATE ENDPOINT ===

export interface SystemByDateResponse {
  filters: RidershipFilters;
  data: Array<{
    date: string;
    dayOfWeek: number;
    totalBoardings: number;
    totalAlightings: number;
    avgLoad: number;
    maxLoad: number;
  }>;
}

export async function getSystemByDate(request: NextRequest): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const db = getDb();

    const query = queries.querySystemByDate(filters);
    const rows = db.prepare(query.sql).all(...query.params) as Record<string, unknown>[];

    const response: SystemByDateResponse = {
      filters,
      data: rows.map(row => ({
        date: row.date as string,
        dayOfWeek: row.day_of_week as number,
        totalBoardings: row.total_boardings as number,
        totalAlightings: row.total_alightings as number,
        avgLoad: Math.round((row.avg_load as number) * 10) / 10,
        maxLoad: row.max_load as number,
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

// === SYSTEM BY DAY OF WEEK ENDPOINT ===

export interface SystemByDayResponse {
  filters: RidershipFilters;
  data: Array<{
    dayOfWeek: number;
    dayName: string;
    totalBoardings: number;
    totalAlightings: number;
    avgLoad: number;
    maxLoad: number;
    dayCount: number;
    avgDailyBoardings: number;
  }>;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function getSystemByDay(request: NextRequest): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const db = getDb();

    const query = queries.querySystemByDayOfWeek(filters);
    const rows = db.prepare(query.sql).all(...query.params) as Record<string, unknown>[];

    const response: SystemByDayResponse = {
      filters,
      data: rows.map(row => ({
        dayOfWeek: row.day_of_week as number,
        dayName: DAY_NAMES[row.day_of_week as number],
        totalBoardings: row.total_boardings as number,
        totalAlightings: row.total_alightings as number,
        avgLoad: Math.round((row.avg_load as number) * 10) / 10,
        maxLoad: row.max_load as number,
        dayCount: row.day_count as number,
        avgDailyBoardings: Math.round((row.total_boardings as number) / (row.day_count as number)),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

// === STOP BY DATE ENDPOINT ===

export interface StopByDateResponse {
  filters: RidershipFilters;
  stopId: string;
  data: Array<{
    date: string;
    dayOfWeek: number;
    totalBoardings: number;
    totalAlightings: number;
  }>;
}

export async function getStopByDate(
  request: NextRequest,
  stopId: string
): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const db = getDb();

    const query = queries.queryStopByDate(filters, stopId);
    const rows = db.prepare(query.sql).all(...query.params) as Record<string, unknown>[];

    const response: StopByDateResponse = {
      filters,
      stopId,
      data: rows.map(row => ({
        date: row.date as string,
        dayOfWeek: row.day_of_week as number,
        totalBoardings: row.total_boardings as number,
        totalAlightings: row.total_alightings as number,
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

// === STOP BY DAY OF WEEK ENDPOINT ===

export interface StopByDayResponse {
  filters: RidershipFilters;
  stopId: string;
  data: Array<{
    dayOfWeek: number;
    dayName: string;
    totalBoardings: number;
    totalAlightings: number;
    dayCount: number;
    avgDailyBoardings: number;
  }>;
}

export async function getStopByDay(
  request: NextRequest,
  stopId: string
): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const db = getDb();

    const query = queries.queryStopByDayOfWeek(filters, stopId);
    const rows = db.prepare(query.sql).all(...query.params) as Record<string, unknown>[];

    const response: StopByDayResponse = {
      filters,
      stopId,
      data: rows.map(row => ({
        dayOfWeek: row.day_of_week as number,
        dayName: DAY_NAMES[row.day_of_week as number],
        totalBoardings: row.total_boardings as number,
        totalAlightings: row.total_alightings as number,
        dayCount: row.day_count as number,
        avgDailyBoardings: Math.round((row.total_boardings as number) / (row.day_count as number)),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

// === STOP BY TIME PERIOD ENDPOINT ===

export interface StopByPeriodResponse {
  filters: RidershipFilters;
  stopId: string;
  data: Array<{
    timePeriod: TimePeriod;
    totalBoardings: number;
    totalAlightings: number;
  }>;
}

export async function getStopByPeriod(
  request: NextRequest,
  stopId: string
): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const db = getDb();
    const daysInRange = queries.getDaysInRange(filters);

    const query = queries.queryStopByTimePeriod(filters, stopId);
    const rows = db.prepare(query.sql).all(...query.params) as Record<string, unknown>[];

    const response: StopByPeriodResponse = {
      filters,
      stopId,
      data: rows.map(row => ({
        timePeriod: row.time_period as TimePeriod,
        totalBoardings: row.total_boardings as number,
        totalAlightings: row.total_alightings as number,
        avgDailyBoardings: Math.round((row.total_boardings as number) / daysInRange),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
