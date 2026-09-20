# Design system

Tailwind v4, CSS-first. Every token lives in one `@theme` block in `src/routes/layout.css`. There
is no `tailwind.config.js` and no PostCSS — the `@tailwindcss/vite` plugin handles it.

## The token layer

```mermaid
flowchart TD
    T["@theme<br/>--color-bg, --color-fg, --color-accent …"] --> U["utilities<br/>bg-surface, text-muted, border-border"]
    T --> V["plain CSS<br/>var(--color-bg)"]
    M["@media prefers-color-scheme: dark<br/>:root:not(.light)"] -->|"overrides the same vars"| T
```

Because the dark overrides re-declare the *same* variables, every utility follows automatically.
No component knows which theme is active and no component carries a `dark:` variant.

## Colour

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--color-bg` | `oklch(0.99 0 0)` | `oklch(0.16 0 0)` | Page background — off-white, never `#fff` |
| `--color-surface` | `oklch(1 0 0)` | `oklch(0.19 0 0)` | Cards, modals |
| `--color-surface-2` | `oklch(0.97 0 0)` | `oklch(0.23 0 0)` | Nested / hovered surfaces |
| `--color-fg` | `oklch(0.21 0 0)` | `oklch(0.97 0 0)` | Body text |
| `--color-muted` | `oklch(0.5 0 0)` | `oklch(0.7 0 0)` | Secondary text, labels |
| `--color-border` | `oklch(0.92 0 0)` | `oklch(0.28 0 0)` | Decorative hairlines — card edges, rules, dashed empty states |
| `--color-border-strong` | `oklch(0.62 0 0)` | `oklch(0.54 0 0)` | **Interactive** boundaries — inputs, chips, outline buttons |
| `--color-accent` | `oklch(0.21 0 0)` | `oklch(0.97 0 0)` | The single neutral accent |

One accent. No gradients, no rainbow dashboards, no AI purple.

### Why there are two border tokens

WCAG 1.4.11 asks for 3:1 on "visual information required to identify user interface components".
A card's edge is not that — nothing becomes unreadable if it disappears — so `--color-border`
stays a hairline. An `<input>`'s outline *is* that: the border alone tells you a field is there,
so it has to clear 3:1 against every surface it can land on.

```mermaid
flowchart TD
    A["a border is needed"] --> B{"is it the only thing<br/>identifying a control?"}
    B -- "yes: input, select,<br/>file picker, toggle chip" --> C["border-border-strong<br/>3.34:1 worst case"]
    B -- "no: card edge, divider,<br/>dashed empty state" --> D["border-border<br/>decorative, exempt"]
```

`0.62` (light) and `0.54` (dark) are the *lightest* values that clear 3:1 against `bg`, `surface`
**and** `surface-2` — 3.34:1 in both modes. Lighter than that and the worst pair drops under the
line; darker and the UI picks up outlines it doesn't need.

To re-check after changing any token: convert `oklch(L C H)` to sRGB, take each channel to linear
lightness (`c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4`), then relative luminance
`0.2126R + 0.7152G + 0.0722B`, then `(L1 + 0.05) / (L2 + 0.05)`. Text needs 4.5:1 (1.4.3),
non-text needs 3:1 (1.4.11). For the tag chips, sweep hue 0–359° at fixed `L` and `C` and take the
**worst** ratio — the worst light-mode hue is 191° at 6.47:1, the worst dark-mode hue is 20° at
8.56:1.

## Status colour, without a rainbow

Stages and statuses get a `-100` / `-700` pair each — a pale fill and a readable text colour in
the same hue family, all low chroma.

```mermaid
flowchart LR
    A["saved<br/>hue 250"] --> B["applied<br/>220"] --> C["progress<br/>200"] --> D["late<br/>170"] --> E["offer<br/>145"]
    F["terminal<br/>290"] & G["closed<br/>0"] --> H["out of band"]
```

Tags are the one place colour is arbitrary. Instead of hashing a tag name to a random hue — which
is how you get a rainbow — tag colours snap to six low-chroma buckets driven by four variables:
`--tag-bg-l`, `--tag-bg-c`, `--tag-fg-l`, `--tag-fg-c`, plugged into
`oklch(var(--tag-bg-l) var(--tag-bg-c) <hue>)`. Retune all six at once by editing four numbers.

## Typography

| Token | Value |
|---|---|
| `--font-sans` | System UI stack |
| `--font-mono` | UI monospace stack |

**Mono is for labels, not for prose.** Small uppercase-ish mono labels mark the structure of the
page; everything a human reads is sans.

## Rules for writing UI here

```mermaid
flowchart TD
    A["new component"] --> B{"needs data?"}
    B -- yes --> C["prop it in via Snippet / props"]
    B -- no --> D["local $state only"]
    A --> E{"needs a colour?"}
    E -- yes --> F["existing token, or add one to @theme"]
    E -- no --> G["done"]
    F --> H{"bare --foo?"}
    H -- yes --> I["STOP — must be --color-foo"]
```

- **Namespaced tokens only.** A bare `--primary` in `@theme` produces no utilities — Tailwind v4
  only scans namespaces (`--color-*`, `--font-*`, `--text-*`, …). Non-token variables go in
  `:root`. See [research/tailwind-v4.md](research/tailwind-v4.md).
- **No em-dashes in UI copy.**
- **Semantic HTML first.** `<button>` for actions, `<table>` for the grid, labelled inputs, a real
  `<dialog>`-style focus trap in `Modal.svelte`.
- **WCAG 2.2 AA is the target,** not a stretch goal: visible focus rings, `aria-busy` on the busy
  button state, `aria-labelledby` on modals, and contrast held by the `-100`/`-700` pairing rather
  than checked after the fact.
- **Every interactive target is at least 24×24px** (2.5.8). Small chips and pills get
  `inline-flex min-h-6 items-center` rather than relying on the spacing exception — a rule you can
  verify by reading the class list beats one you have to reason about.
- **Client-side state changes get announced.** Filtering, sorting and row actions happen without a
  navigation, so a screen reader would otherwise hear nothing. The affected regions carry
  `role="status"` / `role="alert"`, and live regions are rendered unconditionally — one that mounts
  and unmounts with its content is not reliably announced.

## Motion

Motion is information, not decoration. Chart bars animate their width once on mount to show
magnitude; the funnel grows stage by stage so the drop-off reads as a sequence. Nothing loops,
nothing parallaxes, and `prefers-reduced-motion` is respected where an animation carries no
information.

![Stage funnel](assets/stage-funnel.svg)
