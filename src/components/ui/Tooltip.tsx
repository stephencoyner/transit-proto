import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipProps {
  text: string;
  children: React.ReactNode;
  containerRef?: React.RefObject<HTMLElement>;
  position?: 'above' | 'below';
}

export const Tooltip: React.FC<TooltipProps> = ({ text, containerRef, position: tooltipPosition = 'above' }) => {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef?.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (tooltipPosition === 'below') {
        setCoords({
          top: rect.bottom + 8,
          left: rect.left
        });
      } else {
        setCoords({
          top: rect.top - 8,
          left: rect.left
        });
      }
    }
  }, [containerRef, tooltipPosition]);

  // Fallback to absolute positioning if no containerRef (backwards compatible)
  if (!containerRef) {
    return (
      <div
        className="label"
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: '0',
          backgroundColor: 'var(--btn-primary)',
          color: 'var(--text-btn-primary)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          whiteSpace: 'nowrap',
          zIndex: 9999,
          boxShadow: 'var(--shadow-lg)',
          pointerEvents: 'none'
        }}
      >
        {text}
      </div>
    );
  }

  if (!coords) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className="label"
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        transform: tooltipPosition === 'below' ? 'none' : 'translateY(-100%)',
        backgroundColor: 'var(--btn-primary)',
        color: 'var(--text-btn-primary)',
        padding: '8px 12px',
        borderRadius: 'var(--radius-sm)',
        whiteSpace: 'nowrap',
        zIndex: 9999,
        boxShadow: 'var(--shadow-lg)',
        pointerEvents: 'none'
      }}
    >
      {text}
    </div>,
    document.body
  );
};

Tooltip.displayName = 'Tooltip';
