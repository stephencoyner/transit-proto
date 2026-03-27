import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useMemo } from 'react';
import CustomTooltip from './CustomTooltip';
import { DATETIME_1_COLOR, DATETIME_2_COLOR } from '@/utils/comparisonColors';
import { ACCENT_UI, accent, accent2, accentShimmer } from '@/lib/uiAccent';

interface DayDataPoint {
  day: string;
  value: number;
  [key: string]: string | number;
}

interface ByDayChartProps {
  data: DayDataPoint[];
  comparisonData?: DayDataPoint[];
  metric?: string;
  selectedDays?: string[] | null; // null or undefined means all days
  swapped?: boolean;
  loading?: boolean;
}

// Map from full day names to abbreviated names used in data
const dayNameMap: Record<string, string> = {
  'Mon': 'Mon',
  'Tue': 'Tue',
  'Wed': 'Wed',
  'Thu': 'Thu',
  'Fri': 'Fri',
  'Sat': 'Sat',
  'Sun': 'Sun'
};

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
const ByDayChartSkeleton = () => (
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
      width: 50,
      borderRadius: 2,
      marginBottom: 'var(--space-4)',
      background: accentShimmer(),
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite ease-in-out',
      opacity: 0.6
    }} />
    <div style={{ width: '100%', height: CHART_HEIGHT, position: 'relative' }}>
      {/* Y-axis area */}
      <div style={{ position: 'absolute', left: 0, top: 10, width: 40, height: 'calc(100% - 40px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            height: 8,
            width: 24,
            borderRadius: 2,
            background: accentShimmer(),
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite ease-in-out',
            animationDelay: `${i * 0.1}s`,
            opacity: 0.6
          }} />
        ))}
      </div>
      {/* Chart area with vertical bars */}
      <svg style={{ position: 'absolute', left: 40, top: 10, width: 'calc(100% - 50px)', height: 'calc(100% - 40px)', animation: 'shimmerSvg 1.5s infinite ease-in-out' }} viewBox="0 0 280 200" preserveAspectRatio="none">
        {/* Horizontal grid lines */}
        <line x1="0" y1="0" x2="280" y2="0" stroke={accent(0.2)} strokeWidth="0.5" />
        <line x1="0" y1="50" x2="280" y2="50" stroke={accent(0.2)} strokeWidth="0.5" />
        <line x1="0" y1="100" x2="280" y2="100" stroke={accent(0.2)} strokeWidth="0.5" />
        <line x1="0" y1="150" x2="280" y2="150" stroke={accent(0.2)} strokeWidth="0.5" />
        <line x1="0" y1="200" x2="280" y2="200" stroke={accent(0.2)} strokeWidth="0.5" />
        {/* Vertical bars - 7 days */}
        {[0, 1, 2, 3, 4, 5, 6].map(i => {
          const barWidth = 24;
          const gap = 16;
          const x = i * (barWidth + gap) + 8;
          const heights = [120, 140, 130, 150, 135, 80, 70]; // Varied heights for visual interest
          const height = heights[i];
          return (
            <rect
              key={i}
              x={x}
              y={200 - height}
              width={barWidth}
              height={height}
              rx={4}
              ry={4}
              fill={accent(0.15)}
            />
          );
        })}
      </svg>
      {/* X-axis labels */}
      <div style={{ position: 'absolute', left: 40, bottom: 0, width: 'calc(100% - 50px)', display: 'flex', justifyContent: 'space-around' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((_, i) => (
          <div key={i} style={{
            width: 24,
            height: 12,
            borderRadius: 2,
            background: accentShimmer(),
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite ease-in-out',
            animationDelay: `${i * 0.05}s`,
            opacity: 0.6
          }} />
        ))}
      </div>
    </div>
  </div>
);

export default function ByDayChart({ data, comparisonData, metric, selectedDays, swapped = false, loading = false }: ByDayChartProps) {
  // Filter data based on selected days
  const filteredData = selectedDays && selectedDays.length > 0 && selectedDays.length < 7
    ? data.filter(d => selectedDays.includes(dayNameMap[d.day] || d.day))
    : data;

  const filteredComparisonData = comparisonData && selectedDays && selectedDays.length > 0 && selectedDays.length < 7
    ? comparisonData.filter(d => selectedDays.includes(dayNameMap[d.day] || d.day))
    : comparisonData;

  // Merge data for grouped bar chart when in comparison mode
  const chartData = useMemo(() => {
    if (!comparisonData) {
      return filteredData;
    }

    // Merge primary and comparison data by day
    // If swapped, reverse which data goes to value1 vs value2
    return filteredData.map((item, index) => ({
      day: item.day,
      value1: swapped ? (filteredComparisonData?.[index]?.value ?? 0) : item.value,
      value2: swapped ? item.value : (filteredComparisonData?.[index]?.value ?? 0)
    }));
  }, [filteredData, filteredComparisonData, comparisonData, swapped]);

  // Show skeleton when loading (after all hooks)
  if (loading) {
    return <ByDayChartSkeleton />;
  }

  // Hide chart if only 1 day is selected (nothing to compare)
  if (selectedDays && selectedDays.length === 1) {
    return null;
  }

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
        By Day
      </div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={accent(0.2)} strokeWidth={0.5} strokeOpacity={0.6} vertical={false} />
          <defs>
            <linearGradient id="barCursor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT_UI} stopOpacity={0.18} />
              <stop offset="100%" stopColor={ACCENT_UI} stopOpacity={0.08} />
            </linearGradient>
            <linearGradient id="barGradientDay" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT_UI} stopOpacity={0.2} />
              <stop offset="100%" stopColor={ACCENT_UI} stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="day"
            tick={{ fontSize: 'var(--caption-size)', fill: 'var(--text-secondary)', fontWeight: 500 }}
            axisLine={{ stroke: accent(0.2), strokeOpacity: 0.6 }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 'var(--caption-size)', fill: 'var(--text-secondary)', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => value === 0 ? '0' : value >= 1000 ? `${(value / 1000).toFixed(0)}K` : String(value)}
            width={40}
          />
          <Tooltip
            content={<CustomTooltip isComparisonMode={isComparisonMode} metricLabel={metric} />}
            wrapperStyle={{ zIndex: 9999 }}
            cursor={{ fill: `url(#barCursor)` }}
          />
          {isComparisonMode ? (
            <>
              <Bar
                dataKey="value1"
                name="Date-time 1"
                fill={accent(0.4)}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
                animationDuration={400}
                animationEasing="ease-out"
              />
              <Bar
                dataKey="value2"
                name="Date-time 2"
                fill={accent2(0.4)}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
                animationDuration={400}
                animationEasing="ease-out"
              />
            </>
          ) : (
            <Bar
              dataKey="value"
              fill="url(#barGradientDay)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
              animationDuration={400}
              animationEasing="ease-out"
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
