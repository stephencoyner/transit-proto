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

  return (
    <div
      className="absolute bg-bg-elevated"
      style={{
        bottom: '12px',
        right: '12px',
        padding: '12px',
        borderRadius: '20px',
        border: '0.5px solid var(--border-default)',
        minWidth: '280px',
        maxWidth: '400px',
        zIndex: 1000,
      }}
    >
      {/* Title */}
      <div className="button-small text-text-primary mb-3">
        {title}
      </div>

      {/* Color Blocks */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '16px',
          borderRadius: '8px',
          overflow: 'hidden',
          marginBottom: '8px',
        }}
      >
        {MAP_COLORS.map((color, index) => (
          <div
            key={index}
            style={{
              flex: 1,
              backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
            }}
          />
        ))}
      </div>

      {/* Labels */}
      <div
        className="nav-label text-text-tertiary"
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
        }}
      >
        <span>{formatScaleValue(labels[0])}</span>
        <span>{formatScaleValue(labels[1])}</span>
        <span>{formatScaleValue(labels[2])}</span>
      </div>
    </div>
  );
};

export default MapScale;
