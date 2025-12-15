#!/usr/bin/env python3
"""
Import generated ridership CSV data into Supabase.

This script handles the import of ~23M rows of stop_ridership data plus
supporting tables efficiently using PostgreSQL COPY via psycopg2.

Usage:
    python import_to_supabase.py [--dry-run] [--table TABLE_NAME]

Options:
    --dry-run       Print what would be done without executing
    --table NAME    Import only specified table (can be repeated)
    --chunk-size N  Rows per chunk for large tables (default: 100000)

Environment variables required:
    SUPABASE_DB_URL - PostgreSQL connection string (from Supabase dashboard)

    Or individual components:
    SUPABASE_DB_HOST
    SUPABASE_DB_PORT
    SUPABASE_DB_NAME
    SUPABASE_DB_USER
    SUPABASE_DB_PASSWORD

Example:
    # Set the connection URL (get from Supabase Dashboard > Settings > Database)
    export SUPABASE_DB_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"

    # Import all tables
    python import_to_supabase.py

    # Import only routes and stops first
    python import_to_supabase.py --table routes --table stops

    # Dry run to see what would happen
    python import_to_supabase.py --dry-run
"""

import argparse
import csv
import io
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Check for psycopg2
try:
    import psycopg2
    from psycopg2 import sql
except ImportError:
    print("Error: psycopg2 not installed. Install with: pip install psycopg2-binary")
    sys.exit(1)

# Data directory
DATA_DIR = Path(__file__).parent.parent.parent / "data" / "generated_v3"

# Import order matters due to foreign key constraints
IMPORT_ORDER = [
    "routes",           # No dependencies
    "stops",            # No dependencies
    "trips",            # Depends on routes
    "stop_ridership",   # Depends on trips, routes, stops (LARGE - 23M rows)
    "trip_ridership",   # Depends on trips, routes (726K rows)
    "daily_system_summary",   # No dependencies
    "daily_route_summary",    # Depends on routes
    "daily_stop_summary",     # Depends on stops
    "daily_period_summary",   # No dependencies
]

# Column mappings for each table (CSV column -> DB column)
# Only needed if CSV columns differ from DB columns
TABLE_COLUMNS = {
    "routes": ["route_id", "route_short_name", "route_long_name", "route_type"],
    "stops": [
        "stop_id", "stop_name", "lat", "lon",
        "has_shelter", "has_seating", "has_lighting", "has_real_time_display",
        "has_bike_rack", "has_wheelchair_access", "has_tactile_paving", "has_trash_can"
    ],
    "trips": ["trip_id", "route_id", "shape_id", "direction_id", "start_time", "time_period", "headsign"],
    "stop_ridership": [
        "date", "trip_id", "route_id", "shape_id", "stop_id", "stop_sequence",
        "direction_id", "time_period", "day_of_week", "boardings", "alightings", "load_after"
    ],
    "trip_ridership": [
        "date", "trip_id", "route_id", "shape_id", "direction_id", "start_time",
        "time_period", "day_of_week", "total_boardings", "total_alightings", "avg_load", "max_load"
    ],
    "daily_system_summary": [
        "date", "day_of_week", "trip_count", "total_boardings", "total_alightings", "avg_load", "max_load"
    ],
    "daily_route_summary": [
        "date", "route_id", "day_of_week", "trip_count", "total_boardings", "total_alightings", "avg_load", "max_load"
    ],
    "daily_stop_summary": [
        "date", "stop_id", "day_of_week", "total_boardings", "total_alightings"
    ],
    "daily_period_summary": [
        "date", "time_period", "day_of_week", "total_boardings", "total_alightings", "avg_load", "max_load"
    ],
}


@dataclass
class ImportStats:
    """Track import statistics."""
    table: str
    rows_imported: int = 0
    rows_skipped: int = 0
    elapsed_seconds: float = 0.0
    error: Optional[str] = None


def get_db_connection():
    """Get database connection from environment variables."""
    # Try connection URL first
    db_url = os.environ.get("SUPABASE_DB_URL")
    if db_url:
        return psycopg2.connect(db_url)

    # Fall back to individual components
    host = os.environ.get("SUPABASE_DB_HOST")
    port = os.environ.get("SUPABASE_DB_PORT", "6543")
    dbname = os.environ.get("SUPABASE_DB_NAME", "postgres")
    user = os.environ.get("SUPABASE_DB_USER", "postgres")
    password = os.environ.get("SUPABASE_DB_PASSWORD")

    if not host or not password:
        raise ValueError(
            "Missing database credentials. Set SUPABASE_DB_URL or "
            "SUPABASE_DB_HOST + SUPABASE_DB_PASSWORD environment variables.\n\n"
            "Get the connection string from:\n"
            "Supabase Dashboard > Settings > Database > Connection string > URI"
        )

    return psycopg2.connect(
        host=host,
        port=port,
        dbname=dbname,
        user=user,
        password=password
    )


