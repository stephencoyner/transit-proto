#!/bin/bash
# ============================================
# Import Ridership Data v3.1 to Supabase
# ============================================
# Usage:
#   export SUPABASE_DB_URL="postgresql://postgres.xxxxx:password@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
#   ./import_to_supabase.sh
#
# Use the "Session pooler" connection string from Supabase Dashboard:
#   Settings → Database → Connection string → Session pooler
#
# The Session pooler doesn't have statement timeouts, which is needed
# for large imports like the 23M row stop_ridership table.
# ============================================

set -e  # Exit on error

# Check for connection string
if [ -z "$SUPABASE_DB_URL" ]; then
    echo "ERROR: SUPABASE_DB_URL environment variable not set"
    echo ""
    echo "Get your Session pooler connection string from:"
    echo "  Supabase Dashboard → Settings → Database → Connection string → Session pooler"
    echo ""
    echo "Then run:"
    echo "  export SUPABASE_DB_URL=\"postgresql://postgres.xxxxx:password@...\""
    echo "  ./import_to_supabase.sh"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../../data/generated_v3_1"

echo "============================================"
echo "Supabase Import - Ridership Data v3.1"
echo "============================================"
echo "Data directory: $DATA_DIR"
echo ""

# Verify data files exist
for file in routes.csv stops.csv trips.csv trip_ridership.csv stop_ridership.csv \
            daily_system_summary.csv daily_route_summary.csv daily_stop_summary.csv daily_period_summary.csv; do
    if [ ! -f "$DATA_DIR/$file" ]; then
        echo "ERROR: Missing file: $DATA_DIR/$file"
        exit 1
    fi
done
echo "All data files found."
echo ""

# ============================================
# Step 1: Clear existing data and recreate schema
# ============================================
echo "Step 1: Clearing existing data..."
psql "$SUPABASE_DB_URL" <<EOF
-- Drop tables in dependency order
DROP TABLE IF EXISTS daily_route_stop_summary CASCADE;
DROP TABLE IF EXISTS daily_period_summary CASCADE;
DROP TABLE IF EXISTS daily_stop_summary CASCADE;
DROP TABLE IF EXISTS daily_route_summary CASCADE;
DROP TABLE IF EXISTS daily_system_summary CASCADE;
DROP TABLE IF EXISTS stop_ridership CASCADE;
DROP TABLE IF EXISTS trip_ridership CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS stops CASCADE;
DROP TABLE IF EXISTS routes CASCADE;
DROP VIEW IF EXISTS route_patterns CASCADE;

