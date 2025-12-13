-- ============================================
-- Transit Ridership Data Platform
-- Supabase/PostgreSQL Schema
-- Version 1.0 - December 2025
-- ============================================
-- Run this in Supabase SQL Editor
--
-- Schema supports:
-- - 6 aggregation levels (System, Routes, Route Detail, Trip, Stops, Stop)
-- - Filtering by date range, days of week, time periods, patterns, amenities
-- - Pre-aggregated summary tables for performance
-- - Comparison mode queries
-- ============================================

-- ============================================
-- Reference Tables
-- ============================================

-- Routes table (10 prototype routes)
CREATE TABLE IF NOT EXISTS routes (
  route_id TEXT PRIMARY KEY,
  route_short_name TEXT NOT NULL,
  route_long_name TEXT NOT NULL,
  route_type INTEGER NOT NULL DEFAULT 3
);

COMMENT ON TABLE routes IS 'Route metadata from GTFS. route_type 3 = bus.';

-- Stops table with amenities
CREATE TABLE IF NOT EXISTS stops (
  stop_id TEXT PRIMARY KEY,
  stop_name TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  -- Amenity flags (synthetic data)
  has_shelter BOOLEAN NOT NULL DEFAULT FALSE,
  has_seating BOOLEAN NOT NULL DEFAULT FALSE,
  has_lighting BOOLEAN NOT NULL DEFAULT FALSE,
  has_real_time_display BOOLEAN NOT NULL DEFAULT FALSE,
  has_bike_rack BOOLEAN NOT NULL DEFAULT FALSE,
  has_wheelchair_access BOOLEAN NOT NULL DEFAULT FALSE,
  has_tactile_paving BOOLEAN NOT NULL DEFAULT FALSE,
  has_trash_can BOOLEAN NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE stops IS 'Stop metadata with synthetic amenity flags.';

-- Trips table (GTFS trip metadata)
CREATE TABLE IF NOT EXISTS trips (
  trip_id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(route_id),
  shape_id TEXT NOT NULL,
  direction_id INTEGER NOT NULL,
  start_time TEXT NOT NULL,        -- HH:MM:SS format
  time_period TEXT NOT NULL,       -- early_am, am_peak, midday, pm_peak, evening, night
  headsign TEXT
);

COMMENT ON TABLE trips IS 'Trip metadata from GTFS. time_period derived from start_time.';
COMMENT ON COLUMN trips.start_time IS 'Trip start time in HH:MM:SS. Times >24:00 normalized to 00:00-23:59.';
COMMENT ON COLUMN trips.time_period IS 'Derived from start_time: early_am (00-06), am_peak (06-09), midday (09-15), pm_peak (15-19), evening (19-22), night (22-24).';

-- ============================================
-- Fact Tables (detailed ridership data)
-- ============================================

-- Stop-level ridership (atomic unit - largest table)
CREATE TABLE IF NOT EXISTS stop_ridership (
  date DATE NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(trip_id),
  route_id TEXT NOT NULL REFERENCES routes(route_id),
  shape_id TEXT NOT NULL,
  stop_id TEXT NOT NULL REFERENCES stops(stop_id),
  stop_sequence INTEGER NOT NULL,
  direction_id INTEGER NOT NULL,
  time_period TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,    -- 0=Monday, 6=Sunday
  boardings INTEGER NOT NULL,
  alightings INTEGER NOT NULL,
  load_after INTEGER NOT NULL,     -- Passengers on bus after this stop
  PRIMARY KEY (date, trip_id, stop_id)
);

COMMENT ON TABLE stop_ridership IS 'Atomic ridership data: boardings/alightings per stop per trip per day.';
COMMENT ON COLUMN stop_ridership.load_after IS 'Passenger count after boarding/alighting completes. Used for segment coloring.';
COMMENT ON COLUMN stop_ridership.day_of_week IS '0=Monday, 6=Sunday';

-- Trip-level ridership (pre-aggregated summary per trip per day)
CREATE TABLE IF NOT EXISTS trip_ridership (
  date DATE NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(trip_id),
  route_id TEXT NOT NULL REFERENCES routes(route_id),
  shape_id TEXT NOT NULL,
  direction_id INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  time_period TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,
  total_boardings INTEGER NOT NULL,
  total_alightings INTEGER NOT NULL,
  avg_load REAL NOT NULL,
  max_load INTEGER NOT NULL,
  PRIMARY KEY (date, trip_id)
);

COMMENT ON TABLE trip_ridership IS 'Pre-aggregated trip-level totals for fast queries.';

-- ============================================
-- Pre-aggregated Summary Tables (for fast queries)
-- ============================================

-- Daily system-wide summary
CREATE TABLE IF NOT EXISTS daily_system_summary (
  date DATE PRIMARY KEY,
  day_of_week INTEGER NOT NULL,
  trip_count INTEGER NOT NULL,
  total_boardings INTEGER NOT NULL,
  total_alightings INTEGER NOT NULL,
  avg_load REAL NOT NULL,
  max_load INTEGER NOT NULL
);

COMMENT ON TABLE daily_system_summary IS 'System-wide daily aggregates across all routes.';

-- Daily route-level summary
CREATE TABLE IF NOT EXISTS daily_route_summary (
  date DATE NOT NULL,
  route_id TEXT NOT NULL REFERENCES routes(route_id),
  day_of_week INTEGER NOT NULL,
  trip_count INTEGER NOT NULL,
  total_boardings INTEGER NOT NULL,
  total_alightings INTEGER NOT NULL,
  avg_load REAL NOT NULL,
  max_load INTEGER NOT NULL,
  PRIMARY KEY (date, route_id)
);

COMMENT ON TABLE daily_route_summary IS 'Per-route daily aggregates.';

-- Daily stop-level summary (across all routes - for Stops view)
CREATE TABLE IF NOT EXISTS daily_stop_summary (
  date DATE NOT NULL,
  stop_id TEXT NOT NULL REFERENCES stops(stop_id),
  day_of_week INTEGER NOT NULL,
  total_boardings INTEGER NOT NULL,
  total_alightings INTEGER NOT NULL,
  PRIMARY KEY (date, stop_id)
);

COMMENT ON TABLE daily_stop_summary IS 'Per-stop daily aggregates across all routes. No load metrics (no route context).';

-- ============================================
-- Indexes for Query Performance
-- ============================================

-- Stop ridership indexes (most queried table)
CREATE INDEX IF NOT EXISTS idx_stop_ridership_date ON stop_ridership(date);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_route ON stop_ridership(route_id);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_stop ON stop_ridership(stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_shape ON stop_ridership(shape_id);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_dow ON stop_ridership(day_of_week);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_period ON stop_ridership(time_period);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_trip ON stop_ridership(trip_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_stop_ridership_route_date ON stop_ridership(route_id, date);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_route_shape ON stop_ridership(route_id, shape_id);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_stop_date ON stop_ridership(stop_id, date);

-- Route Detail queries: filter by route + shape + date + dow + period
CREATE INDEX IF NOT EXISTS idx_stop_ridership_route_detail
  ON stop_ridership(route_id, shape_id, date, day_of_week, time_period);

-- Trip ridership indexes
CREATE INDEX IF NOT EXISTS idx_trip_ridership_date ON trip_ridership(date);
CREATE INDEX IF NOT EXISTS idx_trip_ridership_route ON trip_ridership(route_id);
CREATE INDEX IF NOT EXISTS idx_trip_ridership_shape ON trip_ridership(shape_id);
CREATE INDEX IF NOT EXISTS idx_trip_ridership_dow ON trip_ridership(day_of_week);
CREATE INDEX IF NOT EXISTS idx_trip_ridership_period ON trip_ridership(time_period);

-- Summary table indexes
CREATE INDEX IF NOT EXISTS idx_daily_route_summary_date ON daily_route_summary(date);
CREATE INDEX IF NOT EXISTS idx_daily_route_summary_route ON daily_route_summary(route_id);
CREATE INDEX IF NOT EXISTS idx_daily_route_summary_dow ON daily_route_summary(day_of_week);

CREATE INDEX IF NOT EXISTS idx_daily_stop_summary_date ON daily_stop_summary(date);
CREATE INDEX IF NOT EXISTS idx_daily_stop_summary_stop ON daily_stop_summary(stop_id);
CREATE INDEX IF NOT EXISTS idx_daily_stop_summary_dow ON daily_stop_summary(day_of_week);

-- Trips table indexes
CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(route_id);
CREATE INDEX IF NOT EXISTS idx_trips_shape ON trips(shape_id);
CREATE INDEX IF NOT EXISTS idx_trips_period ON trips(time_period);

-- Stops amenity indexes (for amenity filtering)
CREATE INDEX IF NOT EXISTS idx_stops_shelter ON stops(has_shelter);
CREATE INDEX IF NOT EXISTS idx_stops_seating ON stops(has_seating);
CREATE INDEX IF NOT EXISTS idx_stops_lighting ON stops(has_lighting);
CREATE INDEX IF NOT EXISTS idx_stops_realtime ON stops(has_real_time_display);
CREATE INDEX IF NOT EXISTS idx_stops_bikerack ON stops(has_bike_rack);
CREATE INDEX IF NOT EXISTS idx_stops_wheelchair ON stops(has_wheelchair_access);
CREATE INDEX IF NOT EXISTS idx_stops_tactile ON stops(has_tactile_paving);
CREATE INDEX IF NOT EXISTS idx_stops_trash ON stops(has_trash_can);

-- ============================================
-- Row Level Security (RLS)
-- Allow public read access for prototype
-- ============================================

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE stop_ridership ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_ridership ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_system_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_route_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stop_summary ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Allow public read" ON routes FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON stops FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON trips FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON stop_ridership FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON trip_ridership FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON daily_system_summary FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON daily_route_summary FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON daily_stop_summary FOR SELECT USING (true);

-- ============================================
-- Utility Views (optional, for convenience)
-- ============================================

-- View: Pattern summary for route detail UI
CREATE OR REPLACE VIEW route_patterns AS
SELECT
  t.route_id,
  t.shape_id,
  t.direction_id,
  t.headsign,
  COUNT(*) as trip_count
FROM trips t
GROUP BY t.route_id, t.shape_id, t.direction_id, t.headsign;

COMMENT ON VIEW route_patterns IS 'Pattern summary for route detail pattern filter UI.';

-- ============================================
-- Data Conventions Reference
-- ============================================
-- day_of_week: 0=Monday, 1=Tuesday, ..., 6=Sunday
-- time_period: 'early_am' (00-06), 'am_peak' (06-09), 'midday' (09-15),
--              'pm_peak' (15-19), 'evening' (19-22), 'night' (22-24)
-- date range: 2025-09-01 through 2025-09-30
-- routes: 1, 8, 10, 11, 13, 14, 40, 44, 62, 70
-- ============================================
