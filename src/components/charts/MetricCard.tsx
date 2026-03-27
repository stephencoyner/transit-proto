import { accentShimmer } from '@/lib/uiAccent';

interface MetricCardProps {
  value: string | number;
  title?: string;
  loading?: boolean;
  valueLoading?: boolean; // Show title but shimmer for value only
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
      background: accentShimmer(),
      backgroundSize: '200% 100%',
      animation: 'metricCardShimmer 1.5s infinite ease-in-out',
      opacity: 0.6
    }} />
    {/* Value skeleton */}
    <div style={{
      height: 32,
      width: 100,
      borderRadius: 4,
      background: accentShimmer(),
      backgroundSize: '200% 100%',
      animation: 'metricCardShimmer 1.5s infinite ease-in-out',
      animationDelay: '0.1s',
      opacity: 0.6
    }} />
  </div>
);

// Value-only skeleton (shows title, shimmer for value)
const ValueSkeleton = () => (
  <>
    <style>{shimmerStyles}</style>
    <div style={{
      height: 24,
      width: 80,
      borderRadius: 4,
      background: accentShimmer(),
      backgroundSize: '200% 100%',
      animation: 'metricCardShimmer 1.5s infinite ease-in-out',
      opacity: 0.6
    }} />
  </>
);

export default function MetricCard({ value, title = 'Average daily boardings', loading = false, valueLoading = false }: MetricCardProps) {
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
        {valueLoading ? <ValueSkeleton /> : (typeof value === 'number' ? value.toLocaleString() : value)}
      </div>
    </div>
  );
}
