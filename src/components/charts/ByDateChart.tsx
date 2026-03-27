import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useMemo } from 'react';
import CustomTooltip from './CustomTooltip';
import { DATETIME_1_COLOR, DATETIME_2_COLOR } from '@/utils/comparisonColors';

interface ChartDataPoint {
  date: string;
  value: number;
  [key: string]: string | number;
}

interface ByDateChartProps {
  data: ChartDataPoint[];
  comparisonData?: ChartDataPoint[];
  gradientId: string;
  metric?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  comparisonStartDate?: Date | null;
  comparisonEndDate?: Date | null;
  swapped?: boolean;
  loading?: boolean;
}

// Helper to format a single date
const formatSingleDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Helper to format a week range
const formatWeekRange = (startDate: Date, endDate: Date): string => {
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();

  if (sameMonth) {
    // Same month: "Jun 1 - 8, 2025"
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.getDate()}, ${endDate.getFullYear()}`;
  } else if (sameYear) {
    // Different month, same year: "Jun 1 - Jul 8, 2025"
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${endDate.getFullYear()}`;
  } else {
    // Different year: "Dec 25, 2024 - Jan 1, 2025"
    return `${formatSingleDate(startDate)} - ${formatSingleDate(endDate)}`;
  }
};

// Generate date labels based on date range
const generateDateLabels = (
  dataLength: number,
  startDate: Date | null | undefined,
  endDate: Date | null | undefined
): string[] => {
  if (!startDate || !endDate) {
    // Fallback to "Day 1", "Day 2", etc. if no dates provided
    return Array.from({ length: dataLength }, (_, i) => `Day ${i + 1}`);
  }

  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  if (diffDays <= 30) {
    // Show individual dates (e.g., "Oct 13, 2025")
    return Array.from({ length: dataLength }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      return formatSingleDate(date);
    });
  } else {
    // Show weekly ranges (e.g., "Jun 1 - Jun 8, 2025")
    const weeksCount = dataLength;
    const daysPerWeek = Math.ceil(diffDays / weeksCount);

    return Array.from({ length: weeksCount }, (_, i) => {
      const weekStart = new Date(startDate);
      weekStart.setDate(startDate.getDate() + (i * daysPerWeek));

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + daysPerWeek - 1);

      // Don't go past the end date
      if (weekEnd > endDate) {
        weekEnd.setTime(endDate.getTime());
      }

      return formatWeekRange(weekStart, weekEnd);
    });
  }
};

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
const ByDateChartSkeleton = () => (
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
      width: 60,
      borderRadius: 2,
      marginBottom: 'var(--space-4)',
      background: 'linear-gradient(90deg, rgba(155, 139, 180, 0.08) 25%, rgba(155, 139, 180, 0.15) 50%, rgba(155, 139, 180, 0.08) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite ease-in-out',
      opacity: 0.6
    }} />
    <div style={{ width: '100%', height: 200, position: 'relative' }}>
      {/* Y-axis area */}
      <div style={{ position: 'absolute', left: 0, top: 10, width: 40, height: 'calc(100% - 26px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            height: 8,
            width: 24,
            borderRadius: 2,
            background: 'linear-gradient(90deg, rgba(155, 139, 180, 0.08) 25%, rgba(155, 139, 180, 0.15) 50%, rgba(155, 139, 180, 0.08) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite ease-in-out',
            animationDelay: `${i * 0.1}s`,
            opacity: 0.6
          }} />
        ))}
      </div>
      {/* Chart area with wave shape */}
      <svg style={{ position: 'absolute', left: 40, top: 10, width: 'calc(100% - 50px)', height: 'calc(100% - 26px)', animation: 'shimmerSvg 1.5s infinite ease-in-out' }} viewBox="0 0 300 174" preserveAspectRatio="none">
        <defs>
          <linearGradient id="skeletonGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9B8BB4" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#9B8BB4" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        {/* Horizontal grid lines */}
        <line x1="0" y1="0" x2="300" y2="0" stroke="rgba(155, 139, 180, 0.2)" strokeWidth="0.5" />
        <line x1="0" y1="58" x2="300" y2="58" stroke="rgba(155, 139, 180, 0.2)" strokeWidth="0.5" />
        <line x1="0" y1="116" x2="300" y2="116" stroke="rgba(155, 139, 180, 0.2)" strokeWidth="0.5" />
        <line x1="0" y1="174" x2="300" y2="174" stroke="rgba(155, 139, 180, 0.2)" strokeWidth="0.5" />
        {/* Wave area */}
        <path
          d="M0,140 Q50,100 100,120 T200,80 T300,100 L300,174 L0,174 Z"
          fill="url(#skeletonGradient)"
        />
        <path
          d="M0,140 Q50,100 100,120 T200,80 T300,100"
          fill="none"
          stroke="#9B8BB4"
          strokeWidth="2"
        />
      </svg>
    </div>
  </div>
);

