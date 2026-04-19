'use client';

import React from 'react';
import type { InsightCard as InsightCardType } from '@/types/insights';

interface InsightCardProps {
  insight: InsightCardType;
  onAnalyze?: (insight: InsightCardType) => void;
  variant?: 'default' | 'hero' | 'compact';
  chatEnabled?: boolean;
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

// AI icon
function AIIcon() {
  return (
    <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
      <path d="M268.5-451.5Q257-440 240-440H80q-17 0-28.5-11.5T40-480q0-17 11.5-28.5T80-520h160q17 0 28.5 11.5T280-480q0 17-11.5 28.5ZM338-622q-11 11-28 11t-28-11l-28-28q-11-11-11-28t11-28q11-11 28-11t28 11l28 28q11 11 11 28t-11 28Zm102-98v-160q0-17 11.5-28.5T480-920q17 0 28.5 11.5T520-880v160q0 17-11.5 28.5T480-680q-17 0-28.5-11.5T440-720Zm182 98q-11-11-11-28t11-28l28-28q11-11 28-11t28 11q11 11 11 28t-11 28l-28 28q-11 11-28 11t-28-11Zm69.5 113.5Q703-520 720-520h160q17 0 28.5 11.5T920-480q0 17-11.5 28.5T880-440H720q-17 0-28.5-11.5T680-480q0-17 11.5-28.5ZM395-395q-35-35-35-85t35-85q35-35 85-35t85 35q35 35 35 85t-35 85q-35 35-85 35t-85-35Zm227 57q11-11 28-11t28 11l28 28q11 11 11 28t-11 28q-11 11-28 11t-28-11l-28-28q-11-11-11-28t11-28Zm-284 0q11 11 11 28t-11 28l-28 28q-11 11-28 11t-28-11q-11-11-11-28t11-28l28-28q11-11 28-11t28 11Zm170.5 69.5Q520-257 520-240v160q0 17-11.5 28.5T480-40q-17 0-28.5-11.5T440-80v-160q0-17 11.5-28.5T480-280q17 0 28.5 11.5Z"/>
    </svg>
  );
}

// Bookmark icon
function BookmarkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12.0001 18.2211L7.97337 19.9434C7.21504 20.2625 6.49604 20.1992 5.81637 19.7534C5.13671 19.3077 4.79688 18.677 4.79688 17.8614V5.07163C4.79688 4.44196 5.01863 3.90538 5.46213 3.46188C5.90563 3.01838 6.44221 2.79663 7.07188 2.79663H11.8326C12.152 2.79663 12.4214 2.90638 12.6409 3.12588C12.8604 3.34555 12.9701 3.61496 12.9701 3.93413C12.9701 4.2533 12.8604 4.52271 12.6409 4.74238C12.4214 4.96188 12.152 5.07163 11.8326 5.07163H7.07188V17.8424L12.0001 15.7281L16.9284 17.8424V12.1254C16.9284 11.8062 17.0381 11.5369 17.2576 11.3174C17.4773 11.0977 17.7467 10.9879 18.0659 10.9879C18.385 10.9879 18.6545 11.0977 18.8741 11.3174C19.0936 11.5369 19.2034 11.8062 19.2034 12.1254V17.8614C19.2034 18.677 18.8635 19.3077 18.1839 19.7534C17.5042 20.1992 16.7852 20.2625 16.0269 19.9434L12.0001 18.2211ZM12.0001 5.07163H7.07188H12.9701H12.0001ZM16.9701 6.98788H16.0599C15.7512 6.98788 15.4925 6.88213 15.2836 6.67063C15.0746 6.45896 14.9701 6.19955 14.9701 5.89238C14.9701 5.58505 15.076 5.32655 15.2876 5.11688C15.4993 4.90738 15.7587 4.80263 16.0659 4.80263H16.9701V3.89238C16.9701 3.58355 17.076 3.32471 17.2876 3.11588C17.4993 2.90705 17.7587 2.80263 18.0659 2.80263C18.3732 2.80263 18.6316 2.90705 18.8411 3.11588C19.0508 3.32471 19.1556 3.58355 19.1556 3.89238V4.80263H20.0659C20.3745 4.80263 20.6334 4.90705 20.8424 5.11588C21.0512 5.32471 21.1556 5.58355 21.1556 5.89238C21.1556 6.19955 21.0512 6.45896 20.8424 6.67063C20.6334 6.88213 20.3745 6.98788 20.0659 6.98788H19.1556V7.89813C19.1556 8.20696 19.0512 8.4658 18.8424 8.67463C18.6334 8.88346 18.3745 8.98788 18.0659 8.98788C17.7587 8.98788 17.4993 8.88213 17.2876 8.67063C17.076 8.45896 16.9701 8.19955 16.9701 7.89238V6.98788Z" fill="currentColor"/>
    </svg>
  );
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const yearOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return s.getFullYear() === e.getFullYear()
    ? `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', yearOpts)}`
    : `${s.toLocaleDateString('en-US', yearOpts)} – ${e.toLocaleDateString('en-US', yearOpts)}`;
}

