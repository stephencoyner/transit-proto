'use client';

/**
 * Walkthrough Prefetch & Cache Persistence
 *
 * Demo-grade: warm the ridership in-memory cache ahead of story-mode clicks so
 * the map paints instantly, and mirror successful fetches to localStorage so
 * reloads don't re-fetch the same data.
 */

import type { WalkthroughStep } from '@/types/insights';
import type { RoutePatternInfo } from '@/lib/data/loaders';
import { FilterState, buildApiUrl, getCacheKey } from '@/lib/utils/filterBuilder';
import {
  setCachedData,
  hasCachedData,
  getInflightFetch,
  registerInflightFetch,
} from '@/hooks/useRidershipData';

export interface RouteListItem {
  id: string;
  shortName: string;
}

interface PrefetchOptions {
  /** Fetch the grid endpoint (large; blocks segment coloring). */
  includeGrid?: boolean;
  /** Fetch comparison-mode data when the step opts in. */
  includeComparison?: boolean;
  /**
   * Route pattern data used to resolve `step.filters.pattern` → direction_id,
   * so the prefetched URL matches the live query (which always appends
   * `&direction=` when a pattern is selected). Without this, pages with a
   * pattern filter cache-miss and re-fetch every endpoint on step change.
   */
  routePatterns?: { [routeId: string]: RoutePatternInfo };
}

const LS_PREFIX = 'ridership-cache:';
// Per-entry cap: keep small summaries (system / by-date / by-day) but skip grids
// and other large payloads so a single insight doesn't monopolize the quota.
const LS_ENTRY_MAX_BYTES = 250_000;
// Total budget across all ridership-cache:* entries. Leaves plenty of the
// ~5 MB per-origin quota for bookmarks (and whatever else writes to LS).
const LS_TOTAL_BUDGET_BYTES = 1_500_000;
const LS_TTL_MS = 24 * 60 * 60 * 1000; // 24h


function resolveDirectionId(
  routeIdFullOrShort: string,
  pattern: string,
  routesList: RouteListItem[],
  routePatterns?: { [routeId: string]: RoutePatternInfo },
): '0' | '1' | undefined {
  if (!routePatterns) return undefined;
  // routePatterns is keyed by full id; resolve from short name if needed.
  const fullId = resolveRouteId(routeIdFullOrShort, routesList);
  const info = routePatterns[fullId];
  if (!info) return undefined;
  const match = info.patterns.find(p => p.headsign === pattern);
  if (!match) return undefined;
  return match.direction_id === '0' || match.direction_id === '1' ? match.direction_id : undefined;
}

function buildFilterState(
  step: WalkthroughStep,
  which: 'primary' | 'comparison',
  routesList: RouteListItem[],
  routePatterns?: { [routeId: string]: RoutePatternInfo },
): FilterState | null {
  const f = step.filters;
  const startStr = which === 'primary' ? f.startDate : f.comparisonStartDate;
  const endStr = which === 'primary' ? f.endDate : f.comparisonEndDate;
  if (!startStr || !endStr) return null;

  const directionId = f.pattern && f.routeId
    ? resolveDirectionId(f.routeId, f.pattern, routesList, routePatterns)
    : undefined;

  return {
    startDate: new Date(startStr + 'T00:00:00'),
    endDate: new Date(endStr + 'T00:00:00'),
    daysMode: f.daysMode ?? 'all',
    customDays: f.customDays ?? [],
    timeMode: f.timeMode ?? 'all',
    timePeriods: f.timePeriods ?? [],
    directionId,
  };
}

function resolveRouteId(raw: string, routesList: RouteListItem[]): string {
  const match = routesList.find(r => r.shortName === raw || r.id === raw);
  return match ? match.id : raw;
}

interface StepEndpoints {
  /** Endpoints to fetch right away (cheap summaries, stop lists, segment geometry). */
  immediate: string[];
  /** Endpoints deferred to idle time (grid — large payload, server-side aggregation). */
  deferred: string[];
}

/**
 * A step only renders segment coloring (which is what needs the grid) when it's
 * on the Summary tab. The Trips tab shows a list and has no use for grid data,
 * so skip the grid fetch entirely for those steps even if the caller opted in.
 */
function stepNeedsGrid(step: WalkthroughStep): boolean {
  const tab = step.filters.routeTab;
  return !tab || tab === 'Summary' || tab === 'Grid';
}

function endpointsForStep(step: WalkthroughStep, routesList: RouteListItem[], opts: PrefetchOptions): StepEndpoints {
  const f = step.filters;
  if (f.tab === 'system') {
    return { immediate: ['system', 'system/by-date', 'system/by-day'], deferred: [] };
  }
  if (f.tab === 'routes' && f.routeId) {
    const id = resolveRouteId(f.routeId, routesList);
    const immediate = [
      `route/${id}`,
      `route/${id}/by-date`,
      `route/${id}/by-day`,
      `route/${id}/stops`,
      `route/${id}/segments`,
    ];
    const deferred = opts.includeGrid && stepNeedsGrid(step) ? [`route/${id}/grid`] : [];
    return { immediate, deferred };
  }
  return { immediate: [], deferred: [] };
}

