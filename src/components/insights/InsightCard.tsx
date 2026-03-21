'use client';

import React from 'react';
import type { InsightCard as InsightCardType } from '@/types/insights';
import { InsightSparkline } from './InsightSparkline';

interface InsightCardProps {
  insight: InsightCardType;
  onAnalyze?: (insight: InsightCardType) => void;
}

const severityConfig = {
  critical: { color: 'var(--error)', label: 'CRITICAL', bg: 'rgba(196, 67, 40, 0.08)' },
  warning: { color: 'var(--warning)', label: 'WARNING', bg: 'rgba(227, 126, 34, 0.08)' },
  info: { color: 'var(--text-tertiary)', label: 'INFO', bg: 'rgba(92, 73, 57, 0.06)' },
  positive: { color: 'var(--success)', label: 'POSITIVE', bg: 'rgba(45, 122, 79, 0.08)' },
};

export function InsightCard({ insight, onAnalyze }: InsightCardProps) {
  const config = severityConfig[insight.severity];

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '0.5px solid var(--border-default)',
        borderRadius: '24px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: config.color,
              background: config.bg,
              padding: '3px 8px',
              borderRadius: '6px',
            }}
          >
            {config.label}
          </span>
        </div>
        <h3
          className="heading-small"
          style={{
            color: 'var(--text-primary)',
            margin: 0,
            fontSize: '16px',
            fontWeight: 600,
            lineHeight: 1.3,
          }}
        >
          {insight.title}
        </h3>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 24px 0' }}>
        <p
          className="body-regular"
          style={{
            color: 'var(--text-secondary)',
            margin: '0 0 16px',
            fontSize: '14px',
            lineHeight: 1.6,
          }}
        >
          {insight.narrative}
        </p>

        {/* Hypothesis */}
        {insight.hypothesis && (
          <div
            style={{
              background: 'var(--bg-primary)',
              borderRadius: '12px',
              padding: '12px 16px',
              marginBottom: '16px',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                display: 'block',
                marginBottom: '4px',
              }}
            >
              Hypothesis
            </span>
            <span
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              {insight.hypothesis}
            </span>
          </div>
        )}

        {/* Analysis Steps */}
        {insight.analysisSteps.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                display: 'block',
                marginBottom: '8px',
              }}
            >
              Analysis steps
            </span>
            <ul
              style={{
                margin: 0,
                paddingLeft: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {insight.analysisSteps.map((step, i) => (
                <li
                  key={i}
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  {step}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sparkline - hidden for now */}
      </div>

      {/* Footer */}
      {onAnalyze && (
        <div
          style={{
            padding: '12px 24px 16px',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={() => onAnalyze(insight)}
            style={{
              background: 'none',
              border: 'var(--border-width) solid var(--border-default)',
              borderRadius: '10px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 150ms ease',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.background = 'var(--bg-primary)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = 'none';
            }}
          >
            Analyze
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5.25 3.5L8.75 7L5.25 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
