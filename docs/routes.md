# Routes

Eight route groups. Every one of them is server-rendered; there is no SPA fallback and no client
router doing data fetching.

```mermaid
flowchart TD
    R["/"] -->|"has session"| D["/dashboard"]
    R -->|"sign up"| P["/pending-approval"]
    D -->|"admin only"| A["/admin/approvals"]
    D -->|"download"| C["/dashboard/export.csv"]
    D -->|"library"| RR["/api/resumes<br/>GET · POST"]
    RR --> RI["/api/resumes/[id]<br/>GET · DELETE"]
    X["anything else"] --> N["[...path] → 404"]
    N --> E["+error.svelte"]
```

## The table

| Route | File | Guard | Purpose |
|---|---|---|---|
| `/` | `+page.server.ts` | Redirects to `/dashboard` if signed in | Sign-in / sign-up |
| `/pending-approval` | `+page.server.ts` | Redirects to `/dashboard` if signed in | "Wait for an admin" notice; `?handle=` echoes the derived sign-in handle |
| `/dashboard` | `+page.server.ts` | Redirects to `/` if not signed in | The app |
| `/dashboard/export.csv` | `+server.ts` | Same as dashboard | CSV download of the current view |
| `/admin/approvals` | `+page.server.ts` | Signed in **and** `role === 'admin'` | Approval queue |
| `/api/resumes` | `+server.ts` | Signed in | `GET` list, `POST` upload |
| `/api/resumes/[id]` | `+server.ts` | Signed in **and** owns the row | `GET` stream the PDF, `DELETE` remove it |
| `/[...path]` | `+page.ts` | none | Throws 404 so `+error.svelte` renders |
| `/api/auth/*` | via `svelteKitHandler` | Better Auth | Auth endpoints, mounted in `hooks.server.ts` |

## The resume endpoints

The only non-form mutation surface in the app, because a form action would push a 10 MB body
through the SSR round-trip.

```mermaid
flowchart LR
    A["GET /api/resumes"] --> B["list + usedBy count"]
    C["POST /api/resumes"] --> D["413 · 409 · 415<br/>then put + insert"]
    E["GET /api/resumes/[id]"] --> F["stream, no-store,<br/>X-Frame-Options SAMEORIGIN"]
    G["DELETE /api/resumes/[id]"] --> H["object + row + detach"]
```

| Status | Means |
|---|---|
| 401 | No session |
| 404 | No such resume **for this user** — a foreign id misses, it does not deny |
| 409 | Already at 20 resumes. Delete one first |
| 413 | Over 10 MB, judged from `content-length` before the body is read |
| 415 | Not a PDF. The first five bytes were not `%PDF-` |

## Actions

Every mutation is a form action, so it re-runs `load()` and the server stays the single source of
truth for what the user sees.

```mermaid
flowchart LR
    F["<form method=POST>"] -->|"use:enhance"| A["?/create · ?/edit · ?/delete"]
    A --> V["validate"]
    V -- bad --> FF["fail(400, {values, errors})"]
    V -- ok --> W["write D1"]
    W --> L["load() re-runs"]
    L --> H["fresh HTML"]
```

| Route | Action | Does |
|---|---|---|
| `/` | `default` | Branches on `mode`: `signin` or `signup`. Pre-checks `disabled` before signing in |
| `/dashboard` | `create` | New application. A submitted `resumeId` must pass `isResumeOwned()` |
| | `edit` | Update an existing one; same `resumeId` check |
| | `delete` | Soft delete — sets `deletedAt` |
| | `restore` | Clears `deletedAt` |
| | `purge` | Hard delete one row |
| | `emptyTrash` | Hard delete everything in the trash |
| | `addInterview` | Adds an interview + an `activity_event` |
| | `addContact` | Adds a contact + an `activity_event` |
| | `signout` | Ends the session |
| `/admin/approvals` | `approve` | `disabled → false`; the user can sign in at once |
| | `reject` | Deletes the user row |

## URL state: what lives where

