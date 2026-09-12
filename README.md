# Job Tracker

A job-application tracking app for the front-line job hunter: track applications through the pipeline, log interviews and contacts, see funnel and velocity analytics, and export everything to CSV. Runs entirely on Cloudflare's free tier.

Built with SvelteKit 2 (Svelte 5 runes-only) + Tailwind v4 + Better Auth on Cloudflare Workers + D1 (SQLite) via Drizzle ORM.

## What it does

- **Auth with approval gate** — email+password sign-up (username or email sign-in). New accounts start disabled; an admin approves them at `/admin/approvals`. The first account ever created bootstraps as an approved admin.
- **Application pipeline** — create, edit, and track job applications through stages (wishlist → screening → interview stages → offer/rejected), with tags, salary (integer minor units, multiple currencies), and work arrangement. Soft delete with trash, restore, and permanent purge.
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

The URL is the source of truth for all dashboard state: filters, sort, and open modals live in query params (`?q=&stage=&status=&arr=&tag=&sort=&dir=&trash=&app=&new=&resume=`). Server actions mutate; `goto()` with `resolvePath()` navigates state changes.

### Layout

| Path                  | What it is                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/`         | SvelteKit routes: `/` auth page, `/dashboard`, `/dashboard/export.csv`, `/admin/approvals`, `/pending-approval`, `/[...path]` 404 catch-all                                                                                                 |
| `src/lib/components/` | Svelte 5 components (Modal with focus trap, table, charts, forms)                                                                                                                                                                           |
| `src/lib/server/`     | Better Auth wiring + data layer. `applications-data.ts` — every function takes `(db, userId, …)`; every query filters on `userId`. `db/schema.ts` — Drizzle schema + row mappers (ISO ↔ unix-seconds conversion, the only conversion point) |
| `src/lib/constants/`  | Stages, statuses, currencies, mock resume URLs (R2 upload deferred)                                                                                                                                                                         |
| `src/lib/utils/`      | Pure helpers: KPIs, money, dates, sort/filter                                                                                                                                                                                               |
| `migrations/`         | Drizzle-generated SQL files (the database recipe). Applied to D1 via `wrangler d1 migrations apply` — never hand-edit                                                                                                                       |
| `scripts/`            | Dev-only: `bun run seed` fills **local** D1 with a test admin + sample data. Never touches the remote DB                                                                                                                                    |
| `docs/`               | Research files — the source of truth for stack behavior (see AGENTS.md)                                                                                                                                                                     |
| `static/`             | Static assets (favicon, robots.txt, `.assetsignore`)                                                                                                                                                                                        |

### Key design decisions

- **Request-scoped everything.** Better Auth and Drizzle instances are built per request from `event.platform.env` (env bindings don't exist at module init on Workers).
- **Approval gate is server-owned.** The `disabled` field is `input: false`; only a server-side database hook writes it. Clients can't self-approve.
- **Money = integer minor units.** Salaries stored as JSON `{min, max, currency}` in integer minor units — never floats.
- **Free tier only.** Every binding and dependency must fit the Workers free plan. No R2/KV/DO/Queues bindings exist yet; the resume-upload feature is deferred until needed.
- **Flat migrations.** drizzle-kit 0.31 emits `migrations/NNNN_name.sql`; `wrangler.jsonc` uses `migrations_pattern: 'migrations/*.sql'`.

## Getting started

Requires [Bun](https://bun.sh) (v1.3+). Cloudflare login via `npx wrangler login` (or the environment your wrapper provides).

```bash
bun install
```

Create `.dev.vars` in the repo root (gitignored) with your local secrets:

```
BETTER_AUTH_SECRET=<random string — openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:5173
```

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

## Deployment (first time)

```
1. bunx wrangler secret put BETTER_AUTH_SECRET     # paste the production secret
2. Edit wrangler.jsonc: set vars.BETTER_AUTH_URL to https://<name>.<subdomain>.workers.dev
3. bun run db:migrate:remote                       # create tables in remote D1
4. bun run deploy
```

## Tests

There is no in-repo test suite. The app is verified by driving the built worker (`bun run preview` → curl/browser flows) and an external Playwright suite kept at `/tmp/pw-tests/` (never inside the repo tree).

## License

All rights reserved (personal project). Adjust if you intend to publish.
