'use client';

import React from 'react';
import { MAP_COLORS, getScaleLabels, formatScaleValue } from '@/lib/utils/colorScale';

interface MapScaleProps {
  title: string;
  min: number;
  max: number;
}

const MapScale: React.FC<MapScaleProps> = ({ title, min, max }) => {
  const labels = getScaleLabels(min, max);

  // Create gradient string from the 7 colors
  const gradientColors = MAP_COLORS.map(color => `rgb(${color[0]}, ${color[1]}, ${color[2]})`).join(', ');

  return (
    <div
      className="absolute bg-bg-elevated"
      style={{
        bottom: '12px',
        right: '12px',
        padding: '16px 20px',
        borderRadius: 'var(--radius-large)',
        border: '0.5px solid var(--border-default)',
        minWidth: '280px',
        maxWidth: '400px',
        zIndex: 1000,
      }}
    >
      {/* Title */}
      <div className="body-regular text-text-primary mb-3">
        {title}
      </div>

      {/* Gradient Bar */}
      <div
        style={{
          width: '100%',
          height: '16px',
          borderRadius: '8px',
          background: `linear-gradient(to right, ${gradientColors})`,
          marginBottom: '8px',
        }}
      />

      {/* Labels */}
      <div
        className="body-small text-text-secondary"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        {labels.map((label, index) => (
          <span key={index}>{formatScaleValue(label)}</span>
        ))}
      </div>
    </div>
  );
};

export default MapScale;
