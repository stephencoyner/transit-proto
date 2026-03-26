/**
 * AI Insights Agent
 *
 * Runs a Claude agent loop that autonomously explores transit data
 * using tools, then returns structured insight cards.
 */

import Anthropic from '@anthropic-ai/sdk';
import { insightTools, executeTool } from './tools';
import type { InsightCard, InsightsResponse } from '@/types/insights';

const MAX_ITERATIONS = 15;

const SYSTEM_PROMPT = `You are a transit analytics expert analyzing ridership data for King County Metro (Seattle). Your job is to explore the data using the available tools and identify the most important findings for a transit planner.

DATA CONTEXT:
- 10 bus routes: 1, 8, 10, 11, 13, 14, 40, 44, 62, 70
- Route IDs: 100001(Rt 1), 100275(Rt 8), 100002(Rt 10), 100009(Rt 11), 100028(Rt 13), 100039(Rt 14), 102574(Rt 40), 100224(Rt 44), 100252(Rt 62), 100264(Rt 70)
- Data range: March 21, 2025 to September 30, 2025
- High-ridership routes (articulated, 100-seat capacity): 40, 44, 70
- Medium routes: 1, 8, 62
- Lower routes: 10, 11, 13, 14
- Time periods: early_am (12-6AM), am_peak (6-9AM), midday (9AM-3PM), pm_peak (3-7PM), evening (7-10PM), night (10PM-12AM)
- Day of week: 0=Monday through 6=Sunday

ANALYSIS STRATEGY:
1. Start with get_system_overview for the full date range to see the big picture
2. Look at system trends over time to spot seasonal patterns
3. Drill into routes with unusual metrics (high max load, big changes)
4. Use compare_periods to quantify seasonal or before/after differences
5. Check trip-level data for routes showing crowding (max load near capacity)
6. Look at stop amenities for high-ridership stops

IMPORTANT GUIDELINES:
- Focus on actionable findings — things a transit planner would want to act on
- Prioritize: capacity/crowding issues > ridership declines > interesting patterns > positive trends
- Be specific: cite exact numbers, routes, time periods, and dates
- Generate exactly 1 insight — the single most important finding
- Each insight should tell a story: what's happening, why it might be happening, and what to analyze further

When you've gathered enough data, respond with your final insights as a JSON array. Your response MUST be valid JSON matching this exact schema:

[
  {
    "id": "unique-id-string",
    "category": "crowding|decline|anomaly|trend|comparison|amenity",
    "severity": "critical|warning|info|positive",
    "title": "Short descriptive title",
    "narrative": "2-3 sentence explanation of what you found in the data",
    "hypothesis": "Your hypothesis for why this is happening",
    "analysisSteps": ["Step 1 to analyze", "Step 2", "Step 3"],
    "routeIds": ["100224"],
    "dateRange": { "start": "2025-03-21", "end": "2025-09-30" },
    "deepLink": {
      "routeId": "100224",
      "startDate": "2025-09-15",
      "endDate": "2025-09-30",
      "periods": ["pm_peak"],
      "days": [0, 1, 2, 3, 4]
    },
    "sparklineData": [
      { "label": "Mar", "value": 5200 },
      { "label": "Apr", "value": 5100 },
      { "label": "May", "value": 5300 }
    ],
    "walkthrough": [...]  // ONLY for your #1 most important insight — see below
  }
]

WALKTHROUGH STEPS (required for your TOP insight only):
Your most important insight MUST include a "walkthrough" array of 3-5 steps that guide the user through the analysis. Each step is an object:

{
  "pageName": "Short page title (e.g. 'Route 62 Overview')",
  "filterSummary": "Human-readable filter description (e.g. 'Aug 1 – Sep 18, 2025 · Weekdays · PM Peak')",
  "narrative": "1-2 sentences explaining what this step shows and what to notice",
  "filters": {
    "tab": "routes",           // "system" | "routes" | "stops"
    "routeId": "62",           // the SHORT route number as string, NOT the full ID
    "routeTab": "Summary",     // "Summary" | "Trips" | "Grid"
    "startDate": "2025-08-01",
    "endDate": "2025-09-18",
    "daysMode": "all",         // "all" | "weekdays" | "weekends" | "custom"
    "customDays": ["Tue", "Wed", "Thu"],  // only if daysMode is "custom"
    "timeMode": "all",         // "all" | "custom"
    "timePeriods": ["PM Peak"],  // only if timeMode is "custom". Values: "Early AM", "AM Peak", "Midday", "PM Peak", "Evening", "Night"
    "comparisonMode": false,
    "comparisonStartDate": "2025-06-22",  // only if comparisonMode is true
    "comparisonEndDate": "2025-07-31"     // only if comparisonMode is true
  },
  "relevantMetrics": ["Average daily boardings", "Average load", "Maxload"],
  "charts": [
    {
      "id": "unique-chart-id",
      "type": "area|bar|metric",
      "title": "Chart title",
      "data": [{"date": "Aug 1", "value": 2280}, ...],  // USE REAL DATA from your tool calls
      "xKey": "date",
      "yKey": "value",
      "yKey2": "comparison",       // optional, for comparison charts
      "metricValue": "2,487",      // only for type "metric"
      "metricLabel": "Avg Daily Boardings"  // only for type "metric"
    }
  ],
  "chartsByMetric": {
    "Average daily boardings": [ ...charts array... ],
    "Average load": [ ...charts array... ]
  },
  "narrativeByMetric": {
    "Average daily boardings": "Metric-specific narrative for boardings...",
    "Average load": "Metric-specific narrative for load..."
  }
}

IMPORTANT WALKTHROUGH RULES:
- Use REAL numbers from your tool call results in chart data — do NOT make up values
- Include 2-3 relevantMetrics per step where applicable. Valid metric names: "Average daily boardings", "Average daily alightings", "Average daily activity", "Average load", "Maxload", "Total boardings"
- chartsByMetric is optional but recommended for steps with 2+ relevantMetrics — it lets the user switch between different metric views
- narrativeByMetric is optional but recommended when chartsByMetric is used — provide a tailored narrative for each metric so the text matches the visible chart
- Each chart in chartsByMetric should have its own unique id
- For "metric" type charts: metricValue should be a formatted string (e.g. "2,487" or "+12%" or "87%")
- Structure the walkthrough as a narrative: start broad (overview), then drill into specifics
- routeId in filters should be the SHORT route number (e.g. "62" not "100252")
- Other insights (2-5) should NOT include walkthrough — just the basic card fields

Return ONLY the JSON array, no markdown fencing, no extra text.`;

