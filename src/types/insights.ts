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
  investigationSteps: string[];
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
}

export interface WalkthroughStep {
  narrative: string;
  filters: WalkthroughFilterState;
}

export interface InsightsResponse {
  generatedAt: string;
  dateRange: { start: string; end: string };
  insights: InsightCard[];
  toolCallCount: number;
}

/** Streamed progress updates during AI analysis */
export interface InsightProgress {
  step: string;
  toolName?: string;
  timestamp: string;
}
