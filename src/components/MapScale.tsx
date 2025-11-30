'use client';

import React from 'react';
import { MAP_COLORS, getScaleLabels, formatScaleValue } from '@/lib/utils/colorScale';
import { COMPARISON_SCALE_COLORS, hexToRGBA } from '@/utils/comparisonColors';

interface MapScaleProps {
  title: string;
  min: number;
  max: number;
  comparisonMode?: boolean;
}

const MapScale: React.FC<MapScaleProps> = ({ title, min, max, comparisonMode = false }) => {
  // For comparison mode, show a different scale
  if (comparisonMode) {
    // Calculate labels for comparison scale (showing actual difference values)
    const formatComparisonValue = (value: number): string => {
      if (value === 0) return '0';
      const prefix = value > 0 ? '+' : '';
      if (Math.abs(value) >= 1000) {
        return `${prefix}${(value / 1000).toFixed(0)}K`;
      }
      return `${prefix}${value}`;
    };

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

        {/* Less/More labels */}
        <div
          className="nav-label text-text-tertiary"
          style={{
            display: 'flex',
            width: '100%',
            justifyContent: 'space-between',
            marginBottom: '4px',
          }}
        >
          <span>Less</span>
          <span>More</span>
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
          {COMPARISON_SCALE_COLORS.map((color, index) => {
            const rgb = hexToRGBA(color);
            return (
              <div
                key={index}
                style={{
                  flex: 1,
                  backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
                }}
              />
            );
          })}
        </div>

        {/* Numeric Labels */}
        <div
          className="nav-label text-text-tertiary"
          style={{
            display: 'flex',
            width: '100%',
            justifyContent: 'space-between',
            paddingLeft: '4px',
            paddingRight: '4px',
          }}
        >
          <span>{formatComparisonValue(min)}</span>
          <span>{formatComparisonValue(Math.round(min / 2))}</span>
          <span>0</span>
          <span>{formatComparisonValue(Math.round(max / 2))}</span>
          <span>{formatComparisonValue(max)}</span>
        </div>
      </div>
    );
  }

  // Normal mode
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
          paddingLeft: '8px',
          paddingRight: '12px',
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
