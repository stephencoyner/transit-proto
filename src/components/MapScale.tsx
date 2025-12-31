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

const MapScale: React.FC<MapScaleProps> = ({
  title,
  min,
  max,
  comparisonMode = false,
}) => {
  // For comparison mode, show a different scale
  if (comparisonMode) {
    // Format values as percentages for comparison scale
    const formatComparisonValue = (value: number): string => {
      // Guard against NaN and non-finite values
      if (!Number.isFinite(value)) return '0';
      if (value === 0) return '0%';
      const prefix = value > 0 ? '+' : '';
      return `${prefix}${Math.round(value)}%`;
    };

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

        {/* Color Blocks - show subset based on data range */}
        {(() => {
          // Determine which portion of the scale to show based on the data range
          // COMPARISON_SCALE_COLORS has 7 colors: indices 0-2 are negative (red to orange),
          // index 3 is neutral (yellow/amber), indices 4-6 are positive (light green to dark green)
          const isAllNegative = max <= 0 && min < 0;
          const isAllPositive = min >= 0 && max > 0;

          // Create a mutable array from the readonly tuple for slicing
          const allColors = [...COMPARISON_SCALE_COLORS];
          let colorsToShow = allColors;
          let colorWeights: number[] = [1, 1, 1, 1, 1, 1, 1]; // Default equal weights

          if (isAllNegative) {
            // Show only the negative portion (first 4 colors: red through amber, indices 0-3)
            colorsToShow = allColors.slice(0, 4);
            colorWeights = [1, 1, 1, 1];
          } else if (isAllPositive) {
            // Show only the positive portion (last 4 colors: amber through green, indices 3-6)
            colorsToShow = allColors.slice(3, 7);
            colorWeights = [1, 1, 1, 1];
          } else {
            // Mixed range: calculate proportional widths
            // Colors 0-2 represent negative values (3 colors), color 3 is neutral, colors 4-6 are positive (3 colors)
            const negativeRange = Math.abs(min);
            const positiveRange = Math.abs(max);
            const totalRange = negativeRange + positiveRange;

            if (totalRange > 0) {
              // Calculate the width ratio for negative vs positive sections
              const negativeRatio = negativeRange / totalRange;
              const positiveRatio = positiveRange / totalRange;

              // Distribute among colors: 3 negative colors + 1 neutral + 3 positive colors
              // Negative colors (0-2) share the negative portion
              // Positive colors (4-6) share the positive portion
              // Neutral (3) is at the boundary
              const negWeight = negativeRatio / 3;
              const posWeight = positiveRatio / 3;
              colorWeights = [negWeight, negWeight, negWeight, 0.001, posWeight, posWeight, posWeight];
            }
          }

          return (
            <>
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
                {colorsToShow.map((color, index) => {
                  const rgb = hexToRGBA(color);
                  return (
                    <div
                      key={index}
                      style={{
                        flex: colorWeights[index] || 1,
                        backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
                      }}
                    />
                  );
                })}
              </div>

              {/* Numeric Labels - adjusted based on which portion of scale is shown */}
              <div
                className="nav-label text-text-tertiary"
                style={{
                  display: 'flex',
                  width: '100%',
                  position: 'relative',
                }}
              >
                {isAllNegative ? (
                  <>
                    {/* All negative: show min, mid, 0 */}
                    <span style={{ position: 'absolute', left: 0 }}>{formatComparisonValue(min)}</span>
                    <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>{formatComparisonValue(Math.round(min / 2))}</span>
                    <span style={{ position: 'absolute', right: 0 }}>0</span>
                  </>
                ) : isAllPositive ? (
                  <>
                    {/* All positive: show 0, mid, max */}
                    <span style={{ position: 'absolute', left: 0 }}>0</span>
                    <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>{formatComparisonValue(Math.round(max / 2))}</span>
                    <span style={{ position: 'absolute', right: 0 }}>{formatComparisonValue(max)}</span>
                  </>
                ) : (
                  <>
                    {/* Mixed: show min, 0, max - position 0 based on actual data range */}
                    {(() => {
                      // Calculate where 0 falls in the range from min to max
                      const range = max - min;
                      const zeroPosition = range === 0 ? 50 : ((-min) / range) * 100;
                      return (
                        <>
                          <span style={{ position: 'absolute', left: 0 }}>{formatComparisonValue(min)}</span>
                          <span style={{ position: 'absolute', left: `${zeroPosition}%`, transform: 'translateX(-50%)' }}>0</span>
                          <span style={{ position: 'absolute', right: 0 }}>{formatComparisonValue(max)}</span>
                        </>
                      );
                    })()}
                  </>
                )}
                {/* Spacer to maintain height */}
                <span style={{ visibility: 'hidden' }}>0</span>
              </div>
            </>
          );
        })()}
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
