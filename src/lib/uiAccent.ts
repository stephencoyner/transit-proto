/**
 * Single source of truth for UI accent colors.
 * Used in: nav indicators, segmented controls, charts, comparison mode.
 * Change values here to update everywhere.
 */
export const ACCENT_UI = '#8880C4';
export const ACCENT_UI_RGB = '136, 128, 196';
export const ACCENT_UI_TEXT = '#3D2E6B';

/** Date range 2 accent — used in comparison mode charts/legends */
export const ACCENT_UI_2 = '#C4956A';
export const ACCENT_UI_2_RGB = '196, 149, 106';

/**
 * Opaque equivalents of each accent at 50% opacity blended over white (#FFF).
 * Use these when transparency isn't possible (e.g. overlapping SVG strokes).
 * Formula: channel * 0.5 + 255 * 0.5
 */
export const ACCENT_UI_ON_WHITE = '#C4C0E2';   // #8880C4 @ 50% on white
export const ACCENT_UI_2_ON_WHITE = '#E2CAB5'; // #C4956A @ 50% on white
export const ACCENT_UI_BAR = '#D5D3EA';        // #8880C4 @ 35% on white — opaque bar/area fill
export const ACCENT_UI_BAR_CMP = '#CFCCE7';    // #8880C4 @ 40% on white — opaque comparison bar/area fill
export const ACCENT_UI_2_BAR_CMP = '#E7D5C3';  // #C4956A @ 40% on white — opaque comparison bar/area fill
export const ACCENT_UI_BAR_CMP_LIGHT = '#F9F9FC'; // #8880C4 @ 5% on white — opaque comparison area bottom
export const ACCENT_UI_2_BAR_CMP_LIGHT = '#FCFAF6'; // #C4956A @ 5% on white — opaque comparison area bottom

/** Returns rgba string at the given opacity, e.g. accent(0.12) */
export const accent = (opacity: number) => `rgba(${ACCENT_UI_RGB}, ${opacity})`;

/** Returns rgba string for accent 2 at the given opacity */
export const accent2 = (opacity: number) => `rgba(${ACCENT_UI_2_RGB}, ${opacity})`;

/** Shimmer/skeleton gradient using the accent color */
export const accentShimmer = () =>
  `linear-gradient(90deg, ${accent(0.08)} 25%, ${accent(0.15)} 50%, ${accent(0.08)} 75%)`;
