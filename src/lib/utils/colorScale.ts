/**
 * Color scale utilities for data-driven visualization
 * Maps metric values to a 7-color gradient scale
 */

// The 7 map colors from globals.css
export const MAP_COLORS: [number, number, number][] = [
  [230, 126, 34],   // --map-1: #E67E22
  [233, 92, 70],    // --map-2: #E95C46
  [220, 44, 126],   // --map-3: #DC2C7E
  [199, 31, 143],   // --map-4: #C71F8F
  [160, 16, 180],   // --map-5: #A010B4
  [127, 26, 163],   // --map-6: #7F1AA3
  [92, 18, 118],    // --map-7: #5C1276
];

/**
 * Maps a value to a color using linear interpolation across the 7-color gradient
 * @param value - The value to map
 * @param min - Minimum value in the dataset
 * @param max - Maximum value in the dataset
 * @returns RGB color array [r, g, b]
 */
export function valueToColor(value: number, min: number, max: number): [number, number, number] {
  // Handle edge cases
  if (max === min) return MAP_COLORS[0];
  if (value <= min) return MAP_COLORS[0];
  if (value >= max) return MAP_COLORS[MAP_COLORS.length - 1];

  // Normalize value to 0-1 range
  const normalized = (value - min) / (max - min);

  // Map to position in color array (0 to 6)
  const position = normalized * (MAP_COLORS.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  // If exactly on a color stop, return that color
  if (lowerIndex === upperIndex) {
    return MAP_COLORS[lowerIndex];
  }

  // Interpolate between the two nearest colors
  const fraction = position - lowerIndex;
  const lowerColor = MAP_COLORS[lowerIndex];
  const upperColor = MAP_COLORS[upperIndex];

  return [
    Math.round(lowerColor[0] + (upperColor[0] - lowerColor[0]) * fraction),
    Math.round(lowerColor[1] + (upperColor[1] - lowerColor[1]) * fraction),
    Math.round(lowerColor[2] + (upperColor[2] - lowerColor[2]) * fraction),
  ];
}

/**
 * Calculate min and max values from a dataset
 * @param values - Array of values
 * @returns Object with min and max values
 */
export function getValueRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) {
    return { min: 0, max: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  return { min, max };
}

/**
 * Generate 5 evenly-spaced labels for the scale
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Array of 5 label values
 */
export function getScaleLabels(min: number, max: number): number[] {
  // Return 5 labels: min, 1/4, 1/2 (middle), 3/4, max
  // These align with: start, between blocks 2-3, middle (between blocks 3-4), between blocks 5-6, end
  const range = max - min;
  return [
    Math.round(min),
    Math.round(min + range / 4),
    Math.round(min + range / 2),
    Math.round(min + (range * 3) / 4),
    Math.round(max),
  ];
}

/**
 * Format a number for display on the scale
 * @param value - The value to format
 * @returns Formatted string
 */
export function formatScaleValue(value: number): string {
  // For values >= 1000, use K notation
  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}K`;
  }
  return value.toString();
}
