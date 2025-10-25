import React from 'react';

export interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children }) => {
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
};

Tooltip.displayName = 'Tooltip';
