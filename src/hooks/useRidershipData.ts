'use client';

/**
 * Ridership Data Hook
 *
 * Fetches ridership data from API endpoints with caching and loading states.
 * Supports comparison mode for fetching two time periods.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { FilterState, buildApiUrl, getCacheKey } from '@/lib/utils/filterBuilder';
import type {
  SystemResponse,
  RouteResponse,
  RouteSegmentsResponse,
  RouteStopsResponse,
  AllStopsResponse,
  StopResponse,
  TripResponse,
} from '@/types/ridership';
import type {
  SystemByDateResponse,
  SystemByDayResponse,
  StopByDateResponse,
  StopByDayResponse,
  StopByPeriodResponse,
  RouteTripsResponse,
  RouteGridDataResponse,
  RouteByDateResponse,
  RouteByDayResponse,
} from '@/lib/ridership-handlers';

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedData<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  return null;
}

export function setCachedData(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/** True when a fresh entry exists in the in-memory cache for the given key. */
export function hasCachedData(key: string): boolean {
  const entry = cache.get(key);
  return !!entry && Date.now() - entry.timestamp < CACHE_TTL;
}

// Types for hook responses
interface UseRidershipResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface UseComparisonResult<T> {
  data1: T | null;
  data2: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Generic fetch hook for ridership data
 */
function useRidershipFetch<T>(
  endpoint: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!endpoint || !enabled) {
      return;
    }

    const url = buildApiUrl(endpoint, filters);
    if (!url) {
      return;
    }

    const cacheKey = getCacheKey(endpoint, filters);
    const cached = getCachedData<T>(cacheKey);
    if (cached) {
      setData(cached);
      setIsLoading(false);
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setCachedData(cacheKey, result);
      setData(result);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, filters, enabled]);

  useEffect(() => {
    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

/**
 * Hook for comparison mode - fetches data for two filter sets
 */
function useComparisonFetch<T>(
  endpoint: string | null,
  filters1: FilterState,
  filters2: FilterState,
  enabled: boolean = true
): UseComparisonResult<T> {
  const result1 = useRidershipFetch<T>(endpoint, filters1, enabled);
  const result2 = useRidershipFetch<T>(endpoint, filters2, enabled);

  return {
    data1: result1.data,
    data2: result2.data,
    isLoading: result1.isLoading || result2.isLoading,
    error: result1.error || result2.error,
    refetch: () => {
      result1.refetch();
      result2.refetch();
    },
  };
}

// === PUBLIC HOOKS ===

/**
 * Fetch system-level metrics
 */
export function useSystemData(
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<SystemResponse> {
  return useRidershipFetch<SystemResponse>('system', filters, enabled);
}

/**
 * Fetch system data for comparison mode
 */
export function useSystemComparisonData(
  filters1: FilterState,
  filters2: FilterState,
  enabled: boolean = true
): UseComparisonResult<SystemResponse> {
  return useComparisonFetch<SystemResponse>('system', filters1, filters2, enabled);
}

/**
 * Fetch system by-date data (for line chart)
 */
export function useSystemByDateData(
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<SystemByDateResponse> {
  return useRidershipFetch<SystemByDateResponse>('system/by-date', filters, enabled);
}

/**
 * Fetch system by-day data (for bar chart)
 */
export function useSystemByDayData(
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<SystemByDayResponse> {
  return useRidershipFetch<SystemByDayResponse>('system/by-day', filters, enabled);
}

/**
 * Fetch route-level metrics
 */
export function useRouteData(
  routeId: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<RouteResponse> {
  const endpoint = routeId ? `route/${routeId}` : null;
  return useRidershipFetch<RouteResponse>(endpoint, filters, enabled && !!routeId);
}

/**
 * Fetch route segment data (for map coloring)
 */
export function useRouteSegmentsData(
  routeId: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<RouteSegmentsResponse> {
  const endpoint = routeId ? `route/${routeId}/segments` : null;
  return useRidershipFetch<RouteSegmentsResponse>(endpoint, filters, enabled && !!routeId);
}

/**
 * Fetch route by-date data (for line chart)
 */
export function useRouteByDateData(
  routeId: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<RouteByDateResponse> {
  const endpoint = routeId ? `route/${routeId}/by-date` : null;
  return useRidershipFetch<RouteByDateResponse>(endpoint, filters, enabled && !!routeId);
}

/**
 * Fetch route by-day data (for bar chart)
 */
export function useRouteByDayData(
  routeId: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<RouteByDayResponse> {
  const endpoint = routeId ? `route/${routeId}/by-day` : null;
  return useRidershipFetch<RouteByDayResponse>(endpoint, filters, enabled && !!routeId);
}

/**
 * Fetch all stops data (for map)
 */
export function useAllStopsData(
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<AllStopsResponse> {
  return useRidershipFetch<AllStopsResponse>('stops', filters, enabled);
}

/**
 * Fetch stop-level metrics
 */
export function useStopData(
  stopId: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<StopResponse> {
  const endpoint = stopId ? `stop/${stopId}` : null;
  return useRidershipFetch<StopResponse>(endpoint, filters, enabled && !!stopId);
}

/**
 * Fetch stop by-date data (for line chart)
 */
export function useStopByDateData(
  stopId: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<StopByDateResponse> {
  const endpoint = stopId ? `stop/${stopId}/by-date` : null;
  return useRidershipFetch<StopByDateResponse>(endpoint, filters, enabled && !!stopId);
}

/**
 * Fetch stop by-day data (for bar chart)
 */
export function useStopByDayData(
  stopId: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<StopByDayResponse> {
  const endpoint = stopId ? `stop/${stopId}/by-day` : null;
  return useRidershipFetch<StopByDayResponse>(endpoint, filters, enabled && !!stopId);
}

/**
 * Fetch stop by-period data (for pie chart)
 */
export function useStopByPeriodData(
  stopId: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<StopByPeriodResponse> {
  const endpoint = stopId ? `stop/${stopId}/by-period` : null;
  return useRidershipFetch<StopByPeriodResponse>(endpoint, filters, enabled && !!stopId);
}

/**
 * Fetch trip-level metrics
 */
export function useTripData(
  tripId: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<TripResponse> {
  const endpoint = tripId ? `trip/${tripId}` : null;
  return useRidershipFetch<TripResponse>(endpoint, filters, enabled && !!tripId);
}

/**
 * Fetch route trips with ridership metrics (for trips list view)
 */
export function useRouteTripsData(
  routeId: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<RouteTripsResponse> {
  const endpoint = routeId ? `route/${routeId}/trips` : null;
  return useRidershipFetch<RouteTripsResponse>(endpoint, filters, enabled && !!routeId);
}

/**
 * Fetch route stops with ridership metrics (for map stop coloring)
 */
export function useRouteStopsData(
  routeId: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<RouteStopsResponse> {
  const endpoint = routeId ? `route/${routeId}/stops` : null;
  return useRidershipFetch<RouteStopsResponse>(endpoint, filters, enabled && !!routeId);
}

/**
 * Fetch route grid data (per-trip per-stop ridership for trips grid view)
 */
export function useRouteGridData(
  routeId: string | null,
  filters: FilterState,
  enabled: boolean = true
): UseRidershipResult<RouteGridDataResponse> {
  const endpoint = routeId ? `route/${routeId}/grid` : null;
  return useRidershipFetch<RouteGridDataResponse>(endpoint, filters, enabled && !!routeId);
}

/**
 * Clear the cache (useful for debugging or forced refresh)
 */
export function clearRidershipCache(): void {
  cache.clear();
}
