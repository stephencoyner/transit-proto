/**
 * SQL query helpers for ridership database
 *
 * These functions build SQL queries with proper filtering for:
 * - Date range
 * - Days of week
 * - Time periods
 * - Routes
 * - Direction
 */

import type { RidershipFilters, DayOfWeek, TimePeriod } from "@/types/ridership";

interface QueryParams {
  sql: string;
  params: (string | number)[];
}

/**
 * Build WHERE clause conditions from filters
 */
function buildFilterConditions(
  filters: RidershipFilters,
  tableAlias: string = ""
): { conditions: string[]; params: (string | number)[] } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  const prefix = tableAlias ? `${tableAlias}.` : "";

  // Date range (always required)
  conditions.push(`${prefix}date >= ? AND ${prefix}date <= ?`);
  params.push(filters.dateRange.startDate, filters.dateRange.endDate);

  // Days of week
  if (filters.daysOfWeek && filters.daysOfWeek.length > 0 && filters.daysOfWeek.length < 7) {
    const placeholders = filters.daysOfWeek.map(() => "?").join(", ");
    conditions.push(`${prefix}day_of_week IN (${placeholders})`);
    params.push(...filters.daysOfWeek);
  }

  // Time periods (requires join with trip_ridership if on stop_ridership table)
  if (filters.timePeriods && filters.timePeriods.length > 0 && filters.timePeriods.length < 6) {
    const placeholders = filters.timePeriods.map(() => "?").join(", ");
    conditions.push(`${prefix}time_period IN (${placeholders})`);
    params.push(...filters.timePeriods);
  }

  // Routes
  if (filters.routeIds && filters.routeIds.length > 0) {
    const placeholders = filters.routeIds.map(() => "?").join(", ");
    conditions.push(`${prefix}route_id IN (${placeholders})`);
    params.push(...filters.routeIds);
  }

  // Direction
  if (filters.directionId !== undefined) {
    conditions.push(`${prefix}direction_id = ?`);
    params.push(filters.directionId);
  }

  return { conditions, params };
}

/**
 * Calculate number of unique days in filter range
 */
