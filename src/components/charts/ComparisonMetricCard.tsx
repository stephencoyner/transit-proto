import { DATETIME_1_COLOR, DATETIME_2_COLOR, calculatePercentChange, formatPercentChange, POSITIVE_PILL_BG, POSITIVE_PILL_TEXT, NEGATIVE_PILL_BG, NEGATIVE_PILL_TEXT } from '@/utils/comparisonColors';

interface ComparisonMetricCardProps {
  value1: number;
  value2: number;
  title?: string;
}

export default function ComparisonMetricCard({
  value1,
  value2,
  title = 'Average daily boardings'
}: ComparisonMetricCardProps) {
  const percentChange = calculatePercentChange(value1, value2);
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
        gap: '8px',
        flexWrap: 'wrap'
      }}>
        {/* Value 1 with circle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <div style={{
            width: '10px',
            height: '10px',
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
            {value1.toLocaleString()}
          </span>
        </div>

        {/* Percentage change pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 10px',
          borderRadius: '12px',
          backgroundColor: isPositive ? POSITIVE_PILL_BG : isNegative ? NEGATIVE_PILL_BG : 'var(--bg-secondary)',
          color: isPositive ? POSITIVE_PILL_TEXT : isNegative ? NEGATIVE_PILL_TEXT : 'var(--text-secondary)',
          fontSize: 'var(--caption-size)',
          fontWeight: 600
        }}>
          {formatPercentChange(percentChange)}
        </div>

        {/* Value 2 with circle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <div style={{
            width: '10px',
            height: '10px',
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
            {value2.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
