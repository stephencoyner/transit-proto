'use client';

import React from 'react';
import type { InsightCard as InsightCardType } from '@/types/insights';

interface InsightCardProps {
  insight: InsightCardType;
  onAnalyze?: (insight: InsightCardType) => void;
  variant?: 'default' | 'hero' | 'compact';
}

const severityConfig = {
  critical: { color: 'var(--error)', label: 'CRITICAL', bg: 'rgba(196, 67, 40, 0.08)' },
  warning: { color: 'var(--warning)', label: 'WARNING', bg: 'rgba(227, 126, 34, 0.08)' },
  info: { color: 'var(--text-tertiary)', label: 'INFO', bg: 'rgba(92, 73, 57, 0.06)' },
  positive: { color: 'var(--success)', label: 'POSITIVE', bg: 'rgba(45, 122, 79, 0.08)' },
};

function MapThumbnail({ src, height, style, edgeToEdge }: { src?: string; height: string; style?: React.CSSProperties; edgeToEdge?: boolean }) {
  const inset = edgeToEdge ? 0 : 12;
  const radius = edgeToEdge ? 0 : 20;
  if (src) {
    return (
      <div style={{ padding: inset, flexShrink: 0, ...style }}>
        <div style={{ width: '100%', height, overflow: 'hidden', borderRadius: radius }}>
          <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      </div>
    );
  }
  return (
    <div style={{
      width: '100%', height, background: 'var(--bg-secondary)', margin: inset,
      borderRadius: radius,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style,
    }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3 }}>
        <path d="M3 7L9 4L15 7L21 4V17L15 20L9 17L3 20V7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 4V17M15 7V20" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: InsightCardType['severity'] }) {
  const config = severityConfig[severity];
  return (
    <span style={{
      fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em',
      color: config.color, background: config.bg, padding: '3px 8px', borderRadius: '6px',
    }}>
      {config.label}
    </span>
  );
}

// Sparkle icon for AI-generated insights
function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--accent, #ED7E22)' }}>
      <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5L8 1Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

// Bookmark icon
function BookmarkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.4 }}>
      <path d="M4 2H12V14L8 11L4 14V2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function CardFooter({ insight, onAnalyze, showSparkle }: { insight: InsightCardType; onAnalyze?: (i: InsightCardType) => void; showSparkle?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0 0',
    }}>
      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
        Sep-Oct, 2025
      </span>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <BookmarkIcon />
        {showSparkle ? <SparkleIcon /> : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.4 }}>
            <path d="M2 12H4L10 6L8 4L2 10V12Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M8 4L10 6" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        )}
      </div>
    </div>
  );
}