function CardFooter({ insight, chatEnabled }: { insight: InsightCardType; onAnalyze?: (i: InsightCardType) => void; showSparkle?: boolean; chatEnabled?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0 0',
    }}>
      <style>{`
        .card-footer-icon { opacity: 0.4; transition: opacity 150ms ease, color 150ms ease; color: inherit; }
        .card-footer-icon:hover { opacity: 1; color: var(--text-primary); }
      `}</style>
      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
        {insight.dateRange ? formatDateRange(insight.dateRange.start, insight.dateRange.end) : null}
      </span>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <span className="card-footer-icon"><BookmarkIcon /></span>
        {chatEnabled && <span className="card-footer-icon"><AIIcon /></span>}
      </div>
    </div>
  );
}

// --- Hero variant: side-by-side text + map ---
function HeroCard({ insight, onAnalyze, chatEnabled }: InsightCardProps) {
  return (
    <>
      <style>{`
        .insight-card-hero { border-color: var(--border-subtle); transition: border-color 150ms ease, box-shadow 150ms ease; }
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
          border: '0.5px solid var(--border-subtle)',
          borderRadius: '20px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
          height: '220px',
        }}
      >
        {/* Text side */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', padding: '20px 20px 16px 20px' }}>
          <h3 className="display-xl" style={{
            color: 'var(--text-primary)', margin: '0 0 12px',
          }}>
            {insight.title}
          </h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <p className="body-large" style={{
              color: 'var(--text-primary)', margin: '0 0 4px',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {insight.narrative}
            </p>
            <div style={{ marginTop: 'auto' }}>
              <CardFooter insight={insight} onAnalyze={onAnalyze} showSparkle={insight.isAiGenerated} chatEnabled={chatEnabled} />
            </div>
          </div>
        </div>
        {/* Map side — edge-to-edge, left corners 0 (clipped by card overflow) */}
        <div style={{ width: '44%', flexShrink: 0 }}>
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
function CompactCard({ insight, onAnalyze, chatEnabled }: InsightCardProps) {
  return (
    <>
      <style>{`
        .insight-card-compact:hover { border-color: var(--border-hover) !important; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important; }
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
          border: '0.5px solid var(--border-subtle)',
          borderRadius: '20px',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <MapThumbnail src={insight.previewImage} height="140px" edgeToEdge />
        </div>
        <div className="compact-card-body" style={{
          padding: '12px 16px 16px',
          background: 'var(--bg-elevated)',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <h3 className="display-medium" style={{
            color: 'var(--text-primary)', margin: '0 0 4px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {insight.title}
          </h3>
          <CardFooter insight={insight} onAnalyze={onAnalyze} showSparkle={insight.isAiGenerated} chatEnabled={chatEnabled} />
        </div>
      </div>
    </>
  );
}

// --- Default variant: full card (existing) ---
function DefaultCard({ insight, onAnalyze, chatEnabled }: InsightCardProps) {
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
          border: '0.5px solid var(--border-subtle)',
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
          <h3 className="display-medium" style={{
            color: 'var(--text-primary)', margin: 0,
            lineHeight: 1.3,
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

export function InsightCard({ insight, onAnalyze, variant = 'default', chatEnabled }: InsightCardProps) {
  switch (variant) {
    case 'hero': return <HeroCard insight={insight} onAnalyze={onAnalyze} chatEnabled={chatEnabled} />;
    case 'compact': return <CompactCard insight={insight} onAnalyze={onAnalyze} chatEnabled={chatEnabled} />;
    default: return <DefaultCard insight={insight} onAnalyze={onAnalyze} chatEnabled={chatEnabled} />;
  }
}
