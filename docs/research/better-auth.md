# Better Auth 1.7 — research notes

> Sources: Better Auth MCP (`/llms.txt`, v1.7 latest, plus `/docs/integrations/svelte-kit`, `/docs/concepts/{api,session-management,email-password,oauth,database,plugins,rate-limit,email,hooks,client,cookies,cli,typescript,users-accounts}`, `/docs/plugins/{2fa,organization,admin}`, `/docs/reference/options`, `/docs/adapters/drizzle`).
> Mapped 2026-09-04. **Installed**: `better-auth` + `@better-auth/drizzle-adapter` `^1.7.5` (both `devDependencies` — they are bundled into the Worker at build time, so they do not need to be runtime deps). Where this file says "for a fresh project", read it as the shape the repo already follows **except where a later section says otherwise** — several sections record where the repo deliberately diverges, and those notes win. See `docs/architecture.md` for what the repo actually ships.

## Versions & how to choose

- **Latest stable line**: **1.7.x** (`v1.7` is the `current` docs index; `v1.6` is also indexed).
- **Drizzle adapter** lives at `@better-auth/drizzle-adapter` (separate package; needed even though `better-auth/adapters/drizzle` is a subpath in some examples — the v1.7 docs recommend the package).
- **Bundle-size tip**: if you use a Drizzle/Prisma/Mongo/community adapter, import `better-auth/minimal` instead of `better-auth` to skip the built-in Kysely adapter. Relevant if we ever hit Worker size limits.

## Install shape for a fresh project

```bash
bun add better-auth
bun add -d @better-auth/drizzle-adapter
# optional: dedicated CLI
bun add -d @better-auth/cli
```

The `auth` CLI (`bunx auth@latest …`) is the source of truth for schema generation, migrations, secret generation, and admin user creation. It also includes `info` (sanitized diagnostic dump) and `upgrade` (synchronised release train).

## Core config: `src/lib/server/auth.ts`

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from './db';                  // your Drizzle instance
import * as schema from './db/schema';       // all tables Better Auth needs

export const auth = betterAuth({
  appName: 'Job Tracker',
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL,    // https://...workers.dev
  trustedOrigins: [
    process.env.BETTER_AUTH_URL!,            // prod
    'http://localhost:5173',                  // dev
  ],
  database: drizzleAdapter(db, {
    provider: 'sqlite',                      // or 'pg' | 'mysql'
    schema,                                  // user/session/account/verification tables
    // usePlural: true if tables are 'users' etc
  }),

  // Email + password
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,         // flip when you have an email sender
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    sendResetPassword: async ({ user, url, token }, _request) => {
      // call your email provider here; don't await (timing)
      // worker: use ctx.waitUntil(email.send(...))
    },
  },

  // Email verification
  emailVerification: {
    sendOnSignUp: false,
    sendOnSignIn: false,
    sendVerificationEmail: async ({ user, url, token }, _request) => { /* ... */ },
    autoSignInAfterVerification: true,
  },

  // Social providers (optional)
  socialProviders: {
    github: { clientId, clientSecret },
    google: { clientId, clientSecret },
  },

  // Sessions
  session: {
    expiresIn: 60 * 60 * 24 * 7,            // 7d
    updateAge: 60 * 60 * 24,                // 1d
    freshAge: 60 * 60 * 24,                // 1d (used for password re-auth, account delete)
    cookieCache: {                          // signed session_data cookie
      enabled: true,
      maxAge: 5 * 60,
      strategy: 'compact',                  // 'compact' | 'jwt' | 'jwe'
    },
  },

  // Advanced
  advanced: {
    ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },  // trust CF header
    useSecureCookies: true,
    crossSubDomainCookies: { enabled: false },
    cookiePrefix: 'job-tracker',
    database: { generateId: 'uuid', defaultFindManyLimit: 50, joins: true },
  },

  rateLimit: { enabled: true, window: 60, max: 100, storage: 'database', modelName: 'rateLimit' },

  // Plugins — add as needed
  plugins: [sveltekitCookies(getRequestEvent)],
});
```

> On Cloudflare Workers, `process.env` reads at build time — for runtime secrets use the `env` binding. `worker-configuration.d.ts` declares `Env`. To get them, expose a `secret` accessor that reads `request.platform.env`. The cleanest path: import `env` from `cloudflare:workers` and reference `env.BETTER_AUTH_SECRET` inside `betterAuth({...})` — but `betterAuth()` is called at module init, not per request, so the standard pattern is to pass a getter or wrap behind a per-request handler. See SvelteKit integration below for the recommended pattern.

> **This sample is the vendor's shape, not this repo's.** Four lines in it are the opposite of
> what `src/lib/server/auth.ts` does, and copying any of them back would undo a decision this
> repo made on purpose:
>
> | Sample line | This repo | Why it differs |
> |---|---|---|
> | `export const auth = betterAuth({...})` at module init | `getAuth()` builds per request | Env bindings do not exist at module init on Workers. |
> | `baseURL: process.env.BETTER_AUTH_URL` | `{ allowedHosts, protocol: 'auto' }` | A pinned `baseURL` costs the "one build everywhere" property. See [Base URL](../auth.md#base-url). |
> | `trustedOrigins: [..., 'http://localhost:5173']` | `trustedOrigins: extraOrigins` (from `DEV_ORIGINS`, empty in prod) | Better Auth's own docs: "Do not leave the localhost origin in a trusted origins list of a production auth instance." |
> | `autoSignIn: true` | `autoSignIn: false` | Sign-ups must not receive a session, or every guarded route has to bounce an unapproved user around. |
>
> The `session`, `advanced`, and `rateLimit` blocks in the sample are accurate and match the repo.

## Drizzle adapter specifics

```ts
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { db } from './db';
import * as schema from './db/schema';

database: drizzleAdapter(db, {
  provider: 'sqlite',                       // 'pg' | 'mysql' too
  schema,                                   // pass your full schema object
  // usePlural: true,                       // if you name tables 'users', 'sessions', ...
  // schemaName: 'auth',                    // for Postgres custom namespace (pgSchema)
})
```

### Schema requirements

You must define the four core tables yourself (or use `bunx auth generate --adapter drizzle` to scaffold them). The adapter expects these **default table names and column names** by default; only rename if you also tell Better Auth via the `schema` option or `user.modelName` / `account.modelName` / `session.modelName` / `verification.modelName` per-model.

```ts
// user
{ id: text PK, name: text NOT NULL, email: text NOT NULL UNIQUE,
  emailVerified: integer NOT NULL DEFAULT 0, image: text,
  createdAt: integer NOT NULL, updatedAt: integer NOT NULL }
// session
{ id: text PK, expiresAt: integer NOT NULL, token: text NOT NULL UNIQUE,
  createdAt: integer NOT NULL, updatedAt: integer NOT NULL,
  ipAddress: text, userAgent: text, userId: text FK→user.id }
// account
{ id: text PK, accountId: text NOT NULL,     // the provider subject (e.g. Google sub)
  providerId: text NOT NULL,                  // 'credential' | 'github' | 'google' | ...
  userId: text FK→user.id,
  accessToken: text, refreshToken: text,
  idToken: text, accessTokenExpiresAt: integer,
  refreshTokenExpiresAt: integer, scope: text,
  password: text,                            // scrypt hash for credential accounts
  createdAt: integer NOT NULL, updatedAt: integer NOT NULL }
// verification
{ id: text PK, identifier: text NOT NULL, value: text NOT NULL,
  expiresAt: integer NOT NULL, createdAt: integer, updatedAt: integer }
```

> **CORRECTION (checked against the installed `better-auth@1.7.5`):** there is **no**
> `account.identityStrategy` option and **no** `issuer` column in this version. Grepping every
> `.mjs` and `.d.mts` under `node_modules/better-auth` and `node_modules/@better-auth` for
> `identityStrategy` returns zero hits. An earlier draft of this file claimed the setting existed
> and described its two values; that was wrong, and following it would send you looking for a
> config key that is not there. The `account` table is exactly the block above: `providerId` +
> `accountId`, unique together. `docs/research/drizzle.md` propagated the same error into its
> `uniqIssuerAccount` recipe; both are corrected.

### Adapter Drizzle relations v2 (Drizzle v1.x)

If you're using Drizzle's new `defineRelations` / `defineRelationsPart` API (Drizzle v1.0 RC), the adapter has a v2 entry point:

```ts
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
```

Generated relations use `defineRelationsPart` and must be spread **after** your app's `defineRelations`. The v1.7 schema CLI emits this format automatically.

### Joins

Set `advanced.database.joins: true` for the Drizzle adapter to use joined queries (e.g. `/get-session`, `/get-full-organization`). Requires your Drizzle schema to declare the `relations()` correctly. The vendor describes this as faster for endpoints that need related rows but publishes no benchmark; treat the exact multiplier as unverified. Drizzle's CLI `bunx auth generate` (latest) auto-emits the right relations.

### Programmatic migrations (no CLI access — Cloudflare D1)

```ts
// src/routes/migrate/+server.ts
import { getMigrations } from 'better-auth/db/migration';
import { auth } from '$lib/server/auth';

export const POST: RequestHandler = async () => {
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
  if (!toBeCreated.length && !toBeAdded.length) return json({ ok: 'noop' });
  await runMigrations();
  return json({ ok: true });
};
```

`getMigrations` only works with the built-in Kysely adapter. For Drizzle, use Drizzle Kit's `drizzle-kit generate` + your own migration runner (`drizzle-kit migrate`) or, for D1, set `migrations_pattern: 'migrations/*/migration.sql'` in `wrangler.jsonc` and run `wrangler d1 migrations apply <DB> --remote`.

## SvelteKit integration (the only integration that matters here)

### Server: `src/hooks.server.ts`

```ts
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { sveltekitCookies } from 'better-auth/svelte-kit';          // plugin (NOT for handler)

export async function handle({ event, resolve }) {
  // 1) load session
  const session = await auth.api.getSession({ headers: event.request.headers });
  if (session) {
    event.locals.session = session.session;
    event.locals.user = session.user;
  }

  // 2) run the framework handler (the auth catch-all lives here)
  return svelteKitHandler({ event, resolve, auth, building });
}
```

The `svelteKitHandler` mounts Better Auth's catch-all route on the configured `basePath` (default `/api/auth/*`). So there is **no need** to create a manual `src/routes/api/auth/[...all]/+server.ts` unless you want to override behaviour.

> The docs flag: server-side `event.locals.session` and `event.locals.user` are **not** populated by `svelteKitHandler` alone — you must `auth.api.getSession({ headers: event.request.headers })` and assign them yourself (the snippet above). This is the universal pattern.

> **Cookie auth in server actions (cookies set on the request)**: install `sveltekitCookies(getRequestEvent)` as the **last** plugin. This makes `auth.api.signInEmail` / `auth.api.signUpEmail` from `+page.server.ts` actions correctly write `Set-Cookie` on the response.

### Server: typed locals (`src/app.d.ts`)

```ts
declare global {
  namespace App {
    interface Locals {
      user: import('$lib/server/auth').auth.$Infer.Session.user;
      session: import('$lib/server/auth').auth.$Infer.Session.session;
    }
  }
}
export {};
```

`auth.$Infer.Session` gives the full `{ user, session }` type. Same `Session` type is available client-side via `authClient.$Infer.Session`.

### Client: `src/lib/auth-client.ts` (documented pattern — deliberately NOT used in this repo)

```ts
import { createAuthClient } from 'better-auth/svelte';          // <- /svelte, not /react
export const authClient = createAuthClient({
  baseURL: '',                                                   // same-origin
  // fetchOptions: { onError, onSuccess }
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
```

In Svelte 5, `useSession()` returns a nanostore-backed reactive value. Subscribe in a component with `$session.data` (the `$` prefix is the Svelte store auto-subscribe syntax; nanostore has the same contract). For a fully typed result: `type Session = typeof authClient.$Infer.Session;`.

### SSR hydration

On SvelteKit, call `authClient.hydrateSession(serverSession)` once on the client to seed `useSession()` with the SSR-fetched session. Pass it from a `+layout.server.ts` `load` and forward through props:

```svelte
<!-- +layout.svelte -->
<script>
  import { authClient } from '$lib/auth-client';
  let { data, children } = $props();
  $effect(() => authClient.hydrateSession(data.session));
  const session = authClient.useSession();
</script>
{@render children()}
```

`+layout.server.ts`:
```ts
import { auth } from '$lib/server/auth';
export const load: import('./$types').LayoutServerLoad = async ({ request }) => {
  return { session: await auth.api.getSession({ headers: request.headers }) };
};
```

## Server API surface (the `auth.api.*` namespace)

Every endpoint exposed on `/api/auth/*` is callable on the server. Three calling styles:

```ts
// 1) as a function
const data = await auth.api.signInEmail({ body: { email, password } });

// 2) headers
const data = await auth.api.getSession({ headers: request.headers });

// 3) return Response
const res = await auth.api.signInEmail({ body: {...}, asResponse: true });
// 4) return Headers
const { headers, response } = await auth.api.signInEmail({ body: {...}, returnHeaders: true });
const cookies = headers.getSetCookie();
```

`APIError` is thrown on failure (better-auth/api). Check via `isAPIError(err)`. There is no global `auth.api` rate limiting (server-side calls bypass it).

Key endpoints (all in `auth.api.*`):

- `signUpEmail({ body: { email, password, name, image?, callbackURL? } })`
- `signInEmail({ body: { email, password, rememberMe?, callbackURL? } })` — sets `session_token` cookie.
- `signOut({ headers })` — clears cookie, deletes session.
- `getSession({ headers })` — returns `{ user, session } | null`.
- `useSession` is the client analogue.
- `listSessions`, `revokeSession(token)`, `revokeOtherSessions()`, `revokeSessions()`.
- `updateSession({ body })` — only for `additionalFields` on session; core fields are immutable.
- `changePassword({ body, headers })` — needs current password.
- `setPassword({ body, headers })` — server-only; for OAuth users.
- `verifyPassword({ body, headers })` — server-only; for sensitive operations.
- `changeEmail({ body, headers })` — requires `user.changeEmail.enabled` + email sender.
- `requestPasswordReset({ body })`, `resetPassword({ body })` — need email sender for the link.
- `verifyEmail({ query })` — token-based verify.
- `listUserAccounts({ headers })` — accounts for current user.
- `linkSocialAccount({ body, headers })`, `unlinkAccount({ body, headers })`.

Hooks (`ctx`, all in `auth.api.signInEmail` etc.):

- `before` / `after` are global (`hooks.before` / `hooks.after`) or per-endpoint via plugin `hooks` array. `ctx.path` to branch.
- `ctx.context.newSession` is the freshly created session (only in after hooks).
- `ctx.context.returned` is the response payload.
- `ctx.context.session` is the request's session (in hooks that have it).
- `ctx.context.password.hash/.verify` helpers.
- `ctx.context.adapter` and `ctx.context.internalAdapter` for raw/curated DB access.
- `ctx.context.isTrustedOrigin(url, { allowRelativePaths })`.
- `ctx.context.runInBackground(promise)` (requires `advanced.backgroundTasks.handler`); `runInBackgroundOrAwait` if you want fallback.
- `ctx.setCookie` / `ctx.getCookie` / `ctx.setSignedCookie` / `ctx.getSignedCookie`.
- `ctx.json(obj)` and `ctx.redirect(location)` for short-circuit responses.

## Session model

- Cookie `session_token` is opaque + secret-signed; `session_data` is the optional cache cookie when `session.cookieCache.enabled`.
- DB row has `id, token, userId, expiresAt, createdAt, updatedAt, ipAddress, userAgent`.
- Default: 7-day expiry, refreshed (sliding) after 1 day. `disableSessionRefresh: true` to freeze.
- `freshAge` (default 1d) — `createdAt` must be within this for sensitive operations (delete account, change password, 2FA disable). `0` disables.
- `deferSessionRefresh: true` — GET `/get-session` becomes read-only and returns `needsRefresh: true`; client auto-POSTs to refresh. Useful for read-replica DBs.
- `cookieCache` strategies: `compact` (base64url + HMAC, default), `jwt` (HS256; can use JWT plugin JWKS with `sessionCookieCache: true`), `jwe` (encrypted, biggest).
- `stateless` mode (no database) uses `cookieCache` + `account.storeAccountCookie: true` + `account.storeStateStrategy: 'cookie'`. Sessions are signed cookies; OAuth state is in the cookie; account data in encrypted `account_data` cookie.
- `customSession` plugin (server + client) to augment the session response with extra fields.

## Cookies

- All Better Auth cookies are `httpOnly` + `secure` in production.
- Prefix: `${advanced.cookiePrefix}.<name>` (default `better-auth`).
- Custom cookies per-name (`advanced.cookies.session_token.name`, etc.).
- `crossSubDomainCookies: { enabled, domain }` for shared cookies across subdomains.
- For Safari ITP issues when API is on a different domain, **proxy** API through the frontend's domain — Better Auth has no workaround for cross-origin third-party cookies in Safari.
- Versioned secret rotation: `secrets: [{ version, value }, ...]` (or env `BETTER_AUTH_SECRETS=2:new,1:old`) — supports new + decrypt-only old.

## OAuth providers

- `socialProviders: { github: { clientId, clientSecret, ... }, google: ..., apple: ..., microsoft: ... }` — 30+ first-class.
- `signIn.social({ provider, callbackURL?, errorCallbackURL?, newUserCallbackURL?, disableRedirect?, scopes?, idToken?, additionalData? })`.
- `accountLinking.enabled: true` by default. Same-email OAuth auto-links. `disableImplicitLinking: true` rejects with `account_not_linked` instead.
- `accountLinking.trustedProviders: ['google', ...]` — auto-link even when provider email not verified.
- `accountLinking.updateUserInfoOnLink: true` — copy name/image from provider (never email/emailVerified).
- `accountLinking.allowDifferentEmails: true` — link accounts with different emails.
- Token lifecycle: `getAccessToken({ accountId | useAccountCookie: true })`, `refreshToken({ accountId | useAccountCookie: true })`, `accountInfo({ query: { accountId | useAccountCookie: true } })`. `accountId` is Better Auth's local record id (from `listAccounts`), not the provider's subject.
- `mapProfileToUser(profile)` — provider→user mapping. Returned values are still treated as provider input; server-owned fields (`role`, etc.) need `input: false`.
- `validateUserInfo` — central policy gate (create-user, link-account, sign-in for OAuth/SSO).
- `additionalData` is **client-supplied** in OAuth state; use `addOAuthServerContext` (server hook) for trusted values.
- Placeholder emails (Apple, Discord, etc. without a real email): use `mapProfileToUser` to set a `.invalid` placeholder. Plugins that email (password reset, magic link, org invites) cannot deliver there — use your own domain if you need delivery.
- ~~`account.identityStrategy`~~ — **does not exist in 1.7.5.** See the correction note in the
  schema section above. The account identity namespace is `providerId` + `accountId`, unique
  together, full stop.
- `account.storeAccountCookie: true` (default in stateless setups) — provider account data in encrypted `account_data` cookie. Forward `Set-Cookie` from `getAccessToken`/`refreshToken` server responses.
- `account.storeStateStrategy`:
  - `database` (default if a db or secondary storage is configured) — write state in verification table, set signed state cookie.
  - `cookie` (default if neither) — encrypted state cookie, fully stateless.
- `account.encryptOAuthTokens: true` — encrypt `accessToken`/`refreshToken` at rest.

## Plugins (relevant set for a job-tracker)

- **`twoFactor()` (server) + `twoFactorClient()` (client)** — TOTP (authenticator app) or email OTP. Setup, sign-in challenge, backup codes, trusted device. When credential sign-in is challenged, `ctx.context.newSession` is reset to `null` — guard your after-sign-in hooks against that.
- **`admin()` + `adminClient()`** — role-based admin (default roles `admin`/`user`). Custom roles via `createAccessControl({...})` and `ac.newRole({...})`. Endpoints: `createUser`, `listUsers`, `getUser`, `setRole`, `setUserPassword`, `adminUpdateUser`, `banUser`, `unbanUser`, `listUserSessions`, `revokeUserSession`, `revokeUserSessions`, `impersonateUser`, `stopImpersonating`, `removeUser`, `hasPermission`. Pass `ac` and `roles` to both server and client plugin to keep types tight.
- **`organization()` + `organizationClient()`** — orgs, members, invitations, teams. `setActiveOrganization`, `setActiveTeam`, `createOrganization` (with `userId` server-only to create on behalf of another user). Hooks: `organizationHooks` for `beforeCreateOrganization`, `afterCreateOrganization`, `beforeAddMember`, `afterAddMember`, `beforeRemoveMember`, `afterRemoveMember`, `beforeUpdateMemberRole`, `afterUpdateMemberRole`, `beforeCreateInvitation`, `afterCreateInvitation`, etc. (legacy `organizationCreation` hooks are deprecated).
- **`magicLink()` + `magicLinkClient()`** — email magic link. Requires `sendMagicLink`.
- **`emailOTP()` + `emailOTPClient()`** — email 6-digit OTP. Requires `sendVerificationOTP`.
- **`passkey()` + `passkeyClient()`** — WebAuthn.
- **`username()`** — adds username to email/password flow.
- **`phoneNumber()`** — phone + OTP sign-in.
- **`bearer()`** — JWT bearer token auth for API clients.
- **`multiSession()`** — concurrent sessions per user.
- **`oauthProvider()`** — turn your Better Auth server itself into an OAuth 2.1 provider (so other apps can sign in via your app).
- **`apiKey()` + `apiKeyClient()`** — server-issued API keys with optional per-key permissions.
- **`organization` invites + teams**: extra tables; pass `teams: { enabled: true, maximumTeams, maximumMembersPerTeam, allowRemovingAllTeams }`.
- **`sso()` / `oidc()` / `oauth-proxy()`** — enterprise OIDC/SAML SSO, OAuth proxy for cross-domain.
- **`mcp()`** — your Better Auth instance acts as an OAuth provider for MCP clients.
- **`stripe()` / `polar()` / `autumn()`** — payments.
- **`sentinel()` / `dashboard()` / `audit-logs()`** — Better Auth Infrastructure (commercial, optional).
- **`inferAdditionalFields<T>()`** (client-only) — feed your server's `additionalFields` into the client for proper typing. Two flavors: infer from `typeof auth` (monorepo) or pass the fields explicitly.
- **`customSession(serverFn, options)` (server) + `customSessionClient<typeof auth>()` (client)** — augment session response with extra data, optionally re-infer types. Session caching skips custom fields (re-evaluated every fetch).
- **`sveltekitCookies(getRequestEvent)`** — required for cookie-setting server actions in SvelteKit. Install as last plugin.

## CLI (`auth@latest`)

- `bunx auth@latest generate` — scaffold Drizzle schema (Drizzle/Prisma/Kysely). `--adapter drizzle --dialect sqlite|pg|mysql`.
- `bunx auth@latest migrate plan` → `migrate apply` — inspect + apply with built-in Kysely adapter. JSON output via `--json`.
- `bunx auth@latest create-admin --email ... --password ... --name ... --role ...` — needs the admin plugin. `--force` if users exist.
- `bunx auth@latest init` — scaffold a `auth.ts` (Next.js only at the moment; for SvelteKit, hand-roll the file).
- `bunx auth@latest upgrade` — bumps `better-auth` + every `@better-auth/*` in the synchronised release train to the CLI's version. Doesn't touch independent packages like `@better-auth/utils`.
- `bunx auth@latest secret` — generate a 32-byte base64 secret.
- `bunx auth@latest info` — sanitized diagnostic dump (for support). Supports `--json`.

SvelteKit specifics: the CLI auto-resolves `$lib` aliases, `$env/*`, `$app/*`, and `cloudflare:workers` Vite stubs. It does **not** load `.svelte` files or `import.meta.glob` outside the config — keep those out of the `auth.ts` import graph. Run `svelte-kit sync` first so `.svelte-kit/tsconfig.json` exists.

## Rate limiting

Defaults, read straight out of the installed `better-auth/dist/context/create-context.mjs`:

```js
enabled: options.rateLimit?.enabled ?? isProduction,
window:  options.rateLimit?.window || 10,     // seconds
max:     options.rateLimit?.max || 100,
storage: options.rateLimit?.storage || (options.secondaryStorage ? 'secondary-storage' : 'memory')
```

So: **100 requests per 10-second window**, on in production and off in dev. Not "100 / 60s" — the window is 10 s.

Built-in special rules (`dist/api/rate-limiter/index.mjs → getDefaultSpecialRules()`) override those numbers per path **before** any custom rule runs:

| Path prefix | Window | Max |
|---|---|---|
| `/sign-in`, `/sign-up`, `/change-password`, `/change-email` | 10 s | 3 |
| `/request-password-reset`, `/send-verification-email`, `/forget-password`, `/email-otp/send-verification-otp`, `/email-otp/request-password-reset` | 60 s | 3 |
| `/two-factor/*` (from the 2FA plugin) | 10 s | 3 |

This repo overrides the global rule to `window: 60, max: 100, storage: 'database'` (see `src/lib/server/auth.ts`); the per-path rules above still win.
- IP detection: `x-forwarded-for` by default — **don't** trust leftmost in that chain. Point `advanced.ipAddress.ipAddressHeaders: ['cf-connecting-ip']` (or a single trusted header) or list `trustedProxies` IPs and Better Auth walks the chain right-to-left.
- IPv6: auto-normalizes; per-`/64` subnet by default (override via `advanced.ipAddress.ipv6Subnet`).
- Storage: `memory` (default), `database` (needs the `rateLimit` table), `secondary-storage`, or `customStorage.consume(key, rule) -> { allowed, retryAfter }` (atomic — Better Auth no longer accepts separate `get`/`set` for rate limits because it's a known race).

## Email sending pattern on Cloudflare

Better Auth hands you a callback. Don't `await` it (timing). With Workers, hand off via `ctx.waitUntil`:

```ts
import { getRequestEvent } from '$app/server';

emailAndPassword: {
  sendResetPassword: async ({ user, url, token }, _request) => {
    const event = getRequestEvent();
    event?.ctx?.waitUntil(sendViaResend({ to: user.email, url }));
  }
}
```

`advanced.backgroundTasks.handler` lets you register a single global waitUntil for any `runInBackground(...)` calls.

## Cloudflare Workers / D1 gotchas (gathered)

- **Compatibility flag**: use `"compatibility_flags": ["nodejs_compat"]`. Better Auth's own Cloudflare guidance ([Installation → Mount Handler](https://better-auth.com/docs/installation#mount-handler)) names `nodejs_compat`; `nodejs_als` is listed only as the narrower fallback when AsyncLocalStorage is the *only* thing needed. It is not enough here — see `docs/research/cloudflare.md` for what else the dependency graph reaches for. This project ships `nodejs_compat`.
- **No `process.env` at runtime**: read secrets from `event.platform.env` or `cloudflare:workers`'s `env` binding. Wire `auth.ts` to read `cloudflare:workers.env.BETTER_AUTH_SECRET` at request time (not module init), or use a thin wrapper that calls `auth.handler(request)` and forwards `env` via `getRequestEvent`.
- **CLI in CI**: D1 needs programmatic migration (`getMigrations`) since the CLI can't reach the binding. Or use `wrangler d1 migrations apply <DB> --remote` — this repo's `wrangler.jsonc` sets `migrations_dir: "db/migrations"` and `migrations_pattern: "db/migrations/*.sql"` for drizzle-kit 0.31's flat output.
- **`asResponse: true` for redirects**: with `asResponse: true`, the function returns a `Response`. SvelteKit needs to forward the `Set-Cookie` header — your server load can return `redirect(res.headers.get('location')!, { setHeaders: { 'set-cookie': ... } })`, or use `sveltekitCookies` plugin which handles this for you.
- **Trusted origins**: `baseURL` is always trusted, so the usual setup needs nothing else. Add the Workers `*.workers.dev` URL and any custom domain only if they differ from `baseURL`. Extra origins come from `DEV_ORIGINS` in this repo — it must stay **empty in production**, since anything listed there is accepted as a valid auth origin.
- **Base URL — prefer the dynamic object over leaving it undefined** (verified in Better Auth 1.7.5, `better-auth/dist/context/create-context.mjs:65` and `dist/utils/url.mjs`):

  Leaving `baseURL` undefined logs `WARN [Better Auth]: [better-auth] Base URL is not set…` on every request. The [options reference](https://better-auth.com/docs/reference/options#baseurl) warns: *"Relying on request inference is not recommended. For security and stability, always set `baseURL` explicitly in your config or via the `BETTER_AUTH_URL` environment variable."* The reason is that with no `baseURL`, whatever `Host` arrives is both the origin and a trusted origin — no allowlist.

  The object form keeps per-request resolution and adds validation:

  ```ts
  baseURL: { allowedHosts: ['myapp.com', '*.workers.dev', 'localhost:*'], protocol: 'auto' }
  ```

  Verified behaviours from the installed source:

  - `allowedHosts` may be exact (`myapp.com`), wildcard (`*.vercel.app`, `preview-*.myapp.com`), or port-wildcard (`localhost:*`). Matching is `matchesHostPattern` in `dist/utils/url.mjs`. Non-empty is enforced — an empty array throws at construction.
  - Host is read from the `host` header (which **includes the port**), falling back to the request URL. `x-forwarded-host` is ignored unless `advanced.trustedProxyHeaders: true`.
  - `protocol: 'auto'` picks `http` for loopback hosts and `https` otherwise.
  - **No `fallback` means an unlisted host throws**, not falls back: `Host "…" is not in the allowed hosts list. Allowed hosts: …`. With `fallback` set, unknown hosts silently resolve to it — the docs warn this "can hide deployment or proxy misconfiguration that would otherwise fail loudly."
  - Every `allowedHosts` entry is **also added to `trustedOrigins`**, as `https://<host>` plus `http://<host>` for loopback hosts (`dist/context/helpers.mjs → getTrustedOrigins`). So a host you allow is a host you trust; do not pad the list.
  - When `isDynamicBaseURLConfig(options.baseURL)` is true, the warning is skipped entirely — the check is `if (!baseURL && !isDynamicConfig)`.

  **Gotcha:** a direct `auth.api.*` call has no request, so host resolution fails with `Dynamic baseURL could not be resolved for this direct auth.api call`. Always pass `headers` (carrying a `Host`) to direct `auth.api` calls. The HTTP `/api/auth/*` routes are unaffected because they carry a real `Request`.
- **Better Auth's `info` command** is the fastest way to file good bug reports — outputs everything in a redacted form.

## Concrete recipe for the job-tracker

```ts
// src/lib/server/auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { env } from 'cloudflare:workers';
import { db } from './db';
import * as schema from './db/schema';

export const auth = betterAuth({
  appName: 'Job Tracker',
  // resolve at request time; module init runs at build with stub env
  secret: (() => {
    const e = env as { BETTER_AUTH_SECRET?: string };
    return e.BETTER_AUTH_SECRET ?? 'dev-secret-change-me-32-chars';
  })(),
  baseURL: (() => (env as { BETTER_AUTH_URL?: string }).BETTER_AUTH_URL)(),
  trustedOrigins: [],  // baseURL always trusted; extras via DEV_ORIGINS env (never hardcode localhost — BA docs warning)
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  emailAndPassword: { enabled: true, autoSignIn: false, requireEmailVerification: false },
  session: { cookieCache: { enabled: true, maxAge: 300, strategy: 'compact' } },
  advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
	rateLimit: { enabled: true, storage: 'database', modelName: 'rateLimit' },
	plugins: [sveltekitCookies(getRequestEvent)],
});
```

> Note: `secret` and `baseURL` resolvers are invoked at `betterAuth({})` call time (build), not per request. For a Workers deploy where the env is dynamic per isolate, you typically:
> - Set `BETTER_AUTH_SECRET` as a Wrangler **secret** (`wrangler secret put`, or the dashboard's Variables & Secrets). It must never be a plain var, and never committed.
> - Leave `BETTER_AUTH_URL` **unset** unless you want to pin auth to one origin — Better Auth infers it from `request.url` when it is missing.
> - OR, expose per-request via a wrapper `fetch` handler that calls `auth.handler(request)` and injects secret into request headers before forwarding.


The cleanest pattern for the SvelteKit on Cloudflare combo: define a request-level secret resolver, or, if your secret lives in a binding, read it through `getRequestEvent()` at the auth call site (e.g. a thin `handle` that resolves `event.platform.env.BETTER_AUTH_SECRET` before delegating). For the initial scaffold: `wrangler secret put BETTER_AUTH_SECRET` (or set it in the dashboard for Workers Builds) and leave `BETTER_AUTH_URL` out of `wrangler.jsonc` entirely.

> **UPDATE 2026-09-12 (verified against installed sign-up.mjs):** this repo
> ships `autoSignIn: false`. Verified behaviors of that setting:
> 1. `signUpEmail` returns `{ token: null, user }` and sets NO cookies —
>   sign-ups never hold a session (the approval queue relies on this).
> 2. With `autoSignIn === false`, sign-up for an EXISTING email returns a
>   generic synthetic "created" response (anti-enumeration) instead of
>   USER_ALREADY_EXISTS — so routes that want a friendly "already has an
>   account" error must pre-check the email themselves (see
>   src/routes/+page.server.ts).
> 3. Sign-in DOES hand a disabled user a session — Better Auth has no
>   concept of a `disabled` flag, it only knows the `banned` field the
>   `admin()` plugin adds. So *something* has to revoke it. This repo does
>   that AFTER the password verifies, not before:
>     1. `signInEmail` runs (a disabled user now holds a session).
>     2. If `user.disabled`, `signOut` immediately and fail with 403.
>     3. `hooks.server.ts` revokes any disabled user's session on every
>        request regardless, as a second backstop.
>   Checking `disabled` BEFORE `signInEmail` also works, and was the
>   original implementation here — but it turns the sign-in form into an
>   account-existence oracle ("waiting for approval" vs "incorrect"
>   answers whether an email has an account, with no password required).
>   Post-password is the correct order. Do not move it back.

## Schema source-of-truth recommendation

- Add `@better-auth/cli` as a devDependency.
- `bunx auth@latest generate --adapter drizzle --dialect sqlite` writes a `auth-schema.ts` (or updates your schema) with the four core tables.
- Then `bunx drizzle-kit generate` produces the SQL migration. Apply with `wrangler d1 migrations apply <DB> --remote` (configure `migrations_pattern`).
- For day-to-day app tables (jobs, applications, contacts), keep them in your own `schema.ts` alongside the generated auth tables, and add the auth tables to the schema export passed to `drizzleAdapter`.
