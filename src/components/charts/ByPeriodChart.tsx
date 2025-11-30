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
}

// Fixed chart height
const CHART_HEIGHT = 240;

export default function ByPeriodChart({
  data,
  comparisonData,
  colors: _colors,
  activePieIndex: _activePieIndex,
  setActivePieIndex: _setActivePieIndex,
  metric: _metric,
  selectedPeriods
}: ByPeriodChartProps) {
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
    return filteredData.map((item, index) => ({
      period: item.period,
      value1: item.value,
      value2: filteredComparisonData?.[index]?.value ?? 0
    }));
  }, [filteredData, filteredComparisonData, comparisonData]);

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