// --- Hero variant: side-by-side text + map ---
function HeroCard({ insight, onAnalyze }: InsightCardProps) {
  return (
    <>
      <style>{`
        .insight-card-hero { border-color: var(--border-default); transition: border-color 150ms ease, box-shadow 150ms ease; }
        .insight-card-hero:hover { border-color: var(--border-hover) !important; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important; }
        .insight-card-hero:hover .hero-thumbnail { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); }
        .insight-card-hero:hover h3, .insight-card-hero:hover p { color: var(--text-tertiary) !important; transition: color 150ms ease; }
        .insight-card-hero h3, .insight-card-hero p { transition: color 150ms ease; }
      `}</style>
      <div
        className="insight-card-hero"
        onClick={() => onAnalyze?.(insight)}
        style={{
          cursor: 'pointer',
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--border-default)',
          borderRadius: '20px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
        }}
      >
        {/* Text side */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', padding: '20px' }}>
          <h3 style={{
            color: 'var(--text-primary)', margin: '0 0 16px',
            fontSize: '24px', fontWeight: 700, lineHeight: 1.2, fontFamily: 'var(--font-display)',
          }}>
            {insight.title}
          </h3>
          <p style={{
            color: 'var(--text-primary)', margin: '0 0 4px',
            fontSize: '16px', fontWeight: 400, lineHeight: '24px',
          }}>
            {insight.narrative}
          </p>
          <CardFooter insight={insight} onAnalyze={onAnalyze} showSparkle={insight.isAiGenerated} />
        </div>
        {/* Map side — edge-to-edge, left corners 0 (clipped by card overflow) */}
        <div style={{ width: '44%', minHeight: '200px', flexShrink: 0 }}>
          <div className="hero-thumbnail" style={{ width: '100%', height: '100%', overflow: 'hidden', transition: 'box-shadow 150ms ease' }}>
            {insight.previewImage ? (
              <img src={insight.previewImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3 }}>
                  <path d="M3 7L9 4L15 7L21 4V17L15 20L9 17L3 20V7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// --- Compact variant: thumbnail + title + date ---
function CompactCard({ insight, onAnalyze }: InsightCardProps) {
  return (
    <>
      <style>{`
        .insight-card-compact:hover .compact-card-body { border-color: var(--border-hover) !important; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important; }
        .insight-card-compact:hover h3 { color: var(--text-tertiary) !important; }
        .insight-card-compact h3 { transition: color 150ms ease; }
      `}</style>
      <div
        className="insight-card-compact"
        onClick={() => onAnalyze?.(insight)}
        style={{
          cursor: 'pointer',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <div style={{ borderRadius: '20px 20px 0 0', overflow: 'hidden', flexShrink: 0 }}>
          <MapThumbnail src={insight.previewImage} height="140px" edgeToEdge />
        </div>
        <div className="compact-card-body" style={{
          padding: '12px 16px 16px',
          background: 'var(--bg-elevated)',
          borderLeft: '0.5px solid var(--border-default)',
          borderRight: '0.5px solid var(--border-default)',
          borderBottom: '0.5px solid var(--border-default)',
          borderTop: 'none',
          borderRadius: '0 0 20px 20px',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <h3 style={{
            color: 'var(--text-primary)', margin: '0 0 4px',
            fontSize: '16px', fontWeight: 700, lineHeight: '24px', fontFamily: 'var(--font-display)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {insight.title}
          </h3>
          <CardFooter insight={insight} onAnalyze={onAnalyze} showSparkle={insight.isAiGenerated} />
        </div>
      </div>
    </>
  );
}

// --- Default variant: full card (existing) ---
function DefaultCard({ insight, onAnalyze }: InsightCardProps) {
  const config = severityConfig[insight.severity];
  return (
    <>
      <style>{`
        .insight-card:hover { border-color: var(--border-hover) !important; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important; }
        .insight-card:hover h3 { color: var(--text-tertiary) !important; }
        .insight-card h3 { transition: color 150ms ease; }
      `}</style>
      <div
        className="insight-card"
        style={{
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--border-default)',
          borderRadius: '24px',
          overflow: 'hidden',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
        }}
      >
        <MapThumbnail src={insight.previewImage} height="140px" />

        {/* Header */}
        <div style={{ padding: '0 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <SeverityBadge severity={insight.severity} />
          </div>
          <h3 className="heading-small" style={{
            color: 'var(--text-primary)', margin: 0,
            fontSize: '16px', fontWeight: 700, lineHeight: 1.3, fontFamily: 'var(--font-display)',
          }}>
            {insight.title}
          </h3>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 16px 0' }}>
          <p className="body-regular" style={{
            color: 'var(--text-secondary)', margin: '0 0 16px',
            fontSize: '14px', lineHeight: 1.6,
          }}>
            {insight.narrative}
          </p>

          {insight.hypothesis && (
            <div style={{
              background: 'var(--bg-elevated)', borderRadius: '12px',
              padding: '12px 16px', marginBottom: '16px',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>
                Hypothesis
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {insight.hypothesis}
              </span>
            </div>
          )}

          {insight.analysisSteps.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '8px' }}>
                Analysis steps
              </span>
              <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {insight.analysisSteps.map((step, i) => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {onAnalyze && (
          <div style={{ padding: '12px 16px 16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => onAnalyze(insight)}
              style={{
                background: 'none', border: 'var(--border-width) solid var(--border-default)',
                borderRadius: '10px', padding: '8px 16px', fontSize: '13px', fontWeight: 600,
                color: 'var(--text-primary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 150ms ease',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'var(--bg-primary)'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none'; }}
            >
              Analyze
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5.25 3.5L8.75 7L5.25 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function InsightCard({ insight, onAnalyze, variant = 'default' }: InsightCardProps) {
  switch (variant) {
    case 'hero': return <HeroCard insight={insight} onAnalyze={onAnalyze} />;
    case 'compact': return <CompactCard insight={insight} onAnalyze={onAnalyze} />;
    default: return <DefaultCard insight={insight} onAnalyze={onAnalyze} />;
  }
}
