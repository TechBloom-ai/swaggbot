# SwagBot: Visual Identity Guidelines

**Version 1.0** | Last Updated: February 2026

---

## Table of Contents

1. [Brand Concept & Logo Rationale](#1-brand-concept--logo-rationale)
2. [Color Palette](#2-color-palette)
3. [Typography](#3-typography)
4. [Iconography & Graphic Elements](#4-iconography--graphic-elements)
5. [UI/UX Design Principles](#5-uiux-design-principles)
6. [Accessibility Standards](#6-accessibility-standards)
7. [Usage Rules](#7-usage-rules)
8. [Technical Implementation](#8-technical-implementation)

---

## 1. Brand Concept & Logo Rationale

The SwagBot logo represents the intersection of **structured hardware** and **fluid data**. The symbol is a stylized letter "S" formed by two distinct visual languages:

### The Circuitry (Left/Top)
Represents the physical, hardware, and connection aspect of the bot. It uses clean lines, nodes, and traces to suggest logic and pathways—the foundation of computational thinking.

### The Data Matrix (Right/Bottom)
Represents the digital, processing, and output capabilities. The halftone dot pattern suggests digitization, particles, and modern tech—the flow of information.

### The Spark ✨
A starburst element in the upper right signifies innovation, the "magic" of AI, or a successful operation. It's the moment of insight.

---

## 2. Color Palette

The brand uses a **dual-tone palette** that balances energy with professionalism, creating visual harmony between action and authority.

### Primary Colors

#### Circuit Green
**Hex:** `#10B981` (Emerald 500)  
**RGB:** `16, 185, 129`  
**HSL:** `160°, 84%, 39%`

- **Usage:** Primary brand color, calls to action, active states, success messages, circuit traces, dot matrix
- **Vibe:** Growth, energy, stability, technology, innovation
- **Accessibility:** WCAG AA compliant on white backgrounds (4.5:1 contrast ratio)

#### Logic Navy
**Hex:** `#1E293B` (Slate 800)  
**RGB:** `30, 41, 59`  
**HSL:** `217°, 33%, 17%`

- **Usage:** Primary text, anchor elements, secondary backgrounds, circuit nodes, headings
- **Vibe:** Professionalism, depth, authority, industrial, reliability
- **Accessibility:** WCAG AAA compliant on white backgrounds (14.2:1 contrast ratio)

### Secondary Colors

#### Pure White
**Hex:** `#FFFFFF`  
**RGB:** `255, 255, 255`

- **Usage:** Primary background, card surfaces, clean canvas for detailed elements

#### Light Grey (Background Alternative)
**Hex:** `#F8FAFC` (Slate 50)  
**RGB:** `248, 250, 252`

- **Usage:** Subtle background differentiation, panel backgrounds, disabled states

#### Accent Grey (Borders & Dividers)
**Hex:** `#E2E8F0` (Slate 200)  
**RGB:** `226, 232, 240`

- **Usage:** Borders, dividers, subtle separators

### Semantic Colors

#### Success Green
**Hex:** `#10B981` (Same as Circuit Green)

#### Warning Amber
**Hex:** `#F59E0B` (Amber 500)

#### Error Red
**Hex:** `#EF4444` (Red 500)

#### Info Blue
**Hex:** `#3B82F6` (Blue 500)

---

## 3. Typography

The typography is **modern, geometric, and highly legible**, reflecting the bot's efficiency and clarity.

### Primary Typeface

**Font Family:** Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif

**Rationale:** Inter is designed for screen readability with excellent legibility at all sizes, featuring consistent character widths and modern proportions.

### Font Weights & Usage

| Weight | Value | Usage |
|--------|-------|-------|
| Regular | 400 | Body text, descriptions, secondary content |
| Medium | 500 | Subheadings, emphasized text, labels |
| Semibold | 600 | Button text, card titles, navigation |
| Bold | 700 | Headings, brand wordmark, key CTAs |

### Wordmark Treatment

- **"Swag":** Circuit Green (`#10B981`), Bold (700)
- **"Bot":** Logic Navy (`#1E293B`), Bold (700)
- **Kerning:** -0.02em for tighter, unified appearance
- **Letter Spacing:** Use default for body text, tighter (-0.01em) for headings

### Type Scale

```css
/* Headings */
H1: 2.5rem (40px) / Line Height: 1.2 / Weight: 700
H2: 2rem (32px) / Line Height: 1.25 / Weight: 700
H3: 1.5rem (24px) / Line Height: 1.3 / Weight: 600
H4: 1.25rem (20px) / Line Height: 1.4 / Weight: 600

/* Body */
Large: 1.125rem (18px) / Line Height: 1.6 / Weight: 400
Base: 1rem (16px) / Line Height: 1.5 / Weight: 400
Small: 0.875rem (14px) / Line Height: 1.5 / Weight: 400
Tiny: 0.75rem (12px) / Line Height: 1.5 / Weight: 500
```

---

## 4. Iconography & Graphic Elements

When extending the brand to other materials (websites, slides, UI), use patterns derived from the logo to maintain visual consistency.

### Circuit Traces
- **Style:** Thin lines (1-2px) with terminal dots
- **Usage:** Dividers, background textures, decorative elements
- **Color:** Circuit Green at 10-20% opacity for subtle effects
- **Application:** Header underlines, section separators, loading animations

### Dot Grid Pattern
- **Style:** Halftone dot pattern with varying sizes
- **Usage:** Subtle background texture
- **Opacity:** 5-10% to avoid overwhelming content
- **Pattern:** Radial or linear gradient fade for depth
- **Application:** Hero sections, panel backgrounds, card hover states

### The "S" Monogram
- **Usage:** Favicons, app icons, avatars, loading indicators
- **Minimum Size:** 24x24px (maintain dot visibility)
- **Standalone:** Can be used without wordmark at small sizes
- **Animation:** Can pulse or have dots animate for loading states

### Icon Style
- **Library:** Lucide Icons or Heroicons (outlined style)
- **Stroke Width:** 2px
- **Size:** 20px or 24px standard
- **Color:** Logic Navy for default, Circuit Green for active/hover states

---

## 5. UI/UX Design Principles

### Visual Hierarchy
1. **Primary Actions:** Circuit Green buttons/links with bold text
2. **Secondary Actions:** Logic Navy outline buttons
3. **Tertiary Actions:** Text links in Logic Navy

### Spacing System
Use a **4px base unit** with an 8px grid system:
```
xs: 4px
sm: 8px
md: 16px
lg: 24px
xl: 32px
2xl: 48px
3xl: 64px
```

### Border Radius
- **Small:** 4px (buttons, inputs)
- **Medium:** 8px (cards, panels)
- **Large:** 12px (modals, large containers)
- **Full:** 9999px (pills, avatars)

### Shadows
```css
/* Subtle elevation */
sm: 0 1px 2px rgba(30, 41, 59, 0.05)

/* Standard cards */
md: 0 4px 6px -1px rgba(30, 41, 59, 0.1), 
    0 2px 4px -1px rgba(30, 41, 59, 0.06)

/* Elevated panels */
lg: 0 10px 15px -3px rgba(30, 41, 59, 0.1), 
    0 4px 6px -2px rgba(30, 41, 59, 0.05)

/* Modals & popovers */
xl: 0 20px 25px -5px rgba(30, 41, 59, 0.1), 
    0 10px 10px -5px rgba(30, 41, 59, 0.04)
```

### Animation & Transitions
- **Duration:** 150ms for micro-interactions, 300ms for larger transitions
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` (ease-in-out)
- **Hover States:** Subtle scale (1.02) or color shift
- **Loading:** Pulse or skeleton screens with Circuit Green accents

---

## 6. Accessibility Standards

### Color Contrast
- **Body Text:** Minimum 4.5:1 (WCAG AA)
- **Large Text (18px+):** Minimum 3:1 (WCAG AA)
- **Target:** AAA compliance where possible (7:1 for body text)

### Focus States
- **Outline:** 2px solid Circuit Green
- **Offset:** 2px from element
- **Visible:** Always visible on keyboard navigation

### Screen Reader Support
- Use semantic HTML (`<header>`, `<nav>`, `<main>`, `<article>`)
- Provide `aria-label` for icon-only buttons
- Include skip links for keyboard navigation
- Ensure all images have descriptive `alt` text

### Motion & Animation
- Respect `prefers-reduced-motion` media query
- Provide alternative static states
- Never rely solely on color to convey information

### Touch Targets
- **Minimum Size:** 44x44px (iOS/Android guidelines)
- **Spacing:** Minimum 8px between interactive elements
- **Mobile-First:** Design for touch before mouse

---

## 7. Usage Rules

### Logo Clear Space
Always maintain a clear margin around the logo equivalent to the **height of the letter "B"** to ensure the intricate details of the circuits and dots remain visible and the logo doesn't feel cramped.

### Background Guidelines

#### Preferred
- **White** (`#FFFFFF`) or **Light Grey** (`#F8FAFC`)
- Maximum contrast and clarity

#### Dark Mode Alternative
- **Background:** Dark slate (`#0F172A`)
- **Text Inversion:** White or light grey
- **Circuit Green:** Increase to `#22C55E` for better contrast
- **Ensure:** All elements meet WCAG AA standards on dark backgrounds

### Scaling Requirements

#### Minimum Sizes
- **Digital:** 100px width (maintain dot visibility in "S")
- **Print:** 25mm width
- **Favicon:** 32x32px (use monogram only)
- **Mobile:** 80px width minimum

#### Prohibited
- ❌ Do not compress or distort aspect ratio
- ❌ Do not change colors or add effects (gradients, shadows on logo)
- ❌ Do not rotate or skew the logo
- ❌ Do not place on busy backgrounds that reduce legibility
- ❌ Do not scale down so dots merge into solid blocks

---

## 8. Technical Implementation

### CSS Variables

```css
:root {
  /* Colors */
  --color-primary: #10B981;
  --color-primary-dark: #059669;
  --color-primary-light: #34D399;
  --color-navy: #1E293B;
  --color-navy-light: #334155;
  --color-background: #FFFFFF;
  --color-background-alt: #F8FAFC;
  --color-border: #E2E8F0;
  --color-text-primary: #1E293B;
  --color-text-secondary: #64748B;
  
  /* Typography */
  --font-sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: "Fira Code", Consolas, Monaco, monospace;
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  
  /* Transitions */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Tailwind Configuration

```javascript
// Add to tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'circuit-green': '#10B981',
        'logic-navy': '#1E293B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
}
```