import { DATETIME_1_COLOR, DATETIME_2_COLOR } from '@/utils/comparisonColors';

interface ComparisonLegendProps {
  label1?: string;
  label2?: string;
  orientation?: 'horizontal' | 'vertical';
}

export default function ComparisonLegend({
  label1 = 'Date-time 1',
  label2 = 'Date-time 2',
  orientation = 'horizontal'
}: ComparisonLegendProps) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <div style={{
      display: 'flex',
      flexDirection: isHorizontal ? 'row' : 'column',
      alignItems: isHorizontal ? 'center' : 'flex-start',
      gap: isHorizontal ? '16px' : '8px',
      padding: '8px 12px',
      backgroundColor: 'var(--bg-elevated)',
      borderRadius: 'var(--radius-sm)',
      border: 'var(--border-width) solid var(--border-default)'
    }}>
      {/* Date-time 1 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: DATETIME_1_COLOR,
          flexShrink: 0
        }} />
        <span style={{
          fontSize: 'var(--caption-size)',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap'
        }}>
          {label1}
        </span>
      </div>

      {/* Date-time 2 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: DATETIME_2_COLOR,
          flexShrink: 0
        }} />
        <span style={{
          fontSize: 'var(--caption-size)',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap'
        }}>
          {label2}
        </span>
      </div>
    </div>
  );
}