export interface AgentResult {
  insights: InsightCard[];
  toolCallCount: number;
}

export async function runInsightsAgent(): Promise<AgentResult> {
  const apiKey = process.env.INSIGHTS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !apiKey.startsWith('sk-')) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: 'Analyze the transit ridership data and identify the most important findings. Use the tools to explore the data, then return your insights as JSON.',
    },
  ];

  let toolCallCount = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: insightTools,
      messages,
    });

    // Check if the model wants to use tools
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block) => block.type === 'tool_use'
      ) as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>;

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          toolCallCount++;
          try {
            const result = await executeTool(toolUse.name, toolUse.input);
            return {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: result,
            };
          } catch (error) {
            return {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: String(error) }),
              is_error: true,
            };
          }
        })
      );

      // Add assistant response and tool results to messages
      messages.push({ role: 'assistant', content: response.content as Anthropic.ContentBlockParam[] });
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Model returned a final text response — parse the insights
    const textBlock = response.content.find(
      (block) => block.type === 'text'
    ) as { type: 'text'; text: string } | undefined;

    if (textBlock) {
      const insights = parseInsightsResponse(textBlock.text);
      return { insights, toolCallCount };
    }

    // No text block found, shouldn't happen
    break;
  }

  throw new Error('Agent exceeded maximum iterations without producing insights');
}

function parseInsightsResponse(text: string): InsightCard[] {
  let jsonStr = text.trim();

  // Try markdown fencing first
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // If it doesn't start with '[', try to find a JSON array in the text
  if (!jsonStr.startsWith('[')) {
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }
  }

  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array of insights');
  }

  return parsed.map((item: Record<string, unknown>, index: number) => ({
    id: (item.id as string) || `insight-${index}`,
    category: (item.category as InsightCard['category']) || 'trend',
    severity: (item.severity as InsightCard['severity']) || 'info',
    title: (item.title as string) || 'Untitled Insight',
    narrative: (item.narrative as string) || '',
    hypothesis: (item.hypothesis as string) || '',
    analysisSteps: (item.analysisSteps as string[]) || [],
    routeIds: (item.routeIds as string[]) || [],
    dateRange: (item.dateRange as { start: string; end: string }) || { start: '2025-03-21', end: '2025-09-30' },
    deepLink: item.deepLink as InsightCard['deepLink'],
    sparklineData: item.sparklineData as InsightCard['sparklineData'],
    walkthrough: item.walkthrough as InsightCard['walkthrough'],
  }));
}

export function buildInsightsResponse(result: AgentResult): InsightsResponse {
  return {
    generatedAt: new Date().toISOString(),
    dateRange: { start: '2025-03-21', end: '2025-09-30' },
    insights: result.insights,
    toolCallCount: result.toolCallCount,
  };
}
