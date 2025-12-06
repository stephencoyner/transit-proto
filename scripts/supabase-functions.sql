-- Supabase RPC Functions for Ridership Aggregation
-- Run this in Supabase SQL Editor after setting up the schema

-- System-level metrics aggregation
CREATE OR REPLACE FUNCTION get_system_metrics(
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'totalBoardings', COALESCE(SUM(boardings), 0),
    'totalAlightings', COALESCE(SUM(alightings), 0),
    'avgLoad', COALESCE(AVG(load_after), 0),
    'maxLoad', COALESCE(MAX(load_after), 0),
    'rowCount', COUNT(*)
  ) INTO result
  FROM stop_ridership
  WHERE date >= p_start_date
    AND date <= p_end_date
    AND (p_days IS NULL OR day_of_week = ANY(p_days))
    AND (p_periods IS NULL OR time_period = ANY(p_periods));

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Route-level aggregation
CREATE OR REPLACE FUNCTION get_metrics_by_route(
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data)
    FROM (
      SELECT
        sr.route_id,
        r.route_name,
        r.route_type,
        SUM(sr.boardings) as total_boardings,
        SUM(sr.alightings) as total_alightings,
        AVG(sr.load_after) as avg_load,
        MAX(sr.load_after) as max_load
      FROM stop_ridership sr
      JOIN routes r ON sr.route_id = r.route_id
      WHERE sr.date >= p_start_date
        AND sr.date <= p_end_date
        AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
        AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
      GROUP BY sr.route_id, r.route_name, r.route_type
      ORDER BY SUM(sr.boardings) DESC
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Time period aggregation
CREATE OR REPLACE FUNCTION get_metrics_by_period(
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data ORDER BY
      CASE time_period
        WHEN 'early_am' THEN 1
        WHEN 'am_peak' THEN 2
        WHEN 'midday' THEN 3
        WHEN 'pm_peak' THEN 4
        WHEN 'evening' THEN 5
        WHEN 'night' THEN 6
      END
    )
    FROM (
      SELECT
        time_period,
        SUM(boardings) as total_boardings,
        SUM(alightings) as total_alightings,
        AVG(load_after) as avg_load,
        MAX(load_after) as max_load
      FROM stop_ridership
      WHERE date >= p_start_date
        AND date <= p_end_date
        AND (p_days IS NULL OR day_of_week = ANY(p_days))
        AND (p_routes IS NULL OR route_id = ANY(p_routes))
      GROUP BY time_period
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Daily aggregation (for line charts)
CREATE OR REPLACE FUNCTION get_metrics_by_date(
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data ORDER BY date)
    FROM (
      SELECT
        date,
        day_of_week,
        SUM(boardings) as total_boardings,
        SUM(alightings) as total_alightings,
        AVG(load_after) as avg_load,
        MAX(load_after) as max_load
      FROM stop_ridership
      WHERE date >= p_start_date
        AND date <= p_end_date
        AND (p_days IS NULL OR day_of_week = ANY(p_days))
        AND (p_periods IS NULL OR time_period = ANY(p_periods))
        AND (p_routes IS NULL OR route_id = ANY(p_routes))
      GROUP BY date, day_of_week
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Day of week aggregation (for bar charts)
CREATE OR REPLACE FUNCTION get_metrics_by_day_of_week(
  p_start_date DATE,
  p_end_date DATE,
  p_periods TEXT[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data ORDER BY day_of_week)
    FROM (
      SELECT
        day_of_week,
        SUM(boardings) as total_boardings,
        SUM(alightings) as total_alightings,
        AVG(load_after) as avg_load,
        MAX(load_after) as max_load,
        COUNT(DISTINCT date) as day_count
      FROM stop_ridership
      WHERE date >= p_start_date
        AND date <= p_end_date
        AND (p_periods IS NULL OR time_period = ANY(p_periods))
        AND (p_routes IS NULL OR route_id = ANY(p_routes))
      GROUP BY day_of_week
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stop-level aggregation (for all stops endpoint - map display)
CREATE OR REPLACE FUNCTION get_all_stops_metrics(
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data)
    FROM (
      SELECT
        sr.stop_id,
        s.stop_name,
        s.lat,
        s.lon,
        SUM(sr.boardings) as total_boardings,
        SUM(sr.alightings) as total_alightings,
        COUNT(DISTINCT sr.route_id) as route_count
      FROM stop_ridership sr
      JOIN stops s ON sr.stop_id = s.stop_id
      WHERE sr.date >= p_start_date
        AND sr.date <= p_end_date
        AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
        AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
        AND (p_routes IS NULL OR sr.route_id = ANY(p_routes))
      GROUP BY sr.stop_id, s.stop_name, s.lat, s.lon
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Single stop metrics
CREATE OR REPLACE FUNCTION get_stop_metrics(
  p_stop_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'totalBoardings', COALESCE(SUM(boardings), 0),
      'totalAlightings', COALESCE(SUM(alightings), 0),
      'routeCount', COUNT(DISTINCT route_id),
      'tripCount', COUNT(DISTINCT trip_id)
    )
    FROM stop_ridership
    WHERE stop_id = p_stop_id
      AND date >= p_start_date
      AND date <= p_end_date
      AND (p_days IS NULL OR day_of_week = ANY(p_days))
      AND (p_periods IS NULL OR time_period = ANY(p_periods))
      AND (p_routes IS NULL OR route_id = ANY(p_routes))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stop by route breakdown
CREATE OR REPLACE FUNCTION get_stop_by_route(
  p_stop_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data)
    FROM (
      SELECT
        sr.route_id,
        r.route_name,
        SUM(sr.boardings) as total_boardings,
        SUM(sr.alightings) as total_alightings
      FROM stop_ridership sr
      JOIN routes r ON sr.route_id = r.route_id
      WHERE sr.stop_id = p_stop_id
        AND sr.date >= p_start_date
        AND sr.date <= p_end_date
        AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
        AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
      GROUP BY sr.route_id, r.route_name
      ORDER BY SUM(sr.boardings) DESC
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stop by date (for line chart)
CREATE OR REPLACE FUNCTION get_stop_by_date(
  p_stop_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data ORDER BY date)
    FROM (
      SELECT
        date,
        day_of_week,
        SUM(boardings) as total_boardings,
        SUM(alightings) as total_alightings
      FROM stop_ridership
      WHERE stop_id = p_stop_id
        AND date >= p_start_date
        AND date <= p_end_date
        AND (p_days IS NULL OR day_of_week = ANY(p_days))
        AND (p_periods IS NULL OR time_period = ANY(p_periods))
        AND (p_routes IS NULL OR route_id = ANY(p_routes))
      GROUP BY date, day_of_week
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stop by day of week (for bar chart)
CREATE OR REPLACE FUNCTION get_stop_by_day_of_week(
  p_stop_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_periods TEXT[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data ORDER BY day_of_week)
    FROM (
      SELECT
        day_of_week,
        SUM(boardings) as total_boardings,
        SUM(alightings) as total_alightings,
        COUNT(DISTINCT date) as day_count
      FROM stop_ridership
      WHERE stop_id = p_stop_id
        AND date >= p_start_date
        AND date <= p_end_date
        AND (p_periods IS NULL OR time_period = ANY(p_periods))
        AND (p_routes IS NULL OR route_id = ANY(p_routes))
      GROUP BY day_of_week
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stop by time period (for pie chart)
CREATE OR REPLACE FUNCTION get_stop_by_period(
  p_stop_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_routes TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data ORDER BY
      CASE time_period
        WHEN 'early_am' THEN 1
        WHEN 'am_peak' THEN 2
        WHEN 'midday' THEN 3
        WHEN 'pm_peak' THEN 4
        WHEN 'evening' THEN 5
        WHEN 'night' THEN 6
      END
    )
    FROM (
      SELECT
        time_period,
        SUM(boardings) as total_boardings,
        SUM(alightings) as total_alightings
      FROM stop_ridership
      WHERE stop_id = p_stop_id
        AND date >= p_start_date
        AND date <= p_end_date
        AND (p_days IS NULL OR day_of_week = ANY(p_days))
        AND (p_routes IS NULL OR route_id = ANY(p_routes))
      GROUP BY time_period
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Route metrics
CREATE OR REPLACE FUNCTION get_route_metrics(
  p_route_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_direction TEXT DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'totalBoardings', COALESCE(SUM(boardings), 0),
      'totalAlightings', COALESCE(SUM(alightings), 0),
      'avgLoad', COALESCE(AVG(load_after), 0),
      'maxLoad', COALESCE(MAX(load_after), 0),
      'tripCount', COUNT(DISTINCT trip_id),
      'stopCount', COUNT(DISTINCT stop_id)
    )
    FROM stop_ridership
    WHERE route_id = p_route_id
      AND date >= p_start_date
      AND date <= p_end_date
      AND (p_days IS NULL OR day_of_week = ANY(p_days))
      AND (p_periods IS NULL OR time_period = ANY(p_periods))
      AND (p_direction IS NULL OR direction_id = p_direction)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Route by direction
CREATE OR REPLACE FUNCTION get_route_by_direction(
  p_route_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data)
    FROM (
      SELECT
        direction_id,
        SUM(boardings) as total_boardings,
        SUM(alightings) as total_alightings,
        AVG(load_after) as avg_load,
        MAX(load_after) as max_load
      FROM stop_ridership
      WHERE route_id = p_route_id
        AND date >= p_start_date
        AND date <= p_end_date
        AND (p_days IS NULL OR day_of_week = ANY(p_days))
        AND (p_periods IS NULL OR time_period = ANY(p_periods))
      GROUP BY direction_id
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Route by period
CREATE OR REPLACE FUNCTION get_route_by_period(
  p_route_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_direction TEXT DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data ORDER BY
      CASE time_period
        WHEN 'early_am' THEN 1
        WHEN 'am_peak' THEN 2
        WHEN 'midday' THEN 3
        WHEN 'pm_peak' THEN 4
        WHEN 'evening' THEN 5
        WHEN 'night' THEN 6
      END
    )
    FROM (
      SELECT
        time_period,
        SUM(boardings) as total_boardings,
        SUM(alightings) as total_alightings,
        AVG(load_after) as avg_load,
        MAX(load_after) as max_load
      FROM stop_ridership
      WHERE route_id = p_route_id
        AND date >= p_start_date
        AND date <= p_end_date
        AND (p_days IS NULL OR day_of_week = ANY(p_days))
        AND (p_direction IS NULL OR direction_id = p_direction)
      GROUP BY time_period
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Route stops (for route detail view)
CREATE OR REPLACE FUNCTION get_route_stops(
  p_route_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_direction TEXT DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data ORDER BY min_sequence)
    FROM (
      SELECT
        sr.stop_id,
        s.stop_name,
        s.lat,
        s.lon,
        MIN(sr.stop_sequence) as min_sequence,
        SUM(sr.boardings) as total_boardings,
        SUM(sr.alightings) as total_alightings
      FROM stop_ridership sr
      JOIN stops s ON sr.stop_id = s.stop_id
      WHERE sr.route_id = p_route_id
        AND sr.date >= p_start_date
        AND sr.date <= p_end_date
        AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
        AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
        AND (p_direction IS NULL OR sr.direction_id = p_direction)
      GROUP BY sr.stop_id, s.stop_name, s.lat, s.lon
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Route segments (for map load coloring)
CREATE OR REPLACE FUNCTION get_route_segments(
  p_route_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_days INTEGER[] DEFAULT NULL,
  p_periods TEXT[] DEFAULT NULL,
  p_direction TEXT DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data ORDER BY stop_sequence)
    FROM (
      SELECT
        sr.stop_id,
        s.stop_name,
        s.lat,
        s.lon,
        MIN(sr.stop_sequence) as stop_sequence,
        AVG(sr.load_after) as avg_load,
        MAX(sr.load_after) as max_load
      FROM stop_ridership sr
      JOIN stops s ON sr.stop_id = s.stop_id
      WHERE sr.route_id = p_route_id
        AND sr.date >= p_start_date
        AND sr.date <= p_end_date
        AND (p_days IS NULL OR sr.day_of_week = ANY(p_days))
        AND (p_periods IS NULL OR sr.time_period = ANY(p_periods))
        AND (p_direction IS NULL OR sr.direction_id = p_direction)
      GROUP BY sr.stop_id, s.stop_name, s.lat, s.lon
    ) row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to anon role
GRANT EXECUTE ON FUNCTION get_system_metrics TO anon;
GRANT EXECUTE ON FUNCTION get_metrics_by_route TO anon;
GRANT EXECUTE ON FUNCTION get_metrics_by_period TO anon;
GRANT EXECUTE ON FUNCTION get_metrics_by_date TO anon;
GRANT EXECUTE ON FUNCTION get_metrics_by_day_of_week TO anon;
GRANT EXECUTE ON FUNCTION get_all_stops_metrics TO anon;
GRANT EXECUTE ON FUNCTION get_stop_metrics TO anon;
GRANT EXECUTE ON FUNCTION get_stop_by_route TO anon;
GRANT EXECUTE ON FUNCTION get_stop_by_date TO anon;
GRANT EXECUTE ON FUNCTION get_stop_by_day_of_week TO anon;
GRANT EXECUTE ON FUNCTION get_stop_by_period TO anon;
GRANT EXECUTE ON FUNCTION get_route_metrics TO anon;
GRANT EXECUTE ON FUNCTION get_route_by_direction TO anon;
GRANT EXECUTE ON FUNCTION get_route_by_period TO anon;
GRANT EXECUTE ON FUNCTION get_route_stops TO anon;
GRANT EXECUTE ON FUNCTION get_route_segments TO anon;
