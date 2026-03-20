'use client';

import React, { useRef, useState, useLayoutEffect } from 'react';

interface SegmentedControlOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
}

export function SegmentedControl({ options, value, onChange, style }: SegmentedControlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeBtn = container.querySelector(`[data-value="${value}"]`) as HTMLElement | null;
    if (!activeBtn) return;

    setIndicator({ left: activeBtn.offsetLeft, width: activeBtn.offsetWidth });

    // Enable transitions after first paint
    if (!hasAnimated.current) {
      requestAnimationFrame(() => {
        hasAnimated.current = true;
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '24px',
        padding: '4px',
        position: 'relative',
        width: 'fit-content',
        ...style,
      }}
    >
      {/* Sliding indicator */}
      {indicator && (
        <div
          style={{
            position: 'absolute',
            top: '4px',
            bottom: '4px',
            left: `${indicator.left}px`,
            width: `${indicator.width}px`,
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: '20px',
            transition: hasAnimated.current
              ? 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
              : 'none',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Buttons */}
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-value={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '8px 20px',
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '20px',
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
            fontSize: 'var(--button-small-size)',
            fontWeight: 'var(--button-small-weight)',
            color: value === opt.value ? 'var(--text-primary)' : 'var(--text-tertiary)',
            lineHeight: 'var(--button-small-line-height)',
            transition: 'color 0.2s ease',
            position: 'relative',
            zIndex: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
