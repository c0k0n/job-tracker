# Job Tracker

A job-application tracking app for the front-line job hunter: track applications through the pipeline, log interviews and contacts, see funnel and velocity analytics, and export everything to CSV. Runs entirely on Cloudflare's free tier.

Built with SvelteKit 2 (Svelte 5 runes-only) + Tailwind v4 + Better Auth on Cloudflare Workers + D1 (SQLite) via Drizzle ORM.

## What it does

- **Auth with approval gate** — email+password sign-up (username or email sign-in). New accounts start disabled and sign-up creates no session; an admin approves them at `/admin/approvals`. The first account ever created bootstraps as an approved admin.
- **Application pipeline** — create, edit, and track job applications through stages (`saved` → `applied` → `phone_screen` → `technical` → `onsite` → `final` → `offer` → `accepted` / `rejected` / `withdrawn`), with tags, salary (integer minor units, multiple currencies), and work arrangement. Soft delete with trash, restore, and permanent purge.
- **Per-application detail** — interviews, contacts, and an activity timeline (stage changes, notes) in one modal.
- **Analytics** — KPI cards, conversion funnel, stage-dwell and velocity charts computed from real data.
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
                                       activity_event tables
```

The URL is the source of truth for dashboard state: filters, sort, and the open modal live in the query string (`?q=&stage=&status=&arr=&tag=&sort=&dir=&trash=&app=&new=&resume=`). Two mechanisms write it — `replaceState` (shallow, no Worker invocation) for state the client already owns, and `goto(resolvePath(...))` for real navigations that need the server to refetch. Server actions mutate and re-run `load()`.

### Layout

| Path                  | What it is                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/`         | SvelteKit routes: `/` auth page, `/dashboard`, `/dashboard/export.csv`, `/admin/approvals`, `/pending-approval`, `/[...path]` 404 catch-all                                                                                                 |
| `src/lib/components/` | Svelte 5 components (Modal with focus trap, table, charts, forms)                                                                                                                                                                           |
| `src/lib/server/`     | Better Auth wiring + data layer. `applications-data.ts` — every function takes `(db, userId, …)`; every query filters on `userId`. `db/schema.ts` — Drizzle schema + row mappers (ISO ↔ unix-seconds conversion, the only conversion point) |
| `src/lib/constants/`  | Stages, statuses, currencies, mock resume URLs (R2 upload deferred)                                                                                                                                                                         |
| `src/lib/utils/`      | Pure helpers: KPIs, money, dates, sort/filter                                                                                                                                                                                               |
| `db/migrations/`      | Drizzle-generated SQL files (the database recipe). Applied to D1 via `wrangler d1 migrations apply` — never hand-edit                                                                                                                       |
| `db/scripts/`         | Dev-only: `bun run seed` fills **local** D1 with a test admin + sample data. Never touches the remote DB                                                                                                                                    |
| `docs/`               | `docs/README.md` is the index. `docs/*.md` describes **this repo**; `docs/research/*.md` records **vendor** behaviour with citations — the source of truth for stack behavior (see AGENTS.md)                                               |
| `static/`             | Static assets (favicon, robots.txt, `.assetsignore`)                                                                                                                                                                                        |

### Key design decisions

- **Request-scoped everything.** Better Auth and Drizzle instances are built per request from `event.platform.env` (env bindings don't exist at module init on Workers).
- **Approval gate is server-owned.** The `disabled` field is `input: false`; only a server-side database hook writes it. Clients can't self-approve.
- **Money = integer minor units.** Salaries stored as JSON `{min, max, currency}` in integer minor units — never floats.
- **Free tier only.** Every binding and dependency must fit the Workers free plan. No R2/KV/DO/Queues bindings exist yet; the resume-upload feature is deferred until needed.
- **Flat migrations under `db/`.** drizzle-kit 0.31 emits `db/migrations/NNNN_name.sql`; `wrangler.jsonc` uses `migrations_pattern: 'db/migrations/*.sql'`. `db/scripts/` holds the local-only seed.

## Documentation

[`docs/README.md`](docs/README.md) is the index. Ten files, visual-first:

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

That is the only value you need. `BETTER_AUTH_URL` is intentionally left unset — auth derives its
base URL from each request's own origin, so local and deployed builds need no per-environment URL.

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
1. wrangler d1 create job-tracker      → paste database_id into wrangler.jsonc
2. Dashboard → Settings → Variables & Secrets → add secret BETTER_AUTH_SECRET
3. Dashboard → Settings → Build → connect the GitHub repo
     build command:  bun install --frozen-lockfile && bun run build
     deploy command: bun run db:migrate:remote && bunx wrangler deploy
4. git push origin main                → live
```

There is no `BETTER_AUTH_URL` to set. It is left unset on purpose so Better Auth derives the base
URL from each request's own origin — the same build works on `localhost:5173` and on the deployed
`workers.dev` URL.

## Tests

There is no in-repo test suite. The app is verified by driving the built worker (`bun run preview` → curl/browser flows) and an external Playwright suite kept at `/tmp/pw-tests/` (never inside the repo tree).

## License

[MIT](LICENSE) — Copyright (c) 2026 Chit Ko Ko Nyein. Swap the file if you would rather keep it
all-rights-reserved.
