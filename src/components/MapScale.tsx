'use client';

import React from 'react';
import { MAP_COLORS, getScaleLabels, formatScaleValue } from '@/lib/utils/colorScale';
import { COMPARISON_SCALE_COLORS, hexToRGBA } from '@/utils/comparisonColors';

export type ComparisonDisplayMode = 'percent' | 'number';

interface MapScaleProps {
  title: string;
  min: number;
  max: number;
  comparisonMode?: boolean;
  comparisonDisplayMode?: ComparisonDisplayMode;
  onComparisonDisplayModeChange?: (mode: ComparisonDisplayMode) => void;
  // For number mode, we need the actual min/max difference values
  minDiff?: number;
  maxDiff?: number;
}

const MapScale: React.FC<MapScaleProps> = ({
  title,
  min,
  max,
  comparisonMode = false,
  comparisonDisplayMode = 'percent',
  onComparisonDisplayModeChange,
  minDiff = 0,
  maxDiff = 0
}) => {
  // For comparison mode, show a different scale
  if (comparisonMode) {
    // Format values as percentages for comparison scale
    const formatComparisonValue = (value: number): string => {
      // Guard against NaN and non-finite values
      if (!Number.isFinite(value)) return '0';
      if (comparisonDisplayMode === 'number') {
        if (value === 0) return '0';
        const prefix = value > 0 ? '+' : '';
        return `${prefix}${Math.round(value).toLocaleString()}`;
      }
      if (value === 0) return '0%';
      const prefix = value > 0 ? '+' : '';
      return `${prefix}${Math.round(value)}%`;
    };

    // Use appropriate min/max based on display mode
    const displayMin = comparisonDisplayMode === 'number' ? minDiff : min;
    const displayMax = comparisonDisplayMode === 'number' ? maxDiff : max;

    return (
      <div
        className="absolute"
        style={{
          bottom: '12px',
          right: '12px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '8px',
        }}
      >
        {/* Floating Toggle Control */}
        {onComparisonDisplayModeChange && (
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '9999px',
              padding: '4px',
              border: '0.5px solid var(--border-default)',
              boxShadow: 'var(--shadow-sm)',
              gap: '4px',
              width: '88px',
              height: '48px',
              boxSizing: 'border-box',
            }}
          >
            <button
              onClick={() => onComparisonDisplayModeChange('percent')}
              style={{
                flex: 1,
                height: '40px',
                fontSize: '16px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: comparisonDisplayMode === 'percent' ? 'var(--bg-elevated)' : 'transparent',
                color: comparisonDisplayMode === 'percent' ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              %
            </button>
            <button
              onClick={() => onComparisonDisplayModeChange('number')}
              style={{
                flex: 1,
                height: '40px',
                fontSize: '16px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: comparisonDisplayMode === 'number' ? 'var(--bg-elevated)' : 'transparent',
                color: comparisonDisplayMode === 'number' ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              #
            </button>
          </div>
        )}

        {/* Scale Card */}
        <div
          className="bg-bg-elevated"
          style={{
            padding: '12px',
            borderRadius: '20px',
            border: '0.5px solid var(--border-default)',
            minWidth: '280px',
            maxWidth: '400px',
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

        {/* Numeric Labels - positioned to align with color segments */}
        <div
          className="nav-label text-text-tertiary"
          style={{
            display: 'flex',
            width: '100%',
            position: 'relative',
          }}
        >
          {/* Min label - left aligned */}
          <span style={{ position: 'absolute', left: 0 }}>{formatComparisonValue(displayMin)}</span>
          {/* Mid-left label - at 25% + 8px right */}
          <span style={{ position: 'absolute', left: 'calc(25% + 8px)', transform: 'translateX(-50%)' }}>{formatComparisonValue(Math.round(displayMin / 2))}</span>
          {/* Center "0" label - exactly at 50% (center of amber segment) */}
          <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>0</span>
          {/* Mid-right label - at 75% - 8px left */}
          <span style={{ position: 'absolute', left: 'calc(75% - 8px)', transform: 'translateX(-50%)' }}>{formatComparisonValue(Math.round(displayMax / 2))}</span>
          {/* Max label - right aligned */}
          <span style={{ position: 'absolute', right: 0 }}>{formatComparisonValue(displayMax)}</span>
          {/* Spacer to maintain height */}
          <span style={{ visibility: 'hidden' }}>0</span>
        </div>
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
