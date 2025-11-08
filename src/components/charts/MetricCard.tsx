export default function MetricCard({ value }: { value: string | number }) {
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
        color: 'var(--text-tertiary)',
        marginBottom: 'var(--space-1)'
      }}>
        Average daily boardings
      </div>
      <div style={{
        fontSize: 'var(--data-large-size)',
        fontWeight: 'var(--data-large-weight)',
        color: 'var(--text-primary)',
        lineHeight: '1'
      }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
