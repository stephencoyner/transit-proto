-- Supabase Schema Migration for Transit Ridership Data
-- Run this in Supabase SQL Editor

-- ============================================
-- Reference Tables
-- ============================================

-- Routes table
CREATE TABLE IF NOT EXISTS routes (
  route_id TEXT PRIMARY KEY,
  route_name TEXT NOT NULL,
  route_type TEXT NOT NULL
);

-- Stops table
CREATE TABLE IF NOT EXISTS stops (
  stop_id TEXT PRIMARY KEY,
  stop_name TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL
);

-- ============================================
-- Pre-aggregated Summary Tables (for fast queries)
-- ============================================

-- Daily system-wide summary
CREATE TABLE IF NOT EXISTS daily_system_summary (
  date DATE PRIMARY KEY,
  day_of_week INTEGER NOT NULL,
  route_count INTEGER NOT NULL,
  trip_count INTEGER NOT NULL,
  total_boardings INTEGER NOT NULL,
  total_alightings INTEGER NOT NULL,
  avg_load REAL NOT NULL,
  max_load INTEGER NOT NULL
);

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

-- ============================================
-- Fact Tables (detailed ridership data)
-- ============================================

-- Trip-level ridership
CREATE TABLE IF NOT EXISTS trip_ridership (
  date DATE NOT NULL,
  trip_id TEXT NOT NULL,
  route_id TEXT NOT NULL REFERENCES routes(route_id),
  direction_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  time_period TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,
  total_boardings INTEGER NOT NULL,
  total_alightings INTEGER NOT NULL,
  max_load INTEGER NOT NULL,
  PRIMARY KEY (date, trip_id)
);

-- Stop-level ridership (largest table, denormalized for query performance)
CREATE TABLE IF NOT EXISTS stop_ridership (
  date DATE NOT NULL,
  trip_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL REFERENCES stops(stop_id),
  stop_sequence INTEGER NOT NULL,
  boardings INTEGER NOT NULL,
  alightings INTEGER NOT NULL,
  load_after INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  direction_id TEXT NOT NULL,
  time_period TEXT NOT NULL,
  PRIMARY KEY (date, trip_id, stop_id)
);

-- ============================================
-- Indexes for Query Performance
-- ============================================

-- Trip ridership indexes
CREATE INDEX IF NOT EXISTS idx_trip_ridership_date ON trip_ridership(date);
CREATE INDEX IF NOT EXISTS idx_trip_ridership_route ON trip_ridership(route_id);
CREATE INDEX IF NOT EXISTS idx_trip_ridership_dow ON trip_ridership(day_of_week);
CREATE INDEX IF NOT EXISTS idx_trip_ridership_period ON trip_ridership(time_period);

-- Stop ridership indexes
CREATE INDEX IF NOT EXISTS idx_stop_ridership_date ON stop_ridership(date);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_stop ON stop_ridership(stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_route ON stop_ridership(route_id);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_dow ON stop_ridership(day_of_week);
CREATE INDEX IF NOT EXISTS idx_stop_ridership_period ON stop_ridership(time_period);

-- Summary table indexes
CREATE INDEX IF NOT EXISTS idx_daily_route_summary_date ON daily_route_summary(date);
CREATE INDEX IF NOT EXISTS idx_daily_route_summary_dow ON daily_route_summary(day_of_week);

-- ============================================
-- Row Level Security (RLS)
-- For now, allow public read access
-- ============================================

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_system_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_route_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_ridership ENABLE ROW LEVEL SECURITY;
ALTER TABLE stop_ridership ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access
CREATE POLICY "Allow public read access" ON routes FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON stops FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON daily_system_summary FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON daily_route_summary FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON trip_ridership FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON stop_ridership FOR SELECT USING (true);
