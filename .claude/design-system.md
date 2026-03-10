# WodBoard Design System Reference

## Identity

WodBoard (Wodi) is a premium CrossFit workout logger. The aesthetic is **dark, neon-accented, glassmorphic** — closer to Apple Fitness+ post-workout screens than to SugarWOD's data tables. Every screen should feel like something worth screenshotting.

## The Visual Weight System

Every screen has three typographic levels. If you can't identify Level 1, the design is wrong.

| Level | Role | Size | Weight | Color | Tracking |
|-------|------|------|--------|-------|----------|
| **L1 — Hook** | Hero number/result | 48–52px | 800 | Trinity color | -2px |
| **L2 — Story** | Title / workout name | 32–36px | 700 | `#FFFFFF` | normal |
| **L3 — Metadata** | Labels, timestamps | 11–14px | 500 | `#A0A0A0` | 0.06–0.08em, uppercase |

## The Trinity Color System

Three neon colors define the entire visual language. Each component uses **exactly one**.

| Role | Color | Hex | CSS Variable | Usage |
|------|-------|-----|-------------|-------|
| Sessions/Streak/Skill | Cyan | `#00F2FF` | `--color-sessions` | Duration, intervals, EMOM, focus rings, CTAs |
| Metcon/Conditioning | Magenta | `#FF00E5` | `--color-metcon` | Time scores, AMRAP, bodyweight, conditioning |
| Volume/Strength | Gold | `#FFD600` | `--color-volume` | Weight inputs, volume stats, PRs |

### Extended Palette
- Neon Lime: `#39FF14` (success accents)
- Neon Orange: `#FF8A00` (PR gradients)
- Neon Pink: `#FF1493` (celebration, muted subtitle)

## Surfaces & Backgrounds

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | `#050505` | App background |
| `--color-bg-elevated` | `#0a0a0a` | Elevated background |
| `--color-surface` | `#111111` | Card backgrounds (solid) |
| `--color-surface-2` | `#1a1a1a` | Secondary surfaces, stat chips |
| `--color-surface-3` | `#242424` | Tertiary surfaces |
| `--glass-bg` | `rgba(255,255,255,0.05)` | Glass card default |
| `--glass-bg-hover` | `rgba(255,255,255,0.08)` | Glass card hover |
| `--glass-bg-active` | `rgba(255,255,255,0.12)` | Glass card pressed |
| Chapter card bg | `#161616` | Exercise story cards (not a token — hardcoded intentionally) |

**Key rule**: Card backgrounds use `#161616`, NOT pure black. The slight elevation creates depth and makes the social shadow visible.

## Card Architecture

### Chapter Cards (Exercise Story Cards)
```css
background: #161616;
border: 1px solid #222222;
border-radius: var(--radius-2xl); /* 24px */
padding: 20px;
/* Social shadow — Trinity color at 5-8% opacity */
box-shadow: 0 2px 20px rgba(R, G, B, 0.06);
```

Social shadow colors by type:
- Yellow cards: `rgba(255, 214, 0, 0.06)`
- Magenta cards: `rgba(255, 0, 229, 0.06)`
- Cyan cards: `rgba(0, 242, 255, 0.06)`

### Stat Chips
```css
background: #1A1A1A;
border: 1px solid #222222;
border-radius: var(--radius-2xl); /* 24px */
box-shadow: 0 2px 16px rgba(0, 242, 255, 0.04);
```
Label on top (L3), value below (L1-scale colored), thin 2px progress bar at bottom.

### Glass Effect Recipe
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
- **Scale**: 11/12/14/16/18/20/24/30/36/48/52px
- **Weights**: 400 (normal), 500 (medium), 600 (semibold), 700 (bold), 800 (extra bold), 900 (black)
- **Text colors**: `#FFFFFF` (primary), `#888888` (secondary), `#555555` (tertiary), `#A0A0A0` (labels)
- **Numeric data**: Always use `font-variant-numeric: tabular-nums` for aligned columns

## Spacing (8pt Grid)

4px base grid, strictly enforced. If a value isn't divisible by 4, it's wrong.

| Context | Value | Token |
|---------|-------|-------|
| Hero to edge | 32px | `--space-8` |
| Between sections | 24px | `--space-6` |
| Card internal | 16–20px | `--space-4` / `--space-5` |
| Within card items | 8–12px | `--space-2` / `--space-3` |
| Label to value | 4px | `--space-1` |
| Screen margins | 16px | `--space-4` |

Standard tokens: `--space-1` (4px) through `--space-16` (64px).

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small chips, badges |
| `--radius-md` | 10px | Inputs, small cards |
| `--radius-lg` | 16px | Buttons, standard cards |
| `--radius-xl` | 20px | Large cards, glass panels |
| `--radius-2xl` | 24px | Chapter cards, premium surfaces |
| `--radius-full` | 9999px | Pills, orbs, circular elements |

## Motion

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 150ms | Hover, press states |
| `--duration-normal` | 200ms | General transitions |
| `--duration-slow` | 300ms | Page transitions, modals |
| `--ease-out` | `cubic-bezier(0.16,1,0.3,1)` | Entrances, user-initiated |
| `--ease-in-out` | `cubic-bezier(0.65,0,0.35,1)` | Symmetrical transitions |

Press feedback: `transform: scale(0.97)` on `:active`.
Number transitions: Framer Motion `popLayout` with `y: ±12px` slide.

## Mobile UX Requirements

### Touch Targets
- **Minimum**: 44px (hard requirement for post-workout tired hands)
- **Preferred**: 48px for primary actions
- **Stepper buttons**: Each button ≥ 44×44px individually

### Input Patterns
- **Prefill everything obvious**: Rx weights, prescribed reps, time caps → prefill, let user adjust
- **Steppers > empty inputs**: Use +/− with long-press acceleration for numeric values
- **Right-side controls**: Put steppers on the right for right-thumb one-handed operation
- **No iOS zoom**: Input font-size ≥ 16px to prevent auto-zoom on focus
- **Bottom sheets > modals**: Always slide up from bottom, never center-screen

### Data Display
- Human-friendly formats: `2.1 tons` not `2134 kg`, `18:42` not `1122 seconds`
- AMRAP shows rounds (from `exercise.rounds`), not total reps
- Score formatting: `6 ROUNDS + 3 TTB` not `6 rounds + 3 reps on movement 4`

## Component Patterns

### Buttons
- Min touch target: 44px height
- Sizes: sm (44px), md (48px), lg (56px)
- Primary: Cyan gradient background, black text, neon glow
- Secondary: Glass background with border
- Ghost: Transparent, secondary text color
- All use `--radius-lg` (16px)

### StepperInput (Numeric +/−)
- Right-side vertical control block: + on top, − on bottom
- Each button: ≥ 44×44px touch target
- Long-press acceleration: 400ms → 150ms → 60ms
- Trinity color theming via `--stepper-color`
- Two sizes: md (88px tall) and sm (88px tall, narrower)

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
- Inner glass surface with icon

## Social Artifact Layout (Reward/Detail Screens)

### Header (56px)
- Left: Back arrow (24px icon)
- Center: Date
- Right: "Original WOD" pill (`#2A2A2A` bg, `1px solid #3A3A3A`)

### Hero Area
- Title: 36px bold, left-aligned
- Subtitle: 16px medium, `#888888`
- Result: 52px extra bold (L1 hook)
- Unit: 44px suffix
- Partial progress: Magenta capsule pill

### Movement Lines (within Chapter Cards)
- Structured: `Quantity · Name — Load`
- Quantity: colored, bold (Trinity)
- Name: `rgba(255, 255, 255, 0.6)`
- Load: muted, em-dash separated
- Dot indicator: 6px, Trinity colored

### Action Bar (Reward Mode)
- Done: primary 52px button
- Share: ghost secondary
- **No Edit button** — reward view is for celebration

## Mesh Gradients (Per Workout Type)

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
- `prefers-reduced-motion` media query on all animations

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
| StepperInput | `src/components/logging/story/StepperInput` | Numeric +/− input |
| ExerciseStoryCard | `src/components/workout/ExerciseStoryCard` | Recap chapter card |
| ShareLaunchSheet | `src/components/share/ShareLaunchSheet` | Share bottom sheet |
| WorkloadBreakdown | `src/components/reward/WorkloadBreakdown` | Movement tiles grid |
