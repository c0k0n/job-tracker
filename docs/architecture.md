# Architecture

One Worker, one D1 database, one R2 bucket, no queues, no Durable Objects, no KV. Everything a
request needs is resolved inside that request.

![Request lifecycle](assets/request-lifecycle.svg)

## The shape

```mermaid
flowchart LR
    subgraph edge["Cloudflare edge"]
        W["Worker<br/>.svelte-kit/cloudflare/_worker.js"]
        A[("ASSETS<br/>static bundle")]
    end
    subgraph data["Bindings"]
        D1[("D1 · DB<br/>rows")]
        R2[("R2 · RESUMES<br/>PDF bytes")]
    end
    B["Browser"] --> W
    B --> A
    W -->|"drizzle"| D1
    W -->|"better-auth"| D1
    W -->|"metadata + bytes,<br/>never mixed"| R2
```

D1 holds **metadata**; R2 holds **bytes**. The split is not cosmetic — a resume row without its
object is meaningless, and an object without its row is unreachable garbage, so the write path is
ordered and the failure path cleans up. See
[resumes: the one place bytes live](#resumes-the-one-place-bytes-live).

There is no service boundary to cross, no cache layer, and no background worker. That is a
deliberate consequence of the free tier — see [free-tier-budget.md](free-tier-budget.md).

## Directory ownership

```mermaid
flowchart TD
    S["src/"] --> R["routes/<br/>URL surface: load + actions"]
    S --> L["lib/"]
    S --> H["hooks.server.ts<br/>auth + security headers"]
    L --> C["components/<br/>presentational, runes-only"]
    L --> U["utils/<br/>pure functions: dates, money, kpis, sortFilter"]
    L --> K["constants/<br/>stages, currencies, resumes"]
    L --> T["types.ts<br/>domain types, ISO dates"]
    L --> SV["server/"]
    SV --> AD["applications-data.ts<br/>THE data layer"]
    SV --> RD["resumes-data.ts<br/>resume rows + usage counts"]
    SV --> AU["auth.ts<br/>request-scoped betterAuth()"]
    SV --> DB["db/schema.ts + db/index.ts"]
```

| Directory | Owns | Must never |
|---|---|---|
| `src/routes/` | Reading the URL, calling the data layer, returning view models | Contain SQL, or know about money formatting |
| `src/lib/server/applications-data.ts` | Every D1 query in the app | Be imported from a `.svelte` file |
| `src/lib/server/db/schema.ts` | Table shape **and** the ISO-string ↔ unix-seconds conversion | Be bypassed by a raw `sql` query elsewhere |
| `src/lib/utils/` | Pure transformations, no I/O | Import from `$lib/server` |
| `src/lib/components/` | Presentation, snippets, local UI state | Fetch, or reach into `page` for mutable state |
| `src/lib/server/resumes-data.ts` | Every D1 query against `resume` | Touch the `RESUMES` bucket — that lives in `src/routes/api/resumes/` |

## One request, end to end

```mermaid
sequenceDiagram
    participant B as Browser
    participant H as hooks.server.ts
    participant A as better-auth
    participant L as +page.server.ts
    participant Q as applications-data
    participant D as D1

    B->>H: GET /dashboard?tag=react
    H->>A: getSession(request.headers)
    A-->>H: session + user
    alt user.disabled
        H->>A: signOut()  // self-heal stale cookie
        H->>H: locals.user = null
    else ok
        H->>H: locals.user = user
    end
    H->>L: resolve(event)
    L->>Q: getDashboardData(db, userId, filters)
    Q->>D: batched aggregate
    D-->>Q: rows
    Q-->>L: view model
    L-->>H: data
    H-->>B: SSR HTML + security headers
```

The two rules that make this safe:

1. **`locals` is never trusted twice.** `hooks.server.ts` is the only place that resolves a
   session. Routes read `locals.user` and assume it is already vetted — including that a
   `disabled` user has been signed out.
2. **`getAuth()` is request-scoped.** It builds from `getRequestEvent().platform.env`, never at
   module init, because the D1 binding does not exist at build time.

## Why there is no remote-function layer

SvelteKit's remote functions are the current advice for typed client-server calls. This app does
not use them, and that is a decision, not an oversight:

```mermaid
flowchart LR
    A["filter / sort / modal state"] -->|"replaceState<br/>shallow routing"| A
    B["real navigation:<br/>open detail, toggle trash"] -->|"goto + resolvePath"| C["load() runs"]
    D["mutation"] -->|"form action"| C
```

Filter, sort, and modal-open state is owned by the client and applied against the already-loaded
row set, so it never costs a Worker invocation. Mutations are form actions, which re-run `load()`
and therefore re-derive everything server-side. A remote-function layer would add a second path
to the same data for no gain at this size. See [routes.md](routes.md).

## Resumes: the one place bytes live

![Resume upload and attach flow](assets/resume-flow.svg)

```mermaid
sequenceDiagram
    participant B as Browser
    participant P as POST /api/resumes
    participant R2 as R2 · RESUMES
    participant Q as resumes-data
    participant D as D1

    B->>P: multipart PDF
    P->>P: content-length pre-check → 413
    P->>Q: countResumes() → 409 at 20
    P->>P: size → 413 · magic bytes → 415
    P->>R2: put("userId/resumeId.pdf")
    R2-->>P: ok
    P->>Q: insertResume()
    Q->>D: INSERT resume
    D-->>Q: row
    Note over P,R2: if the INSERT throws,<br/>bucket.delete() runs — no orphan bytes
```

Four properties come out of that ordering:

| Property | How |
|---|---|
| Bytes are never addressed by user input | The key is always `${userId}/${resumeId}.pdf`, both server-generated. The uploaded filename is stored for display and never touches a path |
| Type is proven, not declared | The browser's `Content-Type` is attacker-controlled, so the first five bytes must be `%PDF-` (`0x25 0x50 0x44 0x46 0x2d`) or the upload is 415 |
| A failed row never leaves bytes behind | The object is written first because it can fail for free; if the D1 insert then fails, the object is deleted. The row is the only pointer, so a half-written pair is worse than none |
| Reads are always proxied | `GET /api/resumes/[id]` streams through the Worker with `Cache-Control: private, no-store`. The bucket has no public URL and no presigned URL is ever minted |

```mermaid
flowchart LR
    A["resume row<br/>D1"] -->|"r2Key"| B["object<br/>R2"]
    C["application.resumeId"] -->|"nullable, no FK"| A
    B -.->|"DELETE: object + row + detach"| D["nothing left"]
```

`application.resume_id` is deliberately **not** a foreign key. SQLite cannot add an FK without
rebuilding the table, and a rebuild is the one migration this project refuses to ship. Detaching
is therefore an explicit `UPDATE application SET resume_id = NULL` inside `deleteResume()` — which
also means deleting a resume leaves the application intact rather than taking it down with it.

## What is deliberately absent

| Not here | Why |
|---|---|
| Durable Objects | Single-user, read-mostly. Reads do not need coordination. |
| KV | D1 is already fast enough at this size; a cache would be a second source of truth. |
| Public R2 bucket / presigned URLs | Every read goes through the Worker, so authorisation cannot be bypassed by guessing a key. |
| Queues | No background work. `ctx.waitUntil` is not used because nothing is deferred. |
| Read replicas / sessions API | One primary, and D1's own latency is well inside the budget. |
| Service-worker offline mode | An offline PWA on the free tier costs requests, not saves them. |
