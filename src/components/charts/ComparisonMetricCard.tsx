import { DATETIME_1_COLOR, DATETIME_2_COLOR, calculatePercentChange, formatPercentChange, POSITIVE_PILL_BG, POSITIVE_PILL_TEXT, NEGATIVE_PILL_BG, NEGATIVE_PILL_TEXT } from '@/utils/comparisonColors';

interface ComparisonMetricCardProps {
  value1: number;
  value2: number;
  title?: string;
  swapped?: boolean;
}

export default function ComparisonMetricCard({
  value1,
  value2,
  title = 'Average daily boardings',
  swapped = false
}: ComparisonMetricCardProps) {
  // If swapped, display values in reverse order
  const displayValue1 = swapped ? value2 : value1;
  const displayValue2 = swapped ? value1 : value2;
  const percentChange = calculatePercentChange(displayValue1, displayValue2);
  const isPositive = percentChange > 0;
  const isNegative = percentChange < 0;

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
        color: 'var(--text-tertiary)',
        marginBottom: 'var(--space-2)'
      }}>
        {title}
      </div>

      {/* Values row - inline with circles and percent change */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Value 1 with circle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: DATETIME_1_COLOR,
            flexShrink: 0
          }} />
          <span style={{
            fontSize: 'var(--data-large-size)',
            fontWeight: 'var(--data-large-weight)',
            color: 'var(--text-primary)',
            lineHeight: '1'
          }}>
            {displayValue1.toLocaleString()}
          </span>
        </div>

        {/* Percentage change pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: '24px',
          backgroundColor: isPositive ? POSITIVE_PILL_BG : isNegative ? NEGATIVE_PILL_BG : 'var(--bg-secondary)',
          color: isPositive ? POSITIVE_PILL_TEXT : isNegative ? NEGATIVE_PILL_TEXT : 'var(--text-secondary)',
          fontSize: 'var(--caption-size)',
          fontWeight: 600,
          marginLeft: '8px',
          marginRight: '20px'
        }}>
          {formatPercentChange(percentChange)}
        </div>

        {/* Value 2 with circle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: DATETIME_2_COLOR,
            flexShrink: 0
          }} />
          <span style={{
            fontSize: 'var(--data-large-size)',
            fontWeight: 'var(--data-large-weight)',
            color: 'var(--text-primary)',
            lineHeight: '1'
          }}>
            {displayValue2.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
