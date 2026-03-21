'use client';

import React from 'react';

interface InvestigationCardProps {
  title: string;
  currentStep: number;
  totalSteps: number;
  narrative: string;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  width?: number;
  bottomOffset?: number;
}

export function InvestigationCard({
  title,
  currentStep,
  totalSteps,
  narrative,
  onNext,
  onPrev,
  onClose,
  width,
  bottomOffset,
}: InvestigationCardProps) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: `${bottomOffset ?? 120}px`,
        right: '12px',
        width: width ? `${width}px` : '280px',
        background: 'var(--bg-elevated)',
        border: '0.5px solid var(--border-default)',
        borderRadius: '24px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.12)',
        padding: '20px 24px',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        <h3
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
            lineHeight: 1.3,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {title}
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            padding: '2px',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.80773 13.7071C3.41721 14.0976 2.78419 14.0976 2.39367 13.7071C2.00323 13.3166 2.00318 12.6835 2.39367 12.293L6.63684 8.05086L2.39367 3.80769C2.00328 3.41716 2.00319 2.78411 2.39367 2.39363C2.78416 2.00323 3.41723 2.00326 3.80773 2.39363L8.0509 6.6368L12.2931 2.39363C12.6836 2.00325 13.3167 2.00323 13.7071 2.39363C14.0976 2.78412 14.0976 3.41716 13.7071 3.80769L9.46496 8.05086L13.7071 12.293C14.0976 12.6835 14.0976 13.3166 13.7071 13.7071C13.3166 14.0976 12.6836 14.0976 12.2931 13.7071L8.0509 9.46492L3.80773 13.7071Z" fill="currentColor"/>
          </svg>
        </button>
      </div>

      {/* Narrative */}
      <div
        key={currentStep}
        style={{
          fontSize: '14px',
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          marginBottom: '16px',
          animation: 'investigationFadeIn 150ms ease',
        }}
      >
        {narrative}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text-tertiary)',
          }}
        >
          {currentStep + 1} of {totalSteps}
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onPrev}
            disabled={isFirst}
            style={{
              background: 'none',
              border: '0.5px solid var(--border-default)',
              borderRadius: '10px',
              padding: '6px 12px',
              cursor: isFirst ? 'default' : 'pointer',
              opacity: isFirst ? 0.3 : 1,
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'background 150ms ease, opacity 150ms ease',
            }}
            onMouseEnter={(e) => { if (!isFirst) (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M8.75 3.5L5.25 7L8.75 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <button
            onClick={onNext}
            disabled={isLast}
            style={{
              background: 'none',
              border: '0.5px solid var(--border-default)',
              borderRadius: '10px',
              padding: '6px 12px',
              cursor: isLast ? 'default' : 'pointer',
              opacity: isLast ? 0.3 : 1,
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'background 150ms ease, opacity 150ms ease',
            }}
            onMouseEnter={(e) => { if (!isLast) (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            Next
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M5.25 3.5L8.75 7L5.25 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes investigationFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
