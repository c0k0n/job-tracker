# Job Tracker

A job-application tracking app for the front-line job hunter: track applications through the pipeline, log interviews and contacts, see funnel and velocity analytics, and export everything to CSV. Runs entirely on Cloudflare's free tier.

Built with SvelteKit 2 (Svelte 5 runes-only) + Tailwind v4 + Better Auth on Cloudflare Workers + D1 (SQLite) via Drizzle ORM + R2 for resume PDFs.

## What it does

- **Auth with approval gate** — email+password sign-up (username or email sign-in). New accounts start disabled and sign-up creates no session; an admin approves them at `/admin/approvals`. The first account ever created bootstraps as an approved admin.
- **Application pipeline** — create, edit, and track job applications through stages (`saved` → `applied` → `phone_screen` → `technical` → `onsite` → `final` → `offer` → `accepted` / `rejected` / `withdrawn`), with tags, salary (integer minor units, 32 ISO-4217 currencies), and work arrangement. Soft delete with trash, restore, and permanent purge.
- **Per-application detail** — interviews, contacts, and an activity timeline (stage changes, notes) in one modal.
- **Resume library on R2** — upload PDFs (10 MB max, 20 per user), attach one to any application so you know which version you sent where, preview it inline, or download it. Deleting a resume detaches it from applications instead of taking them with it.
- **Analytics** — KPI cards, conversion funnel, stage-dwell and velocity charts computed from real data, plus a _Next up_ agenda that merges pending interviews and per-application follow-up dates into one ordered list you can tap straight through from.
- **CSV export** — RFC-4180 quoting with a formula-injection neutralizer (leading `=`, `+`, `-`, `@` are neutralized so opening the export in Excel is safe).
- **Admin approval queue** — approve (enable) or reject (delete + cascade) pending sign-ups.

## Architecture

```
Browser ──▶ Cloudflare Worker (the SvelteKit app)
             ├─ src/routes/*            pages, actions, +server endpoints
             ├─ src/hooks.server.ts      session resolution on every request
             ├─ src/lib/server/*        auth + data layer (server-only)
             └─ D1 (SQLite)             user/session/account/verification
                                       application/interview/contact/
                                       activity_event/resume tables
             └─ R2 (job-tracker-resumes)  resume PDF bytes,
                                       keyed userId/resumeId.pdf
```

The URL is the source of truth for dashboard state: filters, sort, and the open modal live in the query string (`?q=&stage=&status=&arr=&tag=&sort=&dir=&trash=&app=&new=&resume=`). Two mechanisms write it — `replaceState` (shallow, no Worker invocation) for state the client already owns, and `goto(resolvePath(...))` for real navigations that need the server to refetch. Server actions mutate and re-run `load()`.

### Layout

