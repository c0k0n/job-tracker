# Project Handoff — Job Tracker

> Comprehensive context for the next AI agent. Written at the user's request before pausing mid-Round-B. **Read this top-to-bottom before touching anything.**
>
> The document is intentionally verbose. The cost of a missed detail is hours of recovered context; the cost of a long handoff is one read. Err on the side of including too much.

---

## Table of contents

1. [What this project is](#1-what-this-project-is)
2. [Hard-wired constraints (not negotiable)](#2-hard-wired-constraints-not-negotiable)
3. [What's installed vs. what's planned](#3-whats-installed-vs-whats-planned)
4. [What's been shipped — round by round](#4-whats-been-shipped--round-by-round)
5. [Round B — in progress, exact state](#5-round-b--in-progress-exact-state)
6. [The Round A code that Round B touches (so the next agent doesn't break it)](#6-the-round-a-code-that-round-b-touches-so-the-next-agent-doesnt-break-it)
7. [What's left to do (full roadmap)](#7-whats-left-to-do-full-roadmap)
8. [How to verify your work](#8-how-to-verify-your-work)
9. [Quick reference: file map with annotations](#9-quick-reference-file-map-with-annotations)
10. [The user's preferences (psychographic notes)](#10-the-users-preferences-psychographic-notes)
11. [Open design questions for the next agent](#11-open-design-questions-for-the-next-agent)
12. [Troubleshooting recipes](#12-troubleshooting-recipes)
13. [Handoff housekeeping](#13-handoff-housekeeping)
14. [TL;DR for the next agent](#14-tldr-for-the-next-agent)

---

## 1. What this project is

**Job Tracker** — a private, multi-user job application tracker for the user, their girlfriend, and 5-7 friends. **Not** a public SaaS. **Not** meant to scale beyond ~10 users. The friend group is the cap.

- **Deployment target**: Cloudflare Workers, free tier only. (See `AGENTS.md` § "Deployment target".)
- **Stack**: Bun + SvelteKit 2.70 + Svelte 5 (runes-only) + Tailwind v4 + `adapter-cloudflare`.
- **Project root**: `/home/rillibane/Projects/web/job-tracker`
- **Branch**: `main`
- **Working state**: pre-feature, but with significant UI scaffolding already shipped (see § 4 and § 5).

The user is the sole developer. They are non-technical on backend topics (no prior Better Auth / D1 / Drizzle experience) and explicitly delegated those decisions to the agent. They have strong opinions on UI/UX and accessibility, and they want a polished, single-route-SPA feel where every interaction happens inside `/dashboard` via modals, not via route changes.

**The user's literal framing** (paraphrased from the original brief): "we have a private job application tracker for me, my gf and maybe another 5 to 7 of my friends. login page, secured dashboard route (/dashboard), private dashboard for each user. security must be unbreachable. no social oauth, no 2fa, no passkeys. d1 and r2 free tier." The "admin approval for sign-ups" and "share with my girlfriend" features came from the same conversation.

**Why this is a personal tracker, not a SaaS**: D1 / R2 free tier usage will be quick to dry out if the user accidentally lets anyone sign up. This is the core reason the admin-approval flow is non-negotiable.

---

## 2. Hard-wired constraints (not negotiable)

These are locked-in decisions from earlier conversations. **Do not re-litigate them** unless the user explicitly reverses them. Each item has the conversation round in parentheses so the next agent can find the context in the conversation history.

### 2.1 Hosting / runtime

- **Free-tier Cloudflare Workers only.** No paid add-ons, no Workers Paid, no always-on Durable Objects, no paid R2/KV. (Round 1, "deployment target: cloudflare workers — free tier only")
- **Auth provider**: not yet wired. Stub session reader exists at `src/lib/server/auth.ts` (sets a placeholder cookie). When we wire real auth, the recommendation is **Better Auth** (1.7.x) per the project's research file at `.agents/research/better-auth-research.md` (464 lines, MCP-sourced). Hand-rolling is explicitly discouraged; the user agreed. (Round 1)
- **Database**: D1 (SQLite). ORM: **Drizzle**. Both not yet installed; this is a later phase. (Round 1)
- **Storage**: R2 for resume PDFs. Not yet installed. (Round 1)
- **Node compat**: when we add Better Auth, must include `compatibility_flags: ["nodejs_als"]` in `wrangler.jsonc`. Already documented in AGENTS.md. (Round 1)

### 2.2 Auth model

- **Email + password** only. No social OAuth, no passkeys, no 2FA, no magic links. The user was explicit: "i don't want to support social oauth or google oauth or two factor or passkeys or those crazy stuffs." (Round 1)
- **Approval workflow**: post-auth `user.disabled` flag. New sign-ups land in `disabled` state; the admin (the user themselves) flips the flag to activate. A pre-auth signup queue was considered and rejected for being more complex without proportional benefit. (Round 2 — "do the cleanest, most efficient, optimized one with graceful handlings and user friendliness as well as minimizing d1 and r2 resources")
- **Admin queue** lives in a **separate protected route** `/admin/approvals` (NOT inside the dashboard). The user changed their mind on this twice — it was originally going to live in the dashboard. Confirmed: separate route. The admin is identified by hardcoded `ADMIN_ID` until we add a `role` column. (Round 2)
- **Rate limiting**: implicit, via Better Auth's built-in `rateLimit: { window: 60, max: 100 }`. (Per the research file's recommendation.)
- **CSRF**: implicit, via SvelteKit's form actions + cookie `SameSite=Lax`. (No explicit config needed.)

### 2.3 Sharing model

- **Authenticated-only sharing** for now. Shape: `share_grant(application_id, viewer_user_id, permissions, granted_at, expires_at?, revoked_at?)` with comment thread support.
- **No public links.** Was considered, rejected on security grounds. The "send to my father who isn't a user" use case is solved by screenshot/copy-paste. (Round 2)
- **No deep linking to specific applications** (no `/dashboard?app=abc123` URLs). All app state is modal-driven. If the user later reverses this, the change is mechanical (URL → state). (Round 2 — "no other way should be able to access that route without successful login" applied to deep links)
- **Comments on shared apps**: recipient can leave comments on a shared application; private to the share, visible only to the owner. (Round 2)

### 2.4 UI architecture

- **Single-route SPA at `/dashboard`.** No nested routes for applications, resumes, or admin. Everything is modal-driven. (Round 2 — "make everything works within that dashboard route. like once logged in, there should be no reason for us to be like going to another page just to fill up stuffs. i want it like complete ... what they say .. spa feel")
- **No new pages until explicitly requested.** All future sub-views (application detail, resume library, admin approvals) are modals inside `/dashboard`. Exception: `/admin/approvals` is a separate route because the user wants it gated by a server-side admin check, not just hidden in a modal.
- **URL state** for filter/sort: `?q=...&stage=...&status=...&arr=...&tag=...&sort=...&dir=...`. The URL is the source of truth; the dashboard's local state mirrors it via `goto({replaceState: true})`. (Round 2)
- **Modal library**: hand-rolled `Modal.svelte` (~180 LOC). bits-ui was read and rejected as overkill for one primitive. (Round 2 — "if you wanna use bits ui go ahead, if you wanna hand-roll please do so")
- **PDF preview**: in-browser via `<iframe>`. Download link as fallback. (Round 2)

### 2.5 Component location

- `src/lib/components/` — presentational UI primitives (Button, Modal, StatCard, etc.) and dashboard-specific composites (ApplicationsTable, PipelineBar, etc.). All in one flat directory; no sub-folders.
- `src/lib/server/` — server-only modules (auth stub, applications-data stub). `$lib/server` blocks client imports at build time per SvelteKit convention.
- `src/lib/utils/` — pure functions (dates, money, sortFilter, kpis).
- `src/lib/constants/` — runtime constants (stages, currencies).
- `src/lib/types.ts` — shared TypeScript types (Application, ApplicationStage, etc.).
- No sub-folders; if a file's name is clear, no folder is needed. (User's preference — confirmed at the start of Round A.)

### 2.6 Modal × URL sync pattern

The `Modal.svelte` primitive takes a bindable `open` prop. Parent components own the open state. The dashboard's `goto({replaceState: true, keepFocus: true, noScroll: true})` for filter changes uses `resolvePath()` from `$app/paths` to satisfy the `svelte/no-navigation-without-resolve` ESLint rule (which requires `goto()` arguments to be either a `Literal` or a result of `resolve(...)`). **Never disable ESLint rules** — find the rule-correct pattern instead. (Round A — there was a long debugging session over this.)

### 2.7 Tag system (Round B)

- **Tag values**: free-form lowercase-hyphenated strings (e.g. `remote`, `dream-company`, `high-priority`).
- **Color**: auto-assigned by hash from a fixed palette (planned for later). For now, all tags render in the same neutral color.
- **Filter semantics**: OR-within-group (selecting `remote` + `fintech` matches apps tagged with either).
- **Stored as**: `Application.tags: string[]` — denormalized for simplicity. The eventual normalized shape is `tag(id, user_id, name)` + `application_tag(application_id, tag_id)`. (Deferred to backend phase.)

### 2.8 Visual design rules (the user's taste)

- **Editorial structure**: off-white background (`oklch(0.99 0 0)`), thin borders, mono labels for metadata, generous whitespace, single neutral accent.
- **No em-dashes**. The user has called this out specifically in past generations as a "smell."
- **No AI-purple gradients**. The accent color is currently `oklch(0.21 0 0)` (near-black) — not purple, not blue.
- **No rainbow dashboards**. Status and stage colors are kept low-chroma; the badges read as state, not decoration.
- **No fake-screenshot divs** (per the design-taste-frontend skill, BANNED).
- **No animations beyond CSS transitions** (no GSAP, no scroll-hijacking, no infinite loops).
- **Semantic HTML** everywhere. Native `<button>`, `<a>`, `<table>`, `<dl>`, `<dt>`, `<dd>`, `<form>`. The "Web Interface Guidelines" skill from the global skills is a good cross-reference.
- **WCAG 2.2 AA target** for accessibility. Contrast, focus-visible, keyboard activation, `aria-*` attributes.
- **44px-min tap targets** on all interactive elements.
- **`prefers-reduced-motion`** honored (Round A is naturally compliant since we only use `transition-colors`).

---

## 3. What's installed vs. what's planned

### 3.1 Already installed (do not re-add)

```
@sveltejs/adapter-cloudflare ^7.2.9
@sveltejs/kit ^2.70.3
@sveltejs/vite-plugin-svelte ^7.3.0
@tailwindcss/vite ^4.3.3
@types/bun ^1.4.0
eslint ^10.9.1
prettier ^3.9.6
svelte ^5.57.0
svelte-check ^4.7.6
tailwindcss ^4.3.3
typescript ^6.0.3
vite ^8.2.2
wrangler ^4.129.0
```

`package.json` `scripts`: dev, build, check, lint, format, types, preview, deploy, prepare.

### 3.2 Not installed (planned for backend phase)

- `drizzle-orm`, `drizzle-kit` — DB layer
- `better-auth`, `@better-auth/drizzle-adapter`, `@better-auth/cli` — auth
- `@sveltejs/enhanced-img` (probably not needed; v4 handles images)

When the user is ready for backend wiring, start with the project research file's `Phase 0-2` checklist at `.agents/research/job-tracker-research.md` (lines 35-78). The TL;DR for that phase is at the bottom of the same file (lines 244-257).

### 3.3 Test / dev tooling

- **No tests, no CI, no README.** Per `AGENTS.md`. The user has explicitly chosen to keep testing out of the project tree.
- **Playwright is installed at `/tmp/pw-tests/`** (out of project tree). This is the user's preferred pattern: keep browser tooling out of the repo. The next agent should use the same `/tmp/pw-tests/` location.
- **The `/tmp/pw-tests/` directory is recreated on every agent handoff.** Don't assume it persists. The setup is documented in § 8.2.

---

## 4. What's been shipped — round by round

### 4.1 Round 0 — Initial scaffold

The user's starting repo: SvelteKit 2 + Svelte 5 + Tailwind v4 + Cloudflare adapter, with one placeholder `+page.svelte` ("Welcome to SvelteKit"). No DB, no auth. `wrangler.jsonc` was minimal (name, main, assets, observability).

### 4.2 Round 1 — Error pages (verified by user)

**Files added:**

- `src/routes/+error.svelte` — handles 404 (no route match) and thrown errors. Branches on `$page.status`. Renders attempted path in `<code>` for 404s. Two CTAs: hard-nav home + `history.back()`. Title via `<svelte:head>`. `noindex` meta.
- `src/routes/[...path]/+page.ts` — explicit catch-all that throws `error(404, ...)` so any unmatched URL renders `+error.svelte` (instead of SvelteKit's default).
- `src/error.html` — fallback for errors thrown from `handle` or `+server.js` (where `+error.svelte` is NOT used, per the SvelteKit MCP docs). Uses `%sveltekit.status%` + `%sveltekit.error.message%` placeholders. Self-contained CSS with `prefers-color-scheme`. Backdrop-blur, semantic markup, focus styles.
- `src/routes/layout.css` — added `@theme` tokens (bg, surface, fg, muted, border, accent, danger, success). `@custom-variant dark`. `prefers-color-scheme: dark` overrides. (This file grew further in later rounds.)
- `src/app.d.ts` — added `App.Error` interface with `code?: string`.

**Dark-mode bug found and fixed**: the error page had text rendered in `text-muted` on a white browser default because no element painted a `bg-bg`. Fixed by adding `class="min-h-screen bg-bg text-fg antialiased"` to `<body>` in `src/app.html`. This made the whole viewport theme correctly, not just the `<main>`. Subsequent Playwright run confirmed contrast ratios of 17.31:1 (light) and 17.83:1 (dark), both AAA.

**Playwright verification** at `/tmp/pw-tests/`: 11/11 assertions pass. Screenshots in `/tmp/pw-tests/screenshots/`.

### 4.3 Round 2 — Auth surface (sign-in + sign-up tabs on `/`)

**Files added:**

- `src/hooks.server.ts` — populates `event.locals.user` from stub `getSession(cookies)`.
- `src/lib/server/auth.ts` — `getSession`, `setSession`, `clearSession`, `SessionUser` type. Stub cookie-based. Real Better Auth will replace this with `auth.api.getSession({headers})`.
- `src/app.d.ts` — added `App.Locals.user: SessionUser | null`.
- `src/routes/+page.svelte` — replaced placeholder. Two tabs (`Sign in` / `Create account`) on the same page. `<form method="POST" use:enhance>` with `novalidate` (server-side validation is the source of truth). Field-level errors via `fail()`. Hidden username field for password-manager association. 44px tap targets. `aria-pressed` on tabs, `aria-describedby` on inputs, `aria-busy` on submit, `aria-live` for form-level errors.
- `src/routes/+page.server.ts` — server load redirects to `/dashboard` if signed in. Default form action branches on `mode=signin` / `mode=signup`, validates input shape, sets stub session cookie, redirects. **Stub accepts anything matching the validation rules** — real Better Auth will replace this with `auth.api.signInEmail` / `auth.api.signUpEmail`.

**Round 2's design read**: "personal tool, not a marketing page" — chose editorial structure (off-white bg, mono labels, thin borders, single neutral accent) over playful / corporate.

**Playwright verification** at `/tmp/pw-tests/auth-flow.mjs`: 11/11 assertions pass, including:

- Unauth `/dashboard` → 303 to `/?next=%2Fdashboard` (security guard works)
- Default heading "Welcome back"
- Tab swap → "Create your account" + confirm field appears
- Sign-up with mismatched passwords → "The two passwords do not match."
- Sign-up with `short` → "Use at least 8 characters."
- Successful sign-in (ada@example.com + correcthorsebatterystaple) → /dashboard
- Dashboard shows username `ada` / email `ada@example.com`
- Sign-out → /
- Post-signout /dashboard → redirect again

### 4.4 Round A — Dashboard (foundation + KPIs + pipeline + table)

This is the largest single round. All committed; check/lint/build clean; 22/22 Playwright assertions pass.

**New types** at `src/lib/types.ts`:

- `Application` (the row)
- `ApplicationStage` (10 values: `saved, applied, phone_screen, technical, onsite, final, offer, accepted, rejected, withdrawn`)
- `ApplicationStatus` (5 values: `active, stalled, ghosted, paused, closed`) — orthogonal to stage
- `WorkArrangement` (`remote, hybrid, onsite, unspecified`)
- `CurrencyCode` (32 ISO 4217 codes)
- `Salary` (4 shapes: `exact`, `range`, `min_only`, `max_only`)
- `ApplicationFilters`, `ApplicationSort`, `SortKey`, `SortDir`
- `KpiCounts`

**New constants** at `src/lib/constants/stages.ts`:

- `STAGES: StageMeta[]` with `value`, `label`, `shortLabel`, `colorToken`. Order matters — that's the funnel render order.
- `STATUSES: StatusMeta[]` — same shape.
- `ARRANGEMENTS: ArrangementMeta[]` — `label` only.
- Lookup maps `STAGE_BY_VALUE`, `STATUS_BY_VALUE`, `ARRANGEMENT_BY_VALUE`.

**New constants** at `src/lib/constants/currencies.ts`:

- 32 ISO 4217 entries with `code, label, symbol, minorUnits, position, locale`.
- Lookup map `CURRENCY_BY_CODE`.

**New utilities** at `src/lib/utils/`:

- `dates.ts`: `daysSince`, `daysBetween`, `formatRelative`, `formatDateShort`, `formatDurationInStage`, `isUpcoming`, `isThisMonth`, `toDateInputValue`. Uses native `Intl` only.
- `money.ts`: `formatSalary(salary)` handles all 4 Salary shapes via `Intl.NumberFormat({notation: 'compact'})`. Output examples: `$185k`, `$140k–$170k`, `£75k+`, `≤₹45L`, `¥11.5M`.
- `sortFilter.ts`: `applyFilters`, `applySort` (with custom stage/status order, null-to-bottom), `parseFiltersFromUrl`, `serializeFiltersToUrl`, `hasActiveFilters`, `tagFacetsFor` (added in Round B). Pure functions, fully testable.
- `kpis.ts`: `computeKpis`, `countByStage`, `countByStatus`, `needsAttentionList`. Server-side rollups.

**Stub data** at `src/lib/server/applications-data.ts`:

- 18 fixtures covering every funnel stage, every status, 6 currencies (USD, EUR, JPY, GBP, INR, SGD), all 4 salary shapes, 1 saved, 1 stalled, 1 ghosted, 1 paused, 2 rejected, 1 accepted, 1 withdrawn.
- `getApplicationsForUser`, `getApplicationById`, `createApplication`, `updateApplication`, `deleteApplication`, `resetStore`. Uses `globalThis` symbol for HMR persistence.
- Real D1 swap-in is mechanical: replace each function with its Drizzle equivalent; call sites don't change.

**Components** at `src/lib/components/`:

- `Modal.svelte` — accessible modal primitive. Bindable `open`. Focus trap. `Esc` close. Backdrop click. Topmost-modal-only Esc. Focus restore. Body scroll lock. ~180 LOC.
- `Button.svelte` — variants `primary/ghost/outline/danger`, sizes `sm/md/lg`. `busy` state with spinner. ~85 LOC.
- `StatCard.svelte` — KPI card with optional accent strip + tone. ~85 LOC.
- `StatusBadge.svelte` — stage/status/arrangement pill with token-based colors. ~55 LOC.
- `PipelineBar.svelte` — 10-stage stacked bar with click-to-filter + legend. ~95 LOC.
- `ApplicationsTable.svelte` — 9-column table with sortable headers (callback-based, parent owns sort). Resume paperclip icon. Row click callback. Keyboard activation. ~225 LOC.
- `FilterBar.svelte` — search input + 4 chip groups (Stage, Status, Work, Sort by) with active state + "Clear all". Bound to parent `filters` + `sort`. ~230 LOC. **Updated in Round B to add Tags chip group.**
- `EmptyState.svelte` — generic empty-state card. ~30 LOC.

**Dashboard route** at `src/routes/dashboard/`:

- `+page.server.ts` — guards via `event.locals.user`. Returns `applications`, `kpis`, `stageCounts`, `filters`, `sort`.
- `+page.svelte` — full dashboard with header (username + sign-out), stale-row banner (when `needsAttention > 0`), 5-card KPI strip, pipeline bar, filter bar, applications table, empty states, footer. URL ↔ local state via `goto({replaceState: true})` filtered through `resolvePath()`.

**Layout CSS additions** at `src/routes/layout.css`:

- `--color-stage-{saved,applied,progress,late,offer,terminal,closed}-100/700` (light + dark variants)
- `--color-status-{active,stalled,ghosted,paused,closed}-100/700`
- All kept low-chroma so the dashboard doesn't turn into a rainbow

**Test expectations** (verified by Playwright on 2026-09-04):

- `kpi-active=14, kpi-interviews=10, kpi-offers=1, kpi-applied=3, kpi-needs=2`
- 10 pipeline segments (one per stage)
- 18 table rows
- Stale banner with "2 applications need attention"
- Filter chip on `Offer` → URL `?stage=offer` → 1 row
- Clear all → URL clean → 18 rows
- Sort by Company → first row `Wise` (alphabetical desc)
- Search `stripe` → 2 rows (Stripe row + Datadog row whose notes mention Stripe)
- Empty state when no matches
- Pipeline segment click → filter the table

### 4.5 Round B — In progress (interrupted mid-build)

User's question that triggered Round B: "forgot about round A, start round B." Round A is locked in. Round B is the rich visualizations layer.

**Round B scope (what the user asked for in plain language):**
"i want all sorts of stats, graphs, charts, visualizations in my dashboard and i want it rich and colorful but i don't want any duplicate information in the dashboard. and all stats, graphs, charts, visualizations should have graceful handling when i don't even have any application data yet."

**Round B deliverables:**

1. Time-in-stage heatmap (`StageActivityHeatmap.svelte`) — 90-day window bucketed by week; color intensity = stage-change count. Implemented.
2. Velocity line chart (`VelocityChart.svelte`) — daily count of new applications + stage transitions over 90 days, rendered as two lines (solid + dashed). Implemented.
3. Stage-conversion funnel (`ConversionFunnel.svelte`) — current-state funnel showing apps at or past each stage. Implemented.
4. Tag filter — extended `ApplicationFilters.tags: string[]`, parser, serializer, `applyFilters`, `tagFacetsFor`. Implemented.
5. Tags column in the applications table — **not yet done**.
6. Wire all 3 charts + tags into the dashboard — **not yet done**.

**Round B data layer changes that ARE done:**

- `Application.tags: string[]` added to the type and all 18 fixtures (with thoughtful tag distribution: 9 apps `remote`, 8 `dream-company`, 7 `high-priority`, 6 `big-tech`, 5 `fintech`, plus `developer-tools, ai, productivity, startup, onsite, japan, marketplace, apac, india, design-tools, devsecops, robotics, design-systems, referral, payments, observability`).
- `parseFiltersFromUrl` and `serializeFiltersToUrl` extended for `tag` query param.
- `applyFilters` extended for tag filter (OR-within-group).
- `hasActiveFilters` extended.
- `tagFacetsFor` added for chip-group rendering.

**Round B files that exist but aren't wired:**

- `src/lib/components/StageActivityHeatmap.svelte` ✓ written
- `src/lib/components/VelocityChart.svelte` ✓ written
- `src/lib/components/ConversionFunnel.svelte` ✓ written (but has unresolved TS errors — see § 5)

**Round B files that DON'T exist yet:**

- `FilterBar` update to add Tags chip group
- `ApplicationsTable` update to add Tags column
- Dashboard updates to import and place the 3 new components
- `+page.server.ts` update to pass `tagFacets` to client

**Current TS state (will fail `bun run check`):**

1. `VelocityChart.svelte:2:2` — `'daysSince' is declared but its value is never read` — **already fixed** (removed the import). Should be clean now; re-verify.
2. `ConversionFunnel.svelte:2:19` — `'STAGE_VALUES' is declared but its value is never used` — needs the import to be removed, OR a real use of `STAGE_VALUES` somewhere in the file.
3. `ConversionFunnel.svelte:139` — `'prev' is possibly 'undefined'` — the `funnel[i-1]` access in the template needs a non-null guard. The `@const` declaration doesn't survive into the inner expression context.

These are quick fixes. The next agent should resolve them in order:

- `STAGE_VALUES` is genuinely unused; remove the import.
- The `prev` undefined case: change `funnel[i-1]` to `funnel[i - 1]` and add a guard like `{@const prev = funnel[i - 1] ?? null}{#if prev}...{/if}`.

After fixing the funnel component, the next agent should:

1. **Wire `tagFacets` into `+page.server.ts`**: add `import { tagFacetsFor }` and return `tagFacets: tagFacetsFor(applications)` from the load function.
2. **Update `+page.svelte`**: import the 3 chart components and `tagFacetsFor`. Place them in a new "Insights" section between the pipeline bar and the applications section. Pass `data.tagFacets` to the FilterBar.
3. **Update `FilterBar.svelte`**: add a new prop `tagFacets: TagFacet[]`, render a Tags chip group using the same chip pattern as Stage/Status/Work. Wire `filters.tags` toggle. Render the count next to each tag.
4. **Update `ApplicationsTable.svelte`**: add a Tags column showing the first 2-3 tag pills inline with "+N" overflow indicator. Place the column between Status and Arrangement (or wherever fits best visually).

### 4.6 What's left to do (full roadmap)

Per the original phased plan in `.agents/research/job-tracker-research.md`, plus the user's modifications:

- **Round B** (in progress): 3 chart components + tag filter + tag column. The 3 chart components are written but not wired. Tag filter and table column are pending.
- **Round C** (modals + sharing + admin + CSV): application detail modal (edit form, interview list, contacts, activity feed, embedded PDF viewer), resume library modal (upload, list, select), admin approvals modal at `/admin/approvals`, CSV export at `/dashboard/export.csv`, application create/edit/delete wired through Better Auth.
- **Backend phase**: Drizzle schema, Better Auth wiring, D1 binding, R2 bucket binding, `compatibility_flags: ["nodejs_als"]`, real `src/lib/server/auth.ts`, real `src/lib/server/applications-data.ts`, real route guards (the `user.disabled` check), admin guard, password reset, email verification (deferred per user — they said "no email/push" for in-app reminders; sign-up verification is still needed for auth).
- **Polish**: keyboard shortcuts (mentioned but not committed), error boundary, loading skeletons, a11y audit.

The user explicitly said no charts beyond what's already planned, no payroll/SaaS features, no public links, no email/push notifications. Those are settled.

---

## 5. Round B — in progress, exact state

This section is the most important one for the next agent. It describes what's already on disk, what the exact code state is, and what the unresolved issues are.

### 5.1 Round B file list

| Path                                             | Status       | Notes                                                                                                                                                                                                      |
| ------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/types.ts`                               | modified     | `Application.tags: string[]` added. `ApplicationFilters.tags: string[]` added.                                                                                                                             |
| `src/lib/server/applications-data.ts`            | modified     | All 18 fixtures have `tags: [...]` populated. `materializeFixture` passes through `tags`.                                                                                                                  |
| `src/lib/utils/sortFilter.ts`                    | modified     | `parseFiltersFromUrl` parses `tag` query. `serializeFiltersToUrl` writes `tag` query. `applyFilters` filters by `tags` (OR-within-group). `hasActiveFilters` checks `tags`. New `tagFacetsFor()` exported. |
| `src/lib/components/StageActivityHeatmap.svelte` | created      | NOT wired into the dashboard.                                                                                                                                                                              |
| `src/lib/components/VelocityChart.svelte`        | created      | NOT wired into the dashboard.                                                                                                                                                                              |
| `src/lib/components/ConversionFunnel.svelte`     | created      | NOT wired. Has 2 TS errors.                                                                                                                                                                                |
| `src/lib/components/FilterBar.svelte`            | NOT modified | Needs a Tags chip group.                                                                                                                                                                                   |
| `src/lib/components/ApplicationsTable.svelte`    | NOT modified | Needs a Tags column.                                                                                                                                                                                       |
| `src/routes/dashboard/+page.svelte`              | NOT modified | Needs to import + place the 3 chart components.                                                                                                                                                            |
| `src/routes/dashboard/+page.server.ts`           | NOT modified | Needs to return `tagFacets` to the client.                                                                                                                                                                 |

### 5.2 StageActivityHeatmap.svelte — full state

The component is **complete and correct**. It renders a 90-day window bucketed by week, with cell color intensity = stage-change count on any day in that week. Uses `oklch(0.97 {intensity * 0.06} 250)` — low-chroma blue, not AI-purple. Has graceful empty state. X-axis labels: `90d ago`, `60d ago`, `30d ago`, `now`. Title attribute on each cell for hover detail.

Key implementation detail: it uses `daysSince()` from `$lib/utils/dates` to bucket. The math is correct, the empty state renders when no apps have changed stage in the window, the visual gradient is intentionally subtle (max chroma 0.06).

**No changes needed in this file.**

### 5.3 VelocityChart.svelte — full state

The component renders an inline SVG with two paths (applications line in `var(--color-accent)`, transitions line in `var(--color-status-stalled-700)` dashed). Window is 90 days by default. Has graceful empty state. X-axis labels: 6 evenly-spaced date stamps. Subtle grid lines at top, mid, bottom.

Key implementation detail: count derived from `appliedAt` (for "applied" events) and `stageChangedAt` (for "transition" events, excluding same-day-as-applied double-counts).

**The next agent should:**

- Verify the unused-import error is gone. (The previous edit removed `import { daysSince }` but the conversation was interrupted. The file should be clean now, but verify.)
- Wire it into the dashboard. Pass `data.applications` to it.

### 5.4 ConversionFunnel.svelte — full state with errors

Renders 10 horizontal bars (saved is excluded; saved apps haven't applied). Each bar's width = `count / max * 100%` so the first bar (everyone who applied) is the widest. Color = the stage's colorToken. Inside each bar: count + percent + stage-to-stage conversion percent.

Has a "Closed stages" footer: rejected/withdrawn apps count only toward "applied" (because we don't have rejection-history detail).

**The next agent should:**

1. Remove the `STAGE_VALUES` import (genuinely unused).
2. Fix the `prev` undefined check. Current line 139 has `funnel[i-1]` inside an `@const` which doesn't survive. Restructure as:
   ```svelte
   {#if i > 0}
   	{@const prev = funnel[i - 1]}
   	{#if prev && prev.count > 0}
   		<span class="ml-1 text-muted">· {((item.count / prev.count) * 100).toFixed(0)}% conv</span>
   	{/if}
   {/if}
   ```
3. Wire it into the dashboard.

### 5.5 The wiring work (next agent's first task)

In order:

1. **Fix the 3 TS errors in the 3 chart components** (most are in `ConversionFunnel.svelte`).
2. **Update `+page.server.ts`**: import `tagFacetsFor`, return `tagFacets: tagFacetsFor(applications)`.
3. **Update `+page.svelte`** to:
   - Import `StageActivityHeatmap`, `VelocityChart`, `ConversionFunnel` (already have `StatCard` import etc.)
   - Add a new section between the pipeline bar and the applications section, titled "Insights" (or whatever name feels right — surface this to the user if uncertain).
   - Layout: 2-column on `lg+` (heatmap on left, velocity chart on right; conversion funnel full-width below). On smaller screens they stack.
   - Each chart component handles its own empty state, so the section doesn't need a wrapper empty state.
   - The "No data" empty state for the dashboard as a whole is already handled by the `if !hasApplications` check in the existing dashboard markup. The insights section is only rendered when `hasApplications` is true.
4. **Update `FilterBar.svelte`**:
   - Add `tagFacets: TagFacet[]` prop.
   - Add a new chip group "Tags" between the "Work" group and the "Sort by" group.
   - Each tag chip shows `{tag} {count}` (e.g. `remote 9`).
   - On click, toggle the tag in `filters.tags` (OR-within-group).
   - Use the same `aria-pressed` pattern as the other chip groups.
5. **Update `ApplicationsTable.svelte`**:
   - Add a "Tags" column. Show the first 2-3 tags as small inline pills. If more, append a `<span class="text-muted">+N</span>` indicator.
   - Place the column between "Status" and "Arrangement" so the natural reading order is: company → role → stage → status → tags → arrangement → salary → applied → in-stage → next-action.
   - Use `class="hidden lg:table-cell"` so it only shows on `lg+` viewports. (The table already has progressive column hiding.)
6. **Run `bun run check`, `bun run lint`, `bun run build`**. Fix any regressions.
7. **Run the existing Playwright tests** (`/tmp/pw-tests/dashboard.mjs`) to confirm Round A still passes. Add new assertions for:
   - Insights section renders
   - Each chart renders the expected number of elements (e.g. 13 cells in the heatmap)
   - Tag filter chip toggle works
   - Tags column appears in the table
8. **Hand back to the user** with a clear summary.

---

## 6. The Round A code that Round B touches (so the next agent doesn't break it)

The Round B work is non-invasive. It adds 3 new files, extends 2 existing files in the data layer, and adds a Tags chip group to one component. None of Round A's behavior changes. But here are the hot spots where care is needed:

### 6.1 `Application` type

`src/lib/types.ts` already has `tags: string[]` from Round B's data-layer changes. The `createApplication` server function in `applications-data.ts` spreads `input` which already includes `tags` via the `CreateApplicationInput` type (`Omit<Application, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'stageChangedAt'>`). So the create flow is already correct — no changes needed.

### 6.2 `+page.server.ts` load function

Currently returns `{ user, applications, kpis, stageCounts, filters, sort }`. Round B needs `tagFacets` added. The dashboard's `+page.svelte` reads from `data.X` — adding a new field doesn't break existing reads.

### 6.3 `+page.svelte` URL sync pattern

This is the most fragile piece. The current pattern:

```ts
const urlTarget = $derived.by(() => {
	const sp = serializeFiltersToUrl(filters, sort);
	return sp.toString() ? `?${sp.toString()}` : '';
});

$effect(() => {
	const target = urlTarget;
	const current = pageStore.url.search;
	if (target !== current) {
		void goto(resolvePath(`/dashboard${target}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		}).catch(() => {
			/* navigation cancelled */
		});
	}
});
```

The `urlTarget` derived is already reactive to `filters` changes. Adding `tags` to the filter set will automatically route through this. No changes needed here.

### 6.4 The "go back to top of table after filter change" pattern

Round A's `+page.svelte` does NOT scroll to the top after a filter change. The current behavior: filter changes preserve scroll position. If the user wants scroll-to-top after a filter change, that would be a Round C polish item. **Do not add it now** — it's a scope creep risk.

### 6.5 The "Add your first application" button

Currently disabled with `ariaLabel="Add application (coming in Round C)"`. Round C wires the actual modal. Round B must NOT enable this button.

---

## 7. What's left to do (full roadmap)

Per the original phased plan in `.agents/research/job-tracker-research.md`, plus the user's modifications:

- **Round B** (in progress): 3 chart components + tag filter + tag column. The 3 chart components are written but not wired. Tag filter and table column are pending.
- **Round C** (modals + sharing + admin + CSV): application detail modal (edit form, interview list, contacts, activity feed, embedded PDF viewer), resume library modal (upload, list, select), admin approvals modal at `/admin/approvals`, CSV export at `/dashboard/export.csv`, application create/edit/delete wired through Better Auth.
- **Backend phase**: Drizzle schema, Better Auth wiring, D1 binding, R2 bucket binding, `compatibility_flags: ["nodejs_als"]`, real `src/lib/server/auth.ts`, real `src/lib/server/applications-data.ts`, real route guards (the `user.disabled` check), admin guard, password reset, email verification (deferred per user — they said "no email/push" for in-app reminders; sign-up verification is still needed for auth).
- **Polish**: keyboard shortcuts (mentioned but not committed), error boundary, loading skeletons, a11y audit.

The user explicitly said no charts beyond what's already planned, no payroll/SaaS features, no public links, no email/push notifications. Those are settled.

---

## 8. How to verify your work

### 8.1 Project-side

```
bun run check      # svelte-check, must be 0 errors / 0 warnings
bun run lint       # prettier + eslint, must be 0 errors (2 pre-existing
                    #  warnings on worker-configuration.d.ts are noise
                    #  per AGENTS.md § "worker-configuration.d.ts is generated")
bun run build      # vite build + adapter-cloudflare, must succeed
```

### 8.2 Browser-side (isolated, in `/tmp/pw-tests/`)

```bash
mkdir -p /tmp/pw-tests && cd /tmp/pw-tests
cat > package.json <<'EOF'
{ "name": "pw-tests", "private": true, "type": "module",
  "dependencies": { "playwright": "^1.62.0" } }
EOF
bun install
bunx playwright install chromium
```

Then write tests as standalone `.mjs` files that import from `playwright` and assert against `http://localhost:5173`. Start the dev server with `bun run dev --port 5173` (background) before running tests. Screenshots go to `/tmp/pw-tests/screenshots/`.

**Existing test scripts** (run any of them):

- `/tmp/pw-tests/check.mjs` — error page contrast (light + dark)
- `/tmp/pw-tests/auth-flow.mjs` — sign-in / sign-up / dashboard guard / sign-out
- `/tmp/pw-tests/dashboard.mjs` — KPIs / pipeline / table / filter / sort / search (22 assertions)

**Do NOT move Playwright into the project tree.** The user has been clear about this.

---

## 9. Quick reference: file map with annotations

```
src/
├── app.d.ts                          # App.Platform + App.Error + App.Locals
│                                       Round B: no change needed.
├── app.html                          # <body> has bg-bg + color-scheme meta
│                                       Round B: no change needed.
├── error.html                        # non-SvelteKit error fallback
│                                       Round B: no change needed.
├── hooks.server.ts                   # stub: populates locals.user
│                                       Round B: no change needed.
├── lib/
│   ├── types.ts                      # Application, ApplicationStage, etc.
│                                       Round B: ALREADY EXTENDED with Application.tags
│                                       and ApplicationFilters.tags.
│   ├── constants/
│   │   ├── stages.ts                 # STAGES, STATUSES, ARRANGEMENTS
│   │   │                                 Round B: no change needed.
│   │   └── currencies.ts             # 32 ISO 4217 entries
│   │                                     Round B: no change needed.
│   ├── server/
│   │   ├── auth.ts                   # stub session reader
│   │   │                                 Round B: no change needed.
│   │   └── applications-data.ts      # stub store, 18 fixtures
│   │                                     Round B: ALREADY EXTENDED with tags
│   │                                     on all 18 fixtures and materializeFixture.
│   ├── utils/
│   │   ├── dates.ts                  # 8 helpers, native Intl only
│   │   │                                 Round B: no change needed.
│   │   ├── money.ts                  # formatSalary, 4 salary shapes
│   │   │                                 Round B: no change needed.
│   │   ├── sortFilter.ts             # includes tagFacetsFor
│   │   │                                 Round B: ALREADY EXTENDED with tag
│   │   │                                 parsing/serialization/filtering.
│   │   └── kpis.ts                   # computeKpis, countByStage, etc.
│   │                                     Round B: no change needed.
│   └── components/
│       ├── Modal.svelte              # hand-rolled accessible modal
│       │                                 Round B: no change needed.
│       ├── Button.svelte             # 4 variants, 3 sizes
│       │                                 Round B: no change needed.
│       ├── StatCard.svelte           # KPI card
│       │                                 Round B: no change needed.
│       ├── StatusBadge.svelte        # stage/status/arr pill
│       │                                 Round B: no change needed.
│       ├── PipelineBar.svelte        # 10-stage stacked bar
│       │                                 Round B: no change needed.
│       ├── ApplicationsTable.svelte   # 9-column table
│       │                                 Round B: NEEDS TAGS COLUMN.
│       ├── FilterBar.svelte           # search + 4 chip groups
│       │                                 Round B: NEEDS TAGS CHIP GROUP.
│       ├── EmptyState.svelte         # generic empty state
│       │                                 Round B: no change needed.
│       ├── StageActivityHeatmap.svelte  # Round B, not wired
│       │                                  (file is complete + correct)
│       ├── VelocityChart.svelte         # Round B, not wired
│       │                                  (file is complete; verify unused-import fix)
│       └── ConversionFunnel.svelte      # Round B, not wired
│                                          (file has 2 TS errors to fix)
└── routes/
    ├── +error.svelte                 # 404 / 5xx
    │                                       Round B: no change needed.
    ├── +layout.svelte                # imports layout.css
    │                                       Round B: no change needed.
    ├── +page.svelte                  # sign-in / sign-up
    │                                       Round B: no change needed.
    ├── +page.server.ts               # auth action
    │                                       Round B: no change needed.
    ├── [...path]/
    │   └── +page.ts                  # catch-all 404
    │                                       Round B: no change needed.
    ├── dashboard/
    │   ├── +page.svelte              # full dashboard (Round A)
    │   │                                 Round B: NEEDS TO IMPORT + PLACE 3 CHARTS.
    │   └── +page.server.ts           # load + sign-out action
    │                                       Round B: NEEDS TO RETURN tagFacets.
    └── layout.css                    # @theme tokens, stage/status colors
                                            Round B: no change needed.
                                            (Maybe add chart-axis colors in
                                            a later polish round.)

wrangler.jsonc                        # minimal: name, main, assets, observability
worker-configuration.d.ts             # generated, ignored by prettier
AGENTS.md                             # project rules — read this first
HANDOFF.md                            # this file
.agents/research/                      # 6 research files, source of truth
```

---

## 10. The user's preferences (psychographic notes)

- **Has strong opinions on UI/UX** but is non-technical on backend. They want a polished feel; they recognize "AI slop" instantly. They will call it out.
- **Hates** em-dashes, fake-screenshot divs, AI-purple gradients, rainbow dashboards, generic SaaS landing-page patterns, "View Selected Work" CTAs.
- **Loves** editorial structure, mono labels, off-white backgrounds, low-chroma status colors, single-accent restraint, generous whitespace, semantic HTML, real a11y, "Tools not Landing Pages" energy.
- **Communication style**: concise. Don't lecture. Don't re-litigate locked decisions. If you find a bug, fix it and report what you did, not why they should care.
- **Will push back** if you do something that violates the project research files. The research files in `.agents/research/` are the source of truth. If you find a conflict between them and your training, the research files win.
- **Will ask questions** before agreeing to architectural changes. If in doubt, ask. Don't assume.
- **Will reverse themselves** on UX decisions if given a good reason — but only one reversal per topic. Don't re-litigate.
- **Asks you to use global skills, local research, and MCP tools generously.** Don't skip them. If a skill exists for what you're doing, load it first.
- **Wants you to plan before coding.** Multiple rounds of brainstorming before implementation is the norm. Don't jump to code.
- **Wants the agent to **continue** when paused mid-work.** A long pause to ask "should I keep going?" is annoying. If the conversation gets cut off, finish the current step, then stop and ask.
- **Hates em-dashes in copy.** Not in code comments, just in user-facing strings. (No example — this is a single character to avoid.)
- **Will say "your call"** when they want you to make a decision. Take it as authorization to proceed with the best choice you can defend.
- **Wants a single-route-SPA feel.** When in doubt about a UX choice, ask "is this inside a modal?" — if not, the user will likely push back.

---

## 11. Open design questions for the next agent to resolve with the user

1. **Tags color coding**: should tags be styled with auto-assigned colors (by hash), or should the user pick colors per tag, or should all tags use the same neutral color? **My recommendation**: auto-assigned, but the user might want to override per-tag.
2. **"Saved" stage in the funnel**: currently excluded (no application date, so no conversion). Is that the right call? Or should we count "saved" as a separate funnel pre-applied step?
3. **Multi-stage activity event history**: when we get to backend, do we model the event history as a separate `application_event` table, or do we just record `stage_changed_at` per application (current state only)? The current Round B charts derive from `stage_changed_at` only. A real event table would let us render "what happened to this application over time" — useful for the Round C detail view.
4. **Time-in-stage alert thresholds**: how many days in `applied` before it counts as `stalled`? Current code treats `status=stalled` as user-assigned. Should there be an automatic default (e.g. `applied` for 14+ days → auto-stalled)?
5. **Resume upload flow**: drag-and-drop in the modal, or click-to-pick with a file input? How do we handle multi-file uploads (one PDF per resume, or one application per resume)?
6. **PDF preview fallback**: in the modal, do we always show the inline `<iframe>`, or detect if the browser blocks it and offer a download link prominently?
7. **Insights section title**: "Insights"? "Trends"? "Charts"? "Activity"? Surface this to the user if you can't decide.
8. **Chart placement on mobile**: 2-column on `lg+` is fine, but on smaller screens, should they stack in a specific order? My recommendation: heatmap → velocity → funnel (most important at top).

None of these are blockers. The next agent should pick reasonable defaults, ship, and surface the choice in the handoff notes.

---

## 12. Troubleshooting recipes

### 12.1 "My Svelte component doesn't update when state changes"

Svelte 5 reactivity is granular. The most common cause: assigning a value to a local `let` instead of a `$state`. Check that any state you mutate is declared with `$state(...)` and read in templates or `$derived(...)`. If you're passing data through props, make sure the parent owns the state (`$state(...)` in the parent, not in the child).

### 12.2 "Modal trap doesn't capture focus"

`Modal.svelte` uses a focus trap via Tab/Shift+Tab. If the focus escapes, check:

- Are you rendering `Modal` inside a parent that has `tabindex="-1"`? (Don't.)
- Are you rendering other focusable elements inside the modal at the wrong level? (Use the `children` snippet, not direct DOM.)
- Is the modal inside another `inert` element? (It shouldn't be.)

### 12.3 "Goto triggers the no-navigation-without-resolve rule"

The rule's static analyzer requires `goto()` arguments to be either:

- A literal string (e.g. `goto('/dashboard')`)
- A result of `resolve(...)` from `$app/paths`
- Inside an awaited expression (`.then(...)` is NOT enough; it has to be `await`ed)

The dashboard uses `resolvePath(\`/dashboard${target}\`)`to satisfy this. If you need to use`goto()` elsewhere, use the same pattern.

### 12.4 "Svelte 5 lint warns `state_referenced_locally`"

This happens when you assign `$state(someValue)` where `someValue` is itself a `$state` or `$derived`. The fix: declare the local with a non-state initial value, then sync via `$effect`:

```ts
let filters: ApplicationFilters = $state({
	q: '',
	stages: [],
	statuses: [],
	arrangements: [],
	tags: []
});
$effect(() => {
	filters = data.filters; // data.filters is a $derived from page data
});
```

### 12.5 "Tailwind v4 dynamic class names don't get picked up"

Tailwind v4 auto-detects class names from source files. Dynamic concatenation like `` `bg-${colorToken}-100` `` won't be detected. **Always use static class strings** for token-based utilities. The dashboard's pattern is to define the class string once per token:

```svelte
<div class="bg-stage-saved-100 text-stage-saved-700">...</div>
```

If you need a truly dynamic color, use a `style:` directive instead.

### 12.6 "My Playwright test can't find an element"

- The dashboard's elements have many duplicates: "Offer" is both a stage filter chip AND a pipeline segment. Scope your locator to a section:
  - `page.locator('section[aria-labelledby="filter-heading"]').getByRole('button', { name: 'Offer' })` for the filter chip
  - `page.locator('[role="group"][aria-label="Application pipeline by stage"]').getByRole('button', { name: 'Offer' })` for the pipeline segment
- Column headers (e.g. "Company") also exist as sort buttons in the FilterBar. Scope to the table header:
  - `page.locator('thead button:has-text("Company")')` for the table column

### 12.7 "Bun dev server seems stale after editing fixtures"

The `applications-data.ts` store is cached on `globalThis` for HMR. To force a reseed, run `resetStore()` from a one-shot script, or restart the dev server.

### 12.8 "svelte-check times out (>2 minutes)"

This has happened in this session. Run it in the background with `notify=true`:

```bash
bun run check > /tmp/check.log 2>&1 &
# wait a few minutes
tail -10 /tmp/check.log
```

The background process will complete and the log will have the result.

### 12.9 "Prettier and the file conflict on tabs vs spaces"

The project uses tabs (per `prettier.config.mts`). The `ErrorPage.svelte` file has `<style>` blocks where Prettier sometimes does weird things. Run `bunx prettier --write <file>` to normalize.

### 12.10 "My new component renders in dev but not in build"

`$lib/server/*` cannot be imported from client code. The build will fail. Make sure your component doesn't transitively import `$lib/server/applications-data.ts`. If you need a server-only helper, expose it through a `+page.server.ts` `load` function.

---

## 13. Handoff housekeeping

- **`AGENTS.md`** is the project's standing rules doc. Read it before any change. **Do not** modify it without asking.
- **`.agents/research/`** is the source of truth for stack behavior. When in doubt about Svelte/SvelteKit/Better Auth/Drizzle/Tailwind v4/Cloudflare, read the relevant file first. The MCP servers for Svelte, Better Auth, and Cloudflare are wired and take priority over web fetches.
- **Git status at handoff**: 3 modified files (`.agents/skills/...` excluded by .gitignore), 5 new directories (`src/lib/components/`, `src/lib/constants/`, `src/lib/server/`, `src/lib/utils/`), 1 new file in `src/lib/`, several new routes/files. Run `git status` to see the full diff before touching anything.
- **The user pauses between rounds** to ask the next agent (you) to confirm scope. Don't pre-emptively start a round the user hasn't asked for.
- **The handoff doc itself** (`HANDOFF.md`) is in the project root. It is NOT in `.gitignore`. If the user wants to commit it, they will. Don't commit anything without asking.
- **When done with a round**, write a short user-facing summary in the chat. Mention what you built, what you deferred, what visual artifacts (screenshots) you generated, and what to look at. Keep it to one screen of text.

---

## 14. TL;DR for the next agent

You are picking up mid-Round-B. The dashboard foundation is shipped and working. The 3 new chart components are written but not wired; the tag type extension is done but the FilterBar and ApplicationsTable haven't been updated yet. There are 2 trivial TS errors in `ConversionFunnel.svelte` to fix. The next step is:

1. **Fix the 2 TS errors in `ConversionFunnel.svelte`** (remove unused `STAGE_VALUES` import, fix `funnel[i-1]` undefined check).
2. **Verify `VelocityChart.svelte` is clean** (the `daysSince` import was removed in an interrupted edit).
3. **Wire `tagFacets` into `+page.server.ts`** and add an "Insights" section to `+page.svelte` containing the 3 chart components.
4. **Add the Tags chip group to `FilterBar.svelte`** (takes a `tagFacets: TagFacet[]` prop).
5. **Add the Tags column to `ApplicationsTable.svelte`**.
6. **Run `bun run check`, `bun run lint`, `bun run build`**. Fix anything that breaks.
7. **Run the existing Playwright tests** to confirm Round A still passes. Add new assertions for the Round B charts.
8. **Hand back to the user** with a clear "Round B is done, here's what changed, here's what to look at in the screenshots" summary.

The user wants to **be involved in design decisions**. Don't make unilateral design calls on the visualizations (color choices, axis labels, empty-state copy) — when in doubt, surface the choice in the handoff notes or ask. The data layer is the agent's call. The visual layer is the user's.

When you finish a step, do not pause to ask permission for the next step unless it would change the architecture. **Continue through the list.** The user can interrupt if needed.

— End of handoff. Good luck.