// Cross-call dedup: once we've issued a prefetch for a cache key in this tab session,
// don't issue it again even after the inflight promise resolves. Keeps repeat callers
// (briefing mount → card click → close → click again) from re-queuing the same work.
const prefetchedKeys = new Set<string>();

function schedulePrefetch(endpoint: string, filterState: FilterState): void {
  const cacheKey = getCacheKey(endpoint, filterState);
  if (!cacheKey || prefetchedKeys.has(cacheKey)) return;
  prefetchedKeys.add(cacheKey);
  void prefetchOne(endpoint, filterState);
}

// Run deferred work off the main thread's critical path. Prefer requestIdleCallback
// so we don't compete with the panel/map's initial paint; fall back to setTimeout.
function runWhenIdle(cb: () => void): void {
  if (typeof window === 'undefined') return;
  const w = window as typeof window & { requestIdleCallback?: (fn: () => void, opts?: { timeout?: number }) => number };
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(cb, { timeout: 1500 });
  } else {
    setTimeout(cb, 300);
  }
}

// Collect existing ridership-cache entries with their size + timestamp.
// Corrupt / legacy entries get their ts forced to 0 so they're evicted first.
function listCacheEntries(): Array<{ key: string; bytes: number; ts: number }> {
  const out: Array<{ key: string; bytes: number; ts: number }> = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(LS_PREFIX)) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    let ts = 0;
    try {
      const parsed = JSON.parse(raw) as { ts?: number };
      if (typeof parsed?.ts === 'number') ts = parsed.ts;
    } catch { /* ts stays 0 — treat as oldest */ }
    out.push({ key, bytes: raw.length, ts });
  }
  return out;
}

// Evict oldest ridership-cache entries until `entries`-total + `incoming` fits
// within the total budget. Operates on the passed array in place.
function evictToBudget(entries: Array<{ key: string; bytes: number; ts: number }>, incoming: number): void {
  let total = entries.reduce((sum, e) => sum + e.bytes, 0);
  if (total + incoming <= LS_TOTAL_BUDGET_BYTES) return;
  entries.sort((a, b) => a.ts - b.ts); // oldest first
  while (entries.length > 0 && total + incoming > LS_TOTAL_BUDGET_BYTES) {
    const oldest = entries.shift()!;
    try { window.localStorage.removeItem(oldest.key); } catch { /* ignore */ }
    total -= oldest.bytes;
  }
}

function tryPersist(cacheKey: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = JSON.stringify({ data, ts: Date.now() });
    if (payload.length > LS_ENTRY_MAX_BYTES) return; // oversized (likely grid); skip
    const storageKey = LS_PREFIX + cacheKey;
    const entries = listCacheEntries().filter(e => e.key !== storageKey);
    evictToBudget(entries, payload.length);
    window.localStorage.setItem(storageKey, payload);
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
  // Already fetching (from prefetch OR a component hook) — share the promise.
  const existing = getInflightFetch(cacheKey);
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
    }
  })();
  registerInflightFetch(cacheKey, task);
  return task;
}

/**
 * Warm the in-memory ridership cache for the given walkthrough steps.
 * Fire-and-forget; non-blocking. Safe to call multiple times.
 *
 * Two-phase fetching: summaries / stops / segments fire immediately so the
 * story panel and map shell paint fast; the large grid endpoint is deferred
 * to idle time so it doesn't compete with the initial paint.
 */
export function prefetchWalkthroughSteps(
  steps: WalkthroughStep[],
  routesList: RouteListItem[],
  opts: PrefetchOptions = {},
): void {
  const deferredTasks: Array<{ ep: string; filter: FilterState }> = [];

  for (const step of steps) {
    const primary = buildFilterState(step, 'primary', routesList, opts.routePatterns);
    const { immediate, deferred } = endpointsForStep(step, routesList, opts);
    if (primary) {
      for (const ep of immediate) schedulePrefetch(ep, primary);
      for (const ep of deferred) deferredTasks.push({ ep, filter: primary });
    }

    if (opts.includeComparison && step.filters.comparisonMode) {
      const comparison = buildFilterState(step, 'comparison', routesList, opts.routePatterns);
      if (comparison) {
        for (const ep of immediate) schedulePrefetch(ep, comparison);
        for (const ep of deferred) deferredTasks.push({ ep, filter: comparison });
      }
    }
  }

  if (deferredTasks.length > 0) {
    runWhenIdle(() => {
      for (const { ep, filter } of deferredTasks) schedulePrefetch(ep, filter);
    });
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
