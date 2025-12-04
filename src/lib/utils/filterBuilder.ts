/**
 * Filter Builder Utility
 *
 * Converts UI state to API query parameters for ridership endpoints.
 */

// Day name to number mapping (API uses 0=Mon, 6=Sun)
const DAY_NAME_TO_NUMBER: Record<string, number> = {
  'Mon': 0,
  'Tue': 1,
  'Wed': 2,
  'Thu': 3,
  'Fri': 4,
  'Sat': 5,
  'Sun': 6,
};

// Time period mapping (UI display name to API value)
const TIME_PERIOD_MAP: Record<string, string> = {
  'Early AM': 'early_am',
  'AM Peak': 'am_peak',
  'Midday': 'midday',
  'PM Peak': 'pm_peak',
  'Evening': 'evening',
  'Night': 'night',
};

export interface FilterState {
  startDate: Date | null;
  endDate: Date | null;
  daysMode: 'all' | 'weekdays' | 'weekends' | 'custom';
  customDays: string[]; // ['Mon', 'Tue', etc.]
  timeMode: 'all' | 'custom';
  timePeriods: string[]; // ['AM Peak', 'PM Peak', etc.]
  routeIds?: string[];
  directionId?: '0' | '1';
}

export interface QueryParams {
  startDate: string;
  endDate: string;
  days?: string;      // comma-separated day numbers
  periods?: string;   // comma-separated period names
  routes?: string;    // comma-separated route IDs
  direction?: string; // '0' or '1'
}

/**
 * Format a Date to YYYY-MM-DD string
 */
export function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert day names to day numbers for API
 */
function convertDaysToNumbers(days: string[]): number[] {
  return days.map(day => DAY_NAME_TO_NUMBER[day]).filter(n => n !== undefined);
}

/**
 * Convert time period display names to API values
 */
function convertTimePeriods(periods: string[]): string[] {
  return periods.map(p => TIME_PERIOD_MAP[p]).filter(Boolean);
}

/**
 * Build query params from filter state
 */
export function buildQueryParams(filters: FilterState): QueryParams | null {
  // Require valid date range
  if (!filters.startDate || !filters.endDate) {
    return null;
  }

  const params: QueryParams = {
    startDate: formatDateString(filters.startDate),
    endDate: formatDateString(filters.endDate),
  };

  // Handle days of week
  if (filters.daysMode === 'weekdays') {
    params.days = '0,1,2,3,4'; // Mon-Fri
  } else if (filters.daysMode === 'weekends') {
    params.days = '5,6'; // Sat-Sun
  } else if (filters.daysMode === 'custom' && filters.customDays.length > 0 && filters.customDays.length < 7) {
    const dayNumbers = convertDaysToNumbers(filters.customDays);
    if (dayNumbers.length > 0) {
      params.days = dayNumbers.sort((a, b) => a - b).join(',');
    }
  }
  // If 'all' or all 7 days selected, don't add the filter

  // Handle time periods
  if (filters.timeMode === 'custom' && filters.timePeriods.length > 0 && filters.timePeriods.length < 6) {
    const apiPeriods = convertTimePeriods(filters.timePeriods);
    if (apiPeriods.length > 0) {
      params.periods = apiPeriods.join(',');
    }
  }

  // Handle route filter
  if (filters.routeIds && filters.routeIds.length > 0) {
    params.routes = filters.routeIds.join(',');
  }

  // Handle direction filter
  if (filters.directionId) {
    params.direction = filters.directionId;
  }

  return params;
}

/**
 * Build URL query string from params
 */
export function buildQueryString(params: QueryParams): string {
  const searchParams = new URLSearchParams();

  searchParams.append('startDate', params.startDate);
  searchParams.append('endDate', params.endDate);

  if (params.days) {
    searchParams.append('days', params.days);
  }
  if (params.periods) {
    searchParams.append('periods', params.periods);
  }
  if (params.routes) {
    searchParams.append('routes', params.routes);
  }
  if (params.direction) {
    searchParams.append('direction', params.direction);
  }

  return searchParams.toString();
}

/**
 * Generate a cache key from filter state
 */
export function getCacheKey(endpoint: string, filters: FilterState): string {
  const params = buildQueryParams(filters);
  if (!params) return '';
  return `${endpoint}-${JSON.stringify(params)}`;
}

/**
 * Build full URL for a ridership API endpoint
 */
export function buildApiUrl(endpoint: string, filters: FilterState): string | null {
  const params = buildQueryParams(filters);
  if (!params) return null;
  return `/api/ridership/${endpoint}?${buildQueryString(params)}`;
}