export default function ByDateChart({ data, comparisonData, gradientId, metric, startDate, endDate, comparisonStartDate, comparisonEndDate, swapped = false, loading = false }: ByDateChartProps) {
  // All hooks must be called before any early returns
  // Generate proper date labels based on the date range
  const dateLabels = generateDateLabels(data.length, startDate, endDate);
  const comparisonDateLabels = generateDateLabels(comparisonData?.length || data.length, comparisonStartDate, comparisonEndDate);

  // Update data with proper date labels
  const chartData = useMemo(() => {
    if (!comparisonData) {
      return data.map((point, index) => ({
        ...point,
        date: dateLabels[index] || point.date
      }));
    }

    // Merge primary and comparison data for dual-line chart
    // If swapped, reverse which data goes to value1 vs value2
    // Include both date labels for tooltip display
    return data.map((point, index) => ({
      date: dateLabels[index] || point.date,
      date2: comparisonDateLabels[index] || comparisonData[index]?.date || '',
      value1: swapped ? (comparisonData[index]?.value ?? 0) : point.value,
      value2: swapped ? point.value : (comparisonData[index]?.value ?? 0)
    }));
  }, [data, comparisonData, dateLabels, comparisonDateLabels, swapped]);

  const isComparisonMode = !!comparisonData;

  // Determine which dataset is larger (should be rendered first/behind)
  const value1Total = useMemo(() => {
    if (!isComparisonMode) return 0;
    return chartData.reduce((sum, point) => sum + ((point as { value1?: number }).value1 || 0), 0);
  }, [chartData, isComparisonMode]);

  const value2Total = useMemo(() => {
    if (!isComparisonMode) return 0;
    return chartData.reduce((sum, point) => sum + ((point as { value2?: number }).value2 || 0), 0);
  }, [chartData, isComparisonMode]);

  // Render larger dataset first (behind), smaller dataset last (on top)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const value1IsLarger = value1Total >= value2Total;

  // Show skeleton when loading (after all hooks)
  if (loading) {
    return <ByDateChartSkeleton />;
  }

  // Hide chart if only 1 date (startDate equals endDate)
  if (startDate && endDate && startDate.getTime() === endDate.getTime()) {
    return null;
  }

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
        By Date
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 16 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9B8BB4" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#9B8BB4" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id={`${gradientId}-primary`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={DATETIME_1_COLOR} stopOpacity={0.4} />
              <stop offset="100%" stopColor={DATETIME_1_COLOR} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id={`${gradientId}-comparison`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={DATETIME_2_COLOR} stopOpacity={0.4} />
              <stop offset="100%" stopColor={DATETIME_2_COLOR} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(155, 139, 180, 0.2)" strokeWidth={0.5} strokeOpacity={0.6} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 'var(--caption-size)', fill: 'var(--text-secondary)', fontWeight: 500 }}
            axisLine={{ stroke: 'rgba(155, 139, 180, 0.2)', strokeOpacity: 0.6 }}
            tickLine={false}
            hide
          />
          <YAxis
            tick={{ fontSize: 'var(--caption-size)', fill: 'var(--text-secondary)', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => value === 0 ? '0' : value >= 1000 ? `${(value / 1000).toFixed(0)}K` : String(value)}
            width={40}
            domain={[0, 'auto']}
          />
          <Tooltip
            content={<CustomTooltip isComparisonMode={isComparisonMode} metricLabel={metric} />}
            wrapperStyle={{ zIndex: 9999 }}
          />
          {isComparisonMode ? (
            <>
              {/* Render larger dataset first (behind), smaller dataset last (on top) */}
              <Area
                type="monotone"
                dataKey="value1"
                name="Date-time 1"
                stroke={DATETIME_1_COLOR}
                strokeOpacity={1}
                strokeWidth={4}
                fill="none"
                isAnimationActive={false}
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Area
                type="monotone"
                dataKey="value2"
                name="Date-time 2"
                stroke={DATETIME_2_COLOR}
                strokeOpacity={1}
                strokeWidth={4}
                fill="none"
                isAnimationActive={false}
                animationDuration={500}
                animationEasing="ease-out"
              />
            </>
          ) : (
            <Area
              type="monotone"
              dataKey="value"
              stroke="#9B8BB4"
              strokeOpacity={0.4}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
              animationDuration={500}
              animationEasing="ease-out"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
