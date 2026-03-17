/**
 * AI Insights API Route
 *
 * GET /api/insights — Runs the AI agent to analyze transit data and return insights.
 * Uses in-memory cache with 30-minute TTL to avoid repeated AI calls.
 */

import { NextResponse } from 'next/server';
import { runInsightsAgent, buildInsightsResponse } from '@/lib/insights/agent';
import type { InsightsResponse } from '@/types/insights';

// In-memory cache
let cachedInsights: { data: InsightsResponse; timestamp: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const refresh = url.searchParams.get('refresh') === 'true';

    // Check cache (unless refresh requested)
    if (!refresh && cachedInsights && Date.now() - cachedInsights.timestamp < CACHE_TTL) {
      return NextResponse.json(cachedInsights.data);
    }

    // Check for API key
    // Note: ANTHROPIC_API_KEY may be set but empty by the Claude Code SDK environment.
    // Fall back to a separate env var name to avoid conflicts.
    const apiKey = process.env.INSIGHTS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey || !apiKey.startsWith('sk-')) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured. Set INSIGHTS_ANTHROPIC_API_KEY in .env.local.' },
        { status: 503 }
      );
    }

    // Run the AI agent
    const result = await runInsightsAgent();
    const response = buildInsightsResponse(result);

    // Cache the result
    cachedInsights = { data: response, timestamp: Date.now() };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Insights API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error generating insights' },
      { status: 500 }
    );
  }
}
