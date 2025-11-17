import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { useState, useEffect } from 'react';
import CustomTooltip from './CustomTooltip';

interface DayDataPoint {
  day: string;
  value: number;
  [key: string]: string | number;
}

export default function ByDayChart({ data, average, metric }: { data: DayDataPoint[], average: number, metric?: string }) {
  const [borderDefault, setBorderDefault] = useState('#D4C9BA');

  useEffect(() => {
    // Get computed CSS variable values on client side
    if (typeof window !== 'undefined') {
      setBorderDefault(getComputedStyle(document.documentElement).getPropertyValue('--border-default').trim());
    }
  }, []);

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
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
            width={40}
          />
          <Tooltip
            content={<CustomTooltip />}
            wrapperStyle={{ zIndex: 9999 }}
            cursor={{ fill: `url(#barCursor)` }}
          />
          <Bar
            dataKey="value"
            fill="var(--border-hover)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <ReferenceLine
            y={average}
            stroke="var(--text-tertiary)"
            strokeWidth={2}
            strokeDasharray="0"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
