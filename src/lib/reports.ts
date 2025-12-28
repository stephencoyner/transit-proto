// Report Types and localStorage utilities

export interface ReportState {
  // View state
  activeTab: 'system' | 'routes' | 'stops' | 'components' | 'reports';
  selectedRouteId: string | null;
  selectedStopId: string | null;
  selectedTrip: string | null;
  selectedPattern: string | null;
  selectedMetric: string;

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

export interface Report {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  state: ReportState;
}

const REPORTS_STORAGE_KEY = 'transit-proto-reports';

// Get all reports from localStorage
export function getReports(): Report[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(REPORTS_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load reports from localStorage:', e);
    return [];
  }
}

// Save a new report
export function saveReport(report: Omit<Report, 'id' | 'createdAt' | 'updatedAt'>): Report {
  const reports = getReports();
  const now = new Date().toISOString();

  const newReport: Report = {
    ...report,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  reports.push(newReport);
  localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports));

  return newReport;
}

// Update an existing report
export function updateReport(id: string, updates: Partial<Pick<Report, 'name' | 'description'>>): Report | null {
  const reports = getReports();
  const index = reports.findIndex(r => r.id === id);

  if (index === -1) return null;

  reports[index] = {
    ...reports[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports));
  return reports[index];
}

// Delete a report
export function deleteReport(id: string): boolean {
  const reports = getReports();
  const filtered = reports.filter(r => r.id !== id);

  if (filtered.length === reports.length) return false;

  localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

// Get a single report by ID
export function getReportById(id: string): Report | null {
  const reports = getReports();
  return reports.find(r => r.id === id) || null;
}

// Generate a unique ID
function generateId(): string {
  return `report_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Format date range for display
export function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end) return 'No date range';

  const startDate = new Date(start);
  const endDate = new Date(end);

  const formatDate = (d: Date) => {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (start === end) {
    return formatDate(startDate);
  }

  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}
