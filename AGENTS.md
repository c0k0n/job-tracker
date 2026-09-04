# AGENTS.md

Bun + SvelteKit 2 (Svelte 5 runes-only) + Tailwind v4 + `adapter-cloudflare`, deployed as a Cloudflare Worker. Pre-feature starter: placeholder `+page.svelte`, no DB/auth yet.

## Commands (bun, not npm)

- `bun run dev` — local dev (`vite dev`)
- `bun run build` — `vite build` + `adapter-cloudflare`
- `bun run check` — `svelte-kit sync && wrangler types --check && svelte-check`; must pass before done
- `bun run lint` — `prettier --check . && eslint .`
- `bun run format` — `prettier --write .`
- `bun run preview` / `deploy` — `bun run build && wrangler dev` / `wrangler deploy`
- No tests, no CI, `README.md` is empty. `wrangler` is via `bunx` (no global install).

## Quirks agents miss

- **No `svelte.config.js`.** SvelteKit config lives in `vite.config.ts` via `sveltekit({ adapter: adapter() })`. Do not create one.
- **Runes forced on** in `vite.config.ts` (`runes: true` outside `node_modules`). Write `$props()`, `$state()`, `$derived()`, `$effect()` only; legacy `export let` / `$:` will fail.
- **Tailwind v4 CSS-first.** No `tailwind.config.js` / PostCSS. Tokens/plugins go in `src/routes/layout.css` (currently just `@import 'tailwindcss'`). Vite plugin is already wired.
- **`worker-configuration.d.ts` is generated** by `wrangler types --check` (part of `check`). Don't hand-edit; regen instead. It is `.prettierignore`d but **not** eslint-ignored — the 2 `Unused eslint-disable directive` warnings from `bun run lint` are pre-existing noise from this file.
- **`wrangler.jsonc` is minimal**: `main: .svelte-kit/cloudflare/_worker.js`, `assets.directory: .svelte-kit/cloudflare`, `observability.enabled`. No D1/KV/R2 bindings, no `compatibility_flags` yet. Adding auth/DB libs needing `node:crypto`/`node:async_hooks` requires `compatibility_flags: ["nodejs_als"]`.
- **TS is strict** (`noUncheckedIndexedAccess`, `noUnusedLocals/Parameters` on). `svelte-check` enforces it.
- **Prettier style**: tabs, single quotes, no trailing commas, `prettier-plugin-svelte` + `prettier-plugin-tailwindcss` (`tailwindStylesheet: ./src/routes/layout.css`).
- **`src/app.d.ts`**: only `App.Platform` (`env/ctx/caches/cf?`) is declared. Add `App.Locals` when auth lands. `$lib/server` is server-only (build blocks client imports).

## Layout

- `src/routes/+layout.svelte` imports `layout.css`, sets favicon, renders `{@render children()}`.
- `static/.assetsignore` excludes `_worker.js` / `_routes.json` from static serving — leave it.
- `.agents/` (local research/plan notes and project-local skills) is **gitignored** — present locally, absent on fresh clone. Don't reference it as if committed, and don't commit it.

## Operating principles (non-negotiable)

- **Deployment target: Cloudflare Workers — free tier only.** Every dependency, binding, runtime limit, and feature must fit the Workers free plan (no paid add-ons, no Workers Paid, no always-on Durable Objects, no paid R2/KV beyond free quotas). Validate against `.agents/research/cloudflare-research.md` before adding any binding or service.
- **TypeScript only.** No `.js` / `.mjs` / `.cjs` source files. Use `.ts`, `.svelte` (with `<script lang="ts">`), and generated `.d.ts`. If a tool insists on JS output (e.g. a config example in a doc), port it to TS.
- **`.agents/` is the source of truth.** Files under `.agents/research/` (and the project-local `.agents/skills/`) are absolute, authoritative knowledge for this project. They reflect current behavior of the pinned stack versions and override anything in pre-training. Before, during, and after writing code: re-read the relevant research file and cross-check the API surface you are using.
  - Entry point: `.agents/research/INDEX.md` → `job-tracker-research.md` (playbook) → per-stack deep dives.
  - When a research file is updated (or a new one added), treat the new content as binding on the next change touching that area.
- **Skills and MCPs first.** Discover and load global skills (`skills_list` → `skill_view`) before reasoning about a task; load local skills from `.agents/skills/` similarly. Prefer MCP servers over web fetches/search for any provider that has one wired (Svelte, Better Auth, Cloudflare docs, Microsoft Learn, Angular, Astro, Playwright, Chrome DevTools, etc.). MCP output is treated as primary documentation.
- **Web fetch / web search is a last resort.** When unavoidable, only trust **official documentation** (vendor-owned domains like `svelte.dev`, `developers.cloudflare.com`, `tailwindcss.com`, `orm.drizzle.team`, `kit.svelte.dev`). Never act on third-party blogs, Medium posts, or AI-written summaries as if they were authoritative. If official docs contradict each other, the more recent / MCP-sourced one wins, and flag the conflict in `.agents/research/`.
- **Consult before, during, and after coding.** Every nontrivial change: read the relevant research file first, draft the change, re-check the research/API surface mid-edit, then verify against research again before declaring done. "It probably works" is not acceptance — the documented behavior is.
- **Code quality bar.** Semantic HTML, accessibility (WCAG 2.2 AA target), security, and performance are first-class — not polish at the end. Code must be short, efficient, readable, and trackable: split into components, keep separation of concerns, no monolithic files. Follow current best practices from the research files — not pre-training habits.
- **No rushed edits.** Never patch a file because it "looks fine" or the diff is tiny. Look up the correct modern pattern in research / MCP docs first, even for one-line changes. If unsure, add a research note under `.agents/research/` before editing.
- **UI / UX / design.** For visual, interaction, and design-system work, lean on global skills to the fullest: `ui-ux-pro-max`, `impeccable`, `design-taste-frontend`, `frontend-design`, `design`, `design-critique`, `accessibility-review`, `web-design-guidelines`, `web-perf`, `apple-design`, `industrial-brutalist-ui`, `minimalist-ui`, etc. Always discover what's available first; pick the skill whose trigger matches the problem, and load it before producing UI.
