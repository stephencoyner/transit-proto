import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useState, useEffect, useMemo, useRef } from 'react';
import PortalTooltipContent from './PortalTooltip';
import { DATETIME_1_COLOR, DATETIME_2_COLOR } from '@/utils/comparisonColors';

interface PatternDataPoint {
  headsign: string;
  value: number;
  percentOfRoute: number;
}

interface ByPatternChartProps {
  data: PatternDataPoint[];
  comparisonData?: PatternDataPoint[];
  metric?: string;
  loading?: boolean;
  onPatternClick?: (headsign: string) => void;
  selectedPattern?: string | null;
  swapped?: boolean;
}

// Shimmer animation styles
const shimmerStyles = `
  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
  @keyframes shimmerSvg {
    0% {
      opacity: 0.3;
    }
    50% {
      opacity: 0.6;
    }
    100% {
      opacity: 0.3;
    }
  }
`;

// Loading skeleton component for horizontal layout
const ByPatternChartSkeleton = ({ patternCount }: { patternCount: number }) => {
  const isHorizontal = patternCount > 2;
  const chartHeight = isHorizontal ? Math.max(120, patternCount * 36) : 160;

  return (
    <div style={{
      backgroundColor: 'var(--bg-elevated)',
      border: 'var(--border-width) solid var(--border-default)',
      borderRadius: 'var(--radius-default)',
      padding: '16px',
      marginBottom: '8px'
    }}>
      <style>{shimmerStyles}</style>
      {/* Title skeleton */}
      <div style={{
        height: 14,
        width: 70,
        borderRadius: 2,
        marginBottom: 'var(--space-4)',
        background: 'linear-gradient(90deg, var(--border-default) 25%, var(--border-hover) 50%, var(--border-default) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite ease-in-out',
        opacity: 0.6
      }} />
      <div style={{ width: '100%', height: chartHeight, position: 'relative' }}>
        {isHorizontal ? (
          <>
            {/* Y-axis labels area for horizontal bars */}
            <div style={{ position: 'absolute', left: 0, top: 10, width: 80, height: 'calc(100% - 20px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
              {Array.from({ length: patternCount }).map((_, i) => (
                <div key={i} style={{
                  height: 10,
                  width: 60,
                  borderRadius: 2,
                  background: 'linear-gradient(90deg, var(--border-default) 25%, var(--border-hover) 50%, var(--border-default) 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s infinite ease-in-out',
                  animationDelay: `${i * 0.1}s`,
                  opacity: 0.6
                }} />
              ))}
            </div>
            {/* Chart area with horizontal bars */}
            <svg style={{ position: 'absolute', left: 80, top: 10, width: 'calc(100% - 90px)', height: 'calc(100% - 20px)', animation: 'shimmerSvg 1.5s infinite ease-in-out' }} viewBox={`0 0 200 ${patternCount * 36}`} preserveAspectRatio="none">
              {Array.from({ length: patternCount }).map((_, i) => {
                const barHeight = 24;
                const gap = 12;
                const y = i * (barHeight + gap);
                const widths = [140, 120, 100, 80, 160, 90];
                const width = widths[i % widths.length];
                return (
                  <rect
                    key={i}
                    x={0}
                    y={y}
                    width={width}
                    height={barHeight}
                    rx={4}
                    ry={4}
                    fill="var(--border-hover)"
                  />
                );
              })}
            </svg>
          </>
        ) : (
          <>
            {/* Y-axis area for vertical bars */}
            <div style={{ position: 'absolute', left: 0, top: 10, width: 40, height: 'calc(100% - 40px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  height: 8,
                  width: 24,
                  borderRadius: 2,
                  background: 'linear-gradient(90deg, var(--border-default) 25%, var(--border-hover) 50%, var(--border-default) 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s infinite ease-in-out',
                  animationDelay: `${i * 0.1}s`,
                  opacity: 0.6
                }} />
              ))}
            </div>
            {/* Chart area with vertical bars */}
            <svg style={{ position: 'absolute', left: 40, top: 10, width: 'calc(100% - 50px)', height: 'calc(100% - 40px)', animation: 'shimmerSvg 1.5s infinite ease-in-out' }} viewBox="0 0 100 120" preserveAspectRatio="none">
              <line x1="0" y1="0" x2="100" y2="0" stroke="var(--border-default)" strokeWidth="0.5" />
              <line x1="0" y1="60" x2="100" y2="60" stroke="var(--border-default)" strokeWidth="0.5" />
              <line x1="0" y1="120" x2="100" y2="120" stroke="var(--border-default)" strokeWidth="0.5" />
              {/* Bar 1 - centered at 33% */}
              <rect x="8" y="20" width="35" height="100" rx="4" ry="4" fill="var(--border-hover)" />
              {/* Bar 2 - centered at 67% */}
              <rect x="57" y="40" width="35" height="80" rx="4" ry="4" fill="var(--border-hover)" />
            </svg>
            {/* X-axis labels - positioned to match SVG bars */}
            <div style={{ position: 'absolute', left: 40, bottom: 0, width: 'calc(100% - 50px)', height: 12 }}>
              {/* Label 1 - matches bar at x=8, width=35 (centered at 25.5%) */}
              <div style={{
                position: 'absolute',
                left: '8%',
                width: '35%',
                height: 12,
                borderRadius: 2,
                background: 'linear-gradient(90deg, var(--border-default) 25%, var(--border-hover) 50%, var(--border-default) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite ease-in-out',
                opacity: 0.6
              }} />
              {/* Label 2 - matches bar at x=57, width=35 (centered at 74.5%) */}
              <div style={{
                position: 'absolute',
                left: '57%',
                width: '35%',
                height: 12,
                borderRadius: 2,
                background: 'linear-gradient(90deg, var(--border-default) 25%, var(--border-hover) 50%, var(--border-default) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite ease-in-out',
                animationDelay: '0.05s',
                opacity: 0.6
              }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Measure text width using canvas
let measureCanvas: HTMLCanvasElement | null = null;
function getTextWidth(text: string, font: string): number {
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
  }
  const context = measureCanvas.getContext('2d');
  if (!context) return text.length * 7; // fallback
  context.font = font;
  return context.measureText(text).width;
}

// Truncate headsign text by pixel width
function truncateHeadsign(headsign: string, maxWidth: number, font: string = '12px system-ui, sans-serif'): string {
  if (typeof document === 'undefined') {
    // SSR fallback - use character count
    const charLimit = Math.floor(maxWidth / 7);
    if (headsign.length <= charLimit) return headsign;
    return headsign.substring(0, charLimit - 1) + '…';
  }

  const textWidth = getTextWidth(headsign, font);
  if (textWidth <= maxWidth) return headsign;

  // Binary search for the right truncation point
  let low = 0;
  let high = headsign.length;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const truncated = headsign.substring(0, mid) + '…';
    if (getTextWidth(truncated, font) <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low === 0 ? '…' : headsign.substring(0, low) + '…';
}

// Custom Y-axis tick component for horizontal chart - left aligned
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomYAxisTick = ({ y, payload, visibleTicksCount }: any) => {
  // Position text at fixed x from left edge, left-aligned
  void visibleTicksCount; // unused but passed by recharts
  return (
    <g transform={`translate(0,${y})`}>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="start"
        fill="var(--text-tertiary)"
        style={{ fontSize: 'var(--caption-size)' }}
      >
        {payload.value}
      </text>
    </g>
  );
};

export default function ByPatternChart({ data, comparisonData, metric, loading = false, onPatternClick, selectedPattern, swapped = false }: ByPatternChartProps) {
  const [borderDefault, setBorderDefault] = useState('#D4C9BA');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(300); // Default fallback

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBorderDefault(getComputedStyle(document.documentElement).getPropertyValue('--border-default').trim());
    }
  }, []);

  // Measure container width for dynamic label truncation
  useEffect(() => {
    if (containerRef.current) {
      const updateWidth = () => {
        if (containerRef.current) {
          // Account for padding (16px each side) and some margin
          setContainerWidth(containerRef.current.offsetWidth - 32);
        }
      };
      updateWidth();

      const resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // Determine if we should use horizontal layout (more than 2 patterns)
  const isHorizontal = data.length > 2;

  // Calculate dynamic height based on number of patterns for horizontal layout
  // Increase height for comparison mode to accommodate grouped bars
  const isComparisonMode = !!comparisonData && comparisonData.length > 0;
  const chartHeight = isHorizontal
    ? Math.max(120, data.length * (isComparisonMode ? 48 : 36))
    : (isComparisonMode ? 200 : 160);

  // Calculate max label width based on container width and number of patterns
  const maxLabelWidth = useMemo(() => {
    if (isHorizontal) {
      return 70; // Fixed width for horizontal layout (Y-axis labels)
    }
    // For vertical layout, divide available width by number of patterns
    // Account for Y-axis (40px) and some spacing between labels
    const availableWidth = containerWidth - 40;
    const widthPerLabel = Math.floor(availableWidth / Math.max(data.length, 1));
    // Leave some padding between labels (at least 10px gap)
    return Math.max(40, widthPerLabel - 10);
  }, [isHorizontal, containerWidth, data.length]);

  // Prepare chart data with truncated labels
  // Merge with comparison data if in comparison mode
  const chartData = useMemo(() => {
    if (isComparisonMode) {
      // Build a map of comparison values by headsign
      const comparisonMap = new Map<string, number>();
      comparisonData?.forEach(d => {
        comparisonMap.set(d.headsign, d.value);
      });

      return data.map(d => ({
        ...d,
        displayName: truncateHeadsign(d.headsign, maxLabelWidth),
        fullName: d.headsign,
        value1: swapped ? (comparisonMap.get(d.headsign) ?? 0) : d.value,
        value2: swapped ? d.value : (comparisonMap.get(d.headsign) ?? 0)
      }));
    }
    return data.map(d => ({
      ...d,
      displayName: truncateHeadsign(d.headsign, maxLabelWidth),
      fullName: d.headsign
    }));
  }, [data, comparisonData, maxLabelWidth, isComparisonMode, swapped]);

  // Show skeleton when loading
  if (loading) {
    return <ByPatternChartSkeleton patternCount={data.length || 2} />;
  }

  // Don't show if no data or only one pattern (when filtered by pattern)
  if (!data || data.length === 0) {
    return null;
  }

  // Custom click handler for bars
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBarClick = (data: any) => {
    if (onPatternClick && data?.fullName) {
      // If clicking the already selected pattern, deselect it
      if (selectedPattern === data.fullName) {
        onPatternClick('all');
      } else {
        onPatternClick(data.fullName);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: 'var(--border-width) solid var(--border-default)',
        borderRadius: 'var(--radius-default)',
        padding: '16px',
        marginBottom: '8px',
        overflow: 'visible'
      }}>
      <div style={{
        fontSize: 'var(--body-regular-size)',
        fontWeight: 'var(--font-normal)',
        color: 'var(--text-tertiary)',
        marginBottom: 'var(--space-4)'
      }}>
        By Pattern
      </div>
      <ResponsiveContainer width="100%" height={chartHeight} style={{ overflow: 'visible' }}>
        {isHorizontal ? (
          // Horizontal bar chart for many patterns
          <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 10, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke="var(--border-default)" strokeWidth={0.5} horizontal={false} />
            <defs>
              <linearGradient id="barCursorPatternH" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={borderDefault} stopOpacity={0.1} />
                <stop offset="100%" stopColor={borderDefault} stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <YAxis
              dataKey="displayName"
              type="category"
              tick={<CustomYAxisTick />}
              axisLine={{ stroke: 'var(--border-default)' }}
              tickLine={false}
              width={80}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 'var(--caption-size)', fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => value === 0 ? '0' : value >= 1000 ? `${(value / 1000).toFixed(0)}K` : String(value)}
              allowDuplicatedCategory={false}
            />
            <Tooltip
              content={<PortalTooltipContent metricLabel={metric} isComparisonMode={isComparisonMode} />}
              wrapperStyle={{ visibility: 'hidden' }}
              cursor={{ fill: `url(#barCursorPatternH)` }}
            />
            {isComparisonMode ? (
              <>
                <Bar
                  dataKey="value1"
                  name="Date-time 1"
                  fill={DATETIME_1_COLOR}
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                  onClick={handleBarClick}
                  cursor={onPatternClick ? 'pointer' : 'default'}
                />
                <Bar
                  dataKey="value2"
                  name="Date-time 2"
                  fill={DATETIME_2_COLOR}
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                  onClick={handleBarClick}
                  cursor={onPatternClick ? 'pointer' : 'default'}
                />
              </>
            ) : (
              <Bar
                dataKey="value"
                fill="var(--border-hover)"
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
                onClick={handleBarClick}
                cursor={onPatternClick ? 'pointer' : 'default'}
              />
            )}
          </BarChart>
        ) : (
          // Vertical bar chart for 2 patterns
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke="var(--border-default)" strokeWidth={0.5} vertical={false} />
            <defs>
              <linearGradient id="barCursorPatternV" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={borderDefault} stopOpacity={0.1} />
                <stop offset="100%" stopColor={borderDefault} stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="displayName"
              tick={{ fontSize: 'var(--caption-size)', fill: 'var(--text-tertiary)' }}
              axisLine={{ stroke: 'var(--border-default)' }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 'var(--caption-size)', fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => value === 0 ? '0' : value >= 1000 ? `${(value / 1000).toFixed(0)}K` : String(value)}
              width={40}
            />
            <Tooltip
              content={<PortalTooltipContent metricLabel={metric} isComparisonMode={isComparisonMode} />}
              wrapperStyle={{ visibility: 'hidden' }}
              cursor={{ fill: `url(#barCursorPatternV)` }}
            />
            {isComparisonMode ? (
              <>
                <Bar
                  dataKey="value1"
                  name="Date-time 1"
                  fill={DATETIME_1_COLOR}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  onClick={handleBarClick}
                  cursor={onPatternClick ? 'pointer' : 'default'}
                />
                <Bar
                  dataKey="value2"
                  name="Date-time 2"
                  fill={DATETIME_2_COLOR}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  onClick={handleBarClick}
                  cursor={onPatternClick ? 'pointer' : 'default'}
                />
              </>
            ) : (
              <Bar
                dataKey="value"
                fill="var(--border-hover)"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
                onClick={handleBarClick}
                cursor={onPatternClick ? 'pointer' : 'default'}
              />
            )}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
