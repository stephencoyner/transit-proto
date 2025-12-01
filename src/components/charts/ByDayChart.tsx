import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useState, useEffect, useMemo } from 'react';
import CustomTooltip from './CustomTooltip';
import { DATETIME_1_COLOR, DATETIME_2_COLOR } from '@/utils/comparisonColors';

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

export default function ByDayChart({ data, comparisonData, metric: _metric, selectedDays, swapped = false }: ByDayChartProps) {
  const [borderDefault, setBorderDefault] = useState('#D4C9BA');

  useEffect(() => {
    // Get computed CSS variable values on client side
    if (typeof window !== 'undefined') {
      setBorderDefault(getComputedStyle(document.documentElement).getPropertyValue('--border-default').trim());
    }
  }, []);

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
          <CartesianGrid strokeDasharray="0" stroke="var(--border-default)" strokeWidth={0.5} vertical={false} />
          <defs>
            <linearGradient id="barCursor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={borderDefault} stopOpacity={0.1} />
              <stop offset="100%" stopColor={borderDefault} stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="day"
            tick={{ fontSize: 'var(--caption-size)', fill: 'var(--text-tertiary)' }}
            axisLine={{ stroke: 'var(--border-default)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 'var(--caption-size)', fill: 'var(--text-tertiary)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => value === 0 ? '0' : `${(value / 1000).toFixed(0)}K`}
            width={40}
          />
          <Tooltip
            content={<CustomTooltip isComparisonMode={isComparisonMode} />}
            wrapperStyle={{ zIndex: 9999 }}
            cursor={{ fill: `url(#barCursor)` }}
          />
          {isComparisonMode ? (
            <>
              <Bar
                dataKey="value1"
                name="Date-time 1"
                fill={DATETIME_1_COLOR}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="value2"
                name="Date-time 2"
                fill={DATETIME_2_COLOR}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </>
          ) : (
            <Bar
              dataKey="value"
              fill="var(--border-hover)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