| Path                  | What it is                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/routes/`         | SvelteKit routes: `/` auth page, `/dashboard`, `/dashboard/export.csv`, `/api/resumes`, `/api/resumes/[id]`, `/admin/approvals`, `/pending-approval`, `/[...path]` 404 catch-all                                                                                                                                                                                                                                                     |
| `src/lib/components/` | Svelte 5 components (Modal with focus trap, table, charts, forms)                                                                                                                                                                                                                                                                                                                                                                    |
| `src/lib/server/`     | Better Auth wiring + data layer. `applications-data.ts` and `resumes-data.ts` — every function takes `(db, userId, …)`; every list query and every write filters on `userId` in SQL, and the six single-row-by-id reads assert ownership in JS before returning (see [data-model.md](docs/data-model.md#query-discipline)). `db/schema.ts` — Drizzle schema + row mappers (ISO ↔ unix-seconds conversion, the only conversion point) |
| `src/lib/constants/`  | Stages, statuses, currencies, resume limits (10 MB, 20 per user) and PDF magic bytes                                                                                                                                                                                                                                                                                                                                                 |
| `src/lib/utils/`      | Pure helpers: KPIs, money, dates, sort/filter, `enhance.ts` form-error handling                                                                                                                                                                                                                                                                                                                                                      |
| `db/migrations/`      | Drizzle-generated SQL files (the database recipe). Applied to D1 via `wrangler d1 migrations apply` — never hand-edit                                                                                                                                                                                                                                                                                                                |
| `db/scripts/`         | Dev-only: `bun run seed` fills **local** D1 with a test admin + sample data. Never touches the remote DB                                                                                                                                                                                                                                                                                                                             |
| `docs/`               | `docs/README.md` is the index. `docs/*.md` describes **this repo**; `docs/research/*.md` records **vendor** behaviour with citations — the source of truth for stack behavior (see AGENTS.md)                                                                                                                                                                                                                                        |
| `src/lib/assets/`     | `favicon.svg`, imported from `+layout.svelte` so Vite hashes it. Deliberately not in `static/`, which is served unhashed                                                                                                                                                                                                                                                                                                             |
| `static/`             | Files served as-is, unhashed: `robots.txt` and `.assetsignore`                                                                                                                                                                                                                                                                                                                                                                       |

### Key design decisions

- **Request-scoped everything.** Better Auth and Drizzle instances are built per request from `event.platform.env` (env bindings don't exist at module init on Workers).
- **Approval gate is server-owned.** The `disabled` field is `input: false`; only a server-side database hook writes it. Clients can't self-approve.
- **Money = integer minor units.** Salaries stored as JSON `{min, max, currency}` in integer minor units — never floats.
- **Free tier only.** Three bindings, all free: `DB` (D1) for rows, `RESUMES` (R2) for resume bytes, `ASSETS` for hashed static output. No KV/DO/Queues. Resume reads are proxied by the Worker — the bucket is never public and no presigned URL is ever issued.
- **Bytes and metadata are written in that order, and cleaned up together.** R2 gets the object first; if the D1 row then fails, the object is deleted. A resume row is the only pointer to its object.
- **Flat migrations under `db/`.** drizzle-kit 0.31 emits `db/migrations/NNNN_name.sql`; `wrangler.jsonc` uses `migrations_pattern: 'db/migrations/*.sql'`. `db/scripts/` holds the local-only seed.
- **Two border weights, because WCAG 1.4.11 only covers interactive edges.** `--color-border` is a decorative hairline (card edges, section rules) and stays light; `--color-border-strong` is the boundary that _identifies_ an input, chip, or outline button, so it clears 3:1 on every surface. Darkening every hairline instead would flatten the whole design.
- **A dead connection never costs you the page.** `use:enhance` turns a failed `fetch` into `{ type: 'error' }`, and the default callback throws that at the nearest error boundary — so a blip on "Move to trash" would replace the dashboard and lose your filters. `safeEnhance()` in `src/lib/utils/enhance.ts` intercepts only that case and reports it inline; validation echo-back and redirects are untouched.
- **The server is the only validation authority.** Every form is `novalidate`. Native constraint validation is not just redundant here, it is _wrong_: `<input type="url">` rejects a bare `vercel.com/jobs/infra`, which `sanitizePostingUrl` goes out of its way to accept, and the result is a form that refuses to submit with no request in the logs and no message on screen. See [docs/security.md](docs/security.md#why-the-browser-is-not-allowed-to-validate).
- **The live URL, never `page.url`.** `replaceState` moves `window.location` but leaves `page.url` frozen at the last real navigation, so anything read from `page.url` between navigations is stale. Both the dashboard's URL-sync effect and `onRowClick` read `window.location` for exactly this reason — reading `page.url` made clicking a table row silently discard your search and sort. See [docs/routes.md](docs/routes.md#url-state-what-lives-where).
- **A funnel rung must be reachable.** The conversion funnel only counts "at or past this stage", which a `rejected` application can never satisfy once it has exited — so exits and `saved` are reported as exact counts in the footer instead of as rungs that are permanently `0% of prev`. Same reasoning behind `isInPlay()`: the "Active" KPI tests the **stage**, not just the status, because the form sets the two independently.

## Documentation

[`docs/README.md`](docs/README.md) is the index. Ten app docs plus five vendor research files, visual-first:

|                                                                                                                |                                                   |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [architecture](docs/architecture.md) · [data-model](docs/data-model.md) · [auth](docs/auth.md)                 | how the system is put together                    |
| [routes](docs/routes.md) · [components](docs/components.md) · [design-system](docs/design-system.md)           | the URL surface and the UI                        |
| [analytics](docs/analytics.md)                                                                                 | what each dashboard number means                  |
| [deployment](docs/deployment.md) · [free-tier-budget](docs/free-tier-budget.md) · [security](docs/security.md) | getting it live, and staying inside the free tier |

`docs/research/*.md` is separate: it records what SvelteKit, Better Auth, Drizzle, Cloudflare, and
Tailwind actually promise, with citations. When it disagrees with the code, the code wins and the
research file gets corrected.

## Getting started

Requires [Bun](https://bun.sh) (v1.3+). Cloudflare login via `bunx wrangler login`.

```bash
bun install
```

Create `.dev.vars` in the repo root (gitignored) with your local secrets:

```
BETTER_AUTH_SECRET=<random string — openssl rand -hex 32>
```

That is the only value you need. `BETTER_AUTH_URL` is intentionally left unset — auth resolves its
base URL per request from an allowlist of hosts (`job-tracker.sanctum.workers.dev`, `*.workers.dev`,
`localhost:*`, `127.0.0.1:*`, plus anything in `DEV_ORIGINS`), so one build works locally and
deployed with no per-environment URL. See [docs/auth.md](docs/auth.md#base-url).

Or copy `.dev.vars.example`. Then:

```bash
bun run db:migrate:local   # create tables in local D1
bun run seed               # test admin + sample data (local only)
bun run dev                # http://localhost:5173
```

Login with the seeded admin: `ada@jobtracker.dev` / `job-tracker-admin-1`.

## Commands

| Command                     | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `bun run dev`               | Vite dev server with live D1 via getPlatformProxy           |
| `bun run build`             | `vite build` + adapter-cloudflare                           |
| `bun run check`             | svelte-kit sync + wrangler types + svelte-check (must pass) |
| `bun run lint`              | prettier --check + eslint                                   |
| `bun run format`            | prettier --write .                                          |
| `bun run preview`           | build, then run the built worker via wrangler dev           |
| `bun run deploy`            | build, then `wrangler deploy`                               |
| `bun run db:generate`       | Generate SQL migrations from `src/lib/server/db/schema.ts`  |
| `bun run db:migrate:local`  | Apply migrations to local D1                                |
| `bun run db:migrate:remote` | Apply migrations to the remote D1                           |
| `bun run seed`              | Seed local D1 with test admin + samples                     |
| `bun run types`             | Regenerate `worker-configuration.d.ts`                      |

## Deployment

Pushes to `main` deploy automatically through **Cloudflare Workers Builds** (Git integration) to
<https://job-tracker.sanctum.workers.dev>. Full setup — D1 database, the one secret, build and
deploy commands, admin bootstrap, and how to let friends in: **[docs/deployment.md](docs/deployment.md)**.

The short version of the one-time setup:

```
1. wrangler d1 create job-tracker             → database_id into wrangler.jsonc  ✅ done
   wrangler r2 bucket create job-tracker-resumes → r2_buckets[0].bucket_name      ✅ done
2. Dashboard → Settings → Variables & Secrets → add secret BETTER_AUTH_SECRET
3. Dashboard → Settings → Build → connect the GitHub repo
     build command:  bun install --frozen-lockfile && bun run build
     deploy command: bun run db:migrate:remote && bunx wrangler deploy
     build variable: BUN_VERSION=1.4.2   (the image default is 1.2.15)
4. git push origin main                       → live
```

Both Cloudflare resources already exist on the account and are already in `wrangler.jsonc`, so
step 1 is only there in case you start over.

There is no `BETTER_AUTH_URL` to set. It is left unset on purpose: Better Auth resolves the base
URL per request against an `allowedHosts` list, so the same build works on `localhost:5173` and on
the deployed `workers.dev` URL. Setting it pins auth to one origin and throws that away.

## Tests

There is no in-repo test suite. The app is verified by driving the built worker (`bun run build` →
`bunx wrangler dev` → a real browser) plus an external Playwright suite kept at `/tmp/pw-tests/`
(never inside the repo tree). `bun run check` and `bun run lint` are the only automated gates.

Worth knowing when you plan the verification: **accessibility is not lint-enforced.**
`eslint-plugin-svelte@3` removed the whole `svelte/a11y_*` rule set, and Svelte 5.57's compiler —
which is what `bun run check` runs — only catches a small subset (a missing `alt`, yes; an
`aria-label` on a roleless `<span>`, a click handler on a `<tr>`, or an `aria-controls` pointing at
nothing, no). So a green `check` means "no compiler-level a11y warnings", which is a much weaker
statement than "accessible". The a11y defects that have been found so far were found by reading the
code and looking at screenshots, not by a tool. See
[docs/components.md](docs/components.md#what-is-not-automated-and-why-that-matters-here).

## License

[MIT](LICENSE) — Copyright (c) 2026 Chit Ko Ko Nyein. Swap the file if you would rather keep it
all-rights-reserved.
