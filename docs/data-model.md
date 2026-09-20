# Data model

Nine tables in one D1 database. Four belong to Better Auth; five belong to the app. Every app
table cascades from `user`, so a deleted account takes its whole subtree with it.

```mermaid
erDiagram
    user ||--o{ application : owns
    user ||--o{ session : has
    user ||--o{ account : has
    application ||--o{ interview : schedules
    application ||--o{ contact : "knows"
    application ||--o{ activity_event : logs
    user {
        text id PK
        text username UK
        text email UK
        boolean disabled "approval gate"
        text role "admin plugin"
    }
    application {
        text id PK
        text user_id FK
        text stage
        text status
        text salary "JSON blob"
        timestamp deleted_at "soft delete"
    }
    activity_event {
        text id PK
        text application_id FK
        text kind
        timestamp occurred_at
    }
```

## The tables

| Table | Owner | Purpose |
|---|---|---|
| `user` | Better Auth + app | Identity, plus `disabled` (approval gate) and `role` (admin plugin) |
| `session` | Better Auth | Session rows; `token` is what the cookie points at |
| `account` | Better Auth | Credentials. Provider `credential` holds the password hash |
| `verification` | Better Auth | Email verification / reset tokens |
| `rate_limit` | Better Auth | Counters, because `storage: 'database'` is mandatory on Workers |
| `application` | app | The job application itself |
| `interview` | app | Interviews attached to an application |
| `contact` | app | People met at a company |
| `activity_event` | app | Append-only timeline: creates, stage moves, interviews, contacts |

## `application` in detail

The one table that carries real domain weight.

| Column | Type | Notes |
|---|---|---|
| `stage` | enum | `saved → applied → phone_screen → technical → onsite → final → offer → accepted / rejected / withdrawn` |
| `status` | enum | Independent of stage: `active`, `stalled`, `ghosted`, `paused`, `closed` |
| `salary` | JSON text | A 4-way union (exact / range / none / unspecified), money as **integer minor units** |
| `tags` | JSON text | `string[]`, defaulted to `'[]'` in SQL so a raw insert still satisfies `notNull` |
| `appliedAt` / `stageChangedAt` / `nextActionAt` | unix seconds | `stageChangedAt` is the dwell-time anchor |
| `deletedAt` | unix seconds, nullable | Non-null means **in trash**; `restore` clears it, `purge` deletes the row |

```mermaid
stateDiagram-v2
    [*] --> saved
    saved --> applied: apply
    applied --> phone_screen
    phone_screen --> technical
    technical --> onsite
    onsite --> final
    final --> offer
    offer --> accepted
    applied --> rejected
    phone_screen --> rejected
    technical --> rejected
    onsite --> rejected
    final --> rejected
    offer --> withdrawn
    accepted --> [*]
    rejected --> [*]
    withdrawn --> [*]
```

**Stage and status are orthogonal on purpose.** Stage answers "how far did it get". Status answers
"is anything happening". An application can sit at `onsite` with status `ghosted` — that
combination is exactly what the dashboard exists to surface.

## Dates: one conversion point

```mermaid
flowchart LR
    D1[("D1<br/>unix seconds")] -->|"row mapper in<br/>schema.ts"| T["domain type<br/>ISO 8601 string"]
    T --> U["utils/dates.ts<br/>formatRelative, daysSince"]
```

Domain types (`src/lib/types.ts`) use **ISO strings**. D1 stores **unix seconds**. The only place
the two meet is the row mapper in `src/lib/server/db/schema.ts`. Nothing else in the codebase does
timestamp arithmetic on a raw integer, and no component receives a `Date` object.

## Money: never a float

`Salary` is a union, stored as a JSON blob rather than flattened into nullable `min`/`max`
columns plus a discriminator. Inside the blob, every amount is an **integer in minor units** —
`12_500_000` is ¥125,000.00, not `125000.0`. Parsing and formatting live in
`src/lib/utils/money.ts`; `parseSalaryFromForm` is the only entry point from user input.

## Indexes, and why exactly these

| Index | Serves |
|---|---|
| `application_user_idx` | Every list query filters on `userId` first |
| `application_user_deleted_idx` | The trash toggle — `userId` plus `deletedAt is null` |
| `interview_application_idx` | Detail modal loads interviews for one application |
| `contact_application_idx` | Same, for contacts |
| `activity_application_idx (applicationId, occurredAt)` | Timeline scan **and** the 90-day bounded stage-moves query |
| `user_username_unique` | Username sign-in; also stops two people claiming one handle |
| `account_provider_id_account_id_unique` | One credential row per provider identity |

There is no index on `stage` or `status`. They are low-cardinality and every query that touches
them is already scoped by `userId`, so a composite index would cost writes and buy nothing.

## Migrations

```mermaid
flowchart LR
    S["edit schema.ts"] --> G["bun run db:generate<br/>drizzle-kit generate"]
    G --> M["db/migrations/NNNN_name.sql"]
    M --> L["bun run db:migrate:local"]
    M --> R["bun run db:migrate:remote"]
```

`db/migrations/` is drizzle-kit output. **Never hand-edit it** — change `schema.ts` and regenerate.
Migrations are flat files (`0000_useful_butterfly.sql`), not one folder per migration, and
`wrangler.jsonc` points at `db/migrations/*.sql`. See [docs/research/drizzle.md](research/drizzle.md).

## Query discipline

Every read and write goes through `src/lib/server/applications-data.ts`, and every function there
takes the per-request `Db` plus the acting `userId`, and filters on `userId`. There is no
"get all applications" query and no way to reach another user's rows.

Deletes are **hard** deletes once they leave the trash. Nothing keeps a versioned row history,
which is what keeps the database inside the free-tier size ceiling — see
[free-tier-budget.md](free-tier-budget.md).
