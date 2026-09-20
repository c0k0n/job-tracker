# Free-tier budget

The app is designed against the Cloudflare free tier, and the shape of the code is a consequence
of that, not a coincidence. Raw vendor numbers live in
[research/cloudflare.md](research/cloudflare.md); this file is about which of them bind and what
the code does about it.

![Free-tier headroom](assets/free-tier-gauge.svg)

## What actually binds

```mermaid
flowchart TD
    A["Workers free tier"] --> B["10 ms CPU / request"]
    A --> C["100,000 requests / day"]
    A --> D["50 subrequests / request"]
    A --> E["64 MiB script"]
    F["D1 free tier"] --> G["50 queries / invocation"]
    F --> H["500 MB database"]
    F --> I["5 M rows read / day"]
    N["R2 free tier"] --> O["10 GB storage"]
    N --> P["1 M Class A / month<br/>10 M Class B / month"]
    N --> Q["zero egress"]
    B -->|"BINDS"| J["batched dashboard aggregate"]
    G -->|"BINDS"| J
    C -->|"headroom 1000x"| K["shallow routing keeps<br/>filter state off the wire"]
    H -->|"headroom large"| L["hard deletes, no row history"]
    O -->|"headroom large"| R["10 MB x 20 resumes per user<br/>= 200 MB max per user"]
    E & D --> M["no pressure"]
```

**Two limits matter: CPU per request, and D1 queries per invocation.** Everything else has
orders of magnitude of headroom for a single-user application.

| Limit | Ceiling | Typical use | Verdict |
|---|---|---|---|
| CPU per request | 10 ms | ~2-3 ms | **Tight — the one to design around** |
| D1 queries / invocation | 50 | single digits | **Design constraint** |
| Requests / day | 100,000 | tens | Large headroom |
| Rows read / day | 5,000,000 | thousands | Large headroom |
| Database size | 500 MB | ~1 MB | Large headroom |
| Script size | 64 MiB | well under | No pressure |
| Subrequests / request | 50 | 0 | No pressure |
| R2 storage | 10 GB | ≤ 200 MB per user | Large headroom |
| R2 Class A ops (writes, lists) | 1 M / month | tens | Large headroom |
| R2 Class B ops (reads) | 10 M / month | hundreds | Large headroom |
| R2 egress | free | every byte a user downloads | **Never a cost — this is why the bucket holds files** |

## What the code does about it

```mermaid
flowchart LR
    subgraph budget["10 ms CPU · 50 D1 queries"]
        direction TB
        A["getDashboardData()"] --> B["ONE batched aggregate"]
        B --> C["computeKpis() — pure, no I/O"]
        B --> D["charts — pure, no I/O"]
    end
    E["8 widgets, 8 queries"] -.->|"rejected"| F["would risk both ceilings"]
```

| Decision | Buys |
|---|---|
| One batched aggregate, not a query per widget | Keeps D1 queries in single digits and CPU at ~2-3 ms |
| `STAGE_MOVES_WINDOW_DAYS = 90` | The `activity_event` scan costs the same on day 1 and day 1000 |
| `session.cookieCache` (5 min, `compact`) | Session reads skip D1 entirely on most requests |
| `replaceState` for filter / sort / modal state | Those interactions cost zero Worker invocations |
| `goto` only for real navigations | Invocations are spent where the server actually has work to do |
| Hard deletes, no versioned row history | Database stays flat instead of growing quadratically |
| No polling, no websockets, no background jobs | Request count stays proportional to actual use |
| Resume bytes in R2, metadata in D1 | 200 MB ceiling per user against a 10 GB bucket, and egress is free |
| Resume PDFs proxied by the Worker, not a public bucket | No presigned URL to leak; a read is one Class B op, which is 10 M/month |
| Upload rejected on `content-length` before the body is read | A 500 MB POST never reaches R2 or the CPU budget |

## What would break it, and what to do instead

```mermaid
flowchart TD
    A["new feature"] --> B{"does it add a query<br/>per row?"}
    B -- yes --> C["STOP · batch it or precompute"]
    B -- no --> D{"does it fire a request<br/>per keystroke?"}
    D -- yes --> E["STOP · replaceState, filter client-side"]
    D -- no --> F{"does it fetch an external API<br/>inside a loop?"}
    F -- yes --> G["STOP · 50-subrequest ceiling"]
    F -- no --> H["fine"]
```

| If you want to add | The cost | Do this instead |
|---|---|---|
| Full-text search | A scan per request | D1 FTS5 with an index; not `LIKE '%…%'` |
| Unlimited resume storage | 10 GB is the free ceiling | Keep the 10 MB × 20 per-user cap; it is enforced in code, not policy |
| Email digests | Needs Queues or a cron | `ctx.waitUntil` for a single call, nothing recurring |
| Real-time collaboration | Durable Objects | Not on the free tier |
| Semantic "more like this" | Workers AI + Vectorize | Feasible, but only past ~50k rows |

## The honest ceiling

```mermaid
flowchart LR
    A["1 user · ~50 applications"] --> B["trivial"]
    C["1 user · 5,000 applications"] --> D["still fine — indexes cover it"]
    E["100 users · shared DB"] --> F["CPU and queries still per-request,<br/>but requests/day becomes the ceiling"]
```

Per-request limits do not care how many users you have; per-day limits do. The design is sound up
to roughly the point where daily request volume becomes the binding constraint, and by then the
answer is a paid plan rather than a rewrite.
