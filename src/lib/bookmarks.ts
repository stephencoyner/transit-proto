// Bookmark Types and localStorage utilities

// Minimal trip data stored in bookmarks - just enough for UI display
// The rest is fetched via normal API queries when bookmark is loaded
export interface BookmarkTrip {
  trip_id: string;
  start_time: string;  // For header display (e.g., "7:05 AM")
  headsign: string;    // For header display (e.g., "Downtown Seattle")
  route_id: string;    // Needed to set selectedRouteId
  shape_id: string;    // Needed for map display
  direction_id: string;
  time_period: string;
  ridership: number;
}

export interface BookmarkState {
  // View state
  activeTab: 'home' | 'system' | 'routes' | 'stops' | 'components' | 'bookmarks';
  selectedRouteId: string | null;
  selectedRouteName?: string | null;  // Display name for the route (e.g., "E Line", "Route 44")
  selectedStopId: string | null;
  selectedStopName?: string | null;   // Display name for the stop
  selectedTrip: BookmarkTrip | null;
  selectedPattern: string | null;
  selectedMetric: string;
  selectedRouteTab: 'Summary' | 'Trips' | 'Grid';

  // Trip tab filters
  tripFilterMin: number | null;
  tripFilterMax: number | null;
  tripSortBy: 'ridership' | 'time' | 'largestIncrease' | 'largestDecrease' | 'largestChange';
  tripSortOrder: 'asc' | 'desc';

  // Stops tab filters
  stopFilterMin: number | null;
  stopFilterMax: number | null;
  stopSortBy: 'name' | 'ridership' | 'largestIncrease' | 'largestDecrease' | 'largestChange';
  stopSortOrder: 'asc' | 'desc';
  stopAmenityFilters: Record<string, boolean>;

  // Routes tab filters
  routeFilterMin: number | null;
  routeFilterMax: number | null;
  routeSortBy: 'name' | 'ridership' | 'largestIncrease' | 'largestDecrease' | 'largestChange';
  routeSortOrder: 'asc' | 'desc';

  // Date filters
  dateRange: {
    start: string | null;
    end: string | null;
  };
  selectedDays: number[];
  selectedPeriods: string[];
  selectedDirection: string | null;

  // Comparison mode
  comparisonMode: boolean;
  comparisonDateRange: {
    start: string | null;
    end: string | null;
  };
  comparisonDays: number[];
  comparisonPeriods: string[];
  comparisonDirection: string | null;
  comparisonSwapped: boolean;

  // Map state
  viewState: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
}

export interface Bookmark {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  state: BookmarkState;
  image?: string; // Base64 encoded map screenshot
}

// Keep old key for backwards compatibility - will read from old storage
const BOOKMARKS_STORAGE_KEY = 'transit-proto-snapshots';

// Get all bookmarks from localStorage
export function getBookmarks(): Bookmark[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load bookmarks from localStorage:', e);
    return [];
  }
}

// Save a new bookmark
export function saveBookmark(bookmark: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>): Bookmark {
  const bookmarks = getBookmarks();
  const now = new Date().toISOString();

  const newBookmark: Bookmark = {
    ...bookmark,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  bookmarks.push(newBookmark);
  localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));

  return newBookmark;
}

// Update an existing bookmark
export function updateBookmark(id: string, updates: Partial<Pick<Bookmark, 'name' | 'description'>>): Bookmark | null {
  const bookmarks = getBookmarks();
  const index = bookmarks.findIndex(b => b.id === id);

  if (index === -1) return null;

  bookmarks[index] = {
    ...bookmarks[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  return bookmarks[index];
}

// Delete a bookmark
export function deleteBookmark(id: string): boolean {
  const bookmarks = getBookmarks();
  const filtered = bookmarks.filter(b => b.id !== id);

  if (filtered.length === bookmarks.length) return false;

  localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

// Get a single bookmark by ID
export function getBookmarkById(id: string): Bookmark | null {
  const bookmarks = getBookmarks();
  return bookmarks.find(b => b.id === id) || null;
}

// Generate a unique ID
function generateId(): string {
  return `bookmark_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Season date ranges (based on MapCanvas definitions)
// Winter: Sep 21 of (year-1) to Mar 20 of year
// Spring: Mar 21 to Jun 21 of year
// Summer: Jun 22 to Sep 18 of year
// Fall: Sep 19 of year to Mar 19 of (year+1)

interface SeasonMatch {
  season: 'Winter' | 'Spring' | 'Summer' | 'Fall';
  year: number;
}

// Check if a date range matches a service season
function matchServiceSeason(start: Date, end: Date): SeasonMatch | null {
  const startMonth = start.getMonth();
  const startDay = start.getDate();
  const endMonth = end.getMonth();
  const endDay = end.getDate();
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  // Spring: Mar 21 to Jun 21 (same year)
  if (startMonth === 2 && startDay === 21 && endMonth === 5 && endDay === 21 && startYear === endYear) {
    return { season: 'Spring', year: startYear };
  }

  // Summer: Jun 22 to Sep 18 (same year)
  if (startMonth === 5 && startDay === 22 && endMonth === 8 && endDay === 18 && startYear === endYear) {
    return { season: 'Summer', year: startYear };
  }

  // Winter: Sep 21 of prev year to Mar 20 of year
  if (startMonth === 8 && startDay === 21 && endMonth === 2 && endDay === 20 && endYear === startYear + 1) {
    return { season: 'Winter', year: endYear };
  }

  // Fall: Sep 19 of year to Mar 19 of next year
  if (startMonth === 8 && startDay === 19 && endMonth === 2 && endDay === 19 && endYear === startYear + 1) {
    return { season: 'Fall', year: startYear };
  }

  return null;
}

// Format date range for display
export function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end) return 'No date range';

  const startDate = new Date(start);
  const endDate = new Date(end);

  // Check if this matches a service season
  const seasonMatch = matchServiceSeason(startDate, endDate);
  if (seasonMatch) {
    return `${seasonMatch.season} ${seasonMatch.year}`;
  }

  const formatDate = (d: Date) => {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (start === end) {
    return formatDate(startDate);
  }

  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

// Legacy exports for backwards compatibility during migration
export type Snapshot = Bookmark;
export type SnapshotState = BookmarkState;
export type SnapshotTrip = BookmarkTrip;
export const getSnapshots = getBookmarks;
export const saveSnapshot = saveBookmark;
export const updateSnapshot = updateBookmark;
export const deleteSnapshot = deleteBookmark;
export const getSnapshotById = getBookmarkById;
