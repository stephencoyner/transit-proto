import { DATETIME_1_COLOR, DATETIME_2_COLOR, calculatePercentChange, formatPercentChange, POSITIVE_PILL_BG, POSITIVE_PILL_TEXT, NEGATIVE_PILL_BG, NEGATIVE_PILL_TEXT } from '@/utils/comparisonColors';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    name: string;
    dataKey: string;
    color?: string;
    payload?: {
      fullName?: string;
      date2?: string;
      [key: string]: unknown;
    };
  }>;
  label?: string;
  isComparisonMode?: boolean;
  metricLabel?: string;
}

export default function CustomTooltip({ active, payload, label, isComparisonMode, metricLabel = 'average daily boardings' }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  // Use fullName from payload data if available (for pattern charts with truncated labels)
  const displayLabel = payload[0]?.payload?.fullName || label;

  // Comparison mode - show both values and percentage change
  if (isComparisonMode && payload.length >= 2) {
    const value1 = payload.find(p => p.dataKey === 'value1')?.value ?? payload[0].value;
    const value2 = payload.find(p => p.dataKey === 'value2')?.value ?? payload[1].value;
    const date2 = payload[0]?.payload?.date2;
    const percentChange = calculatePercentChange(value1, value2);
    const isPositive = percentChange > 0;
    const isNegative = percentChange < 0;

    return (
      <div
        style={{
          backgroundColor: 'white',
          color: 'var(--text-tertiary)',
          border: '0.5px solid var(--border-default)',
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
        {/* Date-time 1 label and value with percentage change */}
        {displayLabel && <div style={{ marginBottom: '2px', fontWeight: 600, color: 'var(--text-secondary)' }}>{displayLabel}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: DATETIME_1_COLOR,
            flexShrink: 0
          }} />
          <span style={{ color: 'var(--text-tertiary)' }}>{value1.toLocaleString()}</span>
          {/* Percentage change pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '1px 6px',
            borderRadius: '12px',
            backgroundColor: isPositive ? POSITIVE_PILL_BG : isNegative ? NEGATIVE_PILL_BG : 'var(--bg-secondary)',
            color: isPositive ? POSITIVE_PILL_TEXT : isNegative ? NEGATIVE_PILL_TEXT : 'var(--text-secondary)',
            fontSize: '0.65rem',
            fontWeight: 600,
            marginLeft: '2px'
          }}>
            {formatPercentChange(percentChange)}
          </div>
        </div>

        {/* Date-time 2 label and value */}
        {date2 && <div style={{ marginBottom: '2px', fontWeight: 600, color: 'var(--text-secondary)' }}>{date2}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: DATETIME_2_COLOR,
            flexShrink: 0
          }} />
          <span style={{ color: 'var(--text-tertiary)' }}>{value2.toLocaleString()}</span>
        </div>
      </div>
    );
  }

  // Normal mode - single value
  const value = payload[0].value;

  return (
    <div
      style={{
        backgroundColor: 'var(--accent-ui-text)',
        color: 'white',
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
      {displayLabel && <div>{displayLabel}</div>}
      <div>{value.toLocaleString()} {metricLabel.toLowerCase()}</div>
    </div>
  );
}
