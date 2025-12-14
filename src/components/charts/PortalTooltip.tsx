import { createPortal } from 'react-dom';
import { useEffect, useState, useCallback } from 'react';
import CustomTooltip from './CustomTooltip';

interface PortalTooltipContentProps {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
  coordinate?: { x: number; y: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewBox?: any;
  metricLabel?: string;
  isComparisonMode?: boolean;
}

/**
 * Portal-based tooltip for Recharts that renders to document.body
 * to escape overflow:hidden/auto containers
 */
export default function PortalTooltipContent({
  active,
  payload,
  label,
  metricLabel,
  isComparisonMode
}: PortalTooltipContentProps) {
  const [mounted, setMounted] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Track mouse position globally
  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (active) {
      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
    }
  }, [active, handleMouseMove]);

  if (!active || !mounted || !payload?.length) {
    return null;
  }

  const tooltipContent = (
    <CustomTooltip
      active={active}
      payload={payload}
      label={label}
      metricLabel={metricLabel}
      isComparisonMode={isComparisonMode}
    />
  );

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: mousePos.x + 12,
        top: mousePos.y - 12,
        zIndex: 99999,
        pointerEvents: 'none',
        transform: 'translateY(-100%)'
      }}
    >
      {tooltipContent}
    </div>,
    document.body
  );
}
