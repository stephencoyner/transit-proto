import { DATETIME_1_COLOR, DATETIME_2_COLOR, calculatePercentChange, formatPercentChange, POSITIVE_PILL_BG, POSITIVE_PILL_TEXT, NEGATIVE_PILL_BG, NEGATIVE_PILL_TEXT } from '@/utils/comparisonColors';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    name: string;
    dataKey: string;
    color?: string;
  }>;
  label?: string;
  isComparisonMode?: boolean;
}

export default function CustomTooltip({ active, payload, label, isComparisonMode }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  // Comparison mode - show both values and percentage change
  if (isComparisonMode && payload.length >= 2) {
    const value1 = payload.find(p => p.dataKey === 'value1')?.value ?? payload[0].value;
    const value2 = payload.find(p => p.dataKey === 'value2')?.value ?? payload[1].value;
    const percentChange = calculatePercentChange(value1, value2);
    const isPositive = percentChange > 0;
    const isNegative = percentChange < 0;

    return (
      <div
        style={{
          backgroundColor: 'var(--btn-primary)',
          color: 'var(--text-btn-primary)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.75rem',
          fontWeight: 500,
          lineHeight: '1rem',
          letterSpacing: '0.01em',
          padding: '8px 12px',
          boxShadow: 'var(--shadow-lg)',
          pointerEvents: 'none',
          minWidth: '160px'
        }}
      >
        {label && <div style={{ marginBottom: '6px', fontWeight: 600 }}>{label}</div>}

        {/* Date-time 1 row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: DATETIME_1_COLOR,
            flexShrink: 0
          }} />
          <span>{value1.toLocaleString()}</span>
        </div>

        {/* Date-time 2 row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: DATETIME_2_COLOR,
            flexShrink: 0
          }} />
          <span>{value2.toLocaleString()}</span>
        </div>

        {/* Percentage change pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: '12px',
          backgroundColor: isPositive ? POSITIVE_PILL_BG : isNegative ? NEGATIVE_PILL_BG : 'var(--bg-secondary)',
          color: isPositive ? POSITIVE_PILL_TEXT : isNegative ? NEGATIVE_PILL_TEXT : 'var(--text-secondary)',
          fontSize: '0.7rem',
          fontWeight: 600
        }}>
          {formatPercentChange(percentChange)}
        </div>
      </div>
    );
  }

  // Normal mode - single value
  const value = payload[0].value;

  return (
    <div
      style={{
        backgroundColor: 'var(--btn-primary)',
        color: 'var(--text-btn-primary)',
        borderRadius: 'var(--radius-sm)',
        fontSize: '0.75rem',
        fontWeight: 500,
        lineHeight: '1rem',
        letterSpacing: '0.01em',
        padding: '8px 12px',
        boxShadow: 'var(--shadow-lg)',
        pointerEvents: 'none'
      }}
    >
      {label && <div>{label}</div>}
      <div>{value.toLocaleString()} average daily boardings</div>
    </div>
  );
}