-- Drop any existing functions
DROP FUNCTION IF EXISTS get_route_metrics(TEXT, DATE, DATE, INTEGER[], TEXT[], TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_route_segments(TEXT, DATE, DATE, INTEGER[], TEXT[], TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_route_stops(TEXT, DATE, DATE, INTEGER[], TEXT[], TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_route_by_direction(TEXT, DATE, DATE, INTEGER[], TEXT[]) CASCADE;

\echo 'Existing tables dropped.'
EOF

echo "Step 1: Running schema.sql..."
psql "$SUPABASE_DB_URL" -f "$SCRIPT_DIR/schema.sql"
echo "Schema created."
echo ""

# ============================================
# Step 2: Import reference tables
# ============================================
echo "Step 2: Importing reference tables..."

echo "  Importing routes.csv..."
psql "$SUPABASE_DB_URL" <<EOF
\copy routes(route_id, route_short_name, route_long_name, route_type) FROM '$DATA_DIR/routes.csv' WITH (FORMAT csv, HEADER true);
SELECT COUNT(*) AS routes_count FROM routes;
EOF

echo "  Importing stops.csv..."
psql "$SUPABASE_DB_URL" <<EOF
\copy stops(stop_id, stop_name, lat, lon, has_shelter, has_seating, has_lighting, has_real_time_display, has_bike_rack, has_wheelchair_access, has_tactile_paving, has_trash_can) FROM '$DATA_DIR/stops.csv' WITH (FORMAT csv, HEADER true);
SELECT COUNT(*) AS stops_count FROM stops;
EOF

echo "  Importing trips.csv..."
psql "$SUPABASE_DB_URL" <<EOF
\copy trips(trip_id, route_id, shape_id, direction_id, start_time, time_period, headsign) FROM '$DATA_DIR/trips.csv' WITH (FORMAT csv, HEADER true);
SELECT COUNT(*) AS trips_count FROM trips;
EOF

echo "Reference tables imported."
echo ""

# ============================================
# Step 3: Import summary tables
# ============================================
echo "Step 3: Importing summary tables..."

echo "  Importing daily_system_summary.csv..."
psql "$SUPABASE_DB_URL" <<EOF
\copy daily_system_summary(date, day_of_week, trip_count, total_boardings, total_alightings, avg_load, max_load) FROM '$DATA_DIR/daily_system_summary.csv' WITH (FORMAT csv, HEADER true);
SELECT COUNT(*) AS daily_system_count FROM daily_system_summary;
EOF

echo "  Importing daily_route_summary.csv..."
psql "$SUPABASE_DB_URL" <<EOF
\copy daily_route_summary(date, route_id, day_of_week, trip_count, total_boardings, total_alightings, avg_load, max_load) FROM '$DATA_DIR/daily_route_summary.csv' WITH (FORMAT csv, HEADER true);
SELECT COUNT(*) AS daily_route_count FROM daily_route_summary;
EOF

echo "  Importing daily_stop_summary.csv..."
psql "$SUPABASE_DB_URL" <<EOF
\copy daily_stop_summary(date, stop_id, day_of_week, total_boardings, total_alightings) FROM '$DATA_DIR/daily_stop_summary.csv' WITH (FORMAT csv, HEADER true);
SELECT COUNT(*) AS daily_stop_count FROM daily_stop_summary;
EOF

echo "  Importing daily_period_summary.csv..."
psql "$SUPABASE_DB_URL" <<EOF
\copy daily_period_summary(date, time_period, day_of_week, total_boardings, total_alightings, avg_load, max_load) FROM '$DATA_DIR/daily_period_summary.csv' WITH (FORMAT csv, HEADER true);
SELECT COUNT(*) AS daily_period_count FROM daily_period_summary;
EOF

echo "Summary tables imported."
echo ""

# ============================================
# Step 4: Import large fact tables
# ============================================
echo "Step 4: Importing trip_ridership (726k rows)..."
echo "  This may take 1-2 minutes..."
time psql "$SUPABASE_DB_URL" <<EOF
\copy trip_ridership(date, trip_id, route_id, shape_id, direction_id, start_time, time_period, day_of_week, total_boardings, total_alightings, avg_load, max_load) FROM '$DATA_DIR/trip_ridership.csv' WITH (FORMAT csv, HEADER true);
SELECT COUNT(*) AS trip_ridership_count FROM trip_ridership;
EOF
echo ""

echo "Step 5: Importing stop_ridership (23M rows)..."
echo "  This may take 10-20 minutes. Go grab a coffee..."
time psql "$SUPABASE_DB_URL" <<EOF
\copy stop_ridership(date, trip_id, route_id, shape_id, stop_id, stop_sequence, direction_id, time_period, day_of_week, boardings, alightings, load_after) FROM '$DATA_DIR/stop_ridership.csv' WITH (FORMAT csv, HEADER true);
SELECT COUNT(*) AS stop_ridership_count FROM stop_ridership;
EOF
echo ""

# ============================================
# Step 5: Generate daily_route_stop_summary
# ============================================
echo "Step 6: Generating daily_route_stop_summary from stop_ridership..."
echo "  This aggregates 23M rows into ~58k summary rows..."
time psql "$SUPABASE_DB_URL" <<EOF
INSERT INTO daily_route_stop_summary (
    date, route_id, stop_id, direction_id, day_of_week, stop_sequence,
    total_boardings, total_alightings, avg_load, max_load
)
SELECT
    date,
    route_id,
    stop_id,
    direction_id,
    day_of_week,
    MIN(stop_sequence) AS stop_sequence,
    SUM(boardings) AS total_boardings,
    SUM(alightings) AS total_alightings,
    AVG(load_after) AS avg_load,
    MAX(load_after) AS max_load
FROM stop_ridership
GROUP BY date, route_id, stop_id, direction_id, day_of_week;

SELECT COUNT(*) AS daily_route_stop_count FROM daily_route_stop_summary;
EOF
echo ""

# ============================================
# Step 6: Install RPC functions
# ============================================
echo "Step 7: Installing RPC functions..."
psql "$SUPABASE_DB_URL" -f "$SCRIPT_DIR/functions.sql"
echo "RPC functions installed."
echo ""

# ============================================
# Verification
# ============================================
echo "============================================"
echo "VERIFICATION"
echo "============================================"
psql "$SUPABASE_DB_URL" <<EOF
SELECT 'routes' AS table_name, COUNT(*) AS row_count FROM routes
UNION ALL SELECT 'stops', COUNT(*) FROM stops
UNION ALL SELECT 'trips', COUNT(*) FROM trips
UNION ALL SELECT 'trip_ridership', COUNT(*) FROM trip_ridership
UNION ALL SELECT 'stop_ridership', COUNT(*) FROM stop_ridership
UNION ALL SELECT 'daily_system_summary', COUNT(*) FROM daily_system_summary
UNION ALL SELECT 'daily_route_summary', COUNT(*) FROM daily_route_summary
UNION ALL SELECT 'daily_stop_summary', COUNT(*) FROM daily_stop_summary
UNION ALL SELECT 'daily_period_summary', COUNT(*) FROM daily_period_summary
UNION ALL SELECT 'daily_route_stop_summary', COUNT(*) FROM daily_route_stop_summary
ORDER BY table_name;
EOF

echo ""
echo "============================================"
echo "IMPORT COMPLETE"
echo "============================================"
echo "Your Supabase database is now loaded with ridership data v3.1"
echo ""
echo "Date range: 2025-03-21 to 2025-09-30 (194 days)"
echo "Routes: 1, 8, 10, 11, 13, 14, 40, 44, 62, 70"
echo ""
