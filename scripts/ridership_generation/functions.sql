-- ============================================
-- Transit Ridership Data Platform
-- Supabase RPC Functions
-- Version 1.0 - December 2025
-- ============================================
-- Run this in Supabase SQL Editor AFTER running schema.sql and importing data
--
-- These functions support the ridership API endpoints with server-side aggregation
-- to avoid Supabase's 1000 row limit on client queries.
-- ============================================

-- ============================================
-- SYSTEM-LEVEL FUNCTIONS
-- ============================================

-- Get system-wide metrics
-- Uses pre-aggregated daily_system_summary for fast queries when no period filter
CREATE OR REPLACE FUNCTION get_system_metrics(
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Fast path: use pre-aggregated daily_system_summary when no period filter
  IF p_periods IS NULL THEN
    SELECT json_build_object(
      'totalBoardings', COALESCE(SUM(total_boardings), 0),
      'totalAlightings', COALESCE(SUM(total_alightings), 0),
      'avgLoad', COALESCE(AVG(avg_load), 0),
      'maxLoad', COALESCE(MAX(max_load), 0),
      'rowCount', COALESCE(SUM(trip_count), 0)
    ) INTO result
    FROM daily_system_summary dss
    WHERE dss.date >= p_start_date
      AND dss.date <= p_end_date
      AND (p_days IS NULL OR dss.day_of_week = ANY(p_days));
  ELSE
    -- Slow path: query stop_ridership when period filter requires it
    SELECT json_build_object(
      'totalBoardings', COALESCE(SUM(boardings), 0),
      'totalAlightings', COALESCE(SUM(alightings), 0),
      'avgLoad', COALESCE(AVG(load_after), 0),
      'maxLoad', COALESCE(MAX(load_after), 0),
      'rowCount', COUNT(*)
    ) INTO result
    FROM stop_ridership sr
    WHERE sr.date >= p_start_date
      AND sr.date <= p_end_date
      AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
      AND (p_periods IS NULL OR sr.time_period = ANY(p_periods));
  END IF;

  RETURN result;
END;
$$;

-- Get metrics grouped by route
-- Uses pre-aggregated daily_route_summary for fast queries when no period filter
CREATE OR REPLACE FUNCTION get_metrics_by_route(
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  route_id TEXT,
  route_name TEXT,
  route_type TEXT,
  total_boardings BIGINT,
  total_alightings BIGINT,
  avg_load NUMERIC,
  max_load INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Fast path: use pre-aggregated daily_route_summary when no period filter
  IF p_periods IS NULL THEN
    RETURN QUERY
    SELECT
      drs.route_id,
      r.route_short_name AS route_name,
      'bus'::TEXT AS route_type,
      SUM(drs.total_boardings)::BIGINT AS total_boardings,
      SUM(drs.total_alightings)::BIGINT AS total_alightings,
      AVG(drs.avg_load)::NUMERIC AS avg_load,
      MAX(drs.max_load) AS max_load
    FROM daily_route_summary drs
    JOIN routes r ON drs.route_id = r.route_id
    WHERE drs.date >= p_start_date
      AND drs.date <= p_end_date
      AND (p_days IS NULL OR drs.day_of_week = ANY(p_days))
    GROUP BY drs.route_id, r.route_short_name
    ORDER BY total_boardings DESC;
  ELSE
    -- Slow path: query stop_ridership when period filter requires it
    RETURN QUERY
    SELECT
      sr.route_id,
      r.route_short_name AS route_name,
      'bus'::TEXT AS route_type,
      COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
      COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings,
      COALESCE(AVG(sr.load_after), 0) AS avg_load,
      COALESCE(MAX(sr.load_after), 0) AS max_load
    FROM stop_ridership sr
    JOIN routes r ON sr.route_id = r.route_id
    WHERE sr.date >= p_start_date
      AND sr.date <= p_end_date
      AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
      AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
    GROUP BY sr.route_id, r.route_short_name
    ORDER BY total_boardings DESC;
  END IF;
END;
$$;

-- Get metrics grouped by time period
-- Uses pre-aggregated daily_period_summary for fast queries when no route filter
CREATE OR REPLACE FUNCTION get_metrics_by_period(
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  time_period TEXT,
  total_boardings BIGINT,
  total_alightings BIGINT,
  avg_load NUMERIC,
  max_load INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Fast path: use pre-aggregated daily_period_summary when no route filter
  IF p_routes IS NULL THEN
    RETURN QUERY
    SELECT
      dps.time_period,
      SUM(dps.total_boardings)::BIGINT AS total_boardings,
      SUM(dps.total_alightings)::BIGINT AS total_alightings,
      AVG(dps.avg_load)::NUMERIC AS avg_load,
      MAX(dps.max_load) AS max_load
    FROM daily_period_summary dps
    WHERE dps.date >= p_start_date
      AND dps.date <= p_end_date
      AND (p_days IS NULL OR dps.day_of_week = ANY(p_days))
    GROUP BY dps.time_period
    ORDER BY
      CASE dps.time_period
        WHEN 'early_am' THEN 1
        WHEN 'am_peak' THEN 2
        WHEN 'midday' THEN 3
        WHEN 'pm_peak' THEN 4
        WHEN 'evening' THEN 5
        WHEN 'night' THEN 6
      END;
  ELSE
    -- Slow path: query stop_ridership when route filter requires it
    RETURN QUERY
    SELECT
      sr.time_period,
      COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
      COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings,
      COALESCE(AVG(sr.load_after), 0) AS avg_load,
      COALESCE(MAX(sr.load_after), 0) AS max_load
    FROM stop_ridership sr
    WHERE sr.date >= p_start_date
      AND sr.date <= p_end_date
      AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
      AND (p_routes IS NULL OR sr.route_id = ANY(p_routes))
    GROUP BY sr.time_period
    ORDER BY
      CASE sr.time_period
        WHEN 'early_am' THEN 1
        WHEN 'am_peak' THEN 2
        WHEN 'midday' THEN 3
        WHEN 'pm_peak' THEN 4
        WHEN 'evening' THEN 5
        WHEN 'night' THEN 6
      END;
  END IF;
END;
$$;

-- Get metrics by date
-- Uses pre-aggregated daily_system_summary for fast queries when no period/route filter
CREATE OR REPLACE FUNCTION get_metrics_by_date(
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  date DATE,
  day_of_week INTEGER,
  total_boardings BIGINT,
  total_alightings BIGINT,
  avg_load NUMERIC,
  max_load INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Fast path: use pre-aggregated daily_system_summary when no period/route filter
  IF p_periods IS NULL AND p_routes IS NULL THEN
    RETURN QUERY
    SELECT
      dss.date,
      dss.day_of_week,
      dss.total_boardings::BIGINT,
      dss.total_alightings::BIGINT,
      dss.avg_load::NUMERIC,
      dss.max_load
    FROM daily_system_summary dss
    WHERE dss.date >= p_start_date
      AND dss.date <= p_end_date
      AND (p_days IS NULL OR dss.day_of_week = ANY(p_days))
    ORDER BY dss.date;
  ELSE
    -- Slow path: query stop_ridership when filters require it
    RETURN QUERY
    SELECT
      sr.date,
      sr.day_of_week,
      COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
      COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings,
      COALESCE(AVG(sr.load_after), 0) AS avg_load,
      COALESCE(MAX(sr.load_after), 0) AS max_load
    FROM stop_ridership sr
    WHERE sr.date >= p_start_date
      AND sr.date <= p_end_date
      AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
      AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
      AND (p_routes IS NULL OR sr.route_id = ANY(p_routes))
    GROUP BY sr.date, sr.day_of_week
    ORDER BY sr.date;
  END IF;
END;
$$;

-- Get metrics by day of week
-- Uses pre-aggregated daily_system_summary for fast queries when no period/route filter
CREATE OR REPLACE FUNCTION get_metrics_by_day_of_week(
  p_start_date DATE,
  p_end_date DATE,
  p_periods TEXT[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  day_of_week INTEGER,
  total_boardings BIGINT,
  total_alightings BIGINT,
  avg_load NUMERIC,
  max_load INTEGER,
  day_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Fast path: use pre-aggregated daily_system_summary when no period/route filter
  IF p_periods IS NULL AND p_routes IS NULL THEN
    RETURN QUERY
    SELECT
      dss.day_of_week,
      SUM(dss.total_boardings)::BIGINT AS total_boardings,
      SUM(dss.total_alightings)::BIGINT AS total_alightings,
      AVG(dss.avg_load)::NUMERIC AS avg_load,
      MAX(dss.max_load) AS max_load,
      COUNT(DISTINCT dss.date)::BIGINT AS day_count
    FROM daily_system_summary dss
    WHERE dss.date >= p_start_date
      AND dss.date <= p_end_date
    GROUP BY dss.day_of_week
    ORDER BY dss.day_of_week;
  ELSE
    -- Slow path: query stop_ridership when filters require it
    RETURN QUERY
    SELECT
      sr.day_of_week,
      COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
      COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings,
      COALESCE(AVG(sr.load_after), 0) AS avg_load,
      COALESCE(MAX(sr.load_after), 0) AS max_load,
      COUNT(DISTINCT sr.date)::BIGINT AS day_count
    FROM stop_ridership sr
    WHERE sr.date >= p_start_date
      AND sr.date <= p_end_date
      AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
      AND (p_routes IS NULL OR sr.route_id = ANY(p_routes))
    GROUP BY sr.day_of_week
    ORDER BY sr.day_of_week;
  END IF;
END;
$$;

-- ============================================
-- ROUTE-LEVEL FUNCTIONS
-- ============================================

-- Get route metrics
CREATE OR REPLACE FUNCTION get_route_metrics(
  p_route_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_direction TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'totalBoardings', COALESCE(SUM(boardings), 0),
    'totalAlightings', COALESCE(SUM(alightings), 0),
    'avgLoad', COALESCE(AVG(load_after), 0),
    'maxLoad', COALESCE(MAX(load_after), 0),
    'tripCount', COUNT(DISTINCT trip_id),
    'stopCount', COUNT(DISTINCT stop_id)
  ) INTO result
  FROM stop_ridership sr
  WHERE sr.route_id = p_route_id
    AND sr.date >= p_start_date
    AND sr.date <= p_end_date
    AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
    AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
    AND (p_direction IS NULL OR sr.direction_id = p_direction::INTEGER);

  RETURN result;
END;
$$;

-- Get route by direction
CREATE OR REPLACE FUNCTION get_route_by_direction(
  p_route_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  direction_id TEXT,
  total_boardings BIGINT,
  total_alightings BIGINT,
  avg_load NUMERIC,
  max_load INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.direction_id::TEXT,
    COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
    COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings,
    COALESCE(AVG(sr.load_after), 0) AS avg_load,
    COALESCE(MAX(sr.load_after), 0) AS max_load
  FROM stop_ridership sr
  WHERE sr.route_id = p_route_id
    AND sr.date >= p_start_date
    AND sr.date <= p_end_date
    AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
    AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
  GROUP BY sr.direction_id
  ORDER BY sr.direction_id;
END;
$$;

-- Get route by time period
CREATE OR REPLACE FUNCTION get_route_by_period(
  p_route_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_direction TEXT DEFAULT NULL
)
RETURNS TABLE(
  time_period TEXT,
  total_boardings BIGINT,
  total_alightings BIGINT,
  avg_load NUMERIC,
  max_load INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.time_period,
    COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
    COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings,
    COALESCE(AVG(sr.load_after), 0) AS avg_load,
    COALESCE(MAX(sr.load_after), 0) AS max_load
  FROM stop_ridership sr
  WHERE sr.route_id = p_route_id
    AND sr.date >= p_start_date
    AND sr.date <= p_end_date
    AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
    AND (p_direction IS NULL OR sr.direction_id = p_direction::INTEGER)
  GROUP BY sr.time_period
  ORDER BY
    CASE sr.time_period
      WHEN 'early_am' THEN 1
      WHEN 'am_peak' THEN 2
      WHEN 'midday' THEN 3
      WHEN 'pm_peak' THEN 4
      WHEN 'evening' THEN 5
      WHEN 'night' THEN 6
    END;
END;
$$;

-- Get route stops with metrics
CREATE OR REPLACE FUNCTION get_route_stops(
  p_route_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_direction TEXT DEFAULT NULL
)
RETURNS TABLE(
  stop_id TEXT,
  stop_name TEXT,
  lat REAL,
  lon REAL,
  min_sequence INTEGER,
  total_boardings BIGINT,
  total_alightings BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.stop_id,
    s.stop_name,
    s.lat,
    s.lon,
    MIN(sr.stop_sequence) AS min_sequence,
    COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
    COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings
  FROM stop_ridership sr
  JOIN stops s ON sr.stop_id = s.stop_id
  WHERE sr.route_id = p_route_id
    AND sr.date >= p_start_date
    AND sr.date <= p_end_date
    AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
    AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
    AND (p_direction IS NULL OR sr.direction_id = p_direction::INTEGER)
  GROUP BY sr.stop_id, s.stop_name, s.lat, s.lon
  ORDER BY min_sequence;
END;
$$;

-- Get route segments with load data
CREATE OR REPLACE FUNCTION get_route_segments(
  p_route_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_direction TEXT DEFAULT NULL
)
RETURNS TABLE(
  stop_id TEXT,
  stop_name TEXT,
  lat REAL,
  lon REAL,
  stop_sequence INTEGER,
  avg_load NUMERIC,
  max_load INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.stop_id,
    s.stop_name,
    s.lat,
    s.lon,
    MIN(sr.stop_sequence) AS stop_sequence,
    COALESCE(AVG(sr.load_after), 0) AS avg_load,
    COALESCE(MAX(sr.load_after), 0) AS max_load
  FROM stop_ridership sr
  JOIN stops s ON sr.stop_id = s.stop_id
  WHERE sr.route_id = p_route_id
    AND sr.date >= p_start_date
    AND sr.date <= p_end_date
    AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
    AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
    AND (p_direction IS NULL OR sr.direction_id = p_direction::INTEGER)
  GROUP BY sr.stop_id, s.stop_name, s.lat, s.lon
  ORDER BY stop_sequence;
END;
$$;

-- ============================================
-- STOP-LEVEL FUNCTIONS
-- ============================================

-- Get stop metrics
CREATE OR REPLACE FUNCTION get_stop_metrics(
  p_stop_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'totalBoardings', COALESCE(SUM(boardings), 0),
    'totalAlightings', COALESCE(SUM(alightings), 0),
    'routeCount', COUNT(DISTINCT route_id),
    'tripCount', COUNT(DISTINCT trip_id)
  ) INTO result
  FROM stop_ridership sr
  WHERE sr.stop_id = p_stop_id
    AND sr.date >= p_start_date
    AND sr.date <= p_end_date
    AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
    AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
    AND (p_routes IS NULL OR sr.route_id = ANY(p_routes));

  RETURN result;
END;
$$;

-- Get stop by route
CREATE OR REPLACE FUNCTION get_stop_by_route(
  p_stop_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  route_id TEXT,
  route_name TEXT,
  total_boardings BIGINT,
  total_alightings BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.route_id,
    r.route_short_name AS route_name,
    COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
    COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings
  FROM stop_ridership sr
  JOIN routes r ON sr.route_id = r.route_id
  WHERE sr.stop_id = p_stop_id
    AND sr.date >= p_start_date
    AND sr.date <= p_end_date
    AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
    AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
  GROUP BY sr.route_id, r.route_short_name
  ORDER BY total_boardings DESC;
END;
$$;

-- Get stop by date
CREATE OR REPLACE FUNCTION get_stop_by_date(
  p_stop_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  date DATE,
  day_of_week INTEGER,
  total_boardings BIGINT,
  total_alightings BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.date,
    sr.day_of_week,
    COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
    COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings
  FROM stop_ridership sr
  WHERE sr.stop_id = p_stop_id
    AND sr.date >= p_start_date
    AND sr.date <= p_end_date
    AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
    AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
    AND (p_routes IS NULL OR sr.route_id = ANY(p_routes))
  GROUP BY sr.date, sr.day_of_week
  ORDER BY sr.date;
END;
$$;

-- Get stop by day of week
CREATE OR REPLACE FUNCTION get_stop_by_day_of_week(
  p_stop_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_periods TEXT[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  day_of_week INTEGER,
  total_boardings BIGINT,
  total_alightings BIGINT,
  day_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.day_of_week,
    COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
    COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings,
    COUNT(DISTINCT sr.date)::BIGINT AS day_count
  FROM stop_ridership sr
  WHERE sr.stop_id = p_stop_id
    AND sr.date >= p_start_date
    AND sr.date <= p_end_date
    AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
    AND (p_routes IS NULL OR sr.route_id = ANY(p_routes))
  GROUP BY sr.day_of_week
  ORDER BY sr.day_of_week;
END;
$$;

-- Get stop by time period
CREATE OR REPLACE FUNCTION get_stop_by_period(
  p_stop_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  time_period TEXT,
  total_boardings BIGINT,
  total_alightings BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.time_period,
    COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
    COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings
  FROM stop_ridership sr
  WHERE sr.stop_id = p_stop_id
    AND sr.date >= p_start_date
    AND sr.date <= p_end_date
    AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
    AND (p_routes IS NULL OR sr.route_id = ANY(p_routes))
  GROUP BY sr.time_period
  ORDER BY
    CASE sr.time_period
      WHEN 'early_am' THEN 1
      WHEN 'am_peak' THEN 2
      WHEN 'midday' THEN 3
      WHEN 'pm_peak' THEN 4
      WHEN 'evening' THEN 5
      WHEN 'night' THEN 6
    END;
END;
$$;

-- Get all stops with metrics (for map view)
-- Uses pre-aggregated daily_stop_summary for fast queries when no route/period filters
CREATE OR REPLACE FUNCTION get_all_stops_metrics(
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  stop_id TEXT,
  stop_name TEXT,
  lat REAL,
  lon REAL,
  total_boardings BIGINT,
  total_alightings BIGINT,
  route_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Fast path: use pre-aggregated daily_stop_summary when no route/period filters
  IF p_periods IS NULL AND p_routes IS NULL THEN
    RETURN QUERY
    SELECT
      dss.stop_id,
      s.stop_name,
      s.lat,
      s.lon,
      COALESCE(SUM(dss.total_boardings), 0)::BIGINT AS total_boardings,
      COALESCE(SUM(dss.total_alightings), 0)::BIGINT AS total_alightings,
      1::BIGINT AS route_count  -- Not available in summary table
    FROM daily_stop_summary dss
    JOIN stops s ON dss.stop_id = s.stop_id
    WHERE dss.date >= p_start_date
      AND dss.date <= p_end_date
      AND (p_days IS NULL OR dss.day_of_week = ANY(p_days))
    GROUP BY dss.stop_id, s.stop_name, s.lat, s.lon
    ORDER BY total_boardings DESC;
  ELSE
    -- Slow path: query stop_ridership when filters require it
    RETURN QUERY
    SELECT
      sr.stop_id,
      s.stop_name,
      s.lat,
      s.lon,
      COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
      COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings,
      COUNT(DISTINCT sr.route_id)::BIGINT AS route_count
    FROM stop_ridership sr
    JOIN stops s ON sr.stop_id = s.stop_id
    WHERE sr.date >= p_start_date
      AND sr.date <= p_end_date
      AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
      AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
      AND (p_routes IS NULL OR sr.route_id = ANY(p_routes))
    GROUP BY sr.stop_id, s.stop_name, s.lat, s.lon
    ORDER BY total_boardings DESC;
  END IF;
END;
$$;

-- ============================================
-- Grant execute permissions to anon and authenticated roles
-- ============================================

GRANT EXECUTE ON FUNCTION get_system_metrics(DATE, DATE, INTEGER[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_metrics_by_route(DATE, DATE, INTEGER[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_metrics_by_period(DATE, DATE, INTEGER[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_metrics_by_date(DATE, DATE, INTEGER[], TEXT[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_metrics_by_day_of_week(DATE, DATE, TEXT[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_route_metrics(TEXT, DATE, DATE, INTEGER[], TEXT[], TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_route_by_direction(TEXT, DATE, DATE, INTEGER[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_route_by_period(TEXT, DATE, DATE, INTEGER[], TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_route_stops(TEXT, DATE, DATE, INTEGER[], TEXT[], TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_route_segments(TEXT, DATE, DATE, INTEGER[], TEXT[], TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_stop_metrics(TEXT, DATE, DATE, INTEGER[], TEXT[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_stop_by_route(TEXT, DATE, DATE, INTEGER[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_stop_by_date(TEXT, DATE, DATE, INTEGER[], TEXT[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_stop_by_day_of_week(TEXT, DATE, DATE, TEXT[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_stop_by_period(TEXT, DATE, DATE, INTEGER[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_all_stops_metrics(DATE, DATE, INTEGER[], TEXT[], TEXT[]) TO anon, authenticated;

-- ============================================
-- ROUTE GRID DATA FUNCTION
-- For trips grid: per-trip per-stop ridership
-- ============================================

-- Get per-trip per-stop ridership for route grid view
CREATE OR REPLACE FUNCTION get_route_grid_data(
  p_route_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_direction TEXT DEFAULT NULL
)
RETURNS TABLE(
  trip_id TEXT,
  stop_id TEXT,
  stop_sequence INTEGER,
  total_boardings BIGINT,
  total_alightings BIGINT,
  avg_load NUMERIC,
  max_load INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.trip_id,
    sr.stop_id,
    MIN(sr.stop_sequence) AS stop_sequence,
    COALESCE(SUM(sr.boardings), 0)::BIGINT AS total_boardings,
    COALESCE(SUM(sr.alightings), 0)::BIGINT AS total_alightings,
    COALESCE(AVG(sr.load_after), 0) AS avg_load,
    COALESCE(MAX(sr.load_after), 0) AS max_load
  FROM stop_ridership sr
  WHERE sr.route_id = p_route_id
    AND sr.date >= p_start_date
    AND sr.date <= p_end_date
    AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
    AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
    AND (p_direction IS NULL OR sr.direction_id = p_direction::INTEGER)
  GROUP BY sr.trip_id, sr.stop_id
  ORDER BY sr.trip_id, stop_sequence;
END;
$$;

GRANT EXECUTE ON FUNCTION get_route_grid_data(TEXT, DATE, DATE, INTEGER[], TEXT[], TEXT) TO anon, authenticated;
