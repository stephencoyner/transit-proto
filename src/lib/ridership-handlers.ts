/**
 * Ridership API Route Handler (Supabase Version)
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
import { getServerSupabase } from "@/lib/supabase";
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

// Calculate days in range considering day-of-week filter
function getDaysInRange(filters: RidershipFilters): number {
  const start = new Date(filters.dateRange.startDate);
  const end = new Date(filters.dateRange.endDate);
  let count = 0;

  const allowedDays = filters.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    // JavaScript: 0=Sunday, but our data uses 0=Monday
    // Convert JS day (0=Sun) to our format (0=Mon)
    const jsDay = d.getDay();
    const ourDay = jsDay === 0 ? 6 : jsDay - 1;
    if (allowedDays.includes(ourDay as DayOfWeek)) {
      count++;
    }
  }

  return Math.max(count, 1);
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

// Build base query filters for stop_ridership table
function buildStopRidershipFilters(filters: RidershipFilters) {
  return {
    startDate: filters.dateRange.startDate,
    endDate: filters.dateRange.endDate,
    days: filters.daysOfWeek,
    periods: filters.timePeriods,
    routes: filters.routeIds,
    direction: filters.directionId,
  };
}

// === SYSTEM ENDPOINT ===

export async function getSystem(request: NextRequest): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const supabase = getServerSupabase();
    const daysInRange = getDaysInRange(filters);
    const f = buildStopRidershipFilters(filters);

    // Use RPC functions for server-side aggregation (avoids 1000 row limit)
    const [systemResult, byRouteResult, byPeriodResult] = await Promise.all([
      // System-level metrics
      supabase.rpc('get_system_metrics', {
        p_start_date: f.startDate,
        p_end_date: f.endDate,
        p_days: f.days || null,
        p_periods: f.periods || null,
      }),
      // By-route aggregation
      supabase.rpc('get_metrics_by_route', {
        p_start_date: f.startDate,
        p_end_date: f.endDate,
        p_days: f.days || null,
        p_periods: f.periods || null,
      }),
      // By-period aggregation
      supabase.rpc('get_metrics_by_period', {
        p_start_date: f.startDate,
        p_end_date: f.endDate,
        p_days: f.days || null,
        p_routes: f.routes || null,
      }),
    ]);

    if (systemResult.error) throw systemResult.error;
    if (byRouteResult.error) throw byRouteResult.error;
    if (byPeriodResult.error) throw byPeriodResult.error;

    const systemMetrics = systemResult.data as {
      totalBoardings: number;
      totalAlightings: number;
      avgLoad: number;
      maxLoad: number;
      rowCount: number;
    };

    const byRouteData = (byRouteResult.data || []) as Array<{
      route_id: string;
      route_name: string;
      route_type: string;
      total_boardings: number;
      total_alightings: number;
      avg_load: number;
      max_load: number;
    }>;

    const byPeriodData = (byPeriodResult.data || []) as Array<{
      time_period: TimePeriod;
      total_boardings: number;
      total_alightings: number;
      avg_load: number;
      max_load: number;
    }>;

    const totalBoardings = systemMetrics?.totalBoardings || 0;
    const totalAlightings = systemMetrics?.totalAlightings || 0;

    // Build byRoute response
    const byRoute = byRouteData.map(row => ({
      routeId: row.route_id,
      routeName: row.route_name || row.route_id,
      routeType: row.route_type || 'bus',
      metrics: {
        ...calculateDerivedMetrics(row.total_boardings, row.total_alightings, daysInRange),
        avgLoad: Math.round((row.avg_load || 0) * 10) / 10,
        maxLoad: row.max_load || 0,
      },
      percentOfSystem: totalBoardings > 0 ? Math.round((row.total_boardings / totalBoardings) * 1000) / 10 : 0,
    })).sort((a, b) => b.metrics.totalBoardings - a.metrics.totalBoardings);

    // Build byTimePeriod response
    const byTimePeriod = byPeriodData.map(row => ({
      timePeriod: row.time_period,
      metrics: {
        ...calculateDerivedMetrics(row.total_boardings, row.total_alightings, daysInRange),
        avgLoad: Math.round((row.avg_load || 0) * 10) / 10,
        maxLoad: row.max_load || 0,
      },
      percentOfTotal: totalBoardings > 0 ? Math.round((row.total_boardings / totalBoardings) * 1000) / 10 : 0,
    }));

    // Get counts - use simple count queries (these are efficient)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [routeCountResult, stopCountResult] = await Promise.all([
      supabase.from('routes').select('route_id', { count: 'exact', head: true }),
      supabase.from('stops').select('stop_id', { count: 'exact', head: true }),
    ]);

    const response: SystemResponse = {
      filters,
      metrics: {
        ...calculateDerivedMetrics(totalBoardings, totalAlightings, daysInRange),
        avgLoad: Math.round((systemMetrics?.avgLoad || 0) * 10) / 10,
        maxLoad: systemMetrics?.maxLoad || 0,
        routeCount: byRouteData.length,
        tripCount: 0, // Not needed for display
        stopCount: stopCountResult.count || 0,
        daysInRange,
      },
      byRoute,
      byTimePeriod,
    };

    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('System endpoint error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}

// === ROUTE ENDPOINT ===

export async function getRoute(
  request: NextRequest,
  routeId: string
): Promise<NextResponse> {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const supabase = getServerSupabase();
    const daysInRange = getDaysInRange(filters);
    const f = buildStopRidershipFilters(filters);

    // Get route info
    const { data: routeInfo, error: routeError } = await supabase
      .from('routes')
      .select('route_id, route_name, route_type')
      .eq('route_id', routeId)
      .single();

    if (routeError || !routeInfo) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    // Use RPC functions for server-side aggregation
    const [metricsResult, byDirectionResult, byPeriodResult] = await Promise.all([
      supabase.rpc('get_route_metrics', {
        p_route_id: routeId,
        p_start_date: f.startDate,
        p_end_date: f.endDate,
        p_days: f.days || null,
        p_periods: f.periods || null,
        p_direction: f.direction || null,
      }),
      supabase.rpc('get_route_by_direction', {
        p_route_id: routeId,
        p_start_date: f.startDate,
        p_end_date: f.endDate,
        p_days: f.days || null,
        p_periods: f.periods || null,
      }),
      supabase.rpc('get_route_by_period', {
        p_route_id: routeId,
        p_start_date: f.startDate,
        p_end_date: f.endDate,
        p_days: f.days || null,
        p_direction: f.direction || null,
      }),
    ]);

    if (metricsResult.error) throw metricsResult.error;
    if (byDirectionResult.error) throw byDirectionResult.error;
    if (byPeriodResult.error) throw byPeriodResult.error;

    const routeMetrics = metricsResult.data as {
      totalBoardings: number;
      totalAlightings: number;
      avgLoad: number;
      maxLoad: number;
      tripCount: number;
      stopCount: number;
    };

    const byDirectionData = (byDirectionResult.data || []) as Array<{
      direction_id: string;
      total_boardings: number;
      total_alightings: number;
      avg_load: number;
      max_load: number;
    }>;

    const byPeriodData = (byPeriodResult.data || []) as Array<{
      time_period: TimePeriod;
      total_boardings: number;
      total_alightings: number;
      avg_load: number;
      max_load: number;
    }>;

    const totalBoardings = routeMetrics?.totalBoardings || 0;
    const totalAlightings = routeMetrics?.totalAlightings || 0;

    const byDirection = byDirectionData.map(row => ({
      directionId: String(row.direction_id) as "0" | "1",
      headsign: row.direction_id === "1" ? "Inbound" : "Outbound",
      metrics: {
        ...calculateDerivedMetrics(row.total_boardings, row.total_alightings, daysInRange),
        avgLoad: Math.round((row.avg_load || 0) * 10) / 10,
        maxLoad: row.max_load || 0,
      },
      percentOfRoute: totalBoardings > 0 ? Math.round((row.total_boardings / totalBoardings) * 1000) / 10 : 0,
    }));

    const byTimePeriod = byPeriodData.map(row => ({
      timePeriod: row.time_period,
      metrics: {
        ...calculateDerivedMetrics(row.total_boardings, row.total_alightings, daysInRange),
        avgLoad: Math.round((row.avg_load || 0) * 10) / 10,
        maxLoad: row.max_load || 0,
      },
      percentOfTotal: totalBoardings > 0 ? Math.round((row.total_boardings / totalBoardings) * 1000) / 10 : 0,
    }));

    const response: RouteResponse = {
      filters,
      metrics: {
        routeId: routeInfo.route_id,
        routeName: routeInfo.route_name,
        routeType: routeInfo.route_type,
        tripCount: routeMetrics?.tripCount || 0,
        stopCount: routeMetrics?.stopCount || 0,
        daysInRange,
        ...calculateDerivedMetrics(totalBoardings, totalAlightings, daysInRange),
        avgLoad: Math.round((routeMetrics?.avgLoad || 0) * 10) / 10,
        maxLoad: routeMetrics?.maxLoad || 0,
      },
      byDirection,
      byTimePeriod,
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
    const supabase = getServerSupabase();
    const daysInRange = getDaysInRange(filters);
    const f = buildStopRidershipFilters(filters);

    // Get route name
    const { data: routeInfo } = await supabase
      .from('routes')
      .select('route_name')
      .eq('route_id', routeId)
      .single();

    if (!routeInfo) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    // Use RPC function for server-side aggregation
    const { data: rpcData, error } = await supabase.rpc('get_route_stops', {
      p_route_id: routeId,
      p_start_date: f.startDate,
      p_end_date: f.endDate,
      p_days: f.days || null,
      p_periods: f.periods || null,
      p_direction: f.direction || null,
    });

    if (error) throw error;

    const stopsData = (rpcData || []) as Array<{
      stop_id: string;
      stop_name: string;
      lat: number;
      lon: number;
      min_sequence: number;
      total_boardings: number;
      total_alightings: number;
    }>;

    const stops = stopsData.map(row => ({
      stopId: row.stop_id,
      stopName: row.stop_name || row.stop_id,
      stopSequence: row.min_sequence,
      lat: row.lat || 0,
      lon: row.lon || 0,
      ...calculateDerivedMetrics(row.total_boardings, row.total_alightings, daysInRange),
    }));

    const response: RouteStopsResponse = {
      filters,
      routeId,
      routeName: routeInfo.route_name,
      stops,
      maxBoardings: Math.max(...stops.map(s => s.totalBoardings), 0),
      maxAlightings: Math.max(...stops.map(s => s.totalAlightings), 0),
      maxActivity: Math.max(...stops.map(s => s.totalActivity), 0),
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
    const supabase = getServerSupabase();
    const f = buildStopRidershipFilters(filters);

    // Get route name
    const { data: routeInfo } = await supabase
      .from('routes')
      .select('route_name')
      .eq('route_id', routeId)
      .single();

    if (!routeInfo) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    // Use RPC function for server-side aggregation
    const { data: rpcData, error } = await supabase.rpc('get_route_segments', {
      p_route_id: routeId,
      p_start_date: f.startDate,
      p_end_date: f.endDate,
      p_days: f.days || null,
      p_periods: f.periods || null,
      p_direction: f.direction || null,
    });

    if (error) throw error;

    const segmentStops = (rpcData || []) as Array<{
      stop_id: string;
      stop_name: string;
      lat: number;
      lon: number;
      stop_sequence: number;
      avg_load: number;
      max_load: number;
    }>;

    // Build segments from consecutive stops
    const segments = [];
    for (let i = 0; i < segmentStops.length - 1; i++) {
      const from = segmentStops[i];
      const to = segmentStops[i + 1];
      segments.push({
        fromStopId: from.stop_id,
        fromStopName: from.stop_name || from.stop_id,
        fromStopSequence: from.stop_sequence,
        toStopId: to.stop_id,
        toStopName: to.stop_name || to.stop_id,
        toStopSequence: to.stop_sequence,
        avgLoad: Math.round((from.avg_load || 0) * 10) / 10,
        maxLoad: from.max_load || 0,
        fromLat: from.lat || 0,
        fromLon: from.lon || 0,
        toLat: to.lat || 0,
        toLon: to.lon || 0,
      });
    }

    const loads = segments.map(s => s.avgLoad);

    const response: RouteSegmentsResponse = {
      filters,
      routeId,
      routeName: routeInfo.route_name,
      segments,
      minLoad: loads.length > 0 ? Math.min(...loads) : 0,
      maxLoad: segments.length > 0 ? Math.max(...segments.map(s => s.maxLoad)) : 0,
      avgLoad: loads.length > 0 ? Math.round((loads.reduce((a, b) => a + b, 0) / loads.length) * 10) / 10 : 0,
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
    const supabase = getServerSupabase();
    const daysInRange = getDaysInRange(filters);
    const f = buildStopRidershipFilters(filters);

    // Get trip data
    let query = supabase
      .from('stop_ridership')
      .select('trip_id, route_id, direction_id, time_period, stop_id, stop_sequence, boardings, alightings, load_after, date')
      .eq('trip_id', tripId)
      .gte('date', f.startDate)
      .lte('date', f.endDate);

    if (f.days && f.days.length > 0) {
      query = query.in('day_of_week', f.days);
    }

    const { data: tripData, error: tripError } = await query;
    if (tripError) throw tripError;

    if (!tripData || tripData.length === 0) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // Get route info
    const routeId = tripData[0].route_id;
    const { data: routeInfo } = await supabase
      .from('routes')
      .select('route_name')
      .eq('route_id', routeId)
      .single();

    // Aggregate trip metrics
    const totalBoardings = tripData.reduce((sum, r) => sum + (r.boardings || 0), 0);
    const totalAlightings = tripData.reduce((sum, r) => sum + (r.alightings || 0), 0);
    const loads = tripData.map(r => r.load_after || 0);
    const avgLoad = loads.length > 0 ? loads.reduce((a, b) => a + b, 0) / loads.length : 0;
    const maxLoad = loads.length > 0 ? Math.max(...loads) : 0;

    // Get unique dates to calculate actual days
    const uniqueDates = new Set(tripData.map(r => r.date));

    // Aggregate by stop
    const stopAggregates = new Map<string, { boardings: number; alightings: number; sequence: number }>();
    tripData.forEach(row => {
      const sid = row.stop_id;
      if (!stopAggregates.has(sid)) {
        stopAggregates.set(sid, { boardings: 0, alightings: 0, sequence: row.stop_sequence || 0 });
      }
      const agg = stopAggregates.get(sid)!;
      agg.boardings += row.boardings || 0;
      agg.alightings += row.alightings || 0;
    });

    // Get stop info
    const stopIds = Array.from(stopAggregates.keys());
    const { data: stopsInfo } = await supabase
      .from('stops')
      .select('stop_id, stop_name, lat, lon')
      .in('stop_id', stopIds);

    const stopMap = new Map(stopsInfo?.map(s => [s.stop_id, s]) || []);

    const stops = Array.from(stopAggregates.entries())
      .map(([stopId, agg]) => {
        const stop = stopMap.get(stopId);
        return {
          stopId,
          stopName: stop?.stop_name || stopId,
          stopSequence: agg.sequence,
          arrivalTime: "",
          lat: stop?.lat || 0,
          lon: stop?.lon || 0,
          ...calculateDerivedMetrics(agg.boardings, agg.alightings, daysInRange),
        };
      })
      .sort((a, b) => a.stopSequence - b.stopSequence);

    // Build segments
    const seqLoads = new Map<number, { stopId: string; loads: number[] }>();
    tripData.forEach(row => {
      const seq = row.stop_sequence || 0;
      if (!seqLoads.has(seq)) {
        seqLoads.set(seq, { stopId: row.stop_id, loads: [] });
      }
      const agg = seqLoads.get(seq)!;
      if (row.load_after) agg.loads.push(row.load_after);
    });

    const sortedSeqs = Array.from(seqLoads.keys()).sort((a, b) => a - b);
    const segments = [];

    for (let i = 0; i < sortedSeqs.length - 1; i++) {
      const fromSeq = sortedSeqs[i];
      const toSeq = sortedSeqs[i + 1];
      const fromData = seqLoads.get(fromSeq)!;
      const toData = seqLoads.get(toSeq)!;
      const fromStop = stopMap.get(fromData.stopId);
      const toStop = stopMap.get(toData.stopId);

      const segAvgLoad = fromData.loads.length > 0
        ? fromData.loads.reduce((a, b) => a + b, 0) / fromData.loads.length
        : 0;
      const segMaxLoad = fromData.loads.length > 0 ? Math.max(...fromData.loads) : 0;

      segments.push({
        fromStopId: fromData.stopId,
        fromStopName: fromStop?.stop_name || fromData.stopId,
        fromStopSequence: fromSeq,
        toStopId: toData.stopId,
        toStopName: toStop?.stop_name || toData.stopId,
        toStopSequence: toSeq,
        avgLoad: Math.round(segAvgLoad * 10) / 10,
        maxLoad: segMaxLoad,
        fromLat: fromStop?.lat || 0,
        fromLon: fromStop?.lon || 0,
        toLat: toStop?.lat || 0,
        toLon: toStop?.lon || 0,
      });
    }

    const response: TripResponse = {
      filters,
      metrics: {
        tripId,
        routeId,
        routeName: routeInfo?.route_name || routeId,
        directionId: String(tripData[0].direction_id) as "0" | "1",
        headsign: tripData[0].direction_id === 1 ? "Inbound" : "Outbound",
        startTime: "",
        timePeriod: tripData[0].time_period as TimePeriod,
        daysInRange: uniqueDates.size,
        ...calculateDerivedMetrics(totalBoardings, totalAlightings, daysInRange),
        avgLoad: Math.round(avgLoad * 10) / 10,
        maxLoad,
      },
      stops,
      segments,
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
    const supabase = getServerSupabase();
    const daysInRange = getDaysInRange(filters);
    const f = buildStopRidershipFilters(filters);

    // Get stop info
    const { data: stopInfo, error: stopError } = await supabase
      .from('stops')
      .select('stop_id, stop_name, lat, lon')
      .eq('stop_id', stopId)
      .single();

    if (stopError || !stopInfo) {
      return NextResponse.json({ error: "Stop not found" }, { status: 404 });
    }

    // Use RPC functions for server-side aggregation
    const [metricsResult, byRouteResult] = await Promise.all([
      supabase.rpc('get_stop_metrics', {
        p_stop_id: stopId,
        p_start_date: f.startDate,
        p_end_date: f.endDate,
        p_days: f.days || null,
        p_periods: f.periods || null,
        p_routes: f.routes || null,
      }),
      supabase.rpc('get_stop_by_route', {
        p_stop_id: stopId,
        p_start_date: f.startDate,
        p_end_date: f.endDate,
        p_days: f.days || null,
        p_periods: f.periods || null,
      }),
    ]);

    if (metricsResult.error) throw metricsResult.error;
    if (byRouteResult.error) throw byRouteResult.error;

    const stopMetrics = metricsResult.data as {
      totalBoardings: number;
      totalAlightings: number;
      routeCount: number;
      tripCount: number;
    };

    const byRouteData = (byRouteResult.data || []) as Array<{
      route_id: string;
      route_name: string;
      total_boardings: number;
      total_alightings: number;
    }>;

    const totalBoardings = stopMetrics?.totalBoardings || 0;
    const totalAlightings = stopMetrics?.totalAlightings || 0;

    const byRoute = byRouteData.map(row => ({
      routeId: row.route_id,
      routeName: row.route_name || row.route_id,
      metrics: calculateDerivedMetrics(row.total_boardings, row.total_alightings, daysInRange),
      percentOfStop: totalBoardings > 0 ? Math.round((row.total_boardings / totalBoardings) * 1000) / 10 : 0,
    })).sort((a, b) => b.metrics.totalBoardings - a.metrics.totalBoardings);

    const response: StopResponse = {
      filters,
      metrics: {
        stopId: stopInfo.stop_id,
        stopName: stopInfo.stop_name,
        lat: stopInfo.lat,
        lon: stopInfo.lon,
        routeCount: stopMetrics?.routeCount || 0,
        tripCount: stopMetrics?.tripCount || 0,
        daysInRange,
        ...calculateDerivedMetrics(totalBoardings, totalAlightings, daysInRange),
      },
      byRoute,
      byTimePeriod: [],
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
    const supabase = getServerSupabase();
    const daysInRange = getDaysInRange(filters);
    const f = buildStopRidershipFilters(filters);

    // Use RPC function for server-side aggregation
    const { data: rpcData, error } = await supabase.rpc('get_all_stops_metrics', {
      p_start_date: f.startDate,
      p_end_date: f.endDate,
      p_days: f.days || null,
      p_periods: f.periods || null,
      p_routes: f.routes || null,
    });

    if (error) throw error;

    const stopsData = (rpcData || []) as Array<{
      stop_id: string;
      stop_name: string;
      lat: number;
      lon: number;
      total_boardings: number;
      total_alightings: number;
      route_count: number;
    }>;

    const stops = stopsData.map(row => ({
      stopId: row.stop_id,
      stopName: row.stop_name || row.stop_id,
      lat: row.lat || 0,
      lon: row.lon || 0,
      totalBoardings: row.total_boardings,
      totalAlightings: row.total_alightings,
      avgDailyActivity: Math.round((row.total_boardings + row.total_alightings) / daysInRange),
      routeCount: row.route_count,
    }));

    const response: AllStopsResponse = {
      filters,
      stops,
      maxBoardings: Math.max(...stops.map(s => s.totalBoardings), 0),
      maxActivity: Math.max(...stops.map(s => s.avgDailyActivity), 0),
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
    const supabase = getServerSupabase();
    const f = buildStopRidershipFilters(filters);

    // Use RPC function for server-side aggregation
    const { data: rpcData, error } = await supabase.rpc('get_metrics_by_date', {
      p_start_date: f.startDate,
      p_end_date: f.endDate,
      p_days: f.days || null,
      p_periods: f.periods || null,
      p_routes: f.routes || null,
    });

    if (error) throw error;

    const byDateData = (rpcData || []) as Array<{
      date: string;
      day_of_week: number;
      total_boardings: number;
      total_alightings: number;
      avg_load: number;
      max_load: number;
    }>;

    const data = byDateData.map(row => ({
      date: row.date,
      dayOfWeek: row.day_of_week,
      totalBoardings: row.total_boardings,
      totalAlightings: row.total_alightings,
      avgLoad: Math.round((row.avg_load || 0) * 10) / 10,
      maxLoad: row.max_load || 0,
    }));

    const response: SystemByDateResponse = {
      filters,
      data,
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
    const supabase = getServerSupabase();
    const f = buildStopRidershipFilters(filters);

    // Use RPC function for server-side aggregation
    const { data: rpcData, error } = await supabase.rpc('get_metrics_by_day_of_week', {
      p_start_date: f.startDate,
      p_end_date: f.endDate,
      p_periods: f.periods || null,
      p_routes: f.routes || null,
    });

    if (error) throw error;

    const byDayData = (rpcData || []) as Array<{
      day_of_week: number;
      total_boardings: number;
      total_alightings: number;
      avg_load: number;
      max_load: number;
      day_count: number;
    }>;

    const data = byDayData.map(row => ({
      dayOfWeek: row.day_of_week,
      dayName: DAY_NAMES[row.day_of_week],
      totalBoardings: row.total_boardings,
      totalAlightings: row.total_alightings,
      avgLoad: Math.round((row.avg_load || 0) * 10) / 10,
      maxLoad: row.max_load || 0,
      dayCount: row.day_count,
      avgDailyBoardings: row.day_count > 0 ? Math.round(row.total_boardings / row.day_count) : 0,
    }));

    const response: SystemByDayResponse = {
      filters,
      data,
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
    const supabase = getServerSupabase();
    const f = buildStopRidershipFilters(filters);

    // Use RPC function for server-side aggregation
    const { data: rpcData, error } = await supabase.rpc('get_stop_by_date', {
      p_stop_id: stopId,
      p_start_date: f.startDate,
      p_end_date: f.endDate,
      p_days: f.days || null,
      p_periods: f.periods || null,
      p_routes: f.routes || null,
    });

    if (error) throw error;

    const byDateData = (rpcData || []) as Array<{
      date: string;
      day_of_week: number;
      total_boardings: number;
      total_alightings: number;
    }>;

    const data = byDateData.map(row => ({
      date: row.date,
      dayOfWeek: row.day_of_week,
      totalBoardings: row.total_boardings,
      totalAlightings: row.total_alightings,
    }));

    const response: StopByDateResponse = {
      filters,
      stopId,
      data,
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
    const supabase = getServerSupabase();
    const f = buildStopRidershipFilters(filters);

    // Use RPC function for server-side aggregation
    const { data: rpcData, error } = await supabase.rpc('get_stop_by_day_of_week', {
      p_stop_id: stopId,
      p_start_date: f.startDate,
      p_end_date: f.endDate,
      p_periods: f.periods || null,
      p_routes: f.routes || null,
    });

    if (error) throw error;

    const byDayData = (rpcData || []) as Array<{
      day_of_week: number;
      total_boardings: number;
      total_alightings: number;
      day_count: number;
    }>;

    const data = byDayData.map(row => ({
      dayOfWeek: row.day_of_week,
      dayName: DAY_NAMES[row.day_of_week],
      totalBoardings: row.total_boardings,
      totalAlightings: row.total_alightings,
      dayCount: row.day_count,
      avgDailyBoardings: row.day_count > 0 ? Math.round(row.total_boardings / row.day_count) : 0,
    }));

    const response: StopByDayResponse = {
      filters,
      stopId,
      data,
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
    const supabase = getServerSupabase();
    const daysInRange = getDaysInRange(filters);
    const f = buildStopRidershipFilters(filters);

    // Use RPC function for server-side aggregation
    const { data: rpcData, error } = await supabase.rpc('get_stop_by_period', {
      p_stop_id: stopId,
      p_start_date: f.startDate,
      p_end_date: f.endDate,
      p_days: f.days || null,
      p_routes: f.routes || null,
    });

    if (error) throw error;

    const byPeriodData = (rpcData || []) as Array<{
      time_period: TimePeriod;
      total_boardings: number;
      total_alightings: number;
    }>;

    const data = byPeriodData.map(row => ({
      timePeriod: row.time_period,
      totalBoardings: row.total_boardings,
      totalAlightings: row.total_alightings,
      avgDailyBoardings: Math.round(row.total_boardings / daysInRange),
    }));

    const response: StopByPeriodResponse = {
      filters,
      stopId,
      data,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
