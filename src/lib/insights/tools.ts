/**
 * AI Insights Tool Definitions + Execution
 *
 * Defines the tools available to the Claude agent for exploring transit data.
 * Each tool maps to existing Supabase RPC functions and returns JSON results.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { getServerSupabase } from '@/lib/supabase';

// === TOOL DEFINITIONS ===

export const insightTools: Anthropic.Tool[] = [
  {
    name: 'get_system_overview',
    description:
      'Get system-wide ridership metrics plus a per-route breakdown. Returns total boardings, alightings, avg/max load, and each route\'s share of the system. Use this first to understand the overall picture.',
    input_schema: {
      type: 'object' as const,
      properties: {
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        days: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by day of week (0=Mon, 6=Sun). Omit for all days.',
        },
        periods: {
          type: 'array',
          items: { type: 'string', enum: ['early_am', 'am_peak', 'midday', 'pm_peak', 'evening', 'night'] },
          description: 'Filter by time period. Omit for all periods.',
        },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'get_system_trends',
    description:
      'Get daily ridership totals over a date range (one row per day). Returns date, dayOfWeek, totalBoardings, totalAlightings, avgLoad, maxLoad. Good for spotting trends, dips, and anomalies over time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        days: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by day of week (0=Mon, 6=Sun)',
        },
        periods: {
          type: 'array',
          items: { type: 'string', enum: ['early_am', 'am_peak', 'midday', 'pm_peak', 'evening', 'night'] },
          description: 'Filter by time period',
        },
        routeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to specific route IDs',
        },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'get_system_by_day_of_week',
    description:
      'Get ridership aggregated by day of week. Returns per-day totals with day counts. Useful for identifying weekday vs weekend patterns and which days have unusual ridership.',
    input_schema: {
      type: 'object' as const,
      properties: {
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        periods: {
          type: 'array',
          items: { type: 'string', enum: ['early_am', 'am_peak', 'midday', 'pm_peak', 'evening', 'night'] },
          description: 'Filter by time period',
        },
        routeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to specific route IDs',
        },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'get_route_detail',
    description:
      'Get detailed metrics for a single route including by-direction and by-time-period breakdowns. Returns total boardings, avg/max load, trip count, stop count, and how ridership splits across directions and time periods.',
    input_schema: {
      type: 'object' as const,
      properties: {
        routeId: { type: 'string', description: 'Route ID (e.g., "100224" for Route 44)' },
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        days: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by day of week (0=Mon, 6=Sun)',
        },
        periods: {
          type: 'array',
          items: { type: 'string', enum: ['early_am', 'am_peak', 'midday', 'pm_peak', 'evening', 'night'] },
          description: 'Filter by time period',
        },
      },
      required: ['routeId', 'startDate', 'endDate'],
    },
  },
  {
    name: 'get_route_stops',
    description:
      'Get per-stop ridership breakdown for a route. Returns each stop\'s boardings, alightings, and position. Useful for finding problem segments — where do riders cluster? Where do load issues start?',
    input_schema: {
      type: 'object' as const,
      properties: {
        routeId: { type: 'string', description: 'Route ID' },
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        days: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by day of week (0=Mon, 6=Sun)',
        },
        periods: {
          type: 'array',
          items: { type: 'string', enum: ['early_am', 'am_peak', 'midday', 'pm_peak', 'evening', 'night'] },
          description: 'Filter by time period',
        },
        direction: {
          type: 'string',
          enum: ['0', '1'],
          description: 'Filter by direction (0 or 1)',
        },
      },
      required: ['routeId', 'startDate', 'endDate'],
    },
  },
  {
    name: 'get_route_trips',
    description:
      'Get trip-level ridership data for a route. Returns each trip\'s ID, start time, time period, direction, total boardings, avg/max load. Critical for finding specific overcrowded trips (e.g., "the 5:15 PM run is at 98% capacity").',
    input_schema: {
      type: 'object' as const,
      properties: {
        routeId: { type: 'string', description: 'Route ID' },
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        days: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by day of week (0=Mon, 6=Sun)',
        },
        periods: {
          type: 'array',
          items: { type: 'string', enum: ['early_am', 'am_peak', 'midday', 'pm_peak', 'evening', 'night'] },
          description: 'Filter by time period',
        },
      },
      required: ['routeId', 'startDate', 'endDate'],
    },
  },
  {
    name: 'get_stop_amenities',
    description:
      'Get amenity information for stops along a route or all stops. Returns which stops have shelter, seating, lighting, real-time display, bike rack, wheelchair access, tactile paving, and trash can. Useful for correlating high ridership with missing infrastructure.',
    input_schema: {
      type: 'object' as const,
      properties: {
        routeId: {
          type: 'string',
          description: 'Optional route ID to filter stops to a specific route',
        },
        stopIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional specific stop IDs to query',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_route_trends',
    description:
      'Get daily ridership for a single route over time. Returns one row per day with totalBoardings, totalAlightings, avgLoad, maxLoad. Good for tracking how a specific route\'s ridership changes over weeks/months.',
    input_schema: {
      type: 'object' as const,
      properties: {
        routeId: { type: 'string', description: 'Route ID' },
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        days: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by day of week (0=Mon, 6=Sun)',
        },
        periods: {
          type: 'array',
          items: { type: 'string', enum: ['early_am', 'am_peak', 'midday', 'pm_peak', 'evening', 'night'] },
          description: 'Filter by time period',
        },
      },
      required: ['routeId', 'startDate', 'endDate'],
    },
  },
  {
    name: 'get_stop_trends',
    description:
      'Get daily ridership for a single stop over time. Returns one row per day with totalBoardings, totalAlightings. Good for tracking how a specific stop\'s usage changes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        stopId: { type: 'string', description: 'Stop ID' },
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        days: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by day of week (0=Mon, 6=Sun)',
        },
        periods: {
          type: 'array',
          items: { type: 'string', enum: ['early_am', 'am_peak', 'midday', 'pm_peak', 'evening', 'night'] },
          description: 'Filter by time period',
        },
      },
      required: ['stopId', 'startDate', 'endDate'],
    },
  },
  {
    name: 'compare_periods',
    description:
      'Compare ridership metrics between two date ranges at any level: system, route, stop, or trip. Returns metrics for both periods with absolute and percent differences. Essential for seasonal analysis, before/after comparisons, and week-over-week trends.',
    input_schema: {
      type: 'object' as const,
      properties: {
        level: {
          type: 'string',
          enum: ['system', 'route', 'stop', 'trip'],
          description: 'What level to compare at',
        },
        entityId: {
          type: 'string',
          description: 'Route ID, stop ID, or trip ID (required for route/stop/trip levels)',
        },
        period1Start: { type: 'string', description: 'First period start date (YYYY-MM-DD)' },
        period1End: { type: 'string', description: 'First period end date (YYYY-MM-DD)' },
        period2Start: { type: 'string', description: 'Second period start date (YYYY-MM-DD)' },
        period2End: { type: 'string', description: 'Second period end date (YYYY-MM-DD)' },
        days: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by day of week (0=Mon, 6=Sun)',
        },
        periods: {
          type: 'array',
          items: { type: 'string', enum: ['early_am', 'am_peak', 'midday', 'pm_peak', 'evening', 'night'] },
          description: 'Filter by time period',
        },
      },
      required: ['level', 'period1Start', 'period1End', 'period2Start', 'period2End'],
    },
  },
];

// === TOOL EXECUTION ===

interface ToolInput {
  startDate?: string;
  endDate?: string;
  days?: number[];
  periods?: string[];
  routeId?: string;
  routeIds?: string[];
  stopId?: string;
  stopIds?: string[];
  direction?: string;
  level?: string;
  entityId?: string;
  period1Start?: string;
  period1End?: string;
  period2Start?: string;
  period2End?: string;
}

export async function executeTool(
  toolName: string,
  input: ToolInput
): Promise<string> {
  const supabase = getServerSupabase();

  switch (toolName) {
    case 'get_system_overview': {
      const [systemResult, byRouteResult] = await Promise.all([
        supabase.rpc('get_system_metrics', {
          p_start_date: input.startDate,
          p_end_date: input.endDate,
          p_days: input.days || null,
          p_periods: input.periods || null,
        }),
        supabase.rpc('get_metrics_by_route', {
          p_start_date: input.startDate,
          p_end_date: input.endDate,
          p_days: input.days || null,
          p_periods: input.periods || null,
        }),
      ]);
      if (systemResult.error) throw systemResult.error;
      if (byRouteResult.error) throw byRouteResult.error;
      return JSON.stringify({ system: systemResult.data, byRoute: byRouteResult.data });
    }

    case 'get_system_trends': {
      const { data, error } = await supabase.rpc('get_metrics_by_date', {
        p_start_date: input.startDate,
        p_end_date: input.endDate,
        p_days: input.days || null,
        p_periods: input.periods || null,
        p_routes: input.routeIds || null,
      });
      if (error) throw error;
      return JSON.stringify(data);
    }

    case 'get_system_by_day_of_week': {
      const { data, error } = await supabase.rpc('get_metrics_by_day_of_week', {
        p_start_date: input.startDate,
        p_end_date: input.endDate,
        p_periods: input.periods || null,
        p_routes: input.routeIds || null,
      });
      if (error) throw error;
      return JSON.stringify(data);
    }

    case 'get_route_detail': {
      const [metricsResult, byPeriodResult] = await Promise.all([
        supabase.rpc('get_route_metrics', {
          p_route_id: input.routeId,
          p_start_date: input.startDate,
          p_end_date: input.endDate,
          p_days: input.days || null,
          p_periods: input.periods || null,
          p_direction: input.direction || null,
        }),
        supabase.rpc('get_route_by_period', {
          p_route_id: input.routeId,
          p_start_date: input.startDate,
          p_end_date: input.endDate,
          p_days: input.days || null,
          p_direction: input.direction || null,
        }),
      ]);
      if (metricsResult.error) throw metricsResult.error;
      if (byPeriodResult.error) throw byPeriodResult.error;
      return JSON.stringify({ metrics: metricsResult.data, byPeriod: byPeriodResult.data });
    }

    case 'get_route_stops': {
      const { data, error } = await supabase.rpc('get_route_stops', {
        p_route_id: input.routeId,
        p_start_date: input.startDate,
        p_end_date: input.endDate,
        p_days: input.days || null,
        p_periods: input.periods || null,
        p_direction: input.direction || null,
      });
      if (error) throw error;
      return JSON.stringify(data);
    }

    case 'get_route_trips': {
      // Query trip_ridership table directly with pagination
      const allTrips: unknown[] = [];
      const pageSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('trip_ridership')
          .select('trip_id, shape_id, direction_id, start_time, time_period, total_boardings, total_alightings, avg_load, max_load')
          .eq('route_id', input.routeId!)
          .gte('date', input.startDate!)
          .lte('date', input.endDate!)
          .range(offset, offset + pageSize - 1);

        if (input.days && input.days.length > 0) {
          query = query.in('day_of_week', input.days);
        }
        if (input.periods && input.periods.length > 0) {
          query = query.in('time_period', input.periods);
        }

        const { data, error } = await query;
        if (error) throw error;
        allTrips.push(...(data || []));
        hasMore = (data?.length || 0) === pageSize;
        offset += pageSize;
      }

      // Aggregate by trip_id (average across days)
      const tripMap = new Map<string, {
        trip_id: string;
        start_time: string;
        time_period: string;
        direction_id: number;
        total_boardings: number;
        total_alightings: number;
        avg_load: number;
        max_load: number;
        day_count: number;
      }>();

      for (const row of allTrips as Array<{
        trip_id: string;
        start_time: string;
        time_period: string;
        direction_id: number;
        total_boardings: number;
        total_alightings: number;
        avg_load: number;
        max_load: number;
      }>) {
        const existing = tripMap.get(row.trip_id);
        if (existing) {
          existing.total_boardings += row.total_boardings;
          existing.total_alightings += row.total_alightings;
          existing.avg_load += row.avg_load;
          existing.max_load = Math.max(existing.max_load, row.max_load);
          existing.day_count++;
        } else {
          tripMap.set(row.trip_id, { ...row, day_count: 1 });
        }
      }

      // Convert to averaged values and sort by max_load desc
      const trips = Array.from(tripMap.values())
        .map(t => ({
          trip_id: t.trip_id,
          start_time: t.start_time,
          time_period: t.time_period,
          direction_id: t.direction_id,
          avg_daily_boardings: Math.round(t.total_boardings / t.day_count),
          avg_load: Math.round((t.avg_load / t.day_count) * 10) / 10,
          max_load: t.max_load,
          day_count: t.day_count,
        }))
        .sort((a, b) => b.max_load - a.max_load);

      return JSON.stringify({ tripCount: trips.length, trips: trips.slice(0, 50) });
    }

    case 'get_stop_amenities': {
      let query = supabase
        .from('stops')
        .select('stop_id, stop_name, lat, lon, has_shelter, has_seating, has_lighting, has_real_time_display, has_bike_rack, has_wheelchair_access, has_tactile_paving, has_trash_can');

      if (input.stopIds && input.stopIds.length > 0) {
        query = query.in('stop_id', input.stopIds);
      }

      if (input.routeId) {
        // Get stop IDs for this route first
        const { data: routeStops, error: rsError } = await supabase.rpc('get_route_stops', {
          p_route_id: input.routeId,
          p_start_date: '2025-03-21',
          p_end_date: '2025-09-30',
          p_days: null,
          p_periods: null,
          p_direction: null,
        });
        if (rsError) throw rsError;
        const stopIds = (routeStops || []).map((s: { stop_id: string }) => s.stop_id);
        if (stopIds.length > 0) {
          query = query.in('stop_id', stopIds);
        }
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return JSON.stringify(data);
    }

    case 'get_route_trends': {
      const { data, error } = await supabase.rpc('get_metrics_by_date', {
        p_start_date: input.startDate,
        p_end_date: input.endDate,
        p_days: input.days || null,
        p_periods: input.periods || null,
        p_routes: [input.routeId!],
      });
      if (error) throw error;
      return JSON.stringify(data);
    }

    case 'get_stop_trends': {
      const { data, error } = await supabase.rpc('get_stop_by_date', {
        p_stop_id: input.stopId,
        p_start_date: input.startDate,
        p_end_date: input.endDate,
        p_days: input.days || null,
        p_periods: input.periods || null,
        p_routes: null,
      });
      if (error) throw error;
      return JSON.stringify(data);
    }

    case 'compare_periods': {
      const fetchMetrics = async (start: string, end: string) => {
        switch (input.level) {
          case 'system': {
            const [sys, routes] = await Promise.all([
              supabase.rpc('get_system_metrics', {
                p_start_date: start,
                p_end_date: end,
                p_days: input.days || null,
                p_periods: input.periods || null,
              }),
              supabase.rpc('get_metrics_by_route', {
                p_start_date: start,
                p_end_date: end,
                p_days: input.days || null,
                p_periods: input.periods || null,
              }),
            ]);
            if (sys.error) throw sys.error;
            if (routes.error) throw routes.error;
            return { system: sys.data, byRoute: routes.data };
          }
          case 'route': {
            const result = await supabase.rpc('get_route_metrics', {
              p_route_id: input.entityId,
              p_start_date: start,
              p_end_date: end,
              p_days: input.days || null,
              p_periods: input.periods || null,
              p_direction: null,
            });
            if (result.error) throw result.error;
            return result.data;
          }
          case 'stop': {
            const result = await supabase.rpc('get_stop_metrics', {
              p_stop_id: input.entityId,
              p_start_date: start,
              p_end_date: end,
              p_days: input.days || null,
              p_periods: input.periods || null,
              p_routes: null,
            });
            if (result.error) throw result.error;
            return result.data;
          }
          case 'trip': {
            // Aggregate trip_ridership for a specific trip across two date ranges
            const { data, error } = await supabase
              .from('trip_ridership')
              .select('total_boardings, total_alightings, avg_load, max_load')
              .eq('trip_id', input.entityId!)
              .gte('date', start)
              .lte('date', end);
            if (error) throw error;
            if (!data || data.length === 0) return { noData: true };
            const avg = {
              avg_daily_boardings: Math.round(data.reduce((s, r) => s + r.total_boardings, 0) / data.length),
              avg_load: Math.round((data.reduce((s, r) => s + r.avg_load, 0) / data.length) * 10) / 10,
              max_load: Math.max(...data.map(r => r.max_load)),
              day_count: data.length,
            };
            return avg;
          }
          default:
            throw new Error(`Unknown compare level: ${input.level}`);
        }
      };

      const [period1, period2] = await Promise.all([
        fetchMetrics(input.period1Start!, input.period1End!),
        fetchMetrics(input.period2Start!, input.period2End!),
      ]);

      return JSON.stringify({
        period1: { dateRange: { start: input.period1Start, end: input.period1End }, data: period1 },
        period2: { dateRange: { start: input.period2Start, end: input.period2End }, data: period2 },
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