export function getDaysInRange(filters: RidershipFilters): number {
  const start = new Date(filters.dateRange.startDate);
  const end = new Date(filters.dateRange.endDate);
  let count = 0;

  const current = new Date(start);
  while (current <= end) {
    const dow = current.getDay();
    // Convert JS day (0=Sun) to our format (0=Mon)
    const normalizedDow = dow === 0 ? 6 : dow - 1;

    if (!filters.daysOfWeek || filters.daysOfWeek.length === 0 ||
        filters.daysOfWeek.includes(normalizedDow as DayOfWeek)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

// === SYSTEM LEVEL QUERIES ===

export function querySystemMetrics(filters: RidershipFilters): QueryParams {
  const { conditions, params } = buildFilterConditions(filters, "tr");

  const sql = `
    SELECT
      COUNT(DISTINCT tr.route_id) as route_count,
      COUNT(DISTINCT tr.trip_id) as trip_count,
      SUM(tr.total_boardings) as total_boardings,
      SUM(tr.total_alightings) as total_alightings,
      AVG(tr.max_load) as avg_load,
      MAX(tr.max_load) as max_load
    FROM trip_ridership tr
    WHERE ${conditions.join(" AND ")}
  `;

  return { sql, params };
}

export function querySystemByRoute(filters: RidershipFilters): QueryParams {
  const { conditions, params } = buildFilterConditions(filters, "tr");

  const sql = `
    SELECT
      tr.route_id,
      r.route_name,
      r.route_type,
      SUM(tr.total_boardings) as total_boardings,
      SUM(tr.total_alightings) as total_alightings,
      AVG(tr.max_load) as avg_load,
      MAX(tr.max_load) as max_load,
      COUNT(DISTINCT tr.trip_id) as trip_count
    FROM trip_ridership tr
    JOIN routes r ON tr.route_id = r.route_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY tr.route_id
    ORDER BY total_boardings DESC
  `;

  return { sql, params };
}

export function querySystemByTimePeriod(filters: RidershipFilters): QueryParams {
  // Remove time period filter for this query since we're grouping by it
  const modifiedFilters = { ...filters, timePeriods: undefined };
  const { conditions, params } = buildFilterConditions(modifiedFilters, "tr");

  const sql = `
    SELECT
      tr.time_period,
      SUM(tr.total_boardings) as total_boardings,
      SUM(tr.total_alightings) as total_alightings,
      AVG(tr.max_load) as avg_load,
      MAX(tr.max_load) as max_load
    FROM trip_ridership tr
    WHERE ${conditions.join(" AND ")}
    GROUP BY tr.time_period
    ORDER BY
      CASE tr.time_period
        WHEN 'early_am' THEN 1
        WHEN 'am_peak' THEN 2
        WHEN 'midday' THEN 3
        WHEN 'pm_peak' THEN 4
        WHEN 'evening' THEN 5
        WHEN 'night' THEN 6
      END
  `;

  return { sql, params };
}

export function querySystemByDate(filters: RidershipFilters): QueryParams {
  // Use daily_system_summary table for efficient per-date aggregates
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // Date range (always required)
  conditions.push(`date >= ? AND date <= ?`);
  params.push(filters.dateRange.startDate, filters.dateRange.endDate);

  // Days of week filter
  if (filters.daysOfWeek && filters.daysOfWeek.length > 0 && filters.daysOfWeek.length < 7) {
    const placeholders = filters.daysOfWeek.map(() => "?").join(", ");
    conditions.push(`day_of_week IN (${placeholders})`);
    params.push(...filters.daysOfWeek);
  }

  const sql = `
    SELECT
      date,
      day_of_week,
      total_boardings,
      total_alightings,
      avg_load,
      max_load
    FROM daily_system_summary
    WHERE ${conditions.join(" AND ")}
    ORDER BY date
  `;

  return { sql, params };
}

export function querySystemByDayOfWeek(filters: RidershipFilters): QueryParams {
  // Aggregate daily_system_summary by day of week
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // Date range (always required)
  conditions.push(`date >= ? AND date <= ?`);
  params.push(filters.dateRange.startDate, filters.dateRange.endDate);

  // Days of week filter (if specified, only include those days)
  if (filters.daysOfWeek && filters.daysOfWeek.length > 0 && filters.daysOfWeek.length < 7) {
    const placeholders = filters.daysOfWeek.map(() => "?").join(", ");
    conditions.push(`day_of_week IN (${placeholders})`);
    params.push(...filters.daysOfWeek);
  }

  const sql = `
    SELECT
      day_of_week,
      SUM(total_boardings) as total_boardings,
      SUM(total_alightings) as total_alightings,
      AVG(avg_load) as avg_load,
      MAX(max_load) as max_load,
      COUNT(*) as day_count
    FROM daily_system_summary
    WHERE ${conditions.join(" AND ")}
    GROUP BY day_of_week
    ORDER BY day_of_week
  `;

  return { sql, params };
}

// === ROUTE LEVEL QUERIES ===

export function queryRouteMetrics(filters: RidershipFilters, routeId: string): QueryParams {
  const modifiedFilters = { ...filters, routeIds: [routeId] };
  const { conditions, params } = buildFilterConditions(modifiedFilters, "tr");

  const sql = `
    SELECT
      tr.route_id,
      r.route_name,
      r.route_type,
      COUNT(DISTINCT tr.trip_id) as trip_count,
      COUNT(DISTINCT sr.stop_id) as stop_count,
      SUM(tr.total_boardings) as total_boardings,
      SUM(tr.total_alightings) as total_alightings,
      AVG(tr.max_load) as avg_load,
      MAX(tr.max_load) as max_load
    FROM trip_ridership tr
    JOIN routes r ON tr.route_id = r.route_id
    LEFT JOIN stop_ridership sr ON tr.trip_id = sr.trip_id AND tr.date = sr.date
    WHERE ${conditions.join(" AND ")}
    GROUP BY tr.route_id
  `;

  return { sql, params };
}

export function queryRouteByDirection(filters: RidershipFilters, routeId: string): QueryParams {
  const modifiedFilters = { ...filters, routeIds: [routeId], directionId: undefined };
  const { conditions, params } = buildFilterConditions(modifiedFilters, "tr");

  const sql = `
    SELECT
      tr.direction_id,
      SUM(tr.total_boardings) as total_boardings,
      SUM(tr.total_alightings) as total_alightings,
      AVG(tr.max_load) as avg_load,
      MAX(tr.max_load) as max_load
    FROM trip_ridership tr
    WHERE ${conditions.join(" AND ")}
    GROUP BY tr.direction_id
  `;

  return { sql, params };
}

// === ROUTE -> STOP LEVEL QUERIES ===

export function queryRouteStops(filters: RidershipFilters, routeId: string): QueryParams {
  const modifiedFilters = { ...filters, routeIds: [routeId] };
  const { conditions, params } = buildFilterConditions(modifiedFilters, "tr");

  const sql = `
    SELECT
      sr.stop_id,
      s.stop_name,
      s.lat,
      s.lon,
      MIN(sr.stop_sequence) as stop_sequence,
      SUM(sr.boardings) as total_boardings,
      SUM(sr.alightings) as total_alightings
    FROM stop_ridership sr
    JOIN trip_ridership tr ON sr.trip_id = tr.trip_id AND sr.date = tr.date
    JOIN stops s ON sr.stop_id = s.stop_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY sr.stop_id
    ORDER BY stop_sequence
  `;

  return { sql, params };
}

// === ROUTE -> SEGMENT LEVEL QUERIES ===

export function queryRouteSegments(filters: RidershipFilters, routeId: string): QueryParams {
  const modifiedFilters = { ...filters, routeIds: [routeId] };
  const { conditions, params } = buildFilterConditions(modifiedFilters, "tr");

  // Segment load = load_after at the FROM stop (passengers traveling to the next stop)
  const sql = `
    WITH ordered_stops AS (
      SELECT
        sr.date,
        sr.trip_id,
        sr.stop_id,
        sr.stop_sequence,
        sr.load_after,
        s.stop_name,
        s.lat,
        s.lon,
        LEAD(sr.stop_id) OVER (PARTITION BY sr.trip_id, sr.date ORDER BY sr.stop_sequence) as next_stop_id,
        LEAD(s.stop_name) OVER (PARTITION BY sr.trip_id, sr.date ORDER BY sr.stop_sequence) as next_stop_name,
        LEAD(sr.stop_sequence) OVER (PARTITION BY sr.trip_id, sr.date ORDER BY sr.stop_sequence) as next_stop_sequence,
        LEAD(s.lat) OVER (PARTITION BY sr.trip_id, sr.date ORDER BY sr.stop_sequence) as next_lat,
        LEAD(s.lon) OVER (PARTITION BY sr.trip_id, sr.date ORDER BY sr.stop_sequence) as next_lon
      FROM stop_ridership sr
      JOIN trip_ridership tr ON sr.trip_id = tr.trip_id AND sr.date = tr.date
      JOIN stops s ON sr.stop_id = s.stop_id
      WHERE ${conditions.join(" AND ")}
    )
    SELECT
      stop_id as from_stop_id,
      stop_name as from_stop_name,
      stop_sequence as from_stop_sequence,
      lat as from_lat,
      lon as from_lon,
      next_stop_id as to_stop_id,
      next_stop_name as to_stop_name,
      next_stop_sequence as to_stop_sequence,
      next_lat as to_lat,
      next_lon as to_lon,
      AVG(load_after) as avg_load,
      MAX(load_after) as max_load
    FROM ordered_stops
    WHERE next_stop_id IS NOT NULL
    GROUP BY stop_id, next_stop_id
    ORDER BY from_stop_sequence
  `;

  return { sql, params };
}

// === TRIP LEVEL QUERIES ===

export function queryTripMetrics(filters: RidershipFilters, tripId: string): QueryParams {
  const { conditions, params } = buildFilterConditions(filters, "tr");
  conditions.push("tr.trip_id = ?");
  params.push(tripId);

  const sql = `
    SELECT
      tr.trip_id,
      tr.route_id,
      r.route_name,
      tr.direction_id,
      tr.start_time,
      tr.time_period,
      COUNT(DISTINCT tr.date) as days_in_range,
      SUM(tr.total_boardings) as total_boardings,
      SUM(tr.total_alightings) as total_alightings,
      AVG(tr.max_load) as avg_load,
      MAX(tr.max_load) as max_load
    FROM trip_ridership tr
    JOIN routes r ON tr.route_id = r.route_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY tr.trip_id
  `;

  return { sql, params };
}

export function queryTripStops(filters: RidershipFilters, tripId: string): QueryParams {
  const { conditions, params } = buildFilterConditions(filters, "tr");
  conditions.push("sr.trip_id = ?");
  params.push(tripId);

  const sql = `
    SELECT
      sr.stop_id,
      s.stop_name,
      sr.stop_sequence,
      s.lat,
      s.lon,
      SUM(sr.boardings) as total_boardings,
      SUM(sr.alightings) as total_alightings,
      AVG(sr.load_after) as avg_load_after
    FROM stop_ridership sr
    JOIN trip_ridership tr ON sr.trip_id = tr.trip_id AND sr.date = tr.date
    JOIN stops s ON sr.stop_id = s.stop_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY sr.stop_id
    ORDER BY sr.stop_sequence
  `;

  return { sql, params };
}

export function queryTripSegments(filters: RidershipFilters, tripId: string): QueryParams {
  const { conditions, params } = buildFilterConditions(filters, "tr");
  conditions.push("sr.trip_id = ?");
  params.push(tripId);

  // Derive segments from stop_ridership using stop_sequence
  // load_after at stop N = passengers traveling from stop N to stop N+1
  const sql = `
    WITH ordered_stops AS (
      SELECT
        sr.date,
        sr.trip_id,
        sr.stop_id,
        sr.stop_sequence,
        sr.load_after,
        s.stop_name,
        s.lat,
        s.lon,
        LEAD(sr.stop_id) OVER (PARTITION BY sr.date ORDER BY sr.stop_sequence) as next_stop_id,
        LEAD(s.stop_name) OVER (PARTITION BY sr.date ORDER BY sr.stop_sequence) as next_stop_name,
        LEAD(sr.stop_sequence) OVER (PARTITION BY sr.date ORDER BY sr.stop_sequence) as next_stop_sequence,
        LEAD(s.lat) OVER (PARTITION BY sr.date ORDER BY sr.stop_sequence) as next_lat,
        LEAD(s.lon) OVER (PARTITION BY sr.date ORDER BY sr.stop_sequence) as next_lon
      FROM stop_ridership sr
      JOIN trip_ridership tr ON sr.trip_id = tr.trip_id AND sr.date = tr.date
      JOIN stops s ON sr.stop_id = s.stop_id
      WHERE ${conditions.join(" AND ")}
    )
    SELECT
      stop_id as from_stop_id,
      stop_name as from_stop_name,
      stop_sequence as from_stop_sequence,
      lat as from_lat,
      lon as from_lon,
      next_stop_id as to_stop_id,
      next_stop_name as to_stop_name,
      next_stop_sequence as to_stop_sequence,
      next_lat as to_lat,
      next_lon as to_lon,
      AVG(load_after) as avg_load,
      MAX(load_after) as max_load
    FROM ordered_stops
    WHERE next_stop_id IS NOT NULL
    GROUP BY stop_sequence
    ORDER BY from_stop_sequence
  `;

  return { sql, params };
}

// === STOP LEVEL (DISAGGREGATED) QUERIES ===

export function queryStopMetrics(filters: RidershipFilters, stopId: string): QueryParams {
  const { conditions, params } = buildFilterConditions(filters, "tr");
  conditions.push("sr.stop_id = ?");
  params.push(stopId);

  const sql = `
    SELECT
      sr.stop_id,
      s.stop_name,
      s.lat,
      s.lon,
      COUNT(DISTINCT sr.route_id) as route_count,
      COUNT(DISTINCT sr.trip_id) as trip_count,
      SUM(sr.boardings) as total_boardings,
      SUM(sr.alightings) as total_alightings
    FROM stop_ridership sr
    JOIN trip_ridership tr ON sr.trip_id = tr.trip_id AND sr.date = tr.date
    JOIN stops s ON sr.stop_id = s.stop_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY sr.stop_id
  `;

  return { sql, params };
}

export function queryStopByRoute(filters: RidershipFilters, stopId: string): QueryParams {
  const { conditions, params } = buildFilterConditions(filters, "tr");
  conditions.push("sr.stop_id = ?");
  params.push(stopId);

  const sql = `
    SELECT
      sr.route_id,
      r.route_name,
      SUM(sr.boardings) as total_boardings,
      SUM(sr.alightings) as total_alightings
    FROM stop_ridership sr
    JOIN trip_ridership tr ON sr.trip_id = tr.trip_id AND sr.date = tr.date
    JOIN routes r ON sr.route_id = r.route_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY sr.route_id
    ORDER BY total_boardings DESC
  `;

  return { sql, params };
}

// === ALL STOPS (FOR MAP) ===

export function queryAllStops(filters: RidershipFilters): QueryParams {
  const { conditions, params } = buildFilterConditions(filters, "tr");

  const sql = `
    SELECT
      sr.stop_id,
      s.stop_name,
      s.lat,
      s.lon,
      COUNT(DISTINCT sr.route_id) as route_count,
      SUM(sr.boardings) as total_boardings,
      SUM(sr.alightings) as total_alightings
    FROM stop_ridership sr
    JOIN trip_ridership tr ON sr.trip_id = tr.trip_id AND sr.date = tr.date
    JOIN stops s ON sr.stop_id = s.stop_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY sr.stop_id
    ORDER BY total_boardings DESC
  `;

  return { sql, params };
}

// === STOP BY DATE/DAY/PERIOD QUERIES ===

export function queryStopByDate(filters: RidershipFilters, stopId: string): QueryParams {
  const { conditions, params } = buildFilterConditions(filters, "tr");
  conditions.push("sr.stop_id = ?");
  params.push(stopId);

  const sql = `
    SELECT
      sr.date,
      tr.day_of_week,
      SUM(sr.boardings) as total_boardings,
      SUM(sr.alightings) as total_alightings
    FROM stop_ridership sr
    JOIN trip_ridership tr ON sr.trip_id = tr.trip_id AND sr.date = tr.date
    WHERE ${conditions.join(" AND ")}
    GROUP BY sr.date
    ORDER BY sr.date
  `;

  return { sql, params };
}

export function queryStopByDayOfWeek(filters: RidershipFilters, stopId: string): QueryParams {
  const { conditions, params } = buildFilterConditions(filters, "tr");
  conditions.push("sr.stop_id = ?");
  params.push(stopId);

  const sql = `
    SELECT
      tr.day_of_week,
      SUM(sr.boardings) as total_boardings,
      SUM(sr.alightings) as total_alightings,
      COUNT(DISTINCT sr.date) as day_count
    FROM stop_ridership sr
    JOIN trip_ridership tr ON sr.trip_id = tr.trip_id AND sr.date = tr.date
    WHERE ${conditions.join(" AND ")}
    GROUP BY tr.day_of_week
    ORDER BY tr.day_of_week
  `;

  return { sql, params };
}

export function queryStopByTimePeriod(filters: RidershipFilters, stopId: string): QueryParams {
  // Remove time period filter for this query since we're grouping by it
  const modifiedFilters = { ...filters, timePeriods: undefined };
  const { conditions, params } = buildFilterConditions(modifiedFilters, "tr");
  conditions.push("sr.stop_id = ?");
  params.push(stopId);

  const sql = `
    SELECT
      tr.time_period,
      SUM(sr.boardings) as total_boardings,
      SUM(sr.alightings) as total_alightings
    FROM stop_ridership sr
    JOIN trip_ridership tr ON sr.trip_id = tr.trip_id AND sr.date = tr.date
    WHERE ${conditions.join(" AND ")}
    GROUP BY tr.time_period
    ORDER BY
      CASE tr.time_period
        WHEN 'early_am' THEN 1
        WHEN 'am_peak' THEN 2
        WHEN 'midday' THEN 3
        WHEN 'pm_peak' THEN 4
        WHEN 'evening' THEN 5
        WHEN 'night' THEN 6
      END
  `;

  return { sql, params };
}

// === UNIQUE VALUES FOR FILTERS ===

export function queryAvailableDates(): QueryParams {
  return {
    sql: `SELECT DISTINCT date FROM trip_ridership ORDER BY date`,
    params: []
  };
}

export function queryAvailableRoutes(): QueryParams {
  return {
    sql: `SELECT route_id, route_name, route_type FROM routes ORDER BY route_name`,
    params: []
  };
}
