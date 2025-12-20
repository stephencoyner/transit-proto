-- ============================================
-- Route-Stop Summary Table for Performance Optimization
-- ============================================
-- This table pre-aggregates stop-level ridership data per route per day,
-- reducing query time from ~10s to <1s for route detail views.
--
-- Size estimate: 10 routes × ~30 stops/route × 194 days = ~58K rows
-- (much smaller than 23M rows in stop_ridership)
-- ============================================

-- Drop existing table if any
DROP TABLE IF EXISTS daily_route_stop_summary CASCADE;

-- Create the pre-aggregated table
CREATE TABLE daily_route_stop_summary (
  date DATE NOT NULL,
  route_id TEXT NOT NULL REFERENCES routes(route_id),
  stop_id TEXT NOT NULL REFERENCES stops(stop_id),
  direction_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  stop_sequence INTEGER NOT NULL,  -- Min stop sequence for ordering
  total_boardings INTEGER NOT NULL,
  total_alightings INTEGER NOT NULL,
  avg_load REAL NOT NULL,
  max_load INTEGER NOT NULL,
  PRIMARY KEY (date, route_id, stop_id, direction_id)
);

COMMENT ON TABLE daily_route_stop_summary IS 'Pre-aggregated stop-level metrics per route per day. Used for fast route detail queries.';

-- Indexes for common query patterns
CREATE INDEX idx_drss_route ON daily_route_stop_summary(route_id);
CREATE INDEX idx_drss_date ON daily_route_stop_summary(date);
CREATE INDEX idx_drss_route_date ON daily_route_stop_summary(route_id, date);
CREATE INDEX idx_drss_dow ON daily_route_stop_summary(day_of_week);
CREATE INDEX idx_drss_direction ON daily_route_stop_summary(direction_id);

-- Enable RLS
ALTER TABLE daily_route_stop_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON daily_route_stop_summary FOR SELECT USING (true);

-- ============================================
-- Populate from existing stop_ridership data
-- ============================================
INSERT INTO daily_route_stop_summary (
  date, route_id, stop_id, direction_id, day_of_week, stop_sequence,
  total_boardings, total_alightings, avg_load, max_load
)
SELECT
  sr.date,
  sr.route_id,
  sr.stop_id,
  sr.direction_id,
  sr.day_of_week,
  MIN(sr.stop_sequence) AS stop_sequence,
  SUM(sr.boardings) AS total_boardings,
  SUM(sr.alightings) AS total_alightings,
  AVG(sr.load_after) AS avg_load,
  MAX(sr.load_after) AS max_load
FROM stop_ridership sr
GROUP BY sr.date, sr.route_id, sr.stop_id, sr.direction_id, sr.day_of_week;

-- ============================================
-- Updated RPC Functions using pre-aggregated data
-- ============================================

-- Get route metrics (fast path using summary table)
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
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  -- Fast path: use pre-aggregated daily_route_stop_summary when no period filter
  IF p_periods IS NULL THEN
    SELECT json_build_object(
      'totalBoardings', COALESCE(SUM(total_boardings), 0),
      'totalAlightings', COALESCE(SUM(total_alightings), 0),
      'avgLoad', COALESCE(AVG(avg_load), 0),
      'maxLoad', COALESCE(MAX(max_load), 0),
      'tripCount', 0,  -- Not available in summary, will be computed separately if needed
      'stopCount', COUNT(DISTINCT stop_id)
    ) INTO result
    FROM daily_route_stop_summary drss
    WHERE drss.route_id = p_route_id
      AND drss.date >= p_start_date
      AND drss.date <= p_end_date
      AND (p_days IS NULL OR drss.day_of_week = ANY(p_days))
      AND (p_direction IS NULL OR drss.direction_id = p_direction::INTEGER);
  ELSE
    -- Slow path: query stop_ridership when period filter requires it
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
  END IF;

  RETURN result;
END;
$$;

-- Get route segments with load data (fast path using summary table)
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
SET search_path = public
AS $$
BEGIN
  -- Fast path: use pre-aggregated daily_route_stop_summary when no period filter
  IF p_periods IS NULL THEN
    RETURN QUERY
    SELECT
      drss.stop_id,
      s.stop_name,
      s.lat,
      s.lon,
      MIN(drss.stop_sequence) AS stop_sequence,
      COALESCE(AVG(drss.avg_load), 0) AS avg_load,
      COALESCE(MAX(drss.max_load), 0) AS max_load
    FROM daily_route_stop_summary drss
    JOIN stops s ON drss.stop_id = s.stop_id
    WHERE drss.route_id = p_route_id
      AND drss.date >= p_start_date
      AND drss.date <= p_end_date
      AND (p_days IS NULL OR drss.day_of_week = ANY(p_days))
      AND (p_direction IS NULL OR drss.direction_id = p_direction::INTEGER)
    GROUP BY drss.stop_id, s.stop_name, s.lat, s.lon
    ORDER BY stop_sequence;
  ELSE
    -- Slow path: query stop_ridership when period filter requires it
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
  END IF;
END;
$$;

-- Get route stops with metrics (fast path using summary table)
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
SET search_path = public
AS $$
BEGIN
  -- Fast path: use pre-aggregated daily_route_stop_summary when no period filter
  IF p_periods IS NULL THEN
    RETURN QUERY
    SELECT
      drss.stop_id,
      s.stop_name,
      s.lat,
      s.lon,
      MIN(drss.stop_sequence) AS min_sequence,
      COALESCE(SUM(drss.total_boardings), 0)::BIGINT AS total_boardings,
      COALESCE(SUM(drss.total_alightings), 0)::BIGINT AS total_alightings
    FROM daily_route_stop_summary drss
    JOIN stops s ON drss.stop_id = s.stop_id
    WHERE drss.route_id = p_route_id
      AND drss.date >= p_start_date
      AND drss.date <= p_end_date
      AND (p_days IS NULL OR drss.day_of_week = ANY(p_days))
      AND (p_direction IS NULL OR drss.direction_id = p_direction::INTEGER)
    GROUP BY drss.stop_id, s.stop_name, s.lat, s.lon
    ORDER BY min_sequence;
  ELSE
    -- Slow path: query stop_ridership when period filter requires it
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
  END IF;
END;
$$;

-- Get route by direction (fast path using summary table)
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
SET search_path = public
AS $$
BEGIN
  -- Fast path: use pre-aggregated daily_route_stop_summary when no period filter
  IF p_periods IS NULL THEN
    RETURN QUERY
    SELECT
      drss.direction_id::TEXT,
      COALESCE(SUM(drss.total_boardings), 0)::BIGINT AS total_boardings,
      COALESCE(SUM(drss.total_alightings), 0)::BIGINT AS total_alightings,
      COALESCE(AVG(drss.avg_load), 0) AS avg_load,
      COALESCE(MAX(drss.max_load), 0) AS max_load
    FROM daily_route_stop_summary drss
    WHERE drss.route_id = p_route_id
      AND drss.date >= p_start_date
      AND drss.date <= p_end_date
      AND (p_days IS NULL OR drss.day_of_week = ANY(p_days))
    GROUP BY drss.direction_id
    ORDER BY drss.direction_id;
  ELSE
    -- Slow path: query stop_ridership when period filter requires it
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
  END IF;
END;
$$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION get_route_metrics(TEXT, DATE, DATE, INTEGER[], TEXT[], TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_route_segments(TEXT, DATE, DATE, INTEGER[], TEXT[], TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_route_stops(TEXT, DATE, DATE, INTEGER[], TEXT[], TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_route_by_direction(TEXT, DATE, DATE, INTEGER[], TEXT[]) TO anon, authenticated;