```mermaid
flowchart TD
    Q["?tag=react&sort=company&dir=asc&trash=1&detail=<id>"] --> S["parseFiltersFromUrl()"]
    S --> L["load()"]
    L --> D["data.applications"]
    D --> C["client re-filters on change<br/>replaceState — no navigation"]
    Q --> M["?detail=<id>"] --> G["goto — real navigation,<br/>server fetches the bundle"]
```

Two kinds of state, two mechanisms, and the split is not cosmetic — each `goto` is a Worker
invocation and the free tier budgets those by the day.

| State | Mechanism | Why |
|---|---|---|
| Filters, sort, tag chips | `replaceState` from `$app/navigation` | The client already owns the rows; re-filtering is free |
| Which detail modal is open | `goto(resolvePath(...))` | The server has to fetch interviews, contacts, and the timeline |
| Trash view | `goto` | Changes what the server returns |

`replaceState` updates `page.state` but **never** `page.url`. If you need to read the current
filter out of `page.url`, you are reading a stale value — read `page.state` instead.

## Redirects

| From | To | Condition |
|---|---|---|
| `/` | `/dashboard` | Session present |
| `/pending-approval` | `/dashboard` | Session present |
| `/dashboard` | `/` | No session |
| `/admin/approvals` | `/?next=/admin/approvals` | No session |
| `/admin/approvals` | `/dashboard` | Signed in but not admin |

The `?next=` parameter goes through `safeNextParam`, which rejects anything starting with `//` or
`/\` — both normalise to a protocol-relative URL in a browser and would be an open redirect.

## The CSV endpoint

`GET /dashboard/export.csv` streams the current filtered view. Two details matter:

- **Formula injection.** Any cell starting with `=`, `+`, `-`, or `@` is prefixed so a spreadsheet
  treats it as text, not a formula.
- **No buffering.** It streams rows rather than building one giant string, which keeps it inside
  the Worker memory ceiling.
- **Resumes by name, not id.** The `resume` column is the filename looked up from `listResumes()`,
  batched into the same load rather than queried per row. An application whose resume was deleted
  exports an empty cell instead of a dangling id.

## Error handling

`/[...path]` throws `error(404, …)` so `src/routes/+error.svelte` renders instead of SvelteKit's
bare default. Action failures return `fail(400, { values, errors })` and the form re-renders with
the user's input echoed back — nothing typed is ever discarded on a validation error.

There are two distinct failure shapes, and they are handled differently on purpose:

```mermaid
flowchart TD
    A["form posted"] --> B{"result type?"}
    B -- "failure (fail 400)" --> C["update() → page.form<br/>fields echo back, errors inline"]
    B -- "success / redirect" --> D["update() → invalidateAll, follow redirect"]
    B -- "error (fetch failed)" --> E["safeEnhance intercepts<br/>onError(msg) → role=alert region"]
    E --> F["page stays intact:<br/>filters, scroll, open modal"]
```

| Shape | Where it comes from | Handling |
|---|---|---|
| `failure` | `fail(400, { values, errors })` in an action | Travels through `page.form`; the field keeps its value |
| `success` / `redirect` | A completed action | `update()` — `invalidateAll` and follow the redirect |
| `error` | The `fetch` itself failed: dead connection, worker restart, DNS blip | `safeEnhance()` reports inline, page is never replaced |

That third row is the one worth understanding. SvelteKit's default `enhance` callback calls
`applyAction(result)`, and applying an `error` result **throws to the nearest `+error.svelte`
boundary** — verified in the installed source at
`node_modules/@sveltejs/kit/src/runtime/app/forms.js` (~lines 192–205). So a momentary network
hiccup on "Move to trash" would swap the whole dashboard for an error page and discard the user's
filters, scroll position, and open modal.

`safeEnhance(onError)` in `src/lib/utils/enhance.ts` intercepts **only** `type === 'error'` and
reports it into a `role="alert"` region. Everything else falls through to `update()` untouched, so
validation echo-back and redirects behave exactly as before. It is wired into every mutating form:
row actions in `ApplicationsTable`, the detail modal's restore / delete / purge and
add-interview / add-contact, approve / reject on the admin queue, sign-out and empty-trash on the
dashboard, plus sign-in / sign-up and `ApplicationForm` (which use `enhanceErrorMessage` directly,
because they already have their own callback).
