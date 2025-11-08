import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function ByDayChart({ data, average }: { data: any[], average: number }) {
  return (
    <div style={{
      backgroundColor: 'var(--bg-elevated)',
      border: 'var(--border-width) solid var(--border-default)',
      borderRadius: 'var(--radius-default)',
      padding: '16px',
      marginBottom: '12px'
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
          <CartesianGrid strokeDasharray="0" stroke="var(--border-default)" vertical={false} />
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
            contentStyle={{
              backgroundColor: 'var(--bg-elevated)',
              border: 'var(--border-width) solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--caption-size)',
              padding: 'var(--space-2) var(--space-3)'
            }}
            formatter={(value: number) => [value.toLocaleString(), 'Boardings']}
            labelStyle={{ fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)' }}
          />
          <Bar
            dataKey="value"
            fill="var(--btn-primary)"
            radius={[4, 4, 0, 0]}
            animationDuration={300}
          />
          <ReferenceLine
            y={average}
            stroke="var(--border-focus)"
            strokeWidth={2}
            strokeDasharray="0"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
