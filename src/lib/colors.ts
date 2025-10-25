/* auto-generated from tokens/colors.json */
/* eslint-disable */

export const HEX = {
  "background_primary": "#FFFCF5",
  "background_secondary": "#FFFAF0",
  "background_elevated": "#FFFFFF",
  "brown_deep": "#3D2817",
  "brown_rich": "#5C3D2E",
  "brown_medium": "#7A5542",
  "text_primary": "#1A1410",
  "text_secondary": "#3D2817",
  "text_tertiary": "#5C4939",
  "text_muted": "#8B7965",
  "border_soft": "#E8E0D5",
  "border_medium": "#D4C9BA",
  "border_dark": "#C0B4A3",
  "ui_hover": "#E8E8E8",
  "ui_active": "#E8E8E8",
  "ui_focus": "#000000",
  "ui_disabled": "#F5F5F5",
  "neutral_white": "#FFFFFF",
  "neutral_black": "#000000",
  "neutral_gray-light": "#F0F0F0",
  "neutral_gray": "#999999",
  "neutral_gray-dark": "#666666",
  "neutral_gray-darker": "#333333"
} as const;

export type Rgba = [number, number, number] | [number, number, number, number];

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) throw new Error("Bad hex: " + hex);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};

export const RGBA = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToRgb(v)])
) as Record<keyof typeof HEX, Rgba>;
