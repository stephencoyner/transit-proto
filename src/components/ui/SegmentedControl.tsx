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
  fullWidth?: boolean;
}

export function SegmentedControl({ options, value, onChange, style, fullWidth }: SegmentedControlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);
  const prevOptionsKey = useRef<string>('');
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Reset animation when options change (e.g. different page with different metrics)
    const optionsKey = options.map(o => o.label).join('|');
    if (optionsKey !== prevOptionsKey.current) {
      hasAnimated.current = false;
      prevOptionsKey.current = optionsKey;
    }

    let settled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const measure = () => {
      const activeBtn = container.querySelector(`[data-value="${value}"]`) as HTMLElement | null;
      if (!activeBtn) return;
      setIndicator({ left: activeBtn.offsetLeft, width: activeBtn.offsetWidth });
    };

    // Wait for container width to stop changing before first measurement
    const ro = new ResizeObserver(() => {
      if (settled) return; // only use RO for initial settle
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        settled = true;
        measure();
        if (!hasAnimated.current) {
          requestAnimationFrame(() => {
            hasAnimated.current = true;
          });
        }
      }, 100);
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '24px',
        padding: '4px',
        position: 'relative',
        width: fullWidth ? '100%' : 'fit-content',
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
            flex: fullWidth ? 1 : undefined,
            textAlign: fullWidth ? 'center' : undefined,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
