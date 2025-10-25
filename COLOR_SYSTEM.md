# Color Token System Documentation

## Overview

This project uses a centralized color token system that generates both CSS variables (for UI/inline styles) and TypeScript constants (for Deck.gl RGB arrays) from a single source of truth.

## Architecture

### Single Source of Truth
**File**: `tokens/colors.json`

Contains all UI color definitions organized by purpose:
- **background**: Main backgrounds, elevated surfaces
- **brown**: Primary, secondary, tertiary action colors
- **text**: Text hierarchy (primary, secondary, tertiary, muted)
- **border**: Border states (soft, medium, dark)
- **ui**: Interactive states (hover, active, focus, disabled)
- **neutral**: Grayscale palette

### Code Generation
**Script**: `scripts/build-colors.mjs`

Automatically generates:
1. **`src/styles/tokens.css`** - CSS custom properties for use in components
2. **`src/lib/colors.ts`** - TypeScript constants with HEX and RGBA values

The script runs automatically before builds via the `prebuild` npm script.

## Usage

### In React Components (Inline Styles)
```tsx
<div style={{
  backgroundColor: 'var(--background-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-medium)'
}}>
```

### In Deck.gl Layers
```tsx
import { RGBA } from '@/lib/colors';

new ScatterplotLayer({
  getFillColor: RGBA.neutral_gray_darker,
  getLineColor: RGBA.border_soft,
});
```

### In CSS Files
```css
.my-component {
  background: var(--background-primary);
  color: var(--text-tertiary);
}
```

## Color Palette

### Backgrounds
- `--background-primary` (#FFFCF5) - Whisper Cream, main background
- `--background-secondary` (#FFFAF0) - Slightly warmer variant
- `--background-elevated` (#FFFFFF) - Pure white for cards/panels

### Browns (Actions)
- `--brown-deep` (#3D2817) - Deep Espresso, primary actions
- `--brown-rich` (#5C3D2E) - Rich Brown, secondary actions
- `--brown-medium` (#7A5542) - Medium Brown, tertiary actions

### Text
- `--text-primary` (#1A1410) - Almost Black, headings
- `--text-secondary` (#3D2817) - Dark Brown, body copy
- `--text-tertiary` (#5C4939) - Medium Brown, captions
- `--text-muted` (#8B7965) - Muted Brown, disabled/placeholders

### Borders
- `--border-soft` (#E8E0D5) - Soft Taupe, default borders
- `--border-medium` (#D4C9BA) - Medium Taupe, hover borders
- `--border-dark` (#C0B4A3) - Darker Taupe, focus states

### UI States
- `--ui-hover` (#E8E8E8) - Hover backgrounds
- `--ui-active` (#E8E8E8) - Active/selected states
- `--ui-focus` (#000000) - Focus borders
- `--ui-disabled` (#F5F5F5) - Disabled backgrounds

### Neutrals
- `--neutral-white` (#FFFFFF)
- `--neutral-black` (#000000)
- `--neutral-gray-light` (#F0F0F0)
- `--neutral-gray` (#999999)
- `--neutral-gray-dark` (#666666)
- `--neutral-gray-darker` (#333333)

## Maintaining the System

### Adding New Colors
1. Edit `tokens/colors.json`
2. Run `npm run prebuild` or `node scripts/build-colors.mjs`
3. The CSS and TypeScript files will regenerate automatically
4. Import and use the new tokens in your components

### Theme Switching (Future Enhancement)
The system is built to support theme switching. Add theme variants in the code generator:
```javascript
// In build-colors.mjs
const darkThemeOverrides = { ... };
```

## Benefits

1. **Single Source of Truth** - All colors defined in one JSON file
2. **No Drift** - CSS and TypeScript are always in sync
3. **Type Safety** - TypeScript constants are fully typed
4. **Performance** - CSS variables resolve in browser, no JS parsing
5. **Deck.gl Compatible** - RGB arrays pre-calculated for map layers
6. **Theme Ready** - Built to support future dark mode implementation

## Files Modified

- `tokens/colors.json` - Color definitions (new)
- `scripts/build-colors.mjs` - Code generator (new)
- `src/styles/tokens.css` - Generated CSS variables (auto-generated)
- `src/lib/colors.ts` - Generated TypeScript constants (auto-generated)
- `src/app/layout.tsx` - Imports tokens.css
- `src/app/globals.css` - Updated to use color tokens
- `src/components/MapCanvas.tsx` - All hardcoded colors replaced
- `package.json` - Added prebuild script

## Notes

- RIDERSHIP_COLORS (map visualization gradient) intentionally kept separate for data visualization purposes
- Generated files (`src/styles/tokens.css`, `src/lib/colors.ts`) can be committed to git or gitignored as preferred
- The prebuild script ensures tokens are always up-to-date before production builds

