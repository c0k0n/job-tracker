# Architecture

One Worker, one D1 database, no queues, no Durable Objects, no KV. Everything a request needs is
resolved inside that request.

![Request lifecycle](assets/request-lifecycle.svg)

## The shape

```mermaid
flowchart LR
    subgraph edge["Cloudflare edge"]
        W["Worker<br/>.svelte-kit/cloudflare/_worker.js"]
        A[("ASSETS<br/>static bundle")]
    end
    subgraph data["Bindings"]
        D1[("D1 · DB")]
    end
    B["Browser"] --> W
    B --> A
    W -->|"drizzle"| D1
    W -->|"better-auth"| D1
```

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

## What is deliberately absent

| Not here | Why |
|---|---|
| Durable Objects | Single-user, read-mostly. Reads do not need coordination. |
| KV / R2 | No files are uploaded yet; resumes are metadata only (`resumeId` + label). |
| Queues | No background work. `ctx.waitUntil` is not used because nothing is deferred. |
| Read replicas / sessions API | One primary, and D1's own latency is well inside the budget. |
| Service-worker offline mode | An offline PWA on the free tier costs requests, not saves them. |
