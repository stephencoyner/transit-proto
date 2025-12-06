import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import CustomTooltip from './CustomTooltip';
import { DATETIME_1_COLOR, DATETIME_2_COLOR } from '@/utils/comparisonColors';

interface PeriodDataPoint {
  period: string;
  value: number;
  [key: string]: string | number;
}

interface ByPeriodChartProps {
  data: PeriodDataPoint[];
  comparisonData?: PeriodDataPoint[];
  colors: string[];
  activePieIndex: number | null;
  setActivePieIndex: (index: number | null) => void;
  metric?: string;
  selectedPeriods?: string[] | null; // null or undefined means all periods
  swapped?: boolean;
  loading?: boolean;
}

// Fixed chart height
const CHART_HEIGHT = 240;

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

// Loading skeleton component
const ByPeriodChartSkeleton = () => (
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
    <div style={{ width: '100%', height: CHART_HEIGHT, position: 'relative' }}>
      {/* Y-axis labels area */}
      <div style={{ position: 'absolute', left: 0, top: 10, width: 70, height: 'calc(100% - 20px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{
            height: 10,
            width: 50,
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
      <svg style={{ position: 'absolute', left: 70, top: 10, width: 'calc(100% - 80px)', height: 'calc(100% - 20px)', animation: 'shimmerSvg 1.5s infinite ease-in-out' }} viewBox="0 0 200 220" preserveAspectRatio="none">
        {/* Vertical grid lines */}
        <line x1="0" y1="0" x2="0" y2="220" stroke="var(--border-default)" strokeWidth="0.5" />
        <line x1="50" y1="0" x2="50" y2="220" stroke="var(--border-default)" strokeWidth="0.5" />
        <line x1="100" y1="0" x2="100" y2="220" stroke="var(--border-default)" strokeWidth="0.5" />
        <line x1="150" y1="0" x2="150" y2="220" stroke="var(--border-default)" strokeWidth="0.5" />
        <line x1="200" y1="0" x2="200" y2="220" stroke="var(--border-default)" strokeWidth="0.5" />
        {/* Horizontal bars - 6 time periods */}
        {[0, 1, 2, 3, 4, 5].map(i => {
          const barHeight = 24;
          const gap = 12;
          const y = i * (barHeight + gap) + 4;
          const widths = [60, 140, 120, 160, 100, 50]; // Varied widths for visual interest
          const width = widths[i];
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
    </div>
  </div>
);

export default function ByPeriodChart({
  data,
  comparisonData,
  colors: _colors,
  activePieIndex: _activePieIndex,
  setActivePieIndex: _setActivePieIndex,
  metric: _metric,
  selectedPeriods,
  swapped = false,
  loading = false
}: ByPeriodChartProps) {
  // Show skeleton when loading
  if (loading) {
    return <ByPeriodChartSkeleton />;
  }
  const [borderDefault, setBorderDefault] = useState('#D4C9BA');

  useEffect(() => {
    // Get computed CSS variable values on client side
    if (typeof window !== 'undefined') {
      setBorderDefault(getComputedStyle(document.documentElement).getPropertyValue('--border-default').trim());
    }
  }, []);

  // Filter data based on selected periods
  const filteredData = selectedPeriods && selectedPeriods.length > 0 && selectedPeriods.length < 6
    ? data.filter(d => selectedPeriods.includes(d.period))
    : data;

  const filteredComparisonData = comparisonData && selectedPeriods && selectedPeriods.length > 0 && selectedPeriods.length < 6
    ? comparisonData.filter(d => selectedPeriods.includes(d.period))
    : comparisonData;

  // Merge data for grouped bar chart when in comparison mode
  const chartData = useMemo(() => {
    if (!comparisonData) {
      return filteredData;
    }

    // Merge primary and comparison data by period
    // If swapped, reverse which data goes to value1 vs value2
    return filteredData.map((item, index) => ({
      period: item.period,
      value1: swapped ? (filteredComparisonData?.[index]?.value ?? 0) : item.value,
      value2: swapped ? item.value : (filteredComparisonData?.[index]?.value ?? 0)
    }));
  }, [filteredData, filteredComparisonData, comparisonData, swapped]);

  const isComparisonMode = !!comparisonData;

  return (
    <div style={{
      backgroundColor: 'var(--bg-elevated)',
      border: 'var(--border-width) solid var(--border-default)',
      borderRadius: 'var(--radius-default)',
      padding: '16px',
      marginBottom: '8px'
    }}>
      <div style={{
        fontSize: 'var(--body-regular-size)',
        fontWeight: 'var(--font-normal)',
        color: 'var(--text-tertiary)',
        marginBottom: 'var(--space-4)'
      }}>
        By Period
      </div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="0" stroke="var(--border-default)" strokeWidth={0.5} horizontal={false} />
          <defs>
            <linearGradient id="barCursorPeriod" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={borderDefault} stopOpacity={0.1} />
              <stop offset="100%" stopColor={borderDefault} stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <YAxis
            dataKey="period"
            type="category"
            tick={{ fontSize: 'var(--caption-size)', fill: 'var(--text-tertiary)' }}
            axisLine={{ stroke: 'var(--border-default)' }}
            tickLine={false}
            width={70}
          />
          <XAxis
            type="number"
            tick={{ fontSize: 'var(--caption-size)', fill: 'var(--text-tertiary)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => value === 0 ? '0' : `${(value / 1000).toFixed(0)}K`}
          />
          <Tooltip
            content={<CustomTooltip isComparisonMode={isComparisonMode} />}
            wrapperStyle={{ zIndex: 9999 }}
            cursor={{ fill: `url(#barCursorPeriod)` }}
          />
          {isComparisonMode ? (
            <>
              <Bar
                dataKey="value1"
                name="Date-time 1"
                fill={DATETIME_1_COLOR}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="value2"
                name="Date-time 2"
                fill={DATETIME_2_COLOR}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
            </>
          ) : (
            <Bar
              dataKey="value"
              fill="var(--border-hover)"
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
