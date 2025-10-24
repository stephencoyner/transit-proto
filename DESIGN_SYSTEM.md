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

```jsx
className="rounded-sm"    // 4px
className="rounded-md"    // 8px
className="rounded-lg"    // 12px
className="rounded-xl"    // 16px
className="rounded-full"  // Fully rounded (9999px)
```

---

## Typography

### Font Sizes

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

### Font Weights

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
<button className="bg-btn-primary text-text-on-primary px-6 py-3 rounded-lg font-medium">
  Click me
</button>
```

### Secondary Button

```jsx
<button className="bg-btn-secondary text-text-primary px-6 py-3 rounded-lg font-medium border border-border-default">
  Click me
</button>
```

### Card

```jsx
<div className="bg-bg-elevated p-6 rounded-xl shadow-md border border-border-default">
  Card content
</div>
```

### Input Field

```jsx
<input
  className="bg-bg-elevated border border-border-default focus:border-border-focus rounded-lg px-4 py-2 text-text-primary"
  type="text"
/>
```

---

## Migration from Inline Styles

### Before (Inline Styles):
```jsx
<div style={{
  backgroundColor: '#FFFFFF',
  padding: '24px',
  borderRadius: '12px',
  color: '#1A1410'
}}>
```

### After (Tailwind Classes):
```jsx
<div className="bg-bg-elevated p-6 rounded-lg text-text-primary">
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
