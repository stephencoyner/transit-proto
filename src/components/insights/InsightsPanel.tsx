'use client';

import React from 'react';
import type { InsightCard as InsightCardType, InsightsResponse } from '@/types/insights';
import { InsightCard } from './InsightCard';

interface InsightsPanelProps {
  data: InsightsResponse | null;
  isLoading: boolean;
  error: Error | null;
  onClose: () => void;
  onInvestigate: (insight: InsightCardType) => void;
  onGenerate: () => void;
  onRefresh: () => void;
}

export function InsightsPanel({
  data,
  isLoading,
  error,
  onClose,
  onInvestigate,
  onGenerate,
  onRefresh,
}: InsightsPanelProps) {
  const hasData = data && data.insights.length > 0;
  const showInitialState = !data && !isLoading && !error;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '24px 28px 0',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px 12px 6px 0',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Map
          </button>
          {hasData && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              style={{
                background: 'none',
                border: 'var(--border-width) solid var(--border-default)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              {isLoading ? 'Analyzing...' : 'Refresh'}
            </button>
          )}
        </div>

        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: '0 0 6px',
            lineHeight: 1.2,
          }}
        >
          {hasData ? 'Here are a few things worth looking at.' : 'AI Insights'}
        </h1>
        {data && (
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-tertiary)',
              margin: '0 0 4px',
            }}
          >
            Based on analysis of {data.dateRange.start} to {data.dateRange.end}
            {data.toolCallCount > 0 && (
              <span> &middot; {data.toolCallCount} data queries</span>
            )}
          </p>
        )}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px 28px 40px',
        }}
      >
        {/* Initial State — Generate Button */}
        {showInitialState && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '80px 40px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '20px',
                background: 'var(--bg-elevated)',
                border: 'var(--border-width) solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" fill="var(--text-tertiary)" opacity="0.6"/>
              </svg>
            </div>
            <p
              style={{
                fontSize: '15px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                margin: '0 0 8px',
              }}
            >
              Analyze your transit data with AI
            </p>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-tertiary)',
                margin: '0 0 24px',
                maxWidth: '360px',
                lineHeight: 1.5,
              }}
            >
              Claude will explore ridership patterns across all 10 routes, identify capacity issues, and surface actionable findings.
            </p>
            <button
              onClick={onGenerate}
              style={{
                background: 'var(--text-primary)',
                color: 'var(--bg-primary)',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 28px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 150ms ease',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              Generate Insights
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '20px' }}>
            <LoadingCard label="Analyzing system metrics..." />
            <LoadingCard label="Examining route patterns..." delay={300} />
            <LoadingCard label="Generating insights..." delay={600} />
          </div>
        )}

        {/* Error State */}
        {error && !data && !isLoading && (
          <div
            style={{
              background: 'rgba(196, 67, 40, 0.06)',
              border: '1px solid rgba(196, 67, 40, 0.2)',
              borderRadius: '16px',
              padding: '24px',
              marginTop: '20px',
            }}
          >
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--error)', margin: '0 0 8px' }}>
              Unable to generate insights
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              {error.message}
            </p>
            <button
              onClick={onGenerate}
              style={{
                background: 'none',
                border: 'var(--border-width) solid var(--border-default)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Insight Cards */}
        {hasData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {data.insights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onInvestigate={onInvestigate}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {data && data.insights.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: 'var(--text-tertiary)',
            }}
          >
            <p style={{ fontSize: '15px', margin: '0 0 8px' }}>No notable findings at this time.</p>
            <p style={{ fontSize: '13px', margin: 0 }}>Try refreshing to run a new analysis.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Loading skeleton card
function LoadingCard({ label, delay = 0 }: { label: string; delay?: number }) {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: 'var(--border-width) solid var(--border-default)',
        borderRadius: '20px',
        padding: '24px',
        animation: `fadeInUp 400ms ease ${delay}ms both`,
      }}
    >
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--text-tertiary)',
            animation: 'pulse 1.5s ease infinite',
          }}
        />
        <span style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      {/* Skeleton lines */}
      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ height: '12px', background: 'var(--bg-primary)', borderRadius: '6px', width: '85%' }} />
        <div style={{ height: '12px', background: 'var(--bg-primary)', borderRadius: '6px', width: '65%' }} />
        <div style={{ height: '12px', background: 'var(--bg-primary)', borderRadius: '6px', width: '75%' }} />
      </div>
    </div>
  );
}
