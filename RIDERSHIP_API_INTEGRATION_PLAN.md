# Ridership API Integration Plan

## Overview

This plan outlines how to wire up the existing ridership API endpoints to the MapCanvas UI views. The API endpoints are already implemented and tested - this work connects them to the frontend.

**Data Range:** December 1, 2024 - November 30, 2025 (365 days of generated ridership data)

---

## Current State

### What Exists
- **API Endpoints** (fully working):
  - `GET /api/ridership/system` - System-level metrics and breakdowns
  - `GET /api/ridership/route/[id]` - Route-level metrics
  - `GET /api/ridership/route/[id]/segments` - Segment load data for map coloring
  - `GET /api/ridership/stops` - All stops with ridership values

- **Mock Data** in MapCanvas.tsx:
  - `mockDataByDay` - Hardcoded bar chart data
  - `mockDataByPeriod` - Hardcoded pie chart data
  - `mockDataByDate` - Hardcoded line chart data
  - `routeMockValues` - Random values for route coloring
  - `stopMockValues` - Random values for stop coloring

### Filter State Variables (already exist)
- `appliedStartDate`, `appliedEndDate` - Date range
- `appliedDaysMode`, `appliedCustomDays` - Day of week filter
- `appliedTimeMode`, `appliedTimePeriods` - Time period filter
- `comparisonMode`, `comparisonDateRange` - Comparison mode settings

---

## Implementation Plan

### Phase 1: Create Data Fetching Infrastructure

**1.1 Create API Client Hook** (`src/hooks/useRidershipData.ts`)

A custom React hook that:
- Builds query parameters from filter state
- Fetches data from API endpoints
- Handles loading and error states
- Caches responses to avoid redundant fetches
- Supports comparison mode (fetches both periods)

```typescript
// Example interface
interface UseRidershipDataOptions {
  startDate: Date | null;
  endDate: Date | null;
  daysOfWeek?: number[];
  timePeriods?: string[];
  routeIds?: string[];
}

interface UseRidershipDataResult {
  systemData: SystemResponse | null;
  routeData: RouteResponse | null;
  segmentsData: RouteSegmentsResponse | null;
  stopsData: AllStopsResponse | null;
  isLoading: boolean;
  error: Error | null;
}
```

**1.2 Create Filter Builder Utility** (`src/lib/utils/filterBuilder.ts`)

Helper functions to:
- Convert UI state to API query parameters
- Handle day name to number conversion (Mon→0, Tue→1, etc.)
- Handle time period name mapping

---

### Phase 2: Wire Up System/Routes View

**2.1 Replace Route Mock Values**

Current: Random values generated in `routesList` useMemo
New: Use `SystemResponse.byRoute` array

- Fetch `/api/ridership/system` when activeTab is 'system' or 'routes'
- Map response to route list format: `{ id, name, value: totalBoardings }`
- Route colors will reflect actual ridership data

**2.2 Replace Chart Mock Data**

Current: Hardcoded `mockDataByDay`, `mockDataByPeriod`, `mockDataByDate`
New: Transform API response data

| Chart | API Source | Transform |
|-------|------------|-----------|
| ByPeriodChart | `SystemResponse.byTimePeriod` | Map `{ timePeriod, metrics.totalBoardings }` |
| ByDayChart | Need new endpoint OR aggregate client-side | TBD |
| ByDateChart | Need new endpoint OR aggregate client-side | TBD |

**Note:** The current API doesn't return by-date or by-day breakdowns. Options:
- A) Add new endpoints: `/api/ridership/system/by-date` and `/api/ridership/system/by-day`
- B) Aggregate on client from trip-level data (expensive)
- C) Keep charts as mock data for now, focus on map/metrics first

**Recommendation:** Start with Option C, add endpoints later if needed.

**2.3 Update MetricCard Values**

Current: Hardcoded or mock values
New: Use `SystemResponse.metrics`

- `avgDailyBoardings` → Daily Average metric
- `totalBoardings` → Total Boardings metric
- `routeCount` → Routes metric
- `tripCount` → Trips metric
- `stopCount` → Stops metric

---

### Phase 3: Wire Up Route Detail View (RDV)

**3.1 Fetch Route Data on Selection**

When `selectedRouteId` changes:
1. Fetch `/api/ridership/route/{id}` with current filters
2. Update route-specific metrics
3. Fetch `/api/ridership/route/{id}/segments` for segment coloring

**3.2 Replace Route Metrics**

