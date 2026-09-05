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
6. [The Round A code that Round B touches](#6-the-round-a-code-that-round-b-touches)
7. [What's left to do (full roadmap)](#7-whats-left-to-do-full-roadmap)
8. [How to verify your work](#8-how-to-verify-your-work)
9. [Quick reference: file map with annotations](#9-quick-reference-file-map-with-annotations)
10. [The user's preferences (psychographic notes)](#10-the-users-preferences-psychographic-notes)
11. [Open design questions for the next agent](#11-open-design-questions-for-the-next-agent-to-resolve-with-the-user)
12. [Troubleshooting recipes](#12-troubleshooting-recipes)
13. [Handoff housekeeping](#13-handoff-housekeeping)
14. [TL;DR for the next agent](#14-tldr-for-the-next-agent)

---

## 1. What this project is

**Job Tracker** — a private, multi-user job application tracker for the user, their girlfriend, and 5-7 friends. **Not** a public SaaS. **Not** meant to scale beyond ~10 users. The friend group is the cap.

- **Deployment target**: Cloudflare Workers, free tier only. (See `AGENTS.md` § "Deployment target".)
- **Stack** (locked): Bun + SvelteKit 2 (Svelte 5 runes-only) + Tailwind v4 + `adapter-cloudflare`.
- **Current state** (this document): Pre-feature Round C is shipped. Round B (rich visualizations) is complete. A post-Round-B technical-debt pass is complete and the project is clean (`bun run check`, `bun run lint`, `bun run build` all green).

The user is the sole developer. They are non-technical on backend topics (no prior Better Auth / D1 / Drizzle experience) and explicitly delegated those decisions to the agent. They have strong opinions on UI/UX and accessibility, and they want a polished, single-route-SPA feel where every interaction happens inside `/dashboard` via modals, not via route changes.

**The user's literal framing** (paraphrased from the original brief): "we have a private job application tracker for me, my gf and maybe another 5 to 7 of my friends. login page, secured dashboard route (/dashboard), private dashboard for each user. security must be unbreachable. no social oauth, no 2fa, no passkeys. d1 and r2 free tier." The "admin approval for sign-ups" and "share with my girlfriend" features came from the same conversation.

**Why this is a personal tracker, not a SaaS**: D1 / R2 free tier usage will be quick to dry out if the user accidentally lets anyone sign up. This is the core reason the admin-approval flow is non-negotiable.

---

## 2. Hard-wired constraints (not negotiable)

These are locked-in decisions from earlier conversations. **Do not re-litigate them** unless the user explicitly reverses them. Each item has the conversation round in parentheses so the next agent can find the context in the conversation history.

### 2.1 Hosting / runtime

- **Free-tier Cloudflare Workers only.** No paid add-ons, no Workers Paid, no always-on Durable Objects, no paid R2/KV. (Round 1, "deployment target: cloudflare workers — free tier only")

### 2.2 Auth model

- **Email + password** only. No social OAuth, no passkeys, no 2FA, no magic links. The user was explicit: "i don't want to support social oauth or google oauth or two factor or passkeys or those crazy stuffs." (Round 1)

### 2.3 Sharing model

- **Authenticated-only sharing** for now. Shape: `share_grant(application_id, viewer_user_id, permissions, granted_at, expires_at?, revoked_at?)` with comment thread support.

### 2.4 UI architecture

- **Single-route SPA at `/dashboard`.** No nested routes for applications, resumes, or admin. Everything is modal-driven. (Round 2 — "make everything works within that dashboard route. like once logged in, there should be no reason for us to be like going to another page just to fill up stuffs. i want it like complete ... what they say .. spa feel")

### 2.5 Component location

- `src/lib/components/` — presentational UI primitives (Button, Modal, StatCard, etc.) and dashboard-specific composites (ApplicationsTable, PipelineBar, etc.). All in one flat directory; no sub-folders.

### 2.6 Modal × URL sync pattern

The `Modal.svelte` primitive takes a bindable `open` prop. Parent components own the open state. The dashboard's `goto({replaceState: true, keepFocus: true, noScroll: true})` for filter changes uses `resolvePath()` from `$app/paths` to satisfy the `svelte/no-navigation-without-resolve` ESLint rule (which requires `goto()` arguments to be either a `Literal` or a result of `resolve(...)`). **Never disable ESLint rules** — find the rule-correct pattern instead. (Round A — there was a long debugging session over this.)

### 2.7 Tag system (Round B)

- **Tag values**: free-form lowercase-hyphenated strings (e.g. `remote`, `dream-company`, `high-priority`).

### 2.8 Visual design rules (the user's taste)

- **Editorial structure**: off-white background (`oklch(0.99 0 0)`), thin borders, mono labels for metadata, generous whitespace, single neutral accent.

---

## 3. What's installed vs. what's planned

### 3.1 Already installed (do not re-add)

```
@eslint/js ^10.0.1
@sveltejs/adapter-cloudflare ^7.2.9
@sveltejs/kit ^2.70.3
@sveltejs/vite-plugin-svelte ^7.3.0
@tailwindcss/vite ^4.3.3
@types/bun ^1.4.0
eslint ^10.9.1
eslint-config-prettier ^10.1.8
eslint-plugin-svelte ^3.23.0
globals ^17.12.0
prettier ^3.9.6
prettier-plugin-svelte ^4.1.1
prettier-plugin-tailwindcss ^0.8.1
svelte ^5.57.0
svelte-check ^4.7.6
typescript ^6.0.3
wrangler (via bunx)
```

`package.json` `scripts`: dev, build, check, lint, format, types, preview, deploy, prepare.

### 3.2 Not installed (planned for backend phase)

- `drizzle-orm`, `drizzle-kit` — DB layer
- `better-auth`, `@better-auth/drizzle-adapter`, `@better-auth/cloudflare` — auth layer
- `@cloudflare/workers-types` — generated into `worker-configuration.d.ts` (already partially)

When the user is ready for backend wiring, start with the project research file's `Phase 0-2` checklist at `.agents/research/job-tracker-research.md` (lines 35-78). The TL;DR for that phase is at the bottom of the same file (lines 244-257).

### 3.3 Test / dev tooling

- **No tests, no CI, no README.** Per `AGENTS.md`. The user has explicitly chosen to keep testing out of the project tree.

---

## 4. What's been shipped — round by round

### 4.1 Round 0 — Initial scaffold

The user's starting repo: SvelteKit 2 + Svelte 5 + Tailwind v4 + Cloudflare adapter, with one placeholder `+page.svelte` ("Welcome to SvelteKit"). No DB, no auth. `wrangler.jsonc` was minimal (name, main, assets, observability).

### 4.2 Round 1 — Error pages (verified by user)

**Files added:**

- `src/routes/+error.svelte` — handles 404 (no route match) and thrown errors. Branches on `$page.status`. Renders attempted path in `<code>` for 404s. Two CTAs: hard-nav home + `history.back()`. Title via `<svelte:head>`. `noindex` meta.

**Dark-mode bug found and fixed**: the error page had text rendered in `text-muted` on a white browser default because no element painted a `bg-bg`. Fixed by adding `class="min-h-screen bg-bg text-fg antialiased"` to `<body>` in `src/app.html`. This made the whole viewport theme correctly, not just the `<main>`. Subsequent Playwright run confirmed contrast ratios of 17.31:1 (light) and 17.83:1 (dark), both AAA.

**Playwright verification** at `/tmp/pw-tests/`: 11/11 assertions pass. Screenshots in `/tmp/pw-tests/screenshots/`.

### 4.3 Round 2 — Auth surface (sign-in + sign-up tabs on `/`)

**Files added:**

- `src/hooks.server.ts` — populates `event.locals.user` from stub `getSession(cookies)`.

### 4.4 Round A — Dashboard (foundation + KPIs + pipeline + table)

This is the largest single round. All committed; check/lint/build clean; 22/22 Playwright assertions pass.

**New types** at `src/lib/types.ts`:

- `Application` (the row)

**New constants** at `src/lib/constants/stages.ts`:

- `STAGES: StageMeta[]` with `value`, `label`, `shortLabel`, `colorToken`. Order matters — that's the funnel render order.

### 4.5 Round B — Charts + tag system (complete)

Round B added three chart components (`StageActivityHeatmap`, `StageDwellChart`, `VelocityChart`, `ConversionFunnel`) and a tag system (`Application.tags`, `tagFacetsFor`, FilterBar Tags chip group, table Tags column). The wiring is complete.

### 4.6 Technical-debt cleanup round (post-B, complete)

A subsequent pass addressed the findings listed in `technicaldebtsfindings.txt`. Key fixes:

- **High-severity**:
  - Removed `role="link"` + `tabindex` on `<tr>` in `ApplicationsTable.svelte` (was announcing as a link AND a container of nested buttons/forms — a real a11y violation).
  - Applied `inert` + `aria-hidden` to the dashboard main container when any modal is open (background screen readers can no longer reach behind the dialog).
  - Wired the resume-library upload affordance honestly — the button is now enabled and clicking it surfaces a stub message instead of being silently `disabled` with an unreachable `onclick`.
- **Form validation feedback**: `ApplicationForm` already accepts a `result` prop with echoed `values/errors/operation`; both call sites (`dashboard +page.svelte` for create, `ApplicationDetailModal` for edit) pass it through, so server-side validation errors now surface above the fields. The dashboard thread (`newAppForm`) only forwards when `form.operation === 'create'`; the detail modal (`form?.operation === 'edit' ? form : undefined`) likewise filters by operation.
- **Dead code removed**: `getApplicationById`, `resetStore`, `note_added` (from `ActivityEvent.kind` union — was declared but never emitted).
- **Misc hardening**: removed the nonstandard `text-scale` meta in `app.html`, removed the dormant `@custom-variant dark` in `layout.css` (dark mode is driven by `@media (prefers-color-scheme)` only), updated `AGENTS.md` to reflect the now-declared `App.Locals` + `App.Error`.
- **`prefers-reduced-motion` rule is live in `layout.css`** — the global rule already kills animations / transitions / scroll-behavior when the OS asks for reduced motion (WCAG 2.3.3).
- **Magic number extracted**: `ResumeLibraryModal`'s 10 MB upload cap is now the named constant `MAX_UPLOAD_BYTES`.

After the cleanup: `bun run check` and `bun run lint` are clean (0 errors, 0 warnings, 413 files), `bun run build` succeeds.

---

## 5. Round B — in progress, exact state

This section is the most important one for the next agent. It describes what's already on disk, what the exact code state is, and what the unresolved issues are.

### 5.1 Round B file list

| Path                                             | Status   | Notes                                                                                                                                                                                                     |
| ------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/components/StageActivityHeatmap.svelte` | Complete | 90-day window bucketed by week. Color = stage-change count. Empty state. Uses `oklch(0.97 {intensity * 0.06} 250)` — low-chroma blue. No changes needed.                                                  |
| `src/lib/components/VelocityChart.svelte`        | Complete | Two paths (applications + transitions) over 90 days. Empty state. Subtle grid. SVG `<title>` per-day.                                                                                                     |
| `src/lib/components/ConversionFunnel.svelte`     | Complete | 10 horizontal bars; bar widths pct-of-max. Color = stage colorToken. Inside each bar: count + pct + stage-to-stage conversion %. Closed-stages footer note.                                               |
| `src/lib/components/StageDwellChart.svelte`      | Complete | Per-stage dwell track with status-colored dots. `TICKS = [7, 14, 21]`. Empty state.                                                                                                                       |
| `src/lib/components/FilterBar.svelte`            | Complete | Tags chip group + sort row + clear-all. Auto-hashed low-chroma tag palette via theme tokens (`--tag-bg-l`, `--tag-bg-c`, `--tag-fg-l`, `--tag-bg-c` defined in `layout.css`; both light + dark variants). |
| `src/lib/types.ts`                               | Modified | `Application.tags: string[]`.                                                                                                                                                                             |
| `src/lib/server/applications-data.ts`            | Modified | All 18 fixtures carry a `tags: string[]`. Deterministic fixture seeding via `globalThis[Symbol.for('job-tracker.applications.store.v1')]`.                                                                |
| `src/routes/dashboard/+page.server.ts`           | Modified | `tagFacets: tagFacetsFor(activeApps)` returned by load.                                                                                                                                                   |
| `src/lib/components/ApplicationsTable.svelte`    | Modified | Tags column added (cell hidden until `lg` viewport; truncates to 3 with `+N` tail). No `role="link"` on `<tr>`.                                                                                           |

### 5.2 Current TS state

All TS errors and lint warnings from earlier rounds have been resolved. `bun run check` reports **413 files, 0 errors, 0 warnings**. `bun run lint` reports **clean**.

---

## 6. The Round A code that Round B touches (so the next agent doesn't break it)

The Round B work is non-invasive. It adds 3 new files, extends 2 existing files in the data layer, and adds a Tags chip group to one component. None of Round A's behavior changes. But here are the hot spots where care is needed:

### 6.1 `Application` type

`src/lib/types.ts` has `tags: string[]` from Round B's data-layer changes. The `createApplication` server function in `applications-data.ts` spreads `input` which already includes `tags` via the `CreateApplicationInput` type. The create flow is correct.

### 6.2 `+page.server.ts` load function

Returns `{ user, applications, kpis, stageCounts, filters, sort, tagFacets, trashView, trashedCount, activeDetail }`. The dashboard's `+page.svelte` reads from `data.X` — adding a new field doesn't break existing reads.

### 6.3 `+page.svelte` URL sync pattern

```ts
// URL is the source of truth; debounced filter writes + replaceState navigation.
// All goto() calls go through resolvePath() from $app/paths.
```

### 6.4 The "go back to top of table after filter change" pattern

Round A's `+page.svelte` does NOT scroll to the top after a filter change. The current behavior: filter changes preserve scroll position. If the user wants scroll-to-top after a filter change, that would be a Round C polish item. **Do not add it now** — it's a scope creep risk.

### 6.5 The "Add your first application" button

Currently disabled with `ariaLabel="Add application (coming in Round C)"`. Round C wires the actual modal. Round B must NOT enable this button.

---

## 7. What's left to do (full roadmap)

Per the original phased plan in `.agents/research/job-tracker-research.md`, plus the user's modifications:

- **Round C** (next): wire the actual application CRUD (create / edit modals), salary input on the form, trash interactions (already UI; backend round), better-auth stub → real.
- **Round D** (later): D1 + Drizzle + Better Auth (the backend round). After: resume upload via R2.
- **Round E+**: comments + share grants, public (authenticated-only) links.

The user explicitly said no charts beyond what's already planned, no payroll/SaaS features, no public links, no email/push notifications. Those are settled.

---

## 8. How to verify your work

### 8.1 Project-side

```
bun run check    # 0 errors, 0 warnings expected
bun run lint     # clean
bun run build    # adapter-cloudflare succeeds
```

### 8.2 Browser-side (isolated, in `/tmp/pw-tests/`)

Per the existing convention. Playwright suite lives at `/tmp/pw-tests/` — NEVER inside the project tree. The dashboard's elements have many duplicates ("Offer" is both a stage filter chip AND a pipeline segment); scope locators to a section.

**Do NOT move Playwright into the project tree.** The user has been clear about this.

---

## 9. Quick reference: file map with annotations

```
.eslint / .prettier / wrangler.jsonc / vite.config.ts / tsconfig.json — standard
src/
  app.d.ts          App.Platform (env/ctx/caches/cf?), App.Locals (user), App.Error (code?), App.PageState (unused)
  app.html          lang="en"; bg-bg/text-fg on <body>; theme-color for light/dark
  error.html        static fallback for SSR failures; lang="en"; noindex
  hooks.server.ts   populates locals.user from stub session
  routes/
    +layout.svelte  imports layout.css; favicon; renders children
    +page.svelte    auth surface (sign-in / sign-up tabs)
    +page.server.ts auth action (no `?next=` honored — see note)
    +error.svelte   404 / 500 boundary
    layout.css      @theme tokens + dark variants + prefers-reduced-motion
    [...path]/+page.ts catch-all 404
    dashboard/
      +page.svelte       SPA dashboard
      +page.server.ts    load (kpis, apps, filters, sort, tagFacets, trashView, trashedCount, activeDetail) + actions
      export.csv/+server.ts CSV export
    admin/approvals/
      +page.svelte       pending sign-ups UI (stub data)
      +page.server.ts    server-guarded; approve/reject actions re-check isAdminUser
  lib/
    types.ts             Application / KpiCounts / Filters / Sort / Interview / Contact / ActivityEvent / ApplicationDetail
    constants/
      stages.ts          STAGES (funnel order), STATUSES, ARRANGEMENTS, *_BY_VALUE maps, isStageOpen()
      currencies.ts      32 ISO 4217 entries
      resumes.ts         RESUME_URLS (mock external PDF URLs)
    utils/
      sortFilter.ts      applyFilters / applySort / parseFiltersFromUrl / serializeFiltersToUrl / hasActiveFilters / TagFacet / tagFacetsFor
      dates.ts           daysSince / formatRelative / formatDateShort / formatDurationInStage / isUpcoming / isThisMonth / toDateInputValue
      kpis.ts            computeKpis (re-exports isStageOpen from stages.ts)
      money.ts           parseSalaryFromForm / formatSalary / defaultSalaryFormValues / SALARY_SHAPES
    server/
      auth.ts            stub session cookie + ADMIN_ID + isAdminUser + getSession / setSession / clearSession
      applications-data.ts in-memory store keyed by globalThis[Symbol.for('job-tracker.applications.store.v1')]; FIXTURES (18); CRUD helpers
    components/
      Modal.svelte           accessible modal primitive; bindable open; focus trap; Esc/backdrop close; body scroll lock
      Button.svelte          variant + size; bindable busy → aria-busy + spinner
      StatCard.svelte        label / value / sublabel / accent strip / loading skeleton
      StatusBadge.svelte     color-token → Tailwind class maps
      EmptyState.svelte      title / description / action snippet / icon snippet
      FilterBar.svelte       search, stage/status/work/tags chips, sort row, clear-all
      ApplicationForm.svelte create/edit form (POSTs to ?/create or ?/edit); supports echo-back values/errors/operation via result prop
      ApplicationsTable.svelte sortable columns; restore/purge + delete actions; tags column (lg+); company cell = the keyboard activation target
      ConversionFunnel.svelte 10 horizontal bars pct-of-max; conversion pct per stage
      VelocityChart.svelte   90-day dual-line SVG (applications + transitions)
      StageDwellChart.svelte per-stage dwell track with status-colored dots
      StageActivityHeatmap.svelte 90-day stage-change heatmap (low-chroma blue)
      ApplicationDetailModal.svelte tabs (Overview / Interviews / Contacts / Activity); trash/restore/purge; edit form embedded
      ResumeLibraryModal.svelte mock library; preview-iframe via RESUME_URLS; upload is a stub (button surfaces honest copy)
      SalaryInput.svelte     shape + currency + amount inputs
```

---

## 10. The user's preferences (psychographic notes)

- **Has strong opinions on UI/UX** but is non-technical on backend. They want a polished feel; they recognize "AI slop" instantly. They will call it out.
- **Strong taste for editorial / mono / minimal UI.** They explicitly dislike purple gradients, em-dashes, and "rainbow dashboards."
- **Believes "no information duplication"** is a non-negotiable design rule. If two widgets say the same thing, consolidate or remove one.
- **Wants "rich visuals and information"** but also **"graceful handling when I don't have any application data yet"** (empty states must be polished, not placeholders).
- **Cares about WCAG accessibility** — Round 1's AAA contrast requirement was theirs.

---

## 11. Open design questions for the next agent to resolve with the user

1. **Tags color coding**: should tags be styled with auto-assigned colors (by hash), or should the user pick colors per tag, or should all tags use the same neutral color? **Current**: auto-assigned via hash, hue snapped to one of six low-chroma oklch buckets; lightness/chroma come from theme tokens (`--tag-bg-l`, `--tag-bg-c`, `--tag-fg-l`, `--tag-fg-c` in `layout.css`) so they adapt to light/dark. Override per tag is not modeled.
2. **Round C form fields**: which fields are required vs optional on `create`? `create` currently requires `company`, `role`, `stage`, `status`, `workArrangement`. `postingUrl`, `postingDescription`, `notes`, `resumeId`, `appliedAt`, `nextActionAt`, `tags`, `salary` are all optional. Round D may add resume upload (R2) and replace the stub `resumeId` text field.
3. **Real-time updates**: no SSE / WebSocket — the dashboard is read-only-on-load + form-driven mutations. Future round might add optimistic UI.

None of these are blockers. The next agent should pick reasonable defaults, ship, and surface the choice in the handoff notes.

---

## 12. Troubleshooting recipes

### 12.1 "My Svelte component doesn't update when state changes"

Svelte 5 reactivity is granular. The most common cause: assigning a value to a local `let` instead of a `$state`. Check that any state you mutate is declared with `$state(...)` and read in templates or `$derived(...)`. If you're passing data through props, make sure the parent owns the state (`$state(...)` in the parent, not in the child).

### 12.2 "Modal trap doesn't capture focus"

`Modal.svelte` uses a focus trap via Tab/Shift+Tab. If the focus escapes, check:

- Are you rendering `Modal` inside a parent that has `tabindex="-1"`? (Don't.)

### 12.3 "Goto triggers the no-navigation-without-resolve rule"

The rule's static analyzer requires `goto()` arguments to be either:

- A literal string (e.g. `goto('/dashboard')`)
- A result of `resolve(...)` or `resolvePath(...)` from `$app/paths`

The dashboard uses `resolvePath(`/dashboard${target}`)` to satisfy this. If you need to use `goto()` elsewhere, use the same pattern.

### 12.4 "Svelte 5 lint warns `state_referenced_locally`"

This happens when you assign `$state(someValue)` where `someValue` is itself a `$state` or `$derived`. The fix: declare the local with a non-state initial value, then sync via `$effect`.

### 12.5 "Tailwind v4 dynamic class names don't get picked up"

Tailwind v4 auto-detects class names from source files. Dynamic concatenation like `` `bg-${colorToken}-100` `` won't be detected. **Always use static class strings** for token-based utilities. The dashboard's pattern is to define the class string once per token. If you need a truly dynamic color, use a `style:` directive instead.

### 12.6 "My Playwright test can't find an element"

- The dashboard's elements have many duplicates: "Offer" is both a stage filter chip AND a pipeline segment. Scope your locator to a section.

### 12.7 "Bun dev server seems stale after editing fixtures"

The `applications-data.ts` store is cached on `globalThis` for HMR. To force a reseed, restart the dev server (or call `resetStore` from a one-shot script — note: `resetStore` is no longer exported as of the post-Round-B cleanup; seed determinism is enforced at first load via the `globalThis[Symbol.for(...)]` cache).

### 12.8 "svelte-check times out (>2 minutes)"

This has happened in this session. Run it in the background with `notify=true`. The background process will complete and the log will have the result.

### 12.9 "Prettier and the file conflict on tabs vs spaces"

The project uses tabs (per `prettier.config.mts`). The `ErrorPage.svelte` file has `<style>` blocks where Prettier sometimes does weird things. Run `bunx prettier --write <file>` to normalize.

### 12.10 "My new component renders in dev but not in build"

`$lib/server/*` cannot be imported from client code. The build will fail. Make sure your component doesn't transitively import `$lib/server/applications-data.ts`. If you need a server-only helper, expose it through a `+page.server.ts` `load` function.

---

## 13. Handoff housekeeping

- **`AGENTS.md`** is the project's standing rules doc. Read it before any change. **Do not** modify it without asking.

---

## 14. TL;DR for the next agent

The project is in a **post-Round-B + post-tech-debt-cleanup** state. The dashboard foundation is shipped and working. Three chart components are wired and rendering. The tag system is wired. The technical-debt cleanup is done — `bun run check`, `bun run lint`, and `bun run build` all pass cleanly. Next round is **Round C**: wire the create/edit application modal end-to-end (the form already exists; the modal that wraps it is also wired; the +page.server.ts `create`/`edit` actions accept all the form fields). After that, **Round D** is the backend round (D1 + Drizzle + Better Auth), which is when you add the `compatibility_flags: ["nodejs_als"]` wrangler setting and the `better-auth`/`drizzle-orm` deps per the playbook at `.agents/research/job-tracker-research.md`.

When you finish a step, do not pause to ask permission for the next step unless it would change the architecture. **Continue through the list.** The user can interrupt if needed.

— End of handoff. Good luck.
