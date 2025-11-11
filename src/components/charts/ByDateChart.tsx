import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartDataPoint {
  date: string;
  value: number;
  [key: string]: string | number;
}

export default function ByDateChart({ data, gradientId }: { data: ChartDataPoint[], gradientId: string }) {
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
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--btn-primary)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--btn-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="0" stroke="var(--border-default)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 'var(--caption-size)', fill: 'var(--text-tertiary)' }}
            axisLine={{ stroke: 'var(--border-default)' }}
            tickLine={false}
            hide
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
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--btn-primary)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            animationDuration={300}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
