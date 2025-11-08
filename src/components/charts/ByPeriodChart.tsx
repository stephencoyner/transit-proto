import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface PeriodDataPoint {
  period: string;
  value: number;
  [key: string]: string | number;
}

export default function ByPeriodChart({
  data,
  colors,
  activePieIndex,
  setActivePieIndex
}: {
  data: PeriodDataPoint[],
  colors: string[],
  activePieIndex: number | null,
  setActivePieIndex: (index: number | null) => void
}) {
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
        By Period
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center' }}>
        <ResponsiveContainer width="60%" height={280}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              dataKey="value"
              onMouseEnter={(_, index) => setActivePieIndex(index)}
              onMouseLeave={() => setActivePieIndex(null)}
              animationDuration={300}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={colors[index % colors.length]}
                  stroke="var(--bg-elevated)"
                  strokeWidth={2}
                />
              ))}
            </Pie>
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
            {activePieIndex !== null && (
              <text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: 'var(--data-large-size)', fontWeight: 'var(--font-normal)', fill: 'var(--text-primary)' }}
              >
                {Math.round((data[activePieIndex].value / data.reduce((sum, item) => sum + item.value, 0)) * 100)}%
              </text>
            )}
            {activePieIndex !== null && (
              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: 'var(--body-regular-size)', fontWeight: 'var(--font-normal)', fill: 'var(--text-tertiary)' }}
              >
                {data[activePieIndex].period}
              </text>
            )}
          </PieChart>
        </ResponsiveContainer>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {data.map((item, index) => (
            <div
              key={item.period}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                cursor: 'pointer',
                opacity: activePieIndex === null || activePieIndex === index ? 1 : 0.5
              }}
              onMouseEnter={() => setActivePieIndex(index)}
              onMouseLeave={() => setActivePieIndex(null)}
            >
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: colors[index % colors.length]
                }}
              />
              <span style={{ fontSize: 'var(--body-regular-size)', color: 'var(--text-primary)' }}>{item.period}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
