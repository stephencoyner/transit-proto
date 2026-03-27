// Comparison Mode Color Constants
import { ACCENT_UI, ACCENT_UI_2 } from '@/lib/uiAccent';

// Date-time range indicator colors — driven by accent tokens in src/lib/uiAccent.ts
export const DATETIME_1_COLOR = ACCENT_UI;
export const DATETIME_2_COLOR = ACCENT_UI_2;

// Percentage change pill colors
export const POSITIVE_PILL_BG = '#E3F4EF';
export const POSITIVE_PILL_TEXT = '#1B5A3C';
export const NEGATIVE_PILL_BG = '#FBE6E9';
export const NEGATIVE_PILL_TEXT = '#D31028';

// Comparison map scale (red-yellow-green for difference visualization)
// Ordered from most negative to most positive
export const COMPARISON_SCALE_COLORS = [
  '#952E07',  // max decrease (dark red)
  '#C3481D',  // medium decrease
  '#E47145',  // low decrease
  '#D4A017',  // no change (golden amber/neutral)
  '#87C5AC',  // low increase
  '#37846A',  // medium increase
  '#23634F',  // max increase (dark green)
] as const;

// Get color from comparison scale based on difference value
export function getComparisonColor(
  difference: number,
  minDiff: number,
  maxDiff: number
): string {
  // Handle edge case where there's no range
  if (minDiff === maxDiff) {
    return COMPARISON_SCALE_COLORS[3]; // neutral yellow
  }

  // Normalize difference to -1 to 1 range
  let normalized: number;
  if (difference === 0) {
    normalized = 0;
  } else if (difference < 0) {
    // Negative values: map minDiff to -1, 0 to 0
    normalized = minDiff === 0 ? 0 : difference / Math.abs(minDiff);
  } else {
    // Positive values: map 0 to 0, maxDiff to 1
    normalized = maxDiff === 0 ? 0 : difference / maxDiff;
  }

  // Clamp to -1 to 1 range
  normalized = Math.max(-1, Math.min(1, normalized));

  // Map normalized value to color index (0-6)
  // -1 -> 0, 0 -> 3, 1 -> 6
  const colorIndex = Math.round((normalized + 1) * 3);

  return COMPARISON_SCALE_COLORS[Math.max(0, Math.min(6, colorIndex))];
}

// Get RGB array from comparison color (for DeckGL)
export function getComparisonColorRGB(
  difference: number,
  minDiff: number,
  maxDiff: number
): [number, number, number, number] {
  const hex = getComparisonColor(difference, minDiff, maxDiff);
  return hexToRGBA(hex);
}

// Convert hex color to RGBA array
export function hexToRGBA(hex: string): [number, number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16),
      255
    ];
  }
  return [128, 128, 128, 255]; // fallback gray
}

// Calculate percentage change between two values
export function calculatePercentChange(current: number, comparison: number): number {
  if (comparison === 0) {
    // Avoid divide by zero
    return current > 0 ? 100 : current < 0 ? -100 : 0;
  }
  return Math.round(((current - comparison) / comparison) * 100);
}

// Format percentage for display
export function formatPercentChange(percent: number): string {
  if (percent > 0) {
    return `+${percent}%`;
  }
  return `${percent}%`;
}
