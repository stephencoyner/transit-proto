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