def count_csv_rows(csv_path: Path) -> int:
    """Count rows in a CSV file (excluding header)."""
    with open(csv_path, 'r') as f:
        return sum(1 for _ in f) - 1  # Subtract header


def truncate_table(conn, table_name: str, cascade: bool = False) -> None:
    """Truncate a table before import."""
    with conn.cursor() as cur:
        if cascade:
            cur.execute(sql.SQL("TRUNCATE TABLE {} CASCADE").format(sql.Identifier(table_name)))
        else:
            cur.execute(sql.SQL("TRUNCATE TABLE {}").format(sql.Identifier(table_name)))
    conn.commit()


def import_small_table(conn, table_name: str, csv_path: Path, columns: list[str]) -> ImportStats:
    """Import a small table using COPY FROM STDIN."""
    stats = ImportStats(table=table_name)
    start_time = time.time()

    try:
        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)

            # Create a buffer with CSV data
            buffer = io.StringIO()
            writer = csv.writer(buffer)

            for row in reader:
                writer.writerow([row[col] for col in columns])
                stats.rows_imported += 1

            buffer.seek(0)

            # Use COPY for fast import
            with conn.cursor() as cur:
                cur.copy_expert(
                    sql.SQL("COPY {} ({}) FROM STDIN WITH CSV").format(
                        sql.Identifier(table_name),
                        sql.SQL(', ').join(sql.Identifier(c) for c in columns)
                    ),
                    buffer
                )
            conn.commit()

    except Exception as e:
        conn.rollback()
        stats.error = str(e)

    stats.elapsed_seconds = time.time() - start_time
    return stats


def import_large_table_chunked(
    conn,
    table_name: str,
    csv_path: Path,
    columns: list[str],
    chunk_size: int = 100000,
    progress_callback=None,
    skip_rows: int = 0
) -> ImportStats:
    """Import a large table in chunks for better memory management and progress tracking."""
    stats = ImportStats(table=table_name)
    start_time = time.time()

    total_rows = count_csv_rows(csv_path)
    print(f"  Total rows to import: {total_rows:,}")
    if skip_rows > 0:
        print(f"  Skipping first {skip_rows:,} rows (already imported)")

    try:
        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)

            chunk_num = 0
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            rows_in_chunk = 0
            rows_read = 0

            for row in reader:
                rows_read += 1
                # Skip already imported rows
                if rows_read <= skip_rows:
                    continue

                writer.writerow([row[col] for col in columns])
                rows_in_chunk += 1
                stats.rows_imported += 1

                # Flush chunk when full
                if rows_in_chunk >= chunk_size:
                    buffer.seek(0)

                    with conn.cursor() as cur:
                        cur.copy_expert(
                            sql.SQL("COPY {} ({}) FROM STDIN WITH CSV").format(
                                sql.Identifier(table_name),
                                sql.SQL(', ').join(sql.Identifier(c) for c in columns)
                            ),
                            buffer
                        )
                    conn.commit()

                    chunk_num += 1
                    pct = (stats.rows_imported / total_rows) * 100
                    elapsed = time.time() - start_time
                    rate = stats.rows_imported / elapsed if elapsed > 0 else 0
                    eta = (total_rows - stats.rows_imported) / rate if rate > 0 else 0

                    print(f"  Chunk {chunk_num}: {stats.rows_imported:,}/{total_rows:,} rows ({pct:.1f}%) - {rate:,.0f} rows/sec - ETA: {eta:.0f}s")

                    if progress_callback:
                        progress_callback(stats.rows_imported, total_rows)

                    # Reset buffer for next chunk
                    buffer = io.StringIO()
                    writer = csv.writer(buffer)
                    rows_in_chunk = 0

            # Import remaining rows
            if rows_in_chunk > 0:
                buffer.seek(0)

                with conn.cursor() as cur:
                    cur.copy_expert(
                        sql.SQL("COPY {} ({}) FROM STDIN WITH CSV").format(
                            sql.Identifier(table_name),
                            sql.SQL(', ').join(sql.Identifier(c) for c in columns)
                        ),
                        buffer
                    )
                conn.commit()

                print(f"  Final chunk: {stats.rows_imported:,}/{total_rows:,} rows (100%)")

    except Exception as e:
        conn.rollback()
        stats.error = str(e)
        print(f"  ERROR at row {stats.rows_imported}: {e}")

    stats.elapsed_seconds = time.time() - start_time
    return stats