Use `RouteResponse.metrics`:
- `totalBoardings`, `avgDailyBoardings`
- `avgLoad`, `maxLoad`
- `tripCount`

**3.3 Wire Up Segment Coloring**

Current: `segmentGeoms` useMemo with mock load values
New: Use `RouteSegmentsResponse.segments`

Each segment has:
- `fromStopId`, `toStopId` - Stop identifiers
- `fromLat`, `fromLon`, `toLat`, `toLon` - Coordinates
- `avgLoad`, `maxLoad` - Load values for coloring

Transform to PathLayer format with color based on `avgLoad` relative to route max.

---

### Phase 4: Wire Up Stops View

**4.1 Replace Stop Mock Values**

Current: Random values in `stopMockValues`
New: Use `AllStopsResponse.stops`

- Fetch `/api/ridership/stops` when activeTab is 'stops'
- Map response to stop list format: `{ id, name, value: totalBoardings, lat, lon }`
- Stop size/color will reflect actual ridership

**4.2 Update Stop List Sorting**

Current: Sorts by mock values
New: Sort by actual `totalBoardings` or `totalActivity`

---

### Phase 5: Wire Up Stop Detail View (SDV)

**5.1 Fetch Stop Data on Selection**

When `selectedStopId` changes:
1. Fetch `/api/ridership/stop/{id}` with current filters
2. Update stop-specific metrics
3. Show route breakdown (`StopResponse.byRoute`)

**Note:** The `/api/ridership/stop/[id]` endpoint may need to be created - checking if it exists.

---

### Phase 6: Wire Up Trip Detail View (TDV)

**6.1 Fetch Trip Data on Selection**

When `selectedTrip` changes:
1. Fetch `/api/ridership/trip/{id}` with current filters
2. Show trip metrics and stop-by-stop breakdown

**Note:** The `/api/ridership/trip/[id]` endpoint may need to be created.

---

### Phase 7: Wire Up Comparison Mode

**7.1 Dual-Period Fetching**

When `comparisonMode` is enabled:
1. Fetch data for Date-time 1 period
2. Fetch data for Date-time 2 period
3. Calculate percent changes

**7.2 Update Map Coloring**

Current: Uses `getComparisonColorRGB()` with mock comparison data
New: Calculate actual percent change between periods

```typescript
const percentChange = ((period2Value - period1Value) / period1Value) * 100;
const color = getComparisonColorRGB(percentChange);
```

**7.3 Update ComparisonMetricCard**

Show actual values from both periods with percent change.

---

## File Changes Summary

| File | Changes |
|------|---------|
| `src/hooks/useRidershipData.ts` | NEW - Data fetching hook |
| `src/lib/utils/filterBuilder.ts` | NEW - Filter utilities |
| `src/components/MapCanvas.tsx` | MODIFY - Replace mock data with API calls |
| `src/app/api/ridership/stop/[id]/route.ts` | NEW - Stop detail endpoint (if needed) |
| `src/app/api/ridership/trip/[id]/route.ts` | NEW - Trip detail endpoint (if needed) |

---

## Implementation Order

1. **Phase 1** - Create infrastructure (hook + utilities)
2. **Phase 2** - System/Routes view (most visible impact)
3. **Phase 3** - Route Detail View + Segments (the "wow" demo - segment load coloring)
4. **Phase 4** - Stops view (similar pattern to routes)
5. **Phase 5** - Stop Detail View
6. **Phase 6** - Trip Detail View
7. **Phase 7** - Comparison Mode

---

## Decisions (Confirmed)

1. **ByDate/ByDay Charts:** Add new query functions to `ridership-queries.ts` using `daily_system_summary` table. **No mock data anywhere.**

2. **Loading States:** Dim existing data + subtle spinner. No skeleton replacement.

3. **Error Handling:** Show toast/snackbar, keep stale data visible. Never fall back to mock data.

4. **Caching Strategy:** Yes, cache responses with key: `${endpoint}-${JSON.stringify(filters)}`. Consider SWR/React Query for automatic revalidation.

5. **Trip/Stop Detail Endpoints:** Handlers exist - just need API route files created.

---

## Success Criteria

- [ ] System view shows real ridership data for routes
- [ ] Route colors reflect actual boardings data
- [ ] Route Detail shows real metrics and segment load coloring
- [ ] Stops view shows real ridership per stop
- [ ] Stop sizes reflect actual boardings
- [ ] Filters (date, day, period) affect all data
- [ ] Comparison mode shows real changes between periods
