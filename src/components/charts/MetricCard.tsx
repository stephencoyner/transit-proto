export default function MetricCard({ value, title = 'Average daily boardings' }: { value: string | number; title?: string }) {
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
        marginBottom: 'var(--space-1)'
      }}>
        {title}
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
