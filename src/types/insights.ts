/**
 * AI Insights Types
 *
 * Defines the shape of AI-generated insights for the home screen.
 * The AI agent analyzes transit data and returns structured insight cards.
 */

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'positive';
export type InsightCategory = 'crowding' | 'decline' | 'anomaly' | 'trend' | 'comparison' | 'amenity';

export interface InsightCard {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  narrative: string;
  hypothesis: string;
  analysisSteps: string[];
  routeIds: string[];
  dateRange: { start: string; end: string };
  deepLink?: {
    routeId?: string;
    startDate?: string;
    endDate?: string;
    periods?: string[];
    days?: number[];
  };
  sparklineData?: Array<{ label: string; value: number }>;
  previewImage?: string;
  isAiGenerated?: boolean;
  walkthrough?: WalkthroughStep[];
}

export interface WalkthroughFilterState {
  tab: 'system' | 'routes' | 'stops';
  routeId?: string;
  routeTab?: 'Summary' | 'Trips' | 'Grid';
  stopId?: string;
  startDate?: string;
  endDate?: string;
  daysMode?: 'all' | 'weekdays' | 'weekends' | 'custom';
  customDays?: string[];
  timeMode?: 'all' | 'custom';
  timePeriods?: string[];
  comparisonMode?: boolean;
  comparisonStartDate?: string;
  comparisonEndDate?: string;
  /** Route pattern headsign (e.g. "Ballard Wallingford") — limits map + data to one pattern */
  pattern?: string;
}

export type StoryChartType = 'area' | 'bar' | 'metric' | 'comparison-metric';

export interface StoryChartSpec {
  id: string;
  type: StoryChartType;
  title: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  yKey2?: string;
  color?: string;
  metricValue?: string | number;
  metricValue2?: string | number;
  metricLabel?: string;
  /** Label for the tooltip value (e.g. "avg passenger load", "weekly boardings") */
  tooltipLabel?: string;
}

export interface WalkthroughStep {
  narrative: string;
  narrativeByMetric?: Record<string, string>;
  filters: WalkthroughFilterState;
  pageName?: string;
  charts?: StoryChartSpec[];
  chartsByMetric?: Record<string, StoryChartSpec[]>;
  filterSummary?: string;
  relevantMetrics?: string[];
}

export interface InsightsResponse {
  generatedAt: string;
  dateRange: { start: string; end: string };
  insights: InsightCard[];
  toolCallCount: number;
  summary?: string;
}

/** Streamed progress updates during AI analysis */
export interface InsightProgress {
  step: string;
  toolName?: string;
  timestamp: string;
}
