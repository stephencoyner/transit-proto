# Comparison Mode Implementation Plan

## Overview
Enable users to compare two date-time ranges across the entire transit analytics platform. When comparison mode is active, all visualizations show data from both periods with appropriate comparison indicators.

---

## Phase 1: State Management & Filter Panel UI

### 1.1 Add Comparison State to MapCanvas
- Add `comparisonMode: boolean` state
- Add `comparisonDateRange: { start: Date | null, end: Date | null }` state
- Add `comparisonPreset: 'previous-period' | 'previous-year' | 'custom' | null` state

### 1.2 Update Filter Panel
- Add "Compare" button below the date picker (tertiary button style)
- When clicked, show dropdown menu with options:
  - "Previous Period" - calculates same duration immediately before current range
  - "Previous Year" - same dates but 1 year prior
  - "Custom" - opens date picker for arbitrary range
- When comparison active, show two date-time sections:
  - **Date-time 1**: Current range with tan circle (#D4CABA), swap icon on right
  - **Date-time 2**: Comparison range with brown circle (#5C4939), X icon to clear/exit

### 1.3 Date Calculation Logic
```typescript
// Previous Period: same duration, immediately before
const duration = endDate - startDate;
const comparisonEnd = new Date(startDate - 1); // day before current start
const comparisonStart = new Date(comparisonEnd - duration);

// Previous Year: same dates, 1 year prior
const comparisonStart = new Date(startDate);
comparisonStart.setFullYear(startDate.getFullYear() - 1);
const comparisonEnd = new Date(endDate);
comparisonEnd.setFullYear(endDate.getFullYear() - 1);
```

---

## Phase 2: Design Tokens & Color Constants

### 2.1 Add Comparison Colors to Theme
```typescript
// Date-time range colors
const DATETIME_1_COLOR = '#D4CABA';  // tan/beige
const DATETIME_2_COLOR = '#5C4939';  // brown (text-tertiary)

// Percentage pill colors
const POSITIVE_PILL_BG = '#E3F4EF';
const POSITIVE_PILL_TEXT = '#1B5A3C';
const NEGATIVE_PILL_BG = '#FBE6E9';
const NEGATIVE_PILL_TEXT = '#D31028';

// Comparison map scale (red-yellow-green for difference)
const COMPARISON_SCALE = [
  '#952E07',  // -max (dark red)
  '#C3481D',  // -medium
  '#E47145',  // -low
  '#F7E05A',  // 0 (yellow/neutral)
  '#87C5AC',  // +low
  '#37846A',  // +medium
  '#23634F',  // +max (dark green)
];
```

---

## Phase 3: MetricCard Component Updates

### 3.1 Create ComparisonMetricCard Component
New variant of MetricCard that shows:
- Left side: Circle (#D4CABA) + Value 1
- Center: Percentage pill with +/-X%
- Right side: Circle (#5C4939) + Value 2

### 3.2 Percentage Calculation
```typescript
const percentChange = ((value1 - value2) / value2) * 100;
const rounded = Math.round(percentChange);
const isPositive = rounded > 0;
const isNegative = rounded < 0;
```

---

## Phase 4: Chart Component Updates

### 4.1 ByDateChart
- Accept optional `comparisonData` prop
- Render second Area with:
  - Stroke color: #5C4939
  - Fill gradient: 60% opacity at top to 5% at bottom
- Align by start date (day 1, day 2, etc.)
- If periods differ in length, longer one extends further

### 4.2 ByDayChart
- Accept optional `comparisonData` prop
- Render grouped bars (date-time 1 on left, date-time 2 on right)
- Date-time 1 bars: #D4CABA
- Date-time 2 bars: #5C4939

### 4.3 ByPeriodChart
- Accept optional `comparisonData` prop
- Render grouped horizontal bars (date-time 1 on top, date-time 2 on bottom)
- Same colors as ByDayChart

### 4.4 Update CustomTooltip
- Show both values when comparison data exists
- Include percentage difference

---

## Phase 5: Map Visualization Updates

### 5.1 Create Comparison Color Scale
- New function `getComparisonColor(difference, minDiff, maxDiff)`
- Returns color from red-yellow-green scale
- Yellow (#F7E05A) at 0 difference
- Red shades for negative, green shades for positive

### 5.2 Update Route Coloring (System/Routes Tab)
- When comparison active:
  - Calculate difference per route: `routeValue1 - routeValue2`
  - Apply comparison color scale
  - Update legend to show "Change in average daily boardings" with -X to +X scale

### 5.3 Update Stop Coloring (Stops Tab, RDV, SDV)
- Same logic as routes but at stop level
- Dynamic scale based on visible stop differences

### 5.4 Update Segment Load Visualization
- Apply comparison colors to segments in load view
- Show difference in passenger load

---

## Phase 6: Generate Mock Comparison Data

### 6.1 System-Level Mock Data
```typescript
const mockComparisonDataByDate = [...]; // Similar trend but ~10-20% different values
const mockComparisonDataByDay = [...];
const mockComparisonDataByPeriod = [...];
```

### 6.2 Route-Level Mock Data
- Generate comparison values for each route
- Random variation of -30% to +30% from primary values

### 6.3 Stop-Level Mock Data
- Generate comparison values for each stop
- Random variation of -30% to +30% from primary values

### 6.4 Trip-Level Mock Data
- Use same trip IDs (single GTFS file)
- Generate comparison boarding values per stop

---

## Phase 7: View-Specific Updates

### 7.1 System Tab
- Update MetricCard to ComparisonMetricCard
- Pass comparison data to all charts
- Update map to show route-level differences

### 7.2 Routes Tab List
- Each route card shows comparison format (two values + percentage)
- Map shows route-level differences

### 7.3 Stops Tab List
- Each stop card shows comparison format
- Map shows stop-level differences

### 7.4 RDV (Route Detail View)
- Summary tab: comparison charts
- Trips tab: two bars per trip (same trip ID, different values)
- Grid view: cells show difference colors (red-yellow-green scale)
- Map: stop-level differences for boardings/load

### 7.5 TDV (Trip Detail View)
- Stop-level difference visualization
- Both boarding and load views use comparison scale

### 7.6 SDV (Stop Detail View)
- Summary tab: comparison charts
- Map: stop-level differences
- Amenity Analysis: **NOT AFFECTED** (no date dependency)

---

## Phase 8: Legend Updates

### 8.1 Create ComparisonLegend Component
- Title: "Change in average daily boardings"
- Scale: red → yellow → green
- Labels: -X (Less) ... 0 ... +X (More)
- Dynamically calculated based on visible data range

### 8.2 Conditionally Render Legend
- Normal mode: existing color scale legend
- Comparison mode: ComparisonLegend

---

## Implementation Order

1. **Phase 1**: State & Filter Panel UI (foundation)
2. **Phase 2**: Color constants (needed for all visuals)
3. **Phase 6**: Mock data generation (needed to test visuals)
4. **Phase 3**: MetricCard comparison variant
5. **Phase 4**: Chart updates (ByDate, ByDay, ByPeriod)
6. **Phase 5**: Map comparison colors
7. **Phase 7**: View-specific integrations
8. **Phase 8**: Legend updates

---

## Files to Modify

### New Files
- `src/components/ComparisonMetricCard.tsx`
- `src/components/ComparisonLegend.tsx`
- `src/utils/comparisonColors.ts`
- `src/data/mockComparisonData.ts`

### Modified Files
- `src/components/MapCanvas.tsx` - State, filter panel, map colors
- `src/components/charts/ByDateChart.tsx` - Second line/area
- `src/components/charts/ByDayChart.tsx` - Grouped bars
- `src/components/charts/ByPeriodChart.tsx` - Grouped bars
- `src/components/charts/CustomTooltip.tsx` - Dual values
- `src/components/MetricCard.tsx` - May extend or create variant

---

## Color Reference Summary

| Element | Color |
|---------|-------|
| Date-time 1 circle/bars | #D4CABA |
| Date-time 2 circle/bars | #5C4939 |
| Positive pill background | #E3F4EF |
| Positive pill text | #1B5A3C |
| Negative pill background | #FBE6E9 |
| Negative pill text | #D31028 |
| Map scale: max decrease | #952E07 |
| Map scale: medium decrease | #C3481D |
| Map scale: low decrease | #E47145 |
| Map scale: no change | #F7E05A |
| Map scale: low increase | #87C5AC |
| Map scale: medium increase | #37846A |
| Map scale: max increase | #23634F |
