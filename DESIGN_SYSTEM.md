# Design System Reference

This document provides a quick reference for using the design tokens in your application.

## How to Use

All design tokens are available as Tailwind CSS utility classes. You can use them directly in your JSX `className` props.

---

## Colors

### Backgrounds

```jsx
className="bg-bg-primary"      // #FAF9F5 - Main background
className="bg-bg-secondary"    // #F5F4ED - Secondary background
className="bg-bg-elevated"     // #FFFFFF - Elevated surfaces (cards, modals)
```

### Buttons

```jsx
className="bg-btn-primary"     // #3D2817 - Primary button background
className="bg-btn-secondary"   // #E8E0D5 - Secondary button background
className="bg-btn-tertiary"    // #FAF9F5 - Tertiary button background
```

### Text

```jsx
className="text-text-primary"      // #1A1410 - Primary text
className="text-text-secondary"    // #3D2817 - Secondary text
className="text-text-tertiary"     // #5C4939 - Tertiary text
className="text-text-on-primary"   // #FAF9F5 - Text on dark backgrounds
className="text-text-disabled"     // #8B8089 - Disabled text
```

### Borders

```jsx
className="border-border-default"  // #E8E0D5 - Default border
className="border-border-hover"    // #D4C9BA - Hover state
className="border-border-focus"    // #C9B4A3 - Focus state
```

### Map Data Colors

```jsx
className="bg-map-1"  // #ED7E22 - Orange
className="bg-map-2"  // #E85C46 - Red-Orange
className="bg-map-3"  // #DC2C7E - Pink
className="bg-map-4"  // #C77F8F - Light Purple
className="bg-map-5"  // #A01084 - Purple
className="bg-map-6"  // #7F1AA3 - Deep Purple
className="bg-map-7"  // #5C1276 - Dark Purple
```

### Semantic Colors

```jsx
className="bg-success"  // #2D7A4F - Success states
className="bg-error"    // #C44328 - Error states
className="bg-warning"  // #E37E22 - Warning states
```

---

## Spacing

Uses a 4px base scale:

```jsx
className="p-1"   // 4px padding
className="p-2"   // 8px padding
className="p-3"   // 12px padding
className="p-4"   // 16px padding
className="p-5"   // 20px padding
className="p-6"   // 24px padding
className="p-8"   // 32px padding
className="p-10"  // 40px padding
className="p-12"  // 48px padding
className="p-16"  // 64px padding
className="p-20"  // 80px padding
```

Works with all spacing utilities: `m-*` (margin), `p-*` (padding), `gap-*`, `space-*`, etc.

---

## Border Radius

**Simplified border radius system with three values:**

```jsx
className="rounded-default"  // 20px - Most elements (buttons, inputs, cards)
className="rounded-large"    // 28px - Larger containers (modals, panels)
className="rounded-full"     // Fully rounded (pills, avatars, badges)
```

**Usage Examples:**

```jsx
// Button with default radius
<button className="rounded-default bg-btn-primary px-6 py-3">
  Click Me
</button>

// Card with large radius
<div className="rounded-large bg-bg-elevated p-6 shadow-md">
  Card content
</div>

// Avatar or badge with full radius
<div className="rounded-full w-10 h-10 bg-map-1">
  A
</div>
```

---

## Typography

**Font Family:** Inter (with system font fallbacks)

The typography system uses **Inter font** with semantic class names for consistent text styling across the application. All typography classes include font-family, size, weight, line-height, and letter-spacing.

### Headings (Semibold - 600)

```jsx
<h1 className="heading-1">Page Title</h1>
// 28px, weight 600, line-height 34px, letter-spacing -0.01em

<h2 className="heading-2">Section Title</h2>
// 22px, weight 600, line-height 28px, letter-spacing -0.01em

<h3 className="heading-3">Subsection Title</h3>
// 18px, weight 600, line-height 24px, letter-spacing -0.005em

<h4 className="heading-4">Card Title</h4>
// 16px, weight 600, line-height 22px, letter-spacing -0.005em
```

### Body Text (Regular - 400)

```jsx
<p className="body-large">Large body text for emphasis</p>
// 16px, weight 400, line-height 24px

<p className="body-regular">Standard body text</p>
// 14px, weight 400, line-height 21px

<p className="body-small">Small body text</p>
// 13px, weight 400, line-height 20px
```

### UI Elements (Medium - 500)