def import_table(conn, table_name: str, chunk_size: int = 100000, skip_truncate: bool = False, skip_rows: int = 0) -> ImportStats:
    """Import a single table from CSV."""
    csv_path = DATA_DIR / f"{table_name}.csv"

    if not csv_path.exists():
        return ImportStats(table=table_name, error=f"CSV file not found: {csv_path}")

    columns = TABLE_COLUMNS.get(table_name)
    if not columns:
        return ImportStats(table=table_name, error=f"No column mapping defined for table: {table_name}")

    # Check file size to determine import strategy
    file_size = csv_path.stat().st_size
    file_size_mb = file_size / (1024 * 1024)

    print(f"\nImporting {table_name} ({file_size_mb:.1f} MB)...")

    # Truncate table first (with CASCADE for tables that other tables depend on)
    if not skip_truncate:
        cascade_tables = ["routes", "stops", "trips"]  # Tables with foreign keys pointing to them
        truncate_table(conn, table_name, cascade=(table_name in cascade_tables))
        print(f"  Truncated {table_name}")
    else:
        print(f"  Skipping truncate (appending data)")

    # Use chunked import for large files (>10MB)
    if file_size_mb > 10:
        return import_large_table_chunked(conn, table_name, csv_path, columns, chunk_size, skip_rows=skip_rows)
    else:
        return import_small_table(conn, table_name, csv_path, columns)


def verify_import(conn, table_name: str) -> tuple[int, str]:
    """Verify row count after import."""
    with conn.cursor() as cur:
        cur.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table_name)))
        count = cur.fetchone()[0]

        # Get a sample row
        cur.execute(sql.SQL("SELECT * FROM {} LIMIT 1").format(sql.Identifier(table_name)))
        sample = cur.fetchone()

    return count, sample


def main():
    parser = argparse.ArgumentParser(description="Import ridership data to Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be done without executing")
    parser.add_argument("--table", action="append", dest="tables", help="Import only specified table(s)")
    parser.add_argument("--chunk-size", type=int, default=100000, help="Rows per chunk for large tables")
    parser.add_argument("--skip-truncate", action="store_true", help="Don't truncate tables before import")
    parser.add_argument("--skip-rows", type=int, default=0, help="Skip first N rows (for resuming interrupted imports)")
    args = parser.parse_args()

    # Determine which tables to import
    tables_to_import = args.tables if args.tables else IMPORT_ORDER

    # Validate table names
    for table in tables_to_import:
        if table not in IMPORT_ORDER:
            print(f"Error: Unknown table '{table}'. Valid tables: {', '.join(IMPORT_ORDER)}")
            sys.exit(1)

    # Check data directory
    if not DATA_DIR.exists():
        print(f"Error: Data directory not found: {DATA_DIR}")
        print("Run generate_ridership_v3.py first to generate the CSV files.")
        sys.exit(1)

    print("=" * 60)
    print("Supabase Import Tool")
    print("=" * 60)
    print(f"Data directory: {DATA_DIR}")
    print(f"Tables to import: {', '.join(tables_to_import)}")
    print(f"Chunk size: {args.chunk_size:,} rows")

    if args.dry_run:
        print("\n[DRY RUN MODE - No changes will be made]\n")
        for table in tables_to_import:
            csv_path = DATA_DIR / f"{table}.csv"
            if csv_path.exists():
                size_mb = csv_path.stat().st_size / (1024 * 1024)
                rows = count_csv_rows(csv_path)
                print(f"  {table}: {rows:,} rows ({size_mb:.1f} MB)")
            else:
                print(f"  {table}: FILE NOT FOUND")
        return

    # Connect to database
    print("\nConnecting to database...")
    try:
        conn = get_db_connection()
        print("  Connected successfully!")
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)

    # Import tables
    results: list[ImportStats] = []
    total_start = time.time()

    for table in tables_to_import:
        # Only apply skip_rows to the first table if specified
        skip = args.skip_rows if table == tables_to_import[0] else 0
        skip_trunc = args.skip_truncate or (skip > 0)
        stats = import_table(conn, table, args.chunk_size, skip_truncate=skip_trunc, skip_rows=skip)
        results.append(stats)

        if stats.error:
            print(f"  ERROR: {stats.error}")
        else:
            # Verify import
            db_count, sample = verify_import(conn, table)
            print(f"  Imported {stats.rows_imported:,} rows in {stats.elapsed_seconds:.1f}s")
            print(f"  Verified: {db_count:,} rows in database")

    # Summary
    total_elapsed = time.time() - total_start
    total_rows = sum(s.rows_imported for s in results)
    errors = [s for s in results if s.error]

    print("\n" + "=" * 60)
    print("IMPORT SUMMARY")
    print("=" * 60)
    print(f"Total rows imported: {total_rows:,}")
    print(f"Total time: {total_elapsed:.1f}s ({total_elapsed/60:.1f} minutes)")
    print(f"Average rate: {total_rows/total_elapsed:,.0f} rows/sec")

    if errors:
        print(f"\nERRORS ({len(errors)}):")
        for stats in errors:
            print(f"  {stats.table}: {stats.error}")
    else:
        print("\nAll tables imported successfully!")

    conn.close()


if __name__ == "__main__":
    main()
