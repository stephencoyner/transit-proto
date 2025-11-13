interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    name: string;
  }>;
  label?: string;
}

export default function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

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
