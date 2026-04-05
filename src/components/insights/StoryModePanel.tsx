'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { InsightCard as InsightCardType, StoryChartSpec } from '@/types/insights';
import CustomTooltip from '@/components/charts/CustomTooltip';
import ComparisonMetricCard from '@/components/charts/ComparisonMetricCard';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ACCENT_UI, ACCENT_UI_BAR, ACCENT_UI_BAR_CMP, ACCENT_UI_BAR_CMP_LIGHT, ACCENT_UI_2_BAR_CMP, ACCENT_UI_2_BAR_CMP_LIGHT, ACCENT_UI_ON_WHITE, ACCENT_UI_2_ON_WHITE, accent } from '@/lib/uiAccent';
import { DATETIME_1_COLOR, DATETIME_2_COLOR } from '@/utils/comparisonColors';

interface StoryModePanelProps {
  insight: InsightCardType;
  stepIndex: number;
  onStepChange: (index: number) => void;
  onClose: () => void;
  isContentHidden?: boolean;
  onMetricChange?: (metric: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}


// Card container style matching data panel charts
const chartCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-elevated)',
  border: 'var(--border-width) solid var(--border-default)',
  borderRadius: 'var(--radius-default)',
  padding: '16px',
  marginBottom: '8px',
};

// ── Chart renderer ──
function StoryChart({ spec, bare }: { spec: StoryChartSpec; bare?: boolean }) {
  const wrapper = bare
    ? { paddingTop: '16px' }
    : chartCardStyle;

  if (spec.type === 'metric') {
    return (
      <div style={wrapper}>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            display: 'block',
            marginBottom: '4px',
          }}
        >
          {spec.metricLabel}
        </span>
        <span
          style={{
            fontSize: '28px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.2,
          }}
        >
          {spec.metricValue}
        </span>
      </div>
    );
  }

  if (spec.type === 'comparison-metric') {
    return (
      <ComparisonMetricCard
        title={spec.metricLabel || ''}
        value1={typeof spec.metricValue === 'number' ? spec.metricValue : parseInt(String(spec.metricValue).replace(/,/g, ''), 10) || 0}
        value2={typeof spec.metricValue2 === 'number' ? spec.metricValue2 : parseInt(String(spec.metricValue2).replace(/,/g, ''), 10) || 0}
      />
    );
  }

  const isComparison = !!spec.yKey2;

  return (
    <div style={wrapper}>
      {spec.title && (
        <h4
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            margin: '0 0 12px 0',
          }}
        >
          {spec.title}
        </h4>
      )}
      <ResponsiveContainer width="100%" height={180}>
        {spec.type === 'area' ? (
          <AreaChart data={spec.data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={accent(0.3)} strokeWidth={0.5} vertical={false} />
            <XAxis
              dataKey={spec.xKey}
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip isComparisonMode={isComparison} />} cursor={{ fill: `url(#cursor-${spec.id})` }} />
            <defs>
              <linearGradient id={`cursor-${spec.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT_UI} stopOpacity={0.18} />
                <stop offset="100%" stopColor={ACCENT_UI} stopOpacity={0.08} />
              </linearGradient>
              <linearGradient id={`gradient-${spec.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT_UI_BAR} stopOpacity={1} />
                <stop offset="100%" stopColor={ACCENT_UI_BAR} stopOpacity={0.15} />
              </linearGradient>
              <linearGradient id={`gradient-${spec.id}-1`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT_UI_BAR_CMP} stopOpacity={1} />
                <stop offset="100%" stopColor={ACCENT_UI_BAR_CMP_LIGHT} stopOpacity={1} />
              </linearGradient>
              <linearGradient id={`gradient-${spec.id}-2`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT_UI_2_BAR_CMP} stopOpacity={1} />
                <stop offset="100%" stopColor={ACCENT_UI_2_BAR_CMP_LIGHT} stopOpacity={1} />
              </linearGradient>
            </defs>
            {isComparison ? (
              <>
                <Area type="monotone" dataKey={spec.yKey} name="Date-time 1" stroke={ACCENT_UI_ON_WHITE} strokeWidth={4} fill={`url(#gradient-${spec.id}-1)`} isAnimationActive={false} />
                <Area type="monotone" dataKey={spec.yKey2!} name="Date-time 2" stroke={ACCENT_UI_2_ON_WHITE} strokeWidth={4} fill={`url(#gradient-${spec.id}-2)`} isAnimationActive={false} />
              </>
            ) : (
              <Area type="monotone" dataKey={spec.yKey} stroke={ACCENT_UI} strokeOpacity={0.4} strokeWidth={2} fill={`url(#gradient-${spec.id})`} isAnimationActive={false} />
            )}
          </AreaChart>
        ) : (
          <BarChart data={spec.data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={accent(0.3)} strokeWidth={0.5} vertical={false} />
            <defs>
              <linearGradient id={`barCursor-${spec.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT_UI} stopOpacity={0.18} />
                <stop offset="100%" stopColor={ACCENT_UI} stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey={spec.xKey}
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip isComparisonMode={isComparison} />} cursor={{ fill: `url(#barCursor-${spec.id})` }} />
            {isComparison ? (
              <>
                <Bar dataKey={spec.yKey} name="Date-time 1" fill={ACCENT_UI_BAR_CMP} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey={spec.yKey2!} name="Date-time 2" fill={ACCENT_UI_2_BAR_CMP} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </>
            ) : (
              <Bar dataKey={spec.yKey} fill={ACCENT_UI_BAR} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            )}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ── Main component ──
export function StoryModePanel({
  insight,
  stepIndex,
  onStepChange,
  onClose,
  isContentHidden,
  onMetricChange,
}: StoryModePanelProps) {
  const steps = insight.walkthrough ?? [];
  const currentStep = steps[stepIndex];
  const totalSteps = steps.length;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  // Metric short labels for segmented control
  const metricShortLabel: Record<string, string> = {
    'Average daily boardings': 'Boardings',
    'Average daily alightings': 'Alightings',
    'Average daily activity': 'Activity',
    'Average load': 'Load',
    'Maxload': 'Maxload',
    'Total boardings': 'Total',
  };

  // Metric state
  const hasMetrics = (currentStep?.relevantMetrics?.length ?? 0) >= 2;
  const [storyMetric, setStoryMetric] = useState<string>(
    currentStep?.relevantMetrics?.[0] ?? 'Average daily boardings'
  );

  // Reset metric when step changes
  useEffect(() => {
    const firstMetric = currentStep?.relevantMetrics?.[0] ?? 'Average daily boardings';
    setStoryMetric(firstMetric);
    onMetricChange?.(firstMetric);
  }, [stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // View state
  const [view, setView] = useState<'page' | 'conversation'>('page');
  const [isViewTransitioning, setIsViewTransitioning] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (view === 'conversation') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatLoading, view]);

  // Focus input when entering conversation
  useEffect(() => {
    if (view === 'conversation' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [view]);

  // Phased view transition
  const transitionToView = useCallback((targetView: 'page' | 'conversation') => {
    setIsViewTransitioning(true);
    setTimeout(() => {
      setView(targetView);
      setTimeout(() => {
        setIsViewTransitioning(false);
      }, 50);
    }, 150);
  }, []);

  // Send chat message
  const sendMessage = useCallback(async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || isChatLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...chatMessages, userMessage];
    setChatMessages(updatedMessages);
    setChatInput('');
    setIsChatLoading(true);

    // If first message, transition to conversation view
    if (view === 'page') {
      transitionToView('conversation');
    }

    // Build context-aware message list
    const contextMessage: ChatMessage = {
      role: 'user',
      content: `[Context: I'm viewing a transit analysis story titled "${insight.title}". Current page: "${currentStep?.pageName || `Page ${stepIndex + 1}`}". ${currentStep?.filterSummary ? `Filters: ${currentStep.filterSummary}.` : ''} Summary: "${currentStep?.narrative || ''}". Please answer my question in this context, but feel free to discuss more broadly if I ask.]`,
    };

    const apiMessages = [
      contextMessage,
      ...updatedMessages.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Chat request failed');
      }

      const responseData = await res.json();
      setChatMessages([...updatedMessages, { role: 'assistant', content: responseData.content }]);
    } catch (err) {
      setChatMessages([
        ...updatedMessages,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}` },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, isChatLoading, chatMessages, view, insight.title, currentStep, stepIndex, transitionToView]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleBackFromChat = () => {
    transitionToView('page');
  };

  if (!currentStep) return null;

  const contentOpacity = isContentHidden || isViewTransitioning ? 0 : 1;

  // ── Conversation View ──
  if (view === 'conversation') {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-primary)',
          position: 'relative',
          opacity: contentOpacity,
          transition: 'opacity 150ms ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 16px 12px',
            flexShrink: 0,
            borderBottom: '0.5px solid var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleBackFromChat}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div style={{ overflow: 'hidden' }}>
              <span
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {insight.title}
              </span>
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                }}
              >
                {currentStep.pageName || `Page ${stepIndex + 1}`}
              </span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px 16px 104px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  className={msg.role === 'assistant' ? 'story-chat-markdown' : undefined}
                  style={{
                    maxWidth: msg.role === 'user' ? '75%' : '100%',
                    padding: msg.role === 'user' ? '10px 14px' : '4px 0',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '0',
                    backgroundColor: msg.role === 'user' ? 'var(--text-secondary)' : 'transparent',
                    color: msg.role === 'user' ? 'var(--bg-primary)' : 'var(--text-primary)',
                    fontSize: '15px',
                    lineHeight: '1.5',
                    whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined,
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isChatLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '16px 16px 16px 4px',
                    backgroundColor: 'var(--bg-secondary)',
                    display: 'flex',
                    gap: '4px',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--text-tertiary)', animation: 'storyDot 1.4s ease-in-out infinite', animationDelay: '0s' }} />
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--text-tertiary)', animation: 'storyDot 1.4s ease-in-out infinite', animationDelay: '0.2s' }} />
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--text-tertiary)', animation: 'storyDot 1.4s ease-in-out infinite', animationDelay: '0.4s' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Floating Input */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '80px',
              backgroundColor: 'var(--bg-primary)',
            }}
          />
          <div
            style={{
              position: 'relative',
              padding: '0 16px',
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--bg-elevated)',
                borderRadius: '36px',
                padding: '16px 20px',
                border: '0.5px solid var(--border-default)',
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
              }}
            >
              <textarea
                ref={inputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Reply..."
                rows={1}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: '15px',
                  lineHeight: '1.5',
                  resize: 'none',
                  fontFamily: 'Inter, sans-serif',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim() || isChatLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: chatInput.trim() && !isChatLoading ? 'pointer' : 'default',
                  padding: '4px',
                  color: chatInput.trim() && !isChatLoading ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  opacity: chatInput.trim() && !isChatLoading ? 1 : 0.4,
                  flexShrink: 0,
                  transition: 'opacity 0.15s ease',
                }}
                aria-label="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <p style={{
              textAlign: 'center',
              fontSize: '12px',
              color: 'var(--text-disabled)',
              margin: '12px 0 12px',
            }}>
              Hopthru is AI and can make mistakes
            </p>
          </div>
        </div>

        <style>{`
          @keyframes storyDot {
            0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
            40% { opacity: 1; transform: scale(1); }
          }
          .story-chat-markdown p { margin: 0 0 12px; }
          .story-chat-markdown p:last-child { margin-bottom: 0; }
          .story-chat-markdown ul, .story-chat-markdown ol { margin: 0 0 12px; padding-left: 20px; }
          .story-chat-markdown li { margin-bottom: 4px; }
          .story-chat-markdown h1, .story-chat-markdown h2, .story-chat-markdown h3 {
            margin: 16px 0 8px;
            font-weight: 600;
          }
          .story-chat-markdown h1 { font-size: 20px; }
          .story-chat-markdown h2 { font-size: 18px; }
          .story-chat-markdown h3 { font-size: 16px; }
          .story-chat-markdown code {
            background: var(--bg-secondary);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 14px;
          }
          .story-chat-markdown pre {
            background: var(--bg-secondary);
            padding: 12px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 0 0 12px;
          }
          .story-chat-markdown pre code { background: none; padding: 0; }
          .story-chat-markdown strong { font-weight: 600; }
        `}</style>
      </div>
    );
  }

  // ── Page Detail View ──
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        position: 'relative',
        opacity: contentOpacity,
        transition: 'opacity 150ms ease',
      }}
    >
      {/* Title Bar */}
      <div
        style={{
          padding: '20px 16px 10px',
          flexShrink: 0,
        }}
      >
        {/* Row 1: X + title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3.80773 13.7071C3.41721 14.0976 2.78419 14.0976 2.39367 13.7071C2.00323 13.3166 2.00318 12.6835 2.39367 12.293L6.63684 8.05086L2.39367 3.80769C2.00328 3.41716 2.00319 2.78411 2.39367 2.39363C2.78416 2.00323 3.41723 2.00326 3.80773 2.39363L8.0509 6.6368L12.2931 2.39363C12.6836 2.00325 13.3167 2.00323 13.7071 2.39363C14.0976 2.78412 14.0976 3.41716 13.7071 3.80769L9.46496 8.05086L13.7071 12.293C14.0976 12.6835 14.0976 13.3166 13.7071 13.7071C13.3166 14.0976 12.6836 14.0976 12.2931 13.7071L8.0509 9.46492L3.80773 13.7071Z" fill="currentColor" />
            </svg>
          </button>
          <h2 style={{
            fontSize: '16px',
            fontWeight: 700,
            fontFamily: '"Playfair Display", Georgia, serif',
            color: 'var(--text-secondary)',
            margin: 0,
            lineHeight: 1.3,
            flex: 1,
          }}>
            {insight.title}
          </h2>
        </div>
      </div>
      <div style={{ height: '0.5px', backgroundColor: 'var(--border-default)', margin: '0 16px', flexShrink: 0 }} />

      {/* Page Navigation */}
      <div style={{ padding: '12px 16px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <button
          onClick={() => onStepChange(stepIndex - 1)}
          disabled={isFirst}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '0.5px solid var(--border-default)',
            backgroundColor: 'var(--bg-elevated)',
            cursor: isFirst ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            opacity: isFirst ? 0.5 : 1,
            color: 'var(--text-primary)',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {stepIndex + 1} of {totalSteps}
        </span>
        <button
          onClick={() => onStepChange(stepIndex + 1)}
          disabled={isLast}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '0.5px solid var(--border-default)',
            backgroundColor: 'var(--bg-elevated)',
            cursor: isLast ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            opacity: isLast ? 0.5 : 1,
            color: 'var(--text-primary)',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div style={{ height: '0.5px', backgroundColor: 'var(--border-default)', flexShrink: 0 }} />

      {/* Scrollable Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 16px 24px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Narrative card: page title + dates + narrative */}
          <div style={chartCardStyle}>
            {/* Page title */}
            <div style={{ fontSize: '16px', fontWeight: 400, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {currentStep.pageName || `Page ${stepIndex + 1}`}
            </div>
            {/* Dates */}
            {(() => {
              const { filters } = currentStep;
              const formatRange = (start?: string, end?: string) => {
                if (!start || !end) return '';
                const s = new Date(start + 'T00:00:00');
                const e = new Date(end + 'T00:00:00');
                const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
                return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`;
              };
              const parts: string[] = [];
              if (filters.daysMode === 'weekdays') parts.push('Weekdays');
              else if (filters.daysMode === 'weekends') parts.push('Weekends');
              else if (filters.daysMode === 'custom' && filters.customDays?.length) parts.push(filters.customDays.join(', '));
              else parts.push('All days');
              if (filters.timeMode === 'custom' && filters.timePeriods?.length) parts.push(filters.timePeriods.join(', '));
              const suffix = parts.join(' · ');
              const isComparison = filters.comparisonMode && filters.comparisonStartDate && filters.comparisonEndDate;
              if (isComparison) {
                const rangeA = `${formatRange(filters.startDate, filters.endDate)} · ${suffix}`;
                const rangeB = `${formatRange(filters.comparisonStartDate, filters.comparisonEndDate)} · ${suffix}`;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '12px' }}>
                    {[rangeA, rangeB].map((range, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: i === 0 ? DATETIME_1_COLOR : DATETIME_2_COLOR, flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{range}</span>
                      </div>
                    ))}
                  </div>
                );
              }
              const summary = currentStep.filterSummary || `${formatRange(filters.startDate, filters.endDate)} · ${suffix}`;
              return summary ? <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>{summary}</div> : null;
            })()}
            {/* Divider below dates */}
            <div style={{ height: '0.5px', backgroundColor: 'var(--border-default)', margin: '0 0 12px' }} />
            {/* Narrative */}
            <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }} className="story-narrative">
              <ReactMarkdown>{currentStep.narrativeByMetric?.[storyMetric] ?? currentStep.narrative}</ReactMarkdown>
            </div>
          </div>

          {/* Charts: combined card with segmented control on top when metrics exist */}
          {hasMetrics ? (
            <div style={chartCardStyle}>
              <SegmentedControl
                value={storyMetric}
                onChange={(value) => {
                  setStoryMetric(value);
                  onMetricChange?.(value);
                }}
                options={currentStep.relevantMetrics!.map((m) => ({ value: m, label: metricShortLabel[m] ?? m }))}
                fullWidth
              />
              <div style={{ height: '0.5px', backgroundColor: 'var(--border-default)', margin: '16px 0 0' }} />
              {(currentStep.chartsByMetric?.[storyMetric] ?? currentStep.charts)?.map((chart, i) => (
                <React.Fragment key={chart.id}>
                  {i > 0 && (
                    <div style={{ height: '0.5px', backgroundColor: 'var(--border-default)', margin: '16px 0 0' }} />
                  )}
                  <StoryChart spec={chart} bare />
                </React.Fragment>
              ))}
            </div>
          ) : (
            (currentStep.charts)?.map((chart) => (
              <StoryChart key={chart.id} spec={chart} />
            ))
          )}
        </div>
      </div>

    </div>
  );
}
