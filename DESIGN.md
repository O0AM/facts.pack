# Design

Rewritten 2026-06-12 for the app-style rebuild of `docs/index.html`
(owner brief: Tokyo-Night colors + gradient bars from `docs/v0.index.html`,
"quick and easy mobile app for fun and productivity, not a documentation
page"; value first, converter second, theory after). The editorial paper
system this replaces is archived in `docs/v1.editorial.index.html`.

## Visual Theme

"Pocket tool." A dark, friendly, app-like single column: rounded cards,
big touch targets, instant interactivity. Tokyo-Night palette with warm
amber as the action color. Light theme exists but dark is the product's
face. The page leads with the tool; explanation is the appendix.

## Color (owner-locked, from v0.index.html)

Dark (default):
- `--bg` #15161e · `--bg2` #1a1b26 · `--panel` #1f2335 · `--panel2` #24283b
- `--line` #2f344d · `--fg` #c0caf5 · `--fg-dim` #787fa3 · `--fg-faint` #565f89
- `--accent` #e0af68 · `--accent2` #ff9e64 (action gradient: 135deg accent → accent2)
- Pack syntax: header #7aa2f7 · meta #636da6 · dict #9ece6a · schema #bb9af7
  · row #c0caf5 · add #73daca · del #f7768e

Light: the v0 light palette (#f8f9fa bg, #b45309 accent, etc.), same roles.

Gradient bars (owner-locked): JSON `linear-gradient(90deg,#f7768e88,#f7768e44)`,
TSV `linear-gradient(90deg,#7aa2f788,#7aa2f744)`,
PACK `linear-gradient(90deg,var(--accent),#e0af6855)`.

## Typography

- Display: **Sora** (Google Fonts, 600-800) for headlines and big numbers.
- Body: system sans stack (Segoe UI/system-ui) for native-app feel.
- Mono: **JetBrains Mono** (Google Fonts, 400/600) for pack text and labels.

## Layout

- Mobile-first single column, max-width ~760px, 18px gutters.
- Sticky compact app bar: wordmark chip, ELI5 link, theme toggle.
- Rounded-16/20 cards for the two tools (converter, playground).
- Buttons ≥ 44px tall; primary = amber gradient with dark text.
- Deep content lives in `<details>` accordions after the tools.
- Order is law: hero value visual → converter → playground → learn → extras → footer.

## Motion

- Hero bars grow to width on load / scroll-into-view (IntersectionObserver,
  .8s ease-out-quint). Button press feedback. Copy buttons flash "copied".
- All gated behind `prefers-reduced-motion`.

## Components

- **Benefit bars**: caption line (name + tokens) above a gradient bar; the
  hero's value visualization, reused in converter results and playground.
- **Converter card**: textarea, detect chip, sample chips, primary convert
  button, output listing with syntax-colored lines, action row
  (copy / copy+prompt / download).
- **Playground card**: two slider+number pairs, live bars, reading line.
- **Listing**: rounded code block, mono caption bar, line-prefix colors,
  flex-column code wrapper (prevents pre double-spacing).
- **Accordion**: v0 details/summary style for the learn/extras content.
- **Footer**: compact author + citation + meta chips.

## Caveman ELI5 page

Unchanged identity (cave brown, Bricolage), shares `fp-theme` storage key.
