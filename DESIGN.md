# Design

<!-- impeccable:design-schema 1 -->

## Visual world

A warm dark study workspace. The feeling is a desk lamp on at 2am — warm light on dark surfaces, focused, calm, professional. Not a tech dashboard, not a gaming UI, not a generic dark mode. The warmth comes from the surface tint (warm brown-black, not cold blue-black) and the amber accent.

## Color

| Token | Value | Use |
|---|---|---|
| `--bg` | `#100d0a` | App background — warm near-black |
| `--surface` | `#1a1612` | Cards, panels — warm dark brown |
| `--surface-2` | `#241f19` | Hover, inputs, secondary surfaces |
| `--surface-3` | `#2e2820` | Active, pressed, tertiary |
| `--border` | `rgba(245,158,11,0.08)` | Structural borders — subtle warm |
| `--border-strong` | `rgba(245,158,11,0.16)` | Hover/focus borders |
| `--text` | `#f0ebe3` | Primary text — warm white |
| `--text-2` | `#c4b8a8` | Secondary text — warm gray |
| `--text-muted` | `#8a7e6e` | Muted text — warm brown-gray |
| `--text-faint` | `#5a5044` | Faint text — disabled, placeholders |
| `--accent` | `#f59e0b` | Amber — CTAs, active states, focus |
| `--accent-h` | `#fbbf24` | Amber hover — lighter, warmer |
| `--success` | `#34d399` | Success — warm green |
| `--danger` | `#f87171` | Danger — warm red |
| `--info` | `#38bdf8` | Info — cool blue (used sparingly) |

Secondary text is tinted warm (not neutral gray). Borders carry a faint amber warmth. The accent is a single amber — used for one primary action per screen, active nav, and focus rings.

## Typography

- **Body**: system sans (-apple-system, Segoe UI, Roboto). 14px base, 1.5 line-height. Measure 65-75ch.
- **Headings**: same family, weight 600, size steps: 20px / 16px / 14px. No display face — this is a tool, not a magazine.
- **Mono**: SF Mono / Cascadia Code. Only for timers, data, code blocks. Never as costume.
- **Tracking**: -0.01em on headings. Body stays default.

## Layout

Single-panel. Left sidebar 220px (collapsible to 56px). Main area fills the rest edge-to-edge. Content padding 20px. No centered narrow column — the content uses the full width. Cards sit on the surface with 12px radius, 1px border, no shadow (elevation is border-only). Active nav item: amber-tinted background, no accent bar, no glow.

## Spacing

- Base unit: 4px. All spacing is multiples of 4.
- Card padding: 16px. Card gap: 12px.
- Nav item height: 36px. Nav item gap: 2px.
- Section gap: 24px. Heading margin-top: 20px, margin-bottom: 8px (more space above than below).

## Motion

Purposeful, minimal. One authored moment per view, not scattered effects.
- Page content: fade-in 0.15s on mount. No slide.
- Messages: translateY 4px + opacity 0→1, 0.2s ease-out.
- Hover: background-color transition 0.12s. No scale transforms on cards.
- Focus: border-color + box-shadow ring. No glow halos.
- No ambient animation (no aurora, no particles, no floating). This is a study tool — motion serves function.
- `prefers-reduced-motion`: all durations → 0.01ms.

## States

Every interactive element has: default, hover, active/pressed, focus-visible, disabled. Focus ring: `0 0 0 2px var(--bg), 0 0 0 4px var(--accent)`. Disabled: opacity 0.4, cursor not-allowed. No element ships without all five states.

## Browser surfaces

- Text selection: amber-tinted background, amber-hover text.
- Custom scrollbar: 6px, warm-tinted thumb, transparent track.
- Focus ring: amber, 2px offset.
- Caret: amber.
- Tabular numbers: `font-variant-numeric: tabular-nums` on all numeric data.