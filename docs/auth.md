# Authentication and the approval gate

Better Auth 1.7, mounted as a SvelteKit catch-all, backed by the same D1 database as everything
else. Nobody is approved by default — the first account to exist becomes the admin, and every
account after that waits in a queue.

![Approval gate](assets/approval-gate.svg)

## How it is wired

```mermaid
flowchart TD
    A["src/lib/server/auth.ts<br/>getAuth() — request-scoped"] --> B["src/hooks.server.ts<br/>handle()"]
    B --> C["auth.api.getSession()"]
    C --> D["event.locals.user<br/>event.locals.session"]
    D --> E["svelteKitHandler<br/>mounts /api/auth/*"]
    E --> F["+ security headers"]
```

Three things about this arrangement are load-bearing:

1. **`getAuth()` is called per request, not at module init.** The D1 binding only exists inside a
   request, so a module-level `betterAuth({...})` would either crash at build or bind to nothing.
2. **`svelteKitHandler` mounts `/api/auth/*` but does not populate `locals`.** `hooks.server.ts`
   calls `getSession()` itself.
3. **`sveltekitCookies(getRequestEvent)` is the last plugin.** Cookie writes need the SvelteKit
   request event, and plugin order decides which wrapper wins.

## Configured options, and why

| Option | Value | Reason |
|---|---|---|
| `user.additionalFields.disabled` | `{ type: 'boolean', input: false, defaultValue: true }` | `input: false` makes it server-owned — a crafted POST cannot set it |
| `emailAndPassword.autoSignIn` | `false` | Sign-up returns `{ token: null, user }`. No cookie, so an unapproved user cannot be half-signed-in |
| `emailAndPassword.requireEmailVerification` | `false` | No mail sender is wired up yet |
| `session.expiresIn` / `updateAge` | 7 days / 1 day | Sliding expiry; `updateAge` stops every request rewriting the row |
| `session.cookieCache` | 5 min, `compact` | Reads session data from a signed cookie instead of a D1 query, inside the CPU budget |
| `advanced.ipAddress.ipAddressHeaders` | `['cf-connecting-ip']` | `x-forwarded-for` is spoofable; Cloudflare's header is not |
| `advanced.database.generateId` | `'uuid'` | Text primary keys throughout |
| `advanced.database.joins` | `true` | Lets the adapter resolve relations in one query |
| `rateLimit` | `window: 60, max: 100, storage: 'database'` | Memory storage is decorative on Workers — isolates reset between requests |
| `plugins` | `admin()`, `username()`, `sveltekitCookies()` | Role checks, username sign-in, cookie plumbing |
| `username()` validation | `/^[a-zA-Z0-9_.]+$/`, length 3–30 | Better Auth defaults (`defaultUsernameValidator`), not overridden — see [Sign-in handles](#sign-in-handles) |

## The four gates

```mermaid
flowchart TD
    S["request"] --> G1{"session<br/>present?"}
    G1 -- no --> L["landing page<br/>sign in / sign up"]
    G1 -- yes --> G2{"user.disabled?"}
    G2 -- yes --> H["signOut() — self-heal"] --> L
    G2 -- no --> G3{"role === 'admin'?"}
    G3 -- no --> D["/dashboard"]
    G3 -- yes --> D
    D --> G4{"admin route?"}
    G4 -- yes --> G3
```

1. **Sign-up** — creates the row with `disabled: true` and issues **no session**. The user lands
   on `/pending-approval`.
2. **Sign-in** — `src/routes/+page.server.ts` looks the user up *before* calling `signInEmail` and
   refuses if `disabled`. This pre-check is required: Better Auth happily hands a session to a
   disabled user once the password verifies.
3. **`hooks.server.ts`** — if a session resolves to a `disabled` user, the session is revoked on
   the spot. This only ever fires for a legacy cookie from before `autoSignIn` was switched off,
   and it exists so those users get signed out cleanly instead of bouncing between redirects.
4. **Admin routes** — `/admin/approvals` re-checks `role` in its own `load`, because `locals` is a
   convenience, not an authorisation boundary.

## Bootstrap

```mermaid
flowchart LR
    A["user.create.before hook"] --> B{"any user with<br/>disabled = false?"}
    B -- no --> C["this user becomes<br/>disabled: false, role: 'admin'"]
    B -- yes --> D["disabled: true<br/>role: 'user'"]
```

The check is `disabled = false`, not "does any user exist". If you delete the only approved admin,
the next sign-up bootstraps again rather than leaving the install permanently unlocked.

## Anti-enumeration, and the price of it

With `autoSignIn: false`, signing up with an existing email returns a generic synthetic success
instead of a "user already exists" error. That is deliberate — it stops the form being an oracle
for which emails have accounts — but it means the route cannot rely on Better Auth to detect
duplicates. `src/routes/+page.server.ts` pre-checks the email itself and returns the friendly
error.

## Sign-in handles

Sign-up asks for an email. Sign-in says "username or email". Both are true, and the join between
them is a derived handle — `src/routes/+page.server.ts` computes it from the email's local part at
sign-up time and stores it in `user.username`.

```mermaid
flowchart LR
    A["john-smith@gmail.com"] --> B["deriveHandle()"]
    B --> C["john.smith"]
    D["jo@x.com"] --> E["deriveHandle()"]
    E --> F["null — too short"]
    F --> G["sign in by email only"]
```

The derivation is not cosmetic. `username()` validates against `/^[a-zA-Z0-9_.]+$/` inside a 3–30
window, and real local parts fall outside that constantly — `john-smith`, `me+tag`, `jo`. Passing
the raw local part through made `signUpEmail` throw `Username is invalid` / `Username is too
short`, which took the whole page to a 500. So:

| Input | Handle | Note |
|---|---|---|
| `noa@noa.com` | `noa` | Already valid, unchanged |
| `john-smith@gmail.com` | `john.smith` | `-` becomes a dot, which stays readable |
| `noa+tag@gmail.com` | `noa.tag` | Same rule |
| `mary.jane@x.com` | `mary.jane` | Dots survive as-is |
| `jo@x.com` | `null` | Under 3 characters — no handle, email sign-in only |

When the derivation returns `null` the account is created with no `username` at all. That is a
supported state, not a fallback: sign-in branches on the `@` and only resolves a handle when the
input has none, so those users simply always use their email.

Two consequences worth knowing:

- **The handle is shown once, at sign-up.** `/pending-approval?handle=…` echoes it, re-validated
  server-side against `/^[a-z0-9_.]{3,30}$/` because it arrives through a URL. There is no
  settings page to change or add one later — see below.
- **Two emails can derive the same handle.** Sign-up pre-checks `user.username` and returns a
  friendly "try a different address" instead of Better Auth's `USERNAME_IS_ALREADY_TAKEN`.
  `signUpEmail` is additionally wrapped in try/catch, so any remaining Better Auth rejection
  degrades to a form error rather than the error boundary.

## What is not implemented

| Not here | Consequence |
|---|---|
| Email verification | `verification` table exists and is empty; no sender is configured |
| Password reset | Needs the same sender |
| OAuth | `account` table is ready; no provider is registered |
| 2FA / passkeys | Not enabled |
| Session revocation UI | Only the self-heal path in `hooks.server.ts` |
| Choosing or editing your handle | Derived once at sign-up; `username()` treats it as immutable, so there is no UI to change it |

Any of these needs a mail sender first. Better Auth hands you a `sendEmail` callback — on Workers,
hand it to `ctx.waitUntil` so the response is not blocked.