```jsx
<button className="button-small">Button Text</button>
// 14px, weight 500, line-height 20px

<button className="button-medium">Button Text</button>
// 15px, weight 500, line-height 20px

<span className="caption">Helper text or caption</span>
// 12px, weight 400, line-height 16px

<label className="label">Form Label</label>
// 12px, weight 500, line-height 16px, letter-spacing 0.01em

<nav className="nav-label">NAV ITEM</nav>
// 11px, weight 500, line-height 16px, letter-spacing 0.02em (typically uppercase)
```

### Data Displays (Semibold - 600)

```jsx
<div className="data-large">1,234</div>
// 28px, weight 600, line-height 32px, letter-spacing -0.01em

<div className="data-medium">567</div>
// 20px, weight 600, line-height 26px, letter-spacing -0.005em

<div className="data-small">89</div>
// 14px, weight 600, line-height 20px
```

### Combining with Tailwind Utilities

You can combine typography classes with Tailwind color utilities:

```jsx
<h1 className="heading-1 text-text-primary">Primary Title</h1>
<p className="body-regular text-text-secondary">Secondary text</p>
<button className="button-medium text-text-on-primary bg-btn-primary">Click Me</button>
```

### Font Sizes (Tailwind Utilities)

If you need more flexibility, you can still use Tailwind's font-size utilities:

```jsx
className="text-xs"    // 12px
className="text-sm"    // 14px
className="text-base"  // 16px
className="text-lg"    // 18px
className="text-xl"    // 20px
className="text-2xl"   // 24px
className="text-3xl"   // 30px
className="text-4xl"   // 36px
```

### Font Weights (Tailwind Utilities)

```jsx
className="font-normal"     // 400
className="font-medium"     // 500
className="font-semibold"   // 600
className="font-bold"       // 700
```

---

## Shadows

```jsx
className="shadow-sm"  // Subtle shadow
className="shadow-md"  // Medium shadow
className="shadow-lg"  // Large shadow
className="shadow-xl"  // Extra large shadow
```

---

## Common Component Patterns

### Primary Button

```jsx
<button className="button-medium bg-btn-primary text-text-on-primary px-6 py-3 rounded-default">
  Click me
</button>
```

### Secondary Button

```jsx
<button className="button-medium bg-btn-secondary text-text-primary px-6 py-3 rounded-default border border-border-default">
  Click me
</button>
```

### Card with Header

```jsx
<div className="bg-bg-elevated p-6 rounded-large shadow-md border border-border-default">
  <h3 className="heading-3 text-text-primary mb-2">Card Title</h3>
  <p className="body-regular text-text-secondary">Card content goes here</p>
</div>
```

### Input Field with Label

```jsx
<div>
  <label className="label text-text-secondary mb-1 block">Email Address</label>
  <input
    className="body-regular bg-bg-elevated border border-border-default focus:border-border-focus rounded-default px-4 py-2 text-text-primary w-full"
    type="email"
  />
  <span className="caption text-text-tertiary mt-1 block">We'll never share your email</span>
</div>
```

### Data Card

```jsx
<div className="bg-bg-elevated p-6 rounded-large shadow-md border border-border-default">
  <span className="label text-text-tertiary">TOTAL RIDES</span>
  <div className="data-large text-text-primary">1,234,567</div>
  <p className="caption text-success">+12% from last month</p>
</div>
```

---

## Migration from Inline Styles

### Before (Inline Styles):
```jsx
<div style={{
  backgroundColor: '#FFFFFF',
  padding: '24px',
  borderRadius: '20px',
  color: '#1A1410'
}}>
```

### After (Tailwind Classes):
```jsx
<div className="bg-bg-elevated p-6 rounded-default text-text-primary">
```

---

## Accessing CSS Variables Directly

If you need to use the raw CSS variables (e.g., in inline styles for dynamic content):

```jsx
<div style={{ backgroundColor: 'var(--bg-primary)' }}>
```

Available CSS variables:
- Colors: `--bg-primary`, `--text-primary`, `--border-default`, etc.
- Spacing: `--space-1` through `--space-20`
- Typography: `--text-xs` through `--text-4xl`
- Shadows: `--shadow-sm` through `--shadow-xl`

---

## Best Practices

1. **Always prefer Tailwind classes** over inline styles
2. **Use semantic names** - Don't memorize hex codes
3. **Be consistent** - Use the same color/spacing for similar elements
4. **Compose utilities** - Combine multiple classes instead of writing custom CSS
5. **Responsive design** - Use Tailwind's responsive prefixes: `md:`, `lg:`, etc.

### Example:
```jsx
// Good: Responsive and semantic
<div className="bg-bg-primary p-4 md:p-8 lg:p-12">

// Bad: Hardcoded values
<div style={{ backgroundColor: '#FAF9F5', padding: '16px' }}>
```
