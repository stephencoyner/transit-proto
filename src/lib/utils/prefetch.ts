'use client';

/**
 * Walkthrough Prefetch & Cache Persistence
 *
 * Demo-grade: warm the ridership in-memory cache ahead of story-mode clicks so
 * the map paints instantly, and mirror successful fetches to localStorage so
 * reloads don't re-fetch the same data.
 */

import type { WalkthroughStep } from '@/types/insights';
import { FilterState, buildApiUrl, getCacheKey } from '@/lib/utils/filterBuilder';
import { setCachedData, hasCachedData } from '@/hooks/useRidershipData';

export interface RouteListItem {
  id: string;
  shortName: string;
}

interface PrefetchOptions {
  /** Fetch the grid endpoint (large; blocks segment coloring). */
  includeGrid?: boolean;
  /** Fetch comparison-mode data when the step opts in. */
  includeComparison?: boolean;
}

const LS_PREFIX = 'ridership-cache:';
const LS_ENTRY_MAX_BYTES = 4_500_000; // ~4.5 MB per entry; chrome LS quota is ~5–10 MB
const LS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Dedupe in-flight prefetches so duplicate callers share one network request.
const inflight = new Map<string, Promise<void>>();

function buildFilterState(
  step: WalkthroughStep,
  which: 'primary' | 'comparison',
): FilterState | null {
  const f = step.filters;
  const startStr = which === 'primary' ? f.startDate : f.comparisonStartDate;
  const endStr = which === 'primary' ? f.endDate : f.comparisonEndDate;
  if (!startStr || !endStr) return null;

  return {
    startDate: new Date(startStr + 'T00:00:00'),
    endDate: new Date(endStr + 'T00:00:00'),
    daysMode: f.daysMode ?? 'all',
    customDays: f.customDays ?? [],
    timeMode: f.timeMode ?? 'all',
    timePeriods: f.timePeriods ?? [],
  };
}

function resolveRouteId(raw: string, routesList: RouteListItem[]): string {
  const match = routesList.find(r => r.shortName === raw || r.id === raw);
  return match ? match.id : raw;
}

function endpointsForStep(step: WalkthroughStep, routesList: RouteListItem[], opts: PrefetchOptions): string[] {
  const f = step.filters;
  if (f.tab === 'system') {
    return ['system', 'system/by-date', 'system/by-day'];
  }
  if (f.tab === 'routes' && f.routeId) {
    const id = resolveRouteId(f.routeId, routesList);
    const base = [
      `route/${id}`,
      `route/${id}/by-date`,
      `route/${id}/by-day`,
      `route/${id}/stops`,
      `route/${id}/segments`,
    ];
    if (opts.includeGrid) base.push(`route/${id}/grid`);
    return base;
  }
  return [];
}

function tryPersist(cacheKey: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = JSON.stringify({ data, ts: Date.now() });
    if (payload.length > LS_ENTRY_MAX_BYTES) return; // oversized (likely grid); skip
    window.localStorage.setItem(LS_PREFIX + cacheKey, payload);
  } catch {
    // Quota exceeded or storage disabled — silent
  }
}

function prefetchOne(endpoint: string, filterState: FilterState): Promise<void> {
  const url = buildApiUrl(endpoint, filterState);
  const cacheKey = getCacheKey(endpoint, filterState);
  if (!url || !cacheKey) return Promise.resolve();
  // Already in memory — nothing to do.
  if (hasCachedData(cacheKey)) return Promise.resolve();
  // Already fetching — share the existing promise.
  const existing = inflight.get(cacheKey);
  if (existing) return existing;
  const task = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setCachedData(cacheKey, data);
      tryPersist(cacheKey, data);
    } catch {
      // Swallow — normal useRidershipFetch path will retry on demand
    } finally {
      inflight.delete(cacheKey);
    }
  })();
  inflight.set(cacheKey, task);
  return task;
}

/**
 * Warm the in-memory ridership cache for the given walkthrough steps.
 * Fire-and-forget; non-blocking. Safe to call multiple times.
 */
export function prefetchWalkthroughSteps(
  steps: WalkthroughStep[],
  routesList: RouteListItem[],
  opts: PrefetchOptions = {},
): void {
  for (const step of steps) {
    const primary = buildFilterState(step, 'primary');
    const endpoints = endpointsForStep(step, routesList, opts);
    if (primary && endpoints.length > 0) {
      for (const ep of endpoints) void prefetchOne(ep, primary);
    }

    if (opts.includeComparison && step.filters.comparisonMode) {
      const comparison = buildFilterState(step, 'comparison');
      if (comparison && endpoints.length > 0) {
        for (const ep of endpoints) void prefetchOne(ep, comparison);
      }
    }
  }
}

/**
 * Hydrate the in-memory ridership cache from localStorage entries written by
 * prior `tryPersist` calls. Call once on mount.
 */
export function hydrateCacheFromLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const storageKey = window.localStorage.key(i);
      if (!storageKey || !storageKey.startsWith(LS_PREFIX)) continue;
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { data: unknown; ts: number };
        if (!parsed || typeof parsed.ts !== 'number') {
          keysToRemove.push(storageKey);
          continue;
        }
        if (Date.now() - parsed.ts > LS_TTL_MS) {
          keysToRemove.push(storageKey);
          continue;
        }
        const cacheKey = storageKey.slice(LS_PREFIX.length);
        setCachedData(cacheKey, parsed.data);
      } catch {
        keysToRemove.push(storageKey);
      }
    }
    for (const k of keysToRemove) {
      try { window.localStorage.removeItem(k); } catch { /* ignore */ }
    }
  } catch {
    // LS unavailable — silent
  }
}
