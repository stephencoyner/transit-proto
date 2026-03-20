/**
 * Chat API Route
 *
 * POST /api/chat — Conversational endpoint with tool use for querying transit data.
 * Runs an agent loop so Claude can call data tools to answer user questions.
 * Also supports simple no-tools mode for title generation etc. via the `system` param.
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { insightTools, executeTool } from '@/lib/insights/tools';

const MAX_ITERATIONS = 10;

const SYSTEM_PROMPT = `You are Hopthru, a helpful transit analytics assistant for King County Metro in Seattle. You help transit planners understand ridership data, patterns, and trends across bus routes.

You have access to tools that can query real ridership data. Use them to answer questions with specific numbers and evidence. Be concise and conversational.

DATA CONTEXT:
- 10 bus routes: 1, 8, 10, 11, 13, 14, 40, 44, 62, 70
- Route IDs: 100001(Rt 1), 100275(Rt 8), 100002(Rt 10), 100009(Rt 11), 100028(Rt 13), 100039(Rt 14), 102574(Rt 40), 100224(Rt 44), 100252(Rt 62), 100264(Rt 70)
- Data range: March 21, 2025 to September 30, 2025
- High-ridership routes (articulated, 100-seat capacity): 40, 44, 70
- Medium routes: 1, 8, 62
- Lower routes: 10, 11, 13, 14
- Time periods: early_am (12-6AM), am_peak (6-9AM), midday (9AM-3PM), pm_peak (3-7PM), evening (7-10PM), night (10PM-12AM)
- Day of week: 0=Monday through 6=Sunday

When answering, cite specific numbers, routes, and time periods. If you need data to answer a question, use the tools — don't guess.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, system } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages array is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.INSIGHTS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey || !apiKey.startsWith('sk-')) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured. Set INSIGHTS_ANTHROPIC_API_KEY in .env.local.' },
        { status: 503 }
      );
    }

    const client = new Anthropic({ apiKey });

    // Simple mode (no tools) — used for title generation, greetings, etc.
    if (system) {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

      const textBlock = response.content.find((block) => block.type === 'text') as
        | { type: 'text'; text: string }
        | undefined;

      return NextResponse.json({
        role: 'assistant',
        content: textBlock?.text || '',
      });
    }

    // Agent mode — full tool use loop
    const agentMessages: Anthropic.MessageParam[] = messages.map(
      (m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })
    );

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: insightTools,
        messages: agentMessages,
      });

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (block) => block.type === 'tool_use'
        ) as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>;

        const toolResults = await Promise.all(
          toolUseBlocks.map(async (toolUse) => {
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

        agentMessages.push({ role: 'assistant', content: response.content as Anthropic.ContentBlockParam[] });
        agentMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Final text response
      const textBlock = response.content.find(
        (block) => block.type === 'text'
      ) as { type: 'text'; text: string } | undefined;

      return NextResponse.json({
        role: 'assistant',
        content: textBlock?.text || 'No response generated.',
      });
    }

    return NextResponse.json({
      role: 'assistant',
      content: 'I ran out of steps while researching your question. Could you try asking in a more specific way?',
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
