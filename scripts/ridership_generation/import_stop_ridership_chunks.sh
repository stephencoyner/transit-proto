#!/bin/bash
# ============================================
# Import stop_ridership chunks to Supabase
# ============================================
# Usage:
#   export SUPABASE_DB_URL="postgresql://postgres.xxxxx:password@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
#   ./import_stop_ridership_chunks.sh
# ============================================

set -e  # Exit on error

# Check for connection string
if [ -z "$SUPABASE_DB_URL" ]; then
    echo "ERROR: SUPABASE_DB_URL environment variable not set"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHUNKS_DIR="$SCRIPT_DIR/../../data/generated_v3_1/stop_ridership_chunks"

echo "============================================"
echo "Importing stop_ridership chunks"
echo "============================================"

# Get initial count
INITIAL_COUNT=$(psql "$SUPABASE_DB_URL" -t -c "SELECT COUNT(*) FROM stop_ridership;")
echo "Initial row count: $INITIAL_COUNT"
echo ""

# Import each chunk
CHUNK_NUM=1
for chunk_file in "$CHUNKS_DIR"/with_header_chunk_*.csv; do
    CHUNK_NAME=$(basename "$chunk_file")
    echo "[$CHUNK_NUM/12] Importing $CHUNK_NAME..."

    time psql "$SUPABASE_DB_URL" <<EOF
\copy stop_ridership(date, trip_id, route_id, shape_id, stop_id, stop_sequence, direction_id, time_period, day_of_week, boardings, alightings, load_after) FROM '$chunk_file' WITH (FORMAT csv, HEADER true);
SELECT COUNT(*) AS current_row_count FROM stop_ridership;
EOF

    echo ""
    CHUNK_NUM=$((CHUNK_NUM + 1))
done

# Final verification
echo "============================================"
echo "FINAL VERIFICATION"
echo "============================================"
psql "$SUPABASE_DB_URL" -c "SELECT COUNT(*) AS total_stop_ridership FROM stop_ridership;"

echo ""
echo "============================================"
echo "CHUNK IMPORT COMPLETE"
echo "============================================"
