# Tailwind CSS v4 — research notes

> Sources: web search (tailwindcss.com, tailwindcss-v4-skill DeepWiki, multiple 2026 guides); Tailwind v4.3 release blog; 2026 articles. Mapped 2026-09-04.
> No Tailwind MCP available — all facts are from the official tailwindcss.com release blog + community write-ups of the v4 CSS-first architecture.

## v4 is installed in this repo

`package.json` already has:
- `tailwindcss ^4.3.3`
- `@tailwindcss/vite ^4.3.3`
- `prettier-plugin-tailwindcss ^0.8.1`

`vite.config.ts` registers `tailwindcss()`. `src/routes/layout.css` is `@import 'tailwindcss';`. `prettier.config.mts` sets `tailwindStylesheet: './src/routes/layout.css'`. **We are mid-migration**: this scaffold uses the v4 wiring but the CSS is the empty `v4 baseline`. We'll add design tokens via `@theme` in `layout.css` when we start styling.

## What changed v3 → v4 (the points that actually matter)

1. **CSS-first config**. `tailwind.config.js` is optional. You put tokens, plugins, and source paths in CSS with `@import "tailwindcss"`, `@theme { ... }`, `@plugin "..."`, `@source "..."`. The JS config still works for advanced cases (e.g. plugins that need JS), but the typical token override is now CSS.
2. **New engine**: Lightning CSS (Rust) replaces PostCSS for transform/optimize. 10-100× faster builds; better minification; first-class CSS nesting.
3. **Native CSS cascade layers** (`@layer theme, base, components, utilities;`). Custom variants and `@apply` respect layers correctly.
4. **Automatic content detection**. v4 walks the project for class names without `content: []` config. Svelte/SvelteKit files are detected. Works for `class="..."` strings, but dynamic class composition must use the `clsx`-compatible `class={[...]}` / `class={{...}}` syntax Svelte 5 supports (Svelte's compiler analyses these too).
5. **`@theme` defines design tokens that are simultaneously CSS custom properties AND Tailwind utility values**. `--color-primary-500: #...;` creates `bg-primary-500`, `text-primary-500`, `border-primary-500`, plus exposes `var(--color-primary-500)` to plain CSS.
6. **Container queries are first-class** — `@container`, `@sm:`, `@md:` modifiers work out of the box.
7. **CSS variable scoping**: tokens are namespaced with `--color-*`, `--font-*`, `--text-*`, `--spacing-*`. If you define `--color-primary` it creates `bg-primary`/`text-primary`/etc. If you want the bare name (e.g. `bg-primary`) without the `--color-` prefix, define `--primary` and it'll be discovered.

## Current package versions (Sept 2026)

- **Tailwind v4.3** is the current minor. Released Aug 2026. Adds: first-party scrollbar styling, more logical-property utilities, new `zoom` + `tab-size` utilities, better `@variant` support, scroll-driven animation utilities. Already in our `^4.3.3`.
- **Earlier majors**: v4.0 (Jan 2025), v4.1, v4.2 — all about CSS-first config, Lightning CSS, OKLCH colors, modern CSS.
- **Browser support**: latest 2 versions of Chrome/Safari/Firefox/Edge. No IE/legacy. Lightning CSS handles the rest of the feature compat.
- **`@tailwindcss/vite` plugin** is the recommended Vite integration (not PostCSS for new projects). The repo already has it.

## Project setup (already done)

```ts
// vite.config.ts (current)
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      compilerOptions: { runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true },
      adapter: adapter()
    })
  ]
});
```

```css
/* src/routes/layout.css (current — we'll add to this) */
@import 'tailwindcss';
```

```html
<!-- src/routes/+layout.svelte (current) -->
<script lang="ts">
  import './layout.css';
  import favicon from '$lib/assets/favicon.svg';
  let { children } = $props();
</script>
<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
```

## The core CSS-first directives

### `@import "tailwindcss"`

The single base import. In v4, this composes all the layers and variant config the framework needs. The `layout.css` already has it.

### `@theme` — design tokens

```css
@import "tailwindcss";

@theme {
  /* Colors — OKLCH for perceptual uniformity */
  --color-brand-50:  oklch(0.97 0.02 250);
  --color-brand-100: oklch(0.94 0.04 250);
  --color-brand-500: oklch(0.62 0.20 250);
  --color-brand-600: oklch(0.55 0.21 250);
  --color-brand-700: oklch(0.48 0.20 250);

  /* Semantic — bare names appear as utilities */
  --color-bg:        oklch(1 0 0);
  --color-fg:        oklch(0.20 0.02 250);
  --color-muted:     oklch(0.96 0.01 250);
  --color-border:    oklch(0.92 0.01 250);
  --color-accent:    var(--color-brand-500);
  --color-danger:    oklch(0.60 0.20 25);

  /* Typography */
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  /* Type scale */
  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  1.875rem;

  /* Spacing (4-pt grid) */
  --spacing: 0.25rem; /* base unit — 1 = 4px, 4 = 1rem */
  --spacing-page: 1.25rem; /* custom 20px page gutter */

  /* Radii */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  /* Shadows */
  --shadow-card: 0 1px 2px rgb(0 0 0 / 0.04), 0 4px 12px rgb(0 0 0 / 0.06);

  /* Breakpoints (used by @media utilities, not @container) */
  --breakpoint-sm: 40rem;
  --breakpoint-md: 48rem;
  --breakpoint-lg: 64rem;
  --breakpoint-xl: 80rem;

  /* Container breakpoints (used by @container utilities) */
  --container-3xs: 16rem;
  --container-sm:  24rem;
  --container-md:  32rem;
  --container-lg:  40rem;
}
```

The `--color-*` prefix creates both `bg-brand-500` etc. AND `var(--color-brand-500)` for plain CSS. **Bare names** (`--bg`, `--accent`, `--danger`) create `bg-bg`, `text-fg`, etc. — slightly awkward, prefer the namespaced form.

Override defaults by reassigning the same variable. Add new tokens by introducing new variables.

### `@source` — explicit class scanning

v4 auto-detects classes. If you keep classes in compiled CSS the scanner can't reach (e.g. string-built class names that survive minification), add explicit sources:

```css
@import "tailwindcss";

@source "../node_modules/@acme/ui/dist/*.js";
@source not "../src/legacy/**";
@source inline("{hover:,focus:,}underline");
```

`safelist` is gone — use `@source inline("...")` with class names instead. For runtime-conditional classnames, prefer `clsx` patterns Svelte 5 supports natively: `class={['base', isActive && 'is-active']}`.

### `@plugin` — first-party + custom plugins

```css
@import "tailwindcss";
@plugin "@tailwindcss/forms";
@plugin "@tailwindcss/typography";
@plugin "my-plugin" { /* options */ }
```

Custom Tailwind plugins are still JS, but loaded via `@plugin "./my-plugin.js"` in v4.

### `@variant` — custom variants

```css
@custom-variant dark (&:where(.dark, .dark *));
@custom-variant theme-midnight (&:where([data-theme="midnight"], [data-theme="midnight"] *));
```

For dark mode, **v4 changed**: `darkMode: "class"` is removed. You declare the variant yourself. Two strategies:

```css
/* class-based dark mode (v4 style) */
@custom-variant dark (&:where(.dark, .dark *));

/* or media-query dark mode (still supported, but considered a v3 holdover) */
@media (prefers-color-scheme: dark) { :root { /* dark overrides */ } }
```

The class-based strategy needs a tiny `setPreference` shim (10 lines) to flip `.dark` on `<html>` and persist the choice. We'll add it in `src/lib/theme.ts` when we style.

## Practical recipes for the job-tracker

### Card / list item component styling

```html
<article class="rounded-lg border border-border bg-bg p-4 shadow-card
              hover:shadow-lg transition-shadow">
  <h3 class="text-lg font-semibold text-fg">{title}</h3>
  <p class="mt-1 text-sm text-fg/70">{company}</p>
  <span class="mt-2 inline-flex items-center gap-1 rounded-sm
               bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
    {status}
  </span>
</article>
```

`text-fg/70` — opacity modifier on the foreground color. v4 supports `/<opacity>` on any color utility.

### Responsive grid

```html
<ul class="grid grid-cols-1 gap-4 @md:grid-cols-2 @xl:grid-cols-3">
```

Container query variant (`@md:`) is preferred over media query for layouts that depend on the available column width rather than the viewport.

### Dark mode toggle

```ts
// src/lib/theme.ts
export function toggleTheme() {
  const root = document.documentElement;
  const next = root.classList.toggle('dark')
    ? 'dark'
    : 'light';
  localStorage.setItem('theme', next);
}

// +layout.svelte
<script>
  import { browser } from '$app/environment';
  if (browser) {
    const saved = localStorage.getItem('theme') ?? 'system';
    if (saved === 'dark' || (saved === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  }
</script>
```

Add `@custom-variant dark (&:where(.dark, .dark *));` in `layout.css` and use `dark:bg-bg-dark`, `dark:text-fg-dark`, etc. on elements that need the dark treatment.

### Custom utilities via `@utility`

```css
@utility card {
  border-radius: var(--radius-lg);
  background: var(--color-bg);
  box-shadow: var(--shadow-card);
  padding: var(--spacing-page);
}
```

Then `<div class="card">` works everywhere.

### Form elements via `@tailwindcss/forms` (recommended)

Install: `bun add -d @tailwindcss/forms`. Then:

```css
@import "tailwindcss";
@plugin "@tailwindcss/forms";
```

Resets the cross-browser form-element ugliness. Classes like `[&_input]:bg-bg [&_input]:rounded-md` work but the plugin is much cleaner.

### Typography for content pages (`/about`, help text)

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

`class="prose prose-neutral max-w-none"` on the article wrapper.

## Build / dev mechanics in this project

- `vite dev` runs the SvelteKit + Vite + Tailwind plugin in one process. HMR for CSS is sub-100ms.
- `vite build` runs Lightning CSS on the final CSS file. Output goes to `.svelte-kit/output/client/_app/immutable/assets/0.<hash>.css` (and an SSR copy).
- The `prettier-plugin-tailwindcss` (already installed) sorts Tailwind classes per `--tw-sort` rules. Configure via `prettier.config.mts` `tailwindStylesheet` (already set to `./src/routes/layout.css` so the plugin knows which file holds tokens).
- `bun run format` to apply.

## Migration from a hypothetical v3 setup (not needed here)

- Move `theme.extend.colors` → `@theme { --color-* }` in CSS.
- Remove `content: [...]` if present.
- Delete `tailwind.config.{js,ts}` (optional).
- Update plugins: `require("@tailwindcss/forms")` → `@plugin "@tailwindcss/forms"` in CSS.
- Update custom variants: `darkMode: "class"` → `@custom-variant dark ...`.
- Keep `tailwind.config.{js,ts}` only if you have a plugin that requires JS (e.g. complex custom utilities in JS).

## Performance & CSS bundle size

- v4 emits one CSS file per route (or one per app, depending on Vite config). The SvelteKit+Vite combo with the Tailwind plugin tree-shakes unused classes per route by default.
- v4 doesn't include a "production" purge step separate from Vite's tree-shake. Just check the built CSS file is small.
- For the job-tracker, expect 10-30 KB of gzipped CSS for a Tailwind-only setup, growing with `@tailwindcss/typography` (~10 KB extra).

## Pitfalls

- **Forgetting `@import "tailwindcss";`** at the top of `layout.css` — no utilities, no preflight, no base styles.
- **Two `@import` order issues**: imports must come before `@theme`/`@plugin`/`@source` declarations.
- **Defining tokens in `+layout.svelte` instead of `layout.css`** — the tokens need to be in the imported CSS so the Tailwind scanner sees them when generating utilities.
- **Svelte 5 dynamic class composition**: if you build class strings like `class={`text-${color}-500`}`, the scanner can't see them. Either use static class lists (`class={['text-red-500', 'text-blue-500'][i]}`) or safelist via `@source inline("text-red-500 text-blue-500")`.
- **OKLCH colors require modern browsers**. Fallback for older targets: convert to hex/rgb in `@theme` definitions.
- **v4 + Svelte scoped styles**: Svelte scopes `<style>` blocks per component, but Tailwind utilities are global. Use Tailwind in templates, not in `<style>` blocks for the same component. Or use `:global(...)` to reach Tailwind classes from a component's `<style>`.

## Reference cheatsheet (v4 utilities worth knowing)

- Layout: `flex`, `grid`, `block`, `inline`, `hidden`, `container`, `columns-*`.
- Spacing: `m-*`, `mt-*`, `mx-*`, `space-x-*` (children spacing — replaces the old `space-x-*`), `gap-*`.
- Sizing: `w-*`, `h-*`, `size-*`, `min-w-*`, `max-w-screen-md`, `aspect-*`, `min-h-screen`.
- Color: `bg-*`, `text-*`, `border-*`, `ring-*`, `outline-*`, `shadow-*`, `accent-*`, `caret-*`, `fill-*`, `stroke-*`.
- Type: `font-*`, `text-{size}`, `leading-*`, `tracking-*`, `text-{color}/{opacity}`.
- Effects: `shadow-*`, `drop-shadow-*`, `opacity-*`, `ring-*`, `blur-*`, `backdrop-*`.
- Interactive: `hover:`, `focus:`, `active:`, `disabled:`, `group-hover:`, `peer-*`, `data-[state=open]:`, `aria-*:`
- Container queries: `@container`, `@sm:`, `@md:` …
- Dark mode: `dark:bg-bg-dark` (works once we declare the variant)
- Motion: `transition`, `transition-all`, `duration-150`, `ease-out`, `animate-spin`, `motion-safe:`, `motion-reduce:`.
- Grid: `col-span-*`, `row-span-*`, `grid-cols-*`, `grid-rows-*`, `auto-cols-*`, `place-items-*`.

## What we'll add in `src/routes/layout.css` (when we style)

```css
@import "tailwindcss";
@plugin "@tailwindcss/forms";
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-brand-50:  oklch(0.97 0.02 250);
  --color-brand-100: oklch(0.94 0.04 250);
  --color-brand-500: oklch(0.62 0.20 250);
  --color-brand-600: oklch(0.55 0.21 250);
  --color-brand-700: oklch(0.48 0.20 250);

  --color-bg:        oklch(1 0 0);
  --color-fg:        oklch(0.20 0.02 250);
  --color-muted:     oklch(0.96 0.01 250);
  --color-border:    oklch(0.92 0.01 250);
  --color-accent:    var(--color-brand-500);
  --color-danger:    oklch(0.60 0.20 25);
  --color-success:   oklch(0.65 0.18 145);

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;

  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;

  --shadow-card: 0 1px 2px rgb(0 0 0 / 0.04), 0 4px 12px rgb(0 0 0 / 0.06);
}
```

## Sources

- Tailwind v4 launch + v4.0 announcement: https://tailwindcss.com/blog (multiple 2025/2026 posts)
- v4.3 release notes (Aug 2026): https://tailwindcss.com/blog/tailwindcss-v4-3
- @theme directive deep dive (community): https://deepwiki.com/tlq5l/tailwindcss-v4-skill/2.2-the-@theme-directive
- v4 core concepts: https://deepwiki.com/tlq5l/tailwindcss-v4-skill/2-tailwind-css-v4-core-concepts
- @source directive: https://deepwiki.com/tlq5l/tailwindcss-v4-skill/2.5-the-@source-directive
- Dark mode config: https://deepwiki.com/tlq5l/tailwindcss-v4-skill/4.2.1-dark-mode-configuration
