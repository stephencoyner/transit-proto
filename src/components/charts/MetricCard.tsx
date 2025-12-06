interface MetricCardProps {
  value: string | number;
  title?: string;
  loading?: boolean;
}

// Shimmer animation styles - unique name to avoid conflicts
const shimmerStyles = `
  @keyframes metricCardShimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
`;

// Loading skeleton component
const MetricCardSkeleton = () => (
  <div style={{
    backgroundColor: 'var(--bg-elevated)',
    border: 'var(--border-width) solid var(--border-default)',
    borderRadius: 'var(--radius-default)',
    padding: '16px',
    marginBottom: '8px'
  }}>
    <style>{shimmerStyles}</style>
    {/* Title skeleton */}
    <div style={{
      height: 14,
      width: 140,
      borderRadius: 2,
      marginBottom: 'var(--space-2)',
      background: 'linear-gradient(90deg, var(--border-default) 25%, var(--border-hover) 50%, var(--border-default) 75%)',
      backgroundSize: '200% 100%',
      animation: 'metricCardShimmer 1.5s infinite ease-in-out',
      opacity: 0.6
    }} />
    {/* Value skeleton */}
    <div style={{
      height: 32,
      width: 100,
      borderRadius: 4,
      background: 'linear-gradient(90deg, var(--border-default) 25%, var(--border-hover) 50%, var(--border-default) 75%)',
      backgroundSize: '200% 100%',
      animation: 'metricCardShimmer 1.5s infinite ease-in-out',
      animationDelay: '0.1s',
      opacity: 0.6
    }} />
  </div>
);

export default function MetricCard({ value, title = 'Average daily boardings', loading = false }: MetricCardProps) {
  if (loading) {
    return <MetricCardSkeleton />;
  }

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
