# WodBoard Design System Reference

## Identity

WodBoard is a premium CrossFit/fitness workout logger for mobile web. The aesthetic is **dark, neon-accented, glassmorphic** — think high-end gaming meets Apple Fitness+. The app should feel fast, fun, and rewarding.

## The Trinity Color System

Three signature neon colors define the entire visual language:

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| Sessions/Streak | Cyan | `#00F2FF` | Primary accent, CTAs, focus rings, session streaks |
| Metcon/Conditioning | Magenta | `#FF00E5` | Conditioning metrics, middle activity ring |
| Volume/Strength | Gold/Yellow | `#FFD600` | Strength metrics, PRs, outer activity ring |

These appear as neon glows, ring colors, gradients, and accent highlights throughout the app.

### Extended Palette
- Neon Lime: `#39FF14` (success accents)
- Neon Orange: `#FF8A00` (PR gradients)
- Neon Pink: `#FF1493` (celebration)

## Surfaces & Backgrounds

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | `#050505` | App background |
| `--color-bg-elevated` | `#0a0a0a` | Elevated background |
| `--color-surface` | `#111111` | Card backgrounds (solid) |
| `--color-surface-2` | `#1a1a1a` | Secondary surfaces |
| `--color-surface-3` | `#242424` | Tertiary surfaces |
| `--glass-bg` | `rgba(255,255,255,0.05)` | Glass card default |
| `--glass-bg-hover` | `rgba(255,255,255,0.08)` | Glass card hover |
| `--glass-bg-active` | `rgba(255,255,255,0.12)` | Glass card pressed |

## Glass Effect Recipe

```css
background: var(--glass-bg);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
border: 1px solid var(--glass-border); /* rgba(255,255,255,0.1) */
border-radius: var(--radius-xl); /* 20px */
```

## Typography

- **Primary**: `Inter` (with system font fallback stack)
- **Mono**: `JetBrains Mono` (for stats, numbers, timers)
- **Scale**: 12/14/16/18/20/24/30/36/48px (`--text-xs` through `--text-5xl`)
- **Weights**: 400 (normal), 500 (medium), 600 (semibold), 700 (bold), 900 (black)
- **Text colors**: `#ffffff` (primary), `#888888` (secondary), `#555555` (tertiary)

## Spacing

4px base grid: `--space-1` (4px) through `--space-16` (64px).

Standard screen margins: `--space-4` (16px).
Card internal padding: `--space-4` (16px) or `--space-6` (24px).

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small chips, badges |
| `--radius-md` | 10px | Inputs, small cards |
| `--radius-lg` | 16px | Buttons, standard cards |
| `--radius-xl` | 20px | Large cards, glass panels |
| `--radius-full` | 9999px | Pills, orbs, circular elements |

## Shadows & Glows

Neon glow pattern for Trinity-colored elements:
```css
box-shadow:
  0 0 20px rgba(0, 242, 255, 0.3),      /* close glow */
  0 0 40px rgba(0, 242, 255, 0.12);      /* far glow */
```

Standard elevation shadows use deep blacks: `rgba(0,0,0,0.3)` to `rgba(0,0,0,0.6)`.

## Motion

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 150ms | Hover, press states |
| `--duration-normal` | 200ms | General transitions |
| `--duration-slow` | 300ms | Page transitions, modals |
| `--ease-out` | `cubic-bezier(0.16,1,0.3,1)` | Entrances, user-initiated |
| `--ease-in-out` | `cubic-bezier(0.65,0,0.35,1)` | Symmetrical transitions |

Press feedback: `transform: scale(0.97)` on `:active`.
Hover lift: `transform: translateY(-1px)` with increased glow.

## Component Patterns

### Buttons
- Min touch target: 44px height
- Sizes: sm (44px), md (48px), lg (56px)
- Primary: Cyan gradient background, black text, neon glow
- Secondary: Glass background with border
- Ghost: Transparent, secondary text color
- All use `--radius-lg` (16px)

### Cards (GlassCard)
- Variants: default (glass), highlighted (brighter glass), solid (opaque surface)
- Padding: none/sm(12px)/md(16px)/lg(24px)
- Optional glow effect with `--glow-color` custom property
- Interactive variant adds hover/active states

### Navigation (FloatingDock)
- Fixed bottom, centered pill shape
- `--dock-bg: rgba(26,26,26,0.8)` with 24px blur
- 48px touch targets for nav buttons
- Active state: white text + subtle white bg

### Bottom Sheets
- Preferred over center modals for mobile
- Glass background with heavy blur
- Drag handle indicator at top
- Slide-up animation

### The Liquid Orb (CTA)
- 56px circular button in the dock
- Rotating Trinity conic gradient ring
- Pulsing glow layers
- Inner glass surface with icon

## Mesh Gradients (Per Workout Type)

Each workout format has a signature gradient:
- **For Time**: Warm reds/oranges (`#FF6B6B` -> `#FF8E53`)
- **AMRAP**: Cool purples (`#667eea` -> `#764ba2`)
- **EMOM**: Teals/greens (`#11998e` -> `#38ef7d`)
- **Strength**: Pink/rose (`#f093fb` -> `#f5576c`)
- **Metcon**: Blues (`#4facfe` -> `#00f2fe`)
- **Mixed**: Pink/gold (`#fa709a` -> `#fee140`)

## Accessibility

- Focus visible: 2px solid cyan outline, 2px offset
- Min touch targets: 44px
- Text contrast: White on dark backgrounds (well above WCAG AA)
- `-webkit-tap-highlight-color: transparent` on interactive elements

## File Structure Convention

- Components: `src/components/{category}/ComponentName.tsx` + `ComponentName.module.css`
- Screens: `src/screens/ScreenName.tsx` + `ScreenName.module.css`
- All styling via CSS Modules (`.module.css` imports)
- Design tokens in `src/styles/variables.css`
- Always use CSS custom properties from variables.css, never hardcode values

## Key Components Reference

| Component | Path | Purpose |
|-----------|------|---------|
| GlassCard | `src/components/ui/GlassCard` | Standard card wrapper |
| Button | `src/components/ui/Button` | All button variants |
| FloatingDock | `src/components/ui/FloatingDock` | Bottom navigation |
| LiquidOrbButton | `src/components/ui/LiquidOrbButton` | Primary CTA orb |
| MicroChip | `src/components/ui/MicroChip` | Small tag/badge |
| ConfirmDialog | `src/components/ui/ConfirmDialog` | Confirmation modal |
| PowerCell | `src/components/stats/PowerCell` | Stat display cell |
| ShareLaunchSheet | `src/components/share/ShareLaunchSheet` | Share bottom sheet |
| WorkloadBreakdown | `src/components/reward/WorkloadBreakdown` | Movement tiles grid |
