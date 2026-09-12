# AGENTS.md

Rules for AI agents working in this repo. **docs/ research files are the source of truth for stack behavior**; this file defines how to work, not what the code is. README.md covers project overview and architecture.

## Sourcing (binding priority)

1. **`docs/` research files** — sveltekit, better-auth, drizzle, cloudflare, tailwind-v4. Before, during, and after any nontrivial change: read the relevant research file and cross-check the API surface you are using. When research and code disagree, fix the stale one and note it in the research file.
2. **MCP servers** — prefer MCP tools over web fetches/search for any provider that has one wired (Svelte, Better Auth, Cloudflare docs, etc.). MCP output is primary documentation.
3. **Vendor docs** — official domains only (svelte.dev, better-auth.com, developers.cloudflare.com, tailwindcss.com, orm.drizzle.team). Third-party blogs/Medium/AI-written summaries are never authoritative. If official sources conflict, the more recent / MCP-sourced one wins; flag the conflict in docs/.
4. **Your own training** — last. "It probably works" is not acceptance; the documented behavior is.

When a research file is updated (or added), its content binds the next change touching that area.

## Hard constraints

- **Bun, not npm.** `bun run <script>`; wrangler via `bunx`.
- **TypeScript only.** No `.js` / `.mjs` / `.cjs` source files (scripts in `db/scripts/` included). `.ts`, `.svelte` with `<script lang="ts">`, generated `.d.ts` only.
- **Svelte 5 runes-only.** `vite.config.ts` forces `runes: true`. Write `$props()`, `$state()`, `$derived()`, `$effect()` only; legacy `export let` / `$:` fails.
- **Free-tier Cloudflare Workers only.** No paid add-ons, no Workers Paid, no always-on Durable Objects, no paid R2/KV. Validate any new binding against `docs/cloudflare-research.md` first.
- **No `svelte.config.js`.** SvelteKit config lives in `vite.config.ts` via `sveltekit({ adapter: adapter() })`.
- **Tailwind v4 CSS-first.** No `tailwind.config.js`, no PostCSS. All tokens (`@theme` + dark overrides) in `src/routes/layout.css`.
- **Playwright suites stay outside the repo tree** (`/tmp/pw-tests/`), never committed.
- **`worker-configuration.d.ts` is generated** (wrangler types). Never hand-edit; regenerate via `bun run check` / `bun run types`.
- **Never edit files in `db/migrations/` by hand.** They are drizzle-kit output; change `src/lib/server/db/schema.ts` and run `bun run db:generate`.
- **`goto()` must use `resolvePath()` from `$app/paths`** (svelte/no-navigation-without-resolve). Never disable ESLint rules to ship.
- **Client-side URL state uses shallow routing** (`replaceState` from `$app/navigation`), never `goto`, for state the client already owns (filters, sort, modal-open/close flags). `goto` is for real navigations only (detail-modal open, trash toggle, action redirects) — every `goto` is a worker invocation; free-tier budget is finite.

## Conventions

- **Prettier**: tabs, single quotes, no trailing commas; `prettier-plugin-svelte` + `prettier-plugin-tailwindcss`.
- **TS strict**: `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters` on. `svelte-check` enforces.
- **Money**: integer minor units everywhere. Never floats.
- **Dates**: ISO strings in domain types; unix seconds in D1. Row mappers in `src/lib/server/db/schema.ts` are the only conversion point.
- **Data layer**: every function takes the per-request `Db` + acting userId; every query filters on userId. Dashboard rollups go through one batched aggregate (`getDashboardData`) — never add sequential per-widget queries.
- **Better Auth is request-scoped** — `getAuth()` builds from `getRequestEvent().platform.env`, never at module init. `sveltekitCookies` stays the LAST plugin.
- **Approval gate**: sign-ups start `disabled: true` (server-owned, `input: false`); first user bootstraps as approved admin. Enforced in `hooks.server.ts` + dashboard load.
- **Scripts never ship**: `db/scripts/` is dev-only tooling (local seed), `db/migrations/` is drizzle-kit output applied via wrangler. Neither is bundled; both are committed.

## Code quality bar

Semantic HTML, accessibility (WCAG 2.2 AA target), security, and performance are first-class — not polish at the end. Code must be short, efficient, readable, trackable: split into components, separation of concerns, no monolithic files. Follow current best practices from the research files — not pre-training habits.

Never patch a file because it "looks fine" or the diff is tiny. Look up the correct modern pattern in research / MCP docs first, even for one-line changes. If unsure, add a research note under `docs/` before editing.

## UI / UX / design

For visual, interaction, and design-system work, lean on global skills to the fullest: `ui-ux-pro-max`, `impeccable`, `design-taste-frontend`, `frontend-design`, `design`, `design-critique`, `accessibility-review`, `web-design-guidelines`, `web-perf`, `apple-design`, `industrial-brutalist-ui`, `minimalist-ui`, etc. Always discover what's available first; pick the skill whose trigger matches the problem, and load it before producing UI.

Visual rules: off-white bg `oklch(0.99 0 0)`, thin borders, mono labels, single neutral accent. NO em-dashes in UI copy, NO AI-purple gradients, NO rainbow dashboards (tag hues snap to six low-chroma buckets via `--tag-*` CSS vars).
