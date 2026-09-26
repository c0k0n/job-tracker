# Svelte 5 + SvelteKit 2.70 — research notes

> Sources: Svelte MCP (`mcp__svelte_list_sections`, `mcp__svelte_get_documentation`), 2026-09-04.
> Covers everything we need to build, ship, and reason about SvelteKit on Cloudflare Workers + D1/Better Auth/Drizzle.

## Project-relevant defaults (this repo)

- Svelte **5.57+** in **runes-only** mode (`vite.config.ts` forces `runes: true` outside `node_modules`).
- SvelteKit **2.70+** with adapter-cloudflare.
- TS strict; `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters` are on.
- `tsconfig.json` extends `.svelte-kit/tsconfig.json`; `types: ["./worker-configuration.d.ts", "bun"]`.

## File layout recap

```
src/
  app.d.ts        — `App.Platform = { env, ctx, caches, cf? }`
  app.html        — wraps %sveltekit.head% + %sveltekit.body% with `data-sveltekit-preload-data="hover"`
  lib/            — alias $lib; $lib/server is server-only (build blocks client imports)
  routes/
    +layout.svelte  — { children } snippet via $props() + @render
    +layout.ts/.server.ts — universal / server load
    +page.svelte  — `let { data, form } = $props()` (PageProps since 2.16)
    +page.ts/.server.ts
    +error.svelte
    +server.ts  — `export function GET/POST/...({ request, platform })`
    (group)/      — layouts without URL segments
    [param]/      — dynamic
    [[opt]]/      — optional
    [...rest]/    — rest
src/hooks.server.ts | hooks.client.ts | hooks.ts
```

## Routing rules (from MCP `kit/routing`)

- Files can run on server; everything except `+server` runs on client too.
- `+layout` / `+error` cascade into subtrees.
- `+page.server.js` + `+server.js` in same dir is allowed; `+page` wins for HTML `Accept`, `+server` wins otherwise; GET responses include `Vary: Accept`.
- `+error.svelte` is **not** used for errors in `handle` or `+server`; they go to `error.html` or JSON.
- Layout state is preserved across nav (component-and-page-state-is-preserved) when possible — only the page component re-renders.

## Data flow (from `kit/load`)

`+page.js` → universal load (`fetch`-able, secret-free, must serialize).
`+page.server.js` → server load (secrets/DB OK; result serialized via `devalue` for client).

`PageProps` type from `./$types`:

```ts
let { data, form, params } = $props();
```

`params` typing arrives in 2.24. `data` is `PageData`; `form` is `ActionData` only if the page defines actions.

`load` API surface (server + universal):

```ts
{
  params, route, url, fetch, data, setHeaders, depends, parent, untrack
}
// server-only extras: request, platform, locals, cookies
```

- `fetch` in load is the same as `event.fetch` (cookie forwarding + internal endpoint short-circuit).
- `parent()` awaits parent load outputs.
- `depends('app:thing')` lets `invalidate('app:thing')` re-run.
- Use `untrack(...)` to read state without subscribing.

## Form actions (from `kit/form-actions`)

Two coexisting models:

### 1. Classic `+page.server.ts` `actions`

```ts
export const actions = {
  create: async ({ request, locals, platform, cookies }) => {
    const data = await request.formData();
    // ...validate
    if (bad) return fail(400, { fieldErrors });
    redirect(303, '/dashboard');
  }
};
```

Use with `<form method="POST" action="?/create">`. Server returns `ActionResult`. Default action is `?/default`.

Progressive enhancement: `use:enhance` from `$app/forms`:

```ts
import { enhance } from '$app/forms';
<form method="POST" action="?/create" use:enhance>
```

- Inside callback: `form.element.reset()`, `form.submit()` (direct submission skipping the callback), `form.update({ reset, invalidateAll })`.
- Default behaviour on success: invalidates all data + resets form + redirects on redirect result. Use `update({ reset: false, invalidateAll: false })` to opt out.

### 2. Remote functions (≥2.27, experimental `remoteFunctions`)

`$app/server` exports `query`, `prerender`, `command`, `form`, `getRequestEvent`, `read`, `requested`. Schema-validated via any Standard Schema (Zod/Valibot/ArkType):

```ts
// app.remote.ts
import * as v from 'valibot';
import { query, command } from '$app/server';

export const getJob = query(v.string(), async (id) => {
  return db.query.jobs.findFirst({ where: (j, { eq }) => eq(j.id, id) });
});

export const createJob = command(
  v.object({ title: v.string(), company: v.string() }),
  async (data) => { /* ... */ }
);
```

Client usage (works without `use:enhance`):

```svelte
<script>
  import { getJob, createJob } from './app.remote';
  let job = $derived(await getJob(params.id));
</script>

{@render getJob.fallback?.()}

<form {...createJob.enhance} onsubmit={...}>
  <input {...createJob.fields.title.as('text')} />
</form>
```

- `query.batch(...)` (≥2.35) groups calls into one network roundtrip; `query.live(...)` is a streaming endpoint via `function*` + `yield`.
- `prerender(fn, { inputs })` runs at build time, inlines in client, optional `dynamic: true` to also serve server-side.
- `command()` and `form()` are POST mutations; `form()` is a `command()` variant tailored to `<form>` (it gives you an `InvalidField` helper to set per-field issues).
- `requested(queryFn, limit)` inside a `command`/`form` to refresh `query` instances the client asked to refresh (one roundtrip). Limit required (DoS).
- Validation failures throw a 400 with no leaked details unless `handleValidationError` is overridden.
- `getRequestEvent()` works inside remote handlers to read cookies/headers (sync only without AsyncLocalStorage).

**For a job-tracker, remote functions are the modern path**: typed end-to-end, batched lists, optimistic-friendly via `.withOverride(...)` in `submit().updates(...)`.

## `$app/state` (from `kit/$app-state`)

Available since 2.12. Three read-only reactives:

- `page` — url, params, route.id, data, error, form, state. Replaces the legacy `$app/stores` `$page` store.
- `navigating` — null when idle; carries `from/to/type/delta?`.
- `updated` — polling version-check state.

```svelte
<script>
  import { page, navigating, updated } from '$app/state';
</script>
<p>{page.url.pathname}</p>
{#if navigating.to}<p>Navigating to {navigating.to.url.pathname}</p>{/if}
{#if updated.current}<button onclick={() => updated.check()}>Update</button>{/if}
```

## `$app/navigation` (from `kit/$app-navigation`)

```ts
goto(url, { replaceState, noScroll, keepFocus, invalidateAll, invalidate, state })
beforeNavigate(({ cancel, type, to, willUnload }) => {...})
afterNavigate(callback)
onNavigate(callback)  // can return Promise → view-transition friendly
preloadCode(pathname)  // code only
preloadData(href)      // code + load
invalidate(resource)   // string | URL | (url)=>bool
invalidateAll()
refreshAll({ includeLoadFunctions: boolean })  // refreshes remote + load
pushState(url, state)
replaceState(url, state)
disableScrollHandling()
```

`beforeNavigate` `cancel()` aborts; for `type: 'leave'` (tab close) it triggers the native unload prompt.

## `$app/forms` (from `kit/$app-forms`)

```ts
enhance(formEl, submitFn?)  // submitFn({ formData, action, cancel, controller })
applyAction(result)          // apply a result manually
deserialize(text)            // parse a server response
```

Default success behaviour is the same as documented in form-actions. `enhance` returns `{ destroy }`.

## `$app/server` (from `kit/$app-server`)

`read(asset)` — read an imported asset's bytes via `Response` (since 2.4). In production files don't exist on disk; it fetch-redirects to the deployed asset.

## `$app/environment` (from `kit/$app-environment`)

```ts
import { browser, dev, building, version } from '$app/environment';
```

`building` is `true` during the `vite build` and prerender phases. Use to gate build-time-only work.

## `$env/*` (from `kit/$env-static-private`, `kit/$env-dynamic-private`)

| | Build time | Runtime |
|---|---|---|
| Public | `$env/static/public` | `$env/dynamic/public` |
| Private | `$env/static/private` | `$env/dynamic/private` |

- `publicPrefix` defaults to `PUBLIC_`. Variables without it are private.
- Static = inlined at build (DCE friendly); dynamic = read at runtime.
- Throws on client import of any private module. Use for secrets.

## Explicit env vars (new, SvelteKit 2.63+)

Opt in via `kit.experimental.explicitEnvironmentVariables: true` in `svelte.config.js`, then add `src/env.ts`:

```ts
import { defineEnvVars } from '@sveltejs/kit/env';
export const variables = defineEnvVars({
  GITHUB_TOKEN: {},
  PUBLIC_BASE_URL: { public: true }
});
```

Will become the default in SvelteKit 3.

## Hooks (`kit/hooks`)

`src/hooks.server.ts` exports (any subset):

```ts
export const handle: Handle = async ({ event, resolve }) => {
  // mutate event, return resolve(event, { transformPageChunk, filterSerializedResponseHeaders, preload })
};
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => { ... };
export const handleValidationError: HandleValidationError = ({ event, issues }) => App.Error;
export const handleError: HandleServerError = ({ error, event, status, message }) => App.Error;
export const init: ServerInit = async () => { /* once at startup, e.g. db pool */ };
export const reroute: Reroute = ({ url }) => string | undefined;
```

Compose multiple handles with `import { sequence } from '@sveltejs/kit/hooks'`. Hooks `handle` is a `sequence(...)` of all exported handles.

## Server-only modules (`kit/server-only-modules`)

Two ways to mark a module server-only:

- `.server.ts`/`.server.js` suffix.
- Inside `$lib/server/`.

Importing from client code → build error with a clear "could leak" message. Disabled in vitest (`process.env.TEST === 'true'`).

## Errors (`kit/errors`)

`error(status, message | { message, code?, ... })` from `@sveltejs/kit` in `load`/actions throws → `+error.svelte` nearest in tree renders with `page.error`.

`handleError` returns an `App.Error` (which always has `message: string`). Type-extend `App.Error` in `app.d.ts` for typed extras.

## Configuration (`kit/configuration`)

Notable `kit` options:

- `alias`: object of import aliases.
- `csp`: `{ mode: 'hash'|'nonce'|'auto', directives, reportOnly }`.
- `csrf.checkOrigin` (default true). Replace with `trustedOrigins: [...]` if needed.
- `embedded` / `paths.relative` / `paths.base` / `paths.assets`.
- `prerender.entries` / `handleHttpMethod` / `handleError`.
- `serviceWorker` (registered at `/service-worker.js` if set).
- `version`: shows "update available" UI when client `version` mismatches server.

`adapter` is passed through the sveltekit() vite plugin (or `svelte.config.js`). `runes` compiler option is also accepted.

## Forms UI in Svelte 5

`enhance` works the same. For non-form mutations use `command` with an `onclick` handler — gives you full SPA + type safety.

## `$app/paths`

Exactly three current exports plus three deprecated ones — verified against `node_modules/@sveltejs/kit/src/runtime/app/paths/public.d.ts` in the installed 2.70.3:

| Export | Status | Use |
|---|---|---|
| `resolve(path, params?)` | **current** | Build an app-relative URL respecting `config.kit.paths.base`. Aliased to `resolvePath` at every import site in this repo, because AGENTS.md requires `goto()`/hrefs to be base-aware. |
| `asset(path)` | **current** | Prefix an asset with `config.kit.paths.assets`. |
| `match(pathname, routes?)` | **current** | Resolve a URL to a route id + params. |
| `base` | deprecated | Use `resolve()` instead. |
| `assets` | deprecated | Use `asset()` instead. |
| `resolveRoute()` | deprecated | Use `resolve()` instead. |

There is **no `resolvePath` export** — `import { resolve as resolvePath } from '$app/paths'` is a local alias, not a named export.

## `kit/types` — generated `./$types`

Per-route types generated by `svelte-kit sync`:

```ts
// src/routes/blog/[slug]/$types.d.ts
export type PageParams = { slug: string };
export type PageLoad = Kit.Load<PageParams>;
export type PageServerLoad = Kit.ServerLoad<PageParams>;
export type PageProps = { data: PageData; form: ActionData; params: PageParams };
export type LayoutProps = { data: LayoutData; children: Snippet };
export type RequestHandler = Kit.RequestHandler<RouteParams>;
export type EntryGenerator = () => Array<Record<string, string>>;
export type ActionData = ...; export type PageData = ...;
```

Annotate with `/** @type {import('./$types').PageServerLoad} */` or in TS `let { data }: import('./$types').PageProps = $props();`. Svelte's IDE plugin auto-fills these so you usually don't write the annotation.

## adapter-cloudflare (from `kit/adapter-cloudflare`)

### Setup

```ts
// svelte.config.js OR vite.config.ts
adapter({
  config: undefined,                 // path to wrangler.jsonc
  platformProxy: { configPath, environment, persist },
  fallback: 'plaintext',             // 'plaintext' | 'spa'
  routes: { include: ['/*'], exclude: ['<all>'] }  // Pages only
})
```

### Minimal `wrangler.jsonc`

```jsonc
{
  "name": "job-tracker",
  "main": ".svelte-kit/cloudflare/_worker.js",
  "compatibility_date": "2026-08-28",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "binding": "ASSETS", "directory": ".svelte-kit/cloudflare" },
  "observability": { "enabled": true }
}
```

> **`nodejs_compat`, not `nodejs_als`.** `nodejs_als` polyfills `AsyncLocalStorage` and nothing else — it does not unlock the `node:*` built-ins. Better Auth's own Cloudflare guidance ([Installation → Mount Handler](https://better-auth.com/docs/installation#mount-handler)) says `nodejs_compat`, listing `nodejs_als` only as the narrower fallback. This project needs the full flag because `better-auth` reaches for `node:async_hooks` and `@better-auth/utils/password` reaches for `node:crypto` scrypt under the `node` export condition.

### `App.Platform` access

```ts
declare global {
  namespace App {
    interface Platform {
      env: { DB: D1Database; BETTER_AUTH_SECRET: string /*...*/ };
      ctx: ExecutionContext;
      caches: CacheStorage;
      cf?: IncomingRequestCfProperties;
    }
  }
}
```

`worker-configuration.d.ts` (regenerated by `wrangler types`) declares the actual `Env`. Re-run via `bun run types` or `bun run check`.

### Local dev: `platformProxy`

`adapter-cloudflare` uses `getPlatformProxy` under the hood. It honors `wrangler.jsonc` bindings; `env.DB` is a real D1 binding in dev. `--persist` flag controls local persistence.

### `+server.js` body limits / `request.formData()`

D1 binding API: `env.DB.prepare(sql).bind(...).first() | .all() | .run()`. New batched variant: `env.DB.batch([stmt1, stmt2, ...])`.

### SPA fallback vs Pages

For SvelteKit on Workers Static Assets, leave `fallback: 'plaintext'`. For a pure SPA shell that intercepts unknown routes, set `fallback: 'spa'`.

## Svelte 5 runes (from `svelte/what-are-runes` etc.)

### `$state` (deep, proxied)

```svelte
let count = $state(0);
let user = $state({ name: 'Ada' });
user.name = 'new'; // reactive
```

- Deep on plain objects/arrays via `Proxy`. Class instances are NOT proxied → use `$state` on class fields instead.
- `$state.raw(value)` — read-only-proxy; only reassignable. Cheap for large read-only data.
- `$state.snapshot(value)` — returns plain clone, strips proxy (pass to `structuredClone`/external APIs).
- `$state.eager(expr)` — for `await` expressions: update UI synchronously, useful for nav-bar highlight on link click.
- Destructuring breaks reactivity. Use getter pattern or `$derived`.
- Cross-module: you can't `export let x = $state(0)` (compilers transform only same-file references). Either export an object `const state = $state({ x: 0 })` and mutate `.x`, or wrap with a getter.

### `$derived` / `$derived.by`

```ts
let doubled = $derived(count * 2);
let complex = $derived.by(() => { ... });
```

- Free of side effects.
- Synchronous reads after `await` are tracked too.
- Override allowed (writable) — useful for optimistic UI: `likes += 1; await like(); if (err) likes -= 1;`. Allowed since 5.25.
- Use `untrack(() => ...)` inside to exempt a read from being a dep.

### `$effect`

- Runs in browser, not SSR. After DOM update, batched in microtask.
- Teardown return → re-run cleanup; runs on parent teardown too.
- Async reads inside NOT tracked. If you need reactivity, read the value **before** the `await`.
- Reads an object → tracks the object, not inner properties. Read the property.
- Conditional reads (e.g. `if (cond) x`) only re-run when `cond` or the read value change.
- `$effect.pre` — runs before DOM update (autoscroll, layout).
- `$effect.tracking()` — `true` when inside a tracking context.
- `$effect.pending()` — count of pending promises in current boundary.
- `$effect.root(fn)` — manual scope, returns `destroy()`. Use outside component setup.
- `getAbortSignal()` — auto-abort signal for fetch in effect.

**When not to use**: derived state, event handlers, syncing to external libraries (use `{@attach}`), analytics logging (`$inspect`).

### `$props` (5.0+)

```svelte
<script lang="ts">
  let { name, age = 18, children, ...rest }: { name: string; age?: number; children: Snippet } = $props();
</script>
{@render children?.()}
```

- Rest props spread onto the host element.
- `$props.id()` — SSR-stable unique ID.
- Don't mutate props. For two-way, use `$bindable`.
- `$bindable(default)` — only for the prop; parent must pass non-`undefined` to use `bind:`.

### `$bindable`

```svelte
// Child
let { value = $bindable(0) } = $props();
// Parent
<FancyInput bind:value={msg} />
```

- Mutation works on parent's state. Don't mutate a non-`$bindable` prop.
- Fallback value only applies if parent doesn't `bind:` (and parent must pass non-`undefined` to bind).

### `$inspect` / `$inspect.trace`

Dev-only. `$inspect(a, b)` deep-tracks. `with(cb)` lets you replace the log. `$inspect.trace()` at the top of a function to log which state fired it.

### `$host` (custom elements only)

`<svelte:options customElement="my-elt" />` then `$host().dispatchEvent(...)`.

### Conditional / list templates

```svelte
{#if x}A{:else if y}B{:else}C{/if}
{#each items as item, i (item.id)}  -- key required
{#each { length: 8 }, rank}        -- render N times
{#each items}...{:else}empty{/each}  -- else for empty
{#key value}<Component />{/key}     -- remount on value change
{#await promise}...{:then v}...{:catch e}...{/await}
{#snippet name(arg)}...{/snippet}
{@render name(arg)}  -- optional: {@render children?.()}
```

- `{#each}` key must be a primitive or stable object. Avoid arrays as keys (new ref every render).
- Destructuring in `{#each as { id, ...rest }}` works.
- `class={{ active, 'font-bold': true }}` and `class={[cond && 'a', 'b']}` (clsx semantics, since 5.16) are an **alternative** to the `class:` directive, not a replacement for it. `class:` is still fully supported and not deprecated: `ClassDirective` is a first-class AST node with its own transform path in `svelte/src/compiler/phases/3-transform/client/visitors/RegularElement.js`. An earlier draft of this file called `class:` "legacy" and said `class={...}` "replaces" it — that is wrong, and it contradicts this repo, which uses `class:` throughout (`FilterBar.svelte`, `dashboard/+page.svelte`, `+page.svelte`). Use whichever reads better; do not migrate away from `class:` on the strength of this file.
- `style:--my-var={val}` — set a CSS custom property.

### Attachments / actions

- `{@attach fn}` since 5.29 (preferred over `use:` actions). Reads state reactively; reruns when state read changes.
- Inline attachments, attachment factories (functions returning attachments), conditional via falsy values.
- `fromAction(action)` from `svelte/attachments` adapts old actions.
- Spreading attachments onto elements requires component to spread `$$restProps`/`...rest` so the symbol-keyed attachment prop is forwarded.

### Snippets

```svelte
{#snippet header()}
  <th>name</th>
{/snippet}
{@render header()}

{#snippet row(item, i)}...{/snippet}
{@render row(item, i)}
```

- Can be passed as props; declared inline → implicitly `children`. Named props + `children` simultaneously.
- Optional: `{@render children?.()}` or `{#if children}{@render children()}{/if}`.
- Typed as `Snippet<[ArgsTuple]>` in TS.
- Exported from `<script module>` since 5.5 (no instance state references).
- `createRawSnippet` for programmatic creation.

### Context

Prefer `createContext<T>()` (5.40+):

```ts
const [get, set, has] = createContext<T>();
// in parent: set(value); in child: const value = get();
```

Stores can be reactive (`$state` objects) — pass reactive objects, not reassigned primitives.

### Lifecycle

- `onMount(fn)` — runs after mount in browser only. Returns teardown function (sync only — async returns a Promise).
- `onDestroy(fn)` — runs before unmount; also runs in SSR.
- `tick()` — promise resolved after pending state changes flushed.
- `beforeUpdate` / `afterUpdate` — deprecated in 5 (use `$effect.pre` / `$effect` instead).

### `svelte/reactivity` reactive primitives

`SvelteMap`, `SvelteSet`, `SvelteDate`, `SvelteURL`, `SvelteURLSearchParams`, `MediaQuery`, `createSubscriber`. Import only what you need (tree-shake friendly). Replace native `Map`/`Set`/`Date`/`URL` when you want reactivity.

### `svelte/motion`

`tweened` (configurable easing/duration), `spring` (stiffness/damping; respects `prefersReducedMotion` via `prefersReducedMotion` global). Use inside `$state` or `$derived`.

### `svelte/transition`, `svelte/animate`

`fade`, `fly`, `scale`, `slide`, `blur`, `draw` (SVG). `crossfade` shared transitions. `flip` for keyed each reorder. `in:`/`out:` for one-way; `transition:` for bidirectional; `animate:` for flip. Web Animations API backed → not affected by `transition-duration: 0` for `prefers-reduced-motion`. Use `prefersReducedMotion` global to adapt.

## Hydration & server rendering

- `<svelte:boundary onerror pending failed>` — wrap async UI; `failed` snippet takes `(error, reset)`. `pending` shows for the first render only. Since 5.3.
- `transformError` on `render(...)` (from `svelte/server`) — sanitize server errors before they reach the client `failed` snippet. Coming to SvelteKit soon.
- `<svelte:head>` — top-level only.
- `<svelte:window>`, `<svelte:document>`, `<svelte:body>` — top-level only. Bind to safe props (`innerWidth` etc.; `scrollY` is read+write).
- `<svelte:element this={tag}>` — `this` must be valid HTML/SVG/known custom element. Nullish → not rendered. Add `xmlns` for SVG.
- `<svelte:options>` — per-component compiler opts: `runes`, `namespace`, `customElement`, `css="injected"`.

## Imperative API

```ts
import { mount, unmount, hydrate, render, tick, flushSync, createSubscriber } from 'svelte';
// mount(Component, { target, props, context, intro, events, anchor, idPrefix })
// hydrate(Component, { target, props, context, anchor, idPrefix })
// render(Component, { props, context, transformError, ... })
```

- `mount` → CSR; `hydrate` → resume SSR; `render` → server render.
- `flushSync()` — run pending effects synchronously. **Cannot be used inside an effect.**
- `tick()` — wait for DOM update.
- For `getRequestEvent` in custom server setups, you must wrap with `AsyncLocalStorage` (SvelteKit does this for you).

## Hydratable data

`hydratable('key', () => compute())` — serializes result on server, replays on client hydration without recomputing. Use behind data-fetching libraries (remote functions in SvelteKit already use it).

## Errors to know

- `state_unsafe_mutation` — mutating `$state` in `$derived` or template. Use `$effect` if you must.
- `each_key_duplicate` / `each_key_volatile` — keyed each key issues.
- `derived_references_self` — derived depending on itself.
- `effect_update_depth_exceeded` — `$effect` reads + writes same state; use `untrack` or move to `$derived`.
- `lifecycle_outside_component` / `set_context_after_init` — only call during init.
- `props_invalid_value` — `bind:` with `undefined` when fallback defined.
- `state_prototype_fixed` / `state_descriptors_fixed` — class state shape constraints.

## Best practices (from `svelte/best-practices`)

- Only `$state` reactive vars; everything else plain `let`.
- Use `$state.raw` for big read-only data (API responses you don't mutate).
- Use `$derived` not `$effect` for any value derivable from state. If you need to override → just reassign the derived (writable in 5.25+).
- Treat props as changeable; derive from them.
- `onclick` not `on:click`; spread `onclick` from props. Use `<svelte:window onkeydown>` instead of `$effect`.
- Snippets over slots.
- Keyed each blocks with primitive keys.
- Use `style:--token={x}` for CSS variables from JS state.
- Pass CSS custom properties to child components to style them from the parent.
- Prefer `createContext` over `set/getContext`.
- For shared global state, use `context` over a `.svelte.js` module — avoids SSR cross-request leaks.
- `class={{...}}` / `class={[...]}` and the `class:` directive are both current; neither supersedes the other. See the note in Appendix A.

## TypeScript

- `<script lang="ts">`.
- Wrapper components: `let { ...rest }: HTMLButtonAttributes = $props();` (types from `svelte/elements`).
- Generic components: `<script lang="ts" generics="T">`.
- Snippet prop type: `Snippet<[ArgsTuple]>`.
- Avoid `$state` snapshot in Playwright/etc. tests — use `expect.element($host).toBeVisible()` style with DOM.

## Testing

- Vitest (unit) — `sv add vitest` installs browser-mode + `@testing-library/svelte` + Playwright.
- For component tests, prefer `mount(...)` with a wrapper that sets required context.

## Cloudflare-specific gotchas for SvelteKit

- Don't `import { env } from '$env/dynamic/private'` in modules that the worker also evaluates during build/prerender — the build-time `event` won't be there. Prefer `$env/static/*` for static secrets.
- `platform.env` is only available server-side. For client side, use `$env/static/public` (compiled into the bundle).
- Cookie `secure` flag: production-only by default. Preview and `workers.dev` URLs are already HTTPS, and because `BETTER_AUTH_URL` is left unset the inferred origin is correct on both.
- `compatibility_date` must be recent (≥ 2024-09-23 for `nodejs_compat`; this project pins `2026-08-28`).
- D1 binding is read from `event.platform.env.DB`; in `+page.server.ts`/`+server.ts` use `platform.env`. In `+page.ts` (universal) only `fetch` works — go via a `+server.ts` proxy or remote function.
- `wrangler types --check` regenerates `worker-configuration.d.ts`. If you change bindings, rerun.

## Quick checklist for the job-tracker

- [ ] `wrangler.jsonc` with `assets`, `observability`, `nodejs_compat`, D1 binding `DB`.
- [ ] `src/app.d.ts` declares `App.Platform.env` typed via `worker-configuration.d.ts`.
- [ ] `src/hooks.server.ts` mounts Better Auth `svelteKitHandler` and populates `event.locals.session/user`.
- [ ] `src/routes/api/auth/[...all]/+server.ts` if not using the `svelteKitHandler` only (the handler does the catch-all already).
- [ ] Use `remote functions` in `src/lib/jobs.remote.ts` for the job list/create/update/delete — typed end-to-end, batched reads, invalidation.
- [ ] `+page.server.ts` for any SSR-pre-rendered reads + SEO.
- [ ] Tailwind v4 via `@tailwindcss/vite` plugin (already wired). CSS-first config in `src/routes/layout.css`.
- [ ] Drizzle schema + migration generation step in `package.json` scripts.

## Appendix A — Svelte 5 essentials cheat sheet (from MCP `svelte/what-are-runes`)

| Rune | Purpose | Notes |
| --- | --- | --- |
| `$state(value)` | Reactive state. Deep proxy on objects/arrays. | Use `$state.raw(...)` for big read-only data; `$state.snapshot(...)` to clone; `$state.eager(...)` for instant UI feedback in `await` expressions. |
| `$derived(expr)` / `$derived.by(fn)` | Computed value; recomputes when deps change. Writable in 5.25+. | Free of side-effects. Use `untrack(...)` to exempt a read from being a dep. |
| `$effect(fn)` | Side effect after DOM update. | Avoid for state derivations (use `$derived`); use `getAbortSignal()` to abort fetches on re-run. `$effect.pre` runs before update. |
| `$props()` | Component props. | `let { x, ...rest } = $props()`; use `bind:` to expose via `$bindable()`. |
| `$bindable()` | Two-way bindable prop. | `let { value = $bindable(0) } = $props()`. |
| `$inspect(...)` / `$inspect.trace(label)` | Dev-time logging/tracing. | Tree-shaken in prod. |
| `$host()` | Custom element host. | For `<svelte:options customElement>`. |

Rules of thumb (from `svelte/best-practices`; see full Best practices section above for the full list):

- Use `$derived` for any computed state; avoid `$effect` to compute.
- Treat props as changeable: derive from them, don't snapshot them.
- `onclick={...}` (attribute) replaces `on:click`. No modifiers — call `e.preventDefault()` etc. in the handler. `onclickcapture={...}` exists.
- `<DynamicComponent this={...} />` (or just `<Component />` with a `Component` binding) replaces `<svelte:component this=...>`.
- `{#snippet name(...)}` / `{@render name(...)}` replaces `<slot>` / `$$slots`. Children is a snippet prop named `children`.
- `class={[a, b && 'c']}` / `class={{ active: isOn }}` is available (5.16+) alongside `class:active={isOn}`, which is **not** deprecated. Pick per readability.
- `{@attach ...}` replaces `use:action`.
- Use `createContext()` (Svelte ≥5.40) for type-safe context: `const [get, set, has] = createContext<T>()`.

## Appendix B — Full Svelte 5 component model

- `let { a, b, ...rest } = $props()` — props with rest-spread. Rename reserved words via destructuring: `let { class: klass } = $props()`.
- `let { value = $bindable(0) } = $props()` — two-way bindable default; parent uses `bind:value={value}`.
- Component events = **callback props**, not `createEventDispatcher`. `onclick={...}` attribute replaces `on:click`. No event modifiers — call `e.preventDefault()` inside the handler. `onclickcapture` exists for capture phase. Spread `onclick` from props like any attr.
- Conditional / list / template primitives:
  - `{#if cond}…{:else if …}…{/if}`
  - `{#each items as item (item.id)}` — always provide a stable key.
  - `{#await promise}…{:then val}…{:catch err}…{/await}`
  - `{#key value}…{/key}` — force remount on `value` change.
  - `{#snippet name(arg)}…{/snippet}` + `{@render name(arg)}` replaces `<slot>`. `children` is the `children` snippet prop.
- Special elements: `<svelte:boundary onerror={…}>` for error isolation; `<svelte:window onkeydown={…}>` / `<svelte:document …>` / `<svelte:body …>` for global events; `<svelte:head>` for `<title>`/OG; `<svelte:element this={tag}>` for dynamic tags; `<svelte:options customElement="x-tag">` for web components.

## Appendix C — Bindings (`bind:`) deep-dive

- `bind:value` on inputs (auto-coerces number/range; `undefined` if empty or invalid).
- `bind:checked`, `bind:group={var}` for radios, `bind:files` for file inputs, `bind:this={ref}` for elements/components, `bind:innerHTML` / `bind:textContent`, `bind:clientWidth` / `bind:clientHeight` / `bind:offsetWidth` / `bind:offsetHeight` / `bind:contentRect` (readonly dimension bindings).
- **Function bindings** (5.9+): `bind:value={get, set}` to validate or transform. Read-only bindings use `bind:clientWidth={null, redraw}`.
- Form `defaultValue` / `defaultChecked` (5.6+) — input reverts to that on `<form>` reset.

## Appendix D — `$effect` deep-dive

- Runs after DOM update, batched, microtask-deferred. Returns a teardown that fires before the next run AND on parent destruction.
- Async reads (after `await` or in `setTimeout`) are NOT tracked.
- `$effect.pre` runs before DOM update (autoscroll, measurements).
- `$effect.tracking()` — `true` inside an effect or template.
- `$effect.pending()` — count of pending boundary promises.
- `$effect.root(() => { … return () => … })` — manual, non-tracked scope (good for nested effects created outside component setup).
- When to avoid: prefer `$derived` for anything that derives state; prefer event handlers for input; prefer `getAbortSignal()` to auto-cancel fetches.

## Appendix E — Imported-from-`svelte` modules (exhaustive)

- `svelte` — runtime: `mount`, `unmount`, `hydrate`, `flushSync`, `tick`, `untrack`, `createContext`, `getContext`, `setContext`, `hasContext`, `getAllContexts`, `getAbortSignal`, `fork`, `createRawSnippet`. Legacy: `SvelteComponent`, `SvelteComponentTyped`, `createEventDispatcher`, `afterUpdate`, `beforeUpdate`, `onMount`, `onDestroy`.
- `svelte/store` — legacy stores (`writable`, `readable`, `derived`, `get`); avoid in new code, use `$state` modules.
- `svelte/reactivity` — `SvelteMap`, `SvelteSet`, `SvelteDate`, `SvelteURL`, `SvelteURLSearchParams`, `MediaQuery`, `createSubscriber`.
- `svelte/reactivity/window` — `innerWidth`, `innerHeight`, `outerWidth`, `outerHeight`, `scrollX`, `scrollY`, `online`, `devicePixelRatio`, `screen`, `visualViewport`.
- `svelte/motion` — `Tween` (configurable easing/duration) and `Spring` (stiffness/damping; `prefersReducedMotion` friendly). Pair with `use:` for animation glue or bind the `.value` getter.
- `svelte/transition` — `fade`, `fly`, `scale`, `slide`, `blur`, `draw` with `delay/duration/easing` params; `crossfade` (shared transitions).
- `svelte/animate` — `flip` for keyed reorder animations.
- `svelte/easing` — linear, cubic, sine, back, bounce, elastic, quad, quart, quint, expo, circ, `cubicInOut`, etc.; `easeInOut` helpers.
- `svelte/server` — `render(Component, { props })` for SSR outside SvelteKit (returns `{ head, html, css, body }`).
- `svelte/compiler` — `compile(source, options)`, `compileModule`, `parse`, `walk`, `preprocess` (build tools, custom bundlers).
- `svelte/attachments` — programmatic element manipulation API that replaces `use:action` (see `{@attach …}` docs).
- `svelte/legacy` — `createClassComponent`, `asClassComponent`, `run` (used by adapters to mount legacy components).

## Appendix F — SvelteKit surface cheat sheet

- **Routing**: `+page` (page), `+layout` (wrapping), `+server` (HTTP endpoint returning `Response`), `+error` (boundary), `+page.ts` / `+page.server.ts` / `+layout.ts` / `+layout.server.ts` (`load`); `(group)` for shared layout without URL; `[param]`, `[[optional]]`, `[...rest]` for dynamic; `src/params/foo.ts` for `match`ers; `routeId` in `$app/types` for type-safe links.
- **Page options**: `export const prerender = true | 'auto'`, `ssr = true | false`, `csr = true | false`, `trailingSlash = 'always' | 'never' | 'ignore'`, `config = { regions, runtime }`, `entries()` for dynamic prerender generation.
- **Loading data**: `load` returns `{ ... }`; receives `params, route.id, url, fetch, data, setHeaders, depends, parent, untrack`; can throw `error(status, msg)` or `redirect(307, '/path')`; server `load` also gets `request, platform, locals, cookies`. Use `event.fetch` in load to call internal endpoints without HTTP roundtrip and with credentials.
- **Form actions**: `export const actions = { create: async (event) => {…} }`. Use `form` prop on the page; default action is `?/default`; named actions `?/create`. Return `fail(400, { fieldErrors })` or `redirect(303, …)`. Client-side via `use:enhance`.
- **Hooks** (`src/hooks.server.ts`): `handle({ event, resolve })` chains via `resolve(event, { transformPageChunk })`; `handleFetch` intercepts server `fetch`; `handleError({ error, event })` for logging/transforming; `init` (instrumentation) runs at startup.
- **Remote functions** (`*.remote.ts`, 2.27+, experimental — opt in via `kit.experimental.remoteFunctions` + `compilerOptions.experimental.async`): `query`, `query.batch`, `query.live`, `form`, `command`, `prerender`; schema-validated with any Standard Schema lib.
- **Error handling**: `error(status, msg)` throws from load/actions; `+error.svelte` renders; `error.html` is the final fallback.
- **Link options** (`data-sveltekit-*` attrs on `<a>` or `<form>`): `preload-data` (`hover|tap|off`), `preload-code` (`eager|viewport|hover|tap`), `reload`, `replacestate`, `keepfocus`, `noscroll`. `data-sveltekit-preload-data="hover"` is set on the `<body>` already.
- **Shallow routing**: `pushState` / `replaceState` / `popState` for modal/overlay URLs that don't trigger a navigation.
- **Snapshots**: `import { snapshot } from '$app/environment'` (typed via `App.Snapshot`) — preserves form/text input values across nav (good for multi-step forms, comment drafts, surveys).
- **Service workers**: `src/service-worker.{js,ts}` with `$service-worker` module; SvelteKit hooks `build`, `prerendered`, `files`, `version`.
- **Packaging** (`@sveltejs/package`, `sv add` not available — install manually): `svelte-package` builds `src/lib/` to `dist/` with `.d.ts`; set `exports` and `files` in `package.json`; all relative imports must include the `.js` extension (use `rewriteRelativeImportExtensions` in tsconfig — already on in this project).

## Appendix G — Accessibility defaults

- `<button>` must have text or `aria-label`.
- `<img>` needs `alt`.
- Avoid positive `tabindex`. Use semantic elements.
- `<svelte:window onkeydown={...}>` / `<svelte:document ...>` for global events.
- `<svelte:boundary>` for resilient async UI: `<svelte:boundary onerror={(e) => log(e)}>...</svelte:boundary>`.

## Appendix H — Performance

- Use `data-sveltekit-preload-data="hover"` (already on `<body>` in `app.html`).
- Prerender static pages with `export const prerender = true`.
- Use `$derived` (not `$effect`) for computed.
- Use keyed `{#each items as item (item.id)}`.
- Images: `<enhanced:img src={...} />` from `@sveltejs/enhanced-img` (or `sv add ...`).
- `import { read } from '$app/server'` for build-time file reads.

## Appendix I — Deployment flow (this project)

1. `bun run build` → `bun run deploy`
2. `wrangler.jsonc` is the source of truth for the Worker config.
3. Cloudflare `assets` binding serves `.svelte-kit/cloudflare/*` (prebuilt client bundle + prerendered HTML).
4. `wrangler dev` emulates bindings from `wrangler.jsonc`; `wrangler types` regenerates `worker-configuration.d.ts` for type safety.

## Appendix J — AI / agent workflow rules (from the Svelte MCP `ai/*` docs)

The Svelte MCP server embeds a prompt that the agent MUST follow when writing Svelte code. Translated to a checklist for this project:

1. **Discover first**: call `mcp__svelte_list_sections` before asking about any Svelte/SvelteKit topic, then read every section whose `use_cases` matches.
2. **Fetch in bulk**: `mcp__svelte_get_documentation` accepts an array of section paths/titles — pass them all at once.
3. **Autofix on every write**: after producing Svelte component/module code, call `mcp__svelte_autofixer` with `desired_svelte_version: 5` (and `async: true` only if the project opted into async Svelte via `svelte.config.js`). Keep iterating until it returns no issues.
4. **Playground link only on user request**, only after code is final, and NEVER when the code is already in a project file. The root component MUST be named `App.svelte`.
5. **CLI counterpart**: `npx -y @sveltejs/mcp <list-sections | get-documentation | svelte-autofixer>`. Inline code with `$` must be shell-escaped (`\$`).
6. **Skills catalog** (Svelte's own `svelte-code-writer`, `svelte-core-bestpractices`, `svelte-eslint-auto-fix`, `svelte-file-editor`) are downloadable from `github.com/sveltejs/ai-tools/releases`. Drop into `.claude/skills/`, `.copilot/skills/`, or `.opencode/skills/`.
7. **Remote MCP** at `https://mcp.svelte.dev/mcp` is a drop-in alternative to local stdio if your client supports HTTP transports.

## Appendix K — Re-query instructions (when docs drift)

```bash
# Svelte docs
mcp__svelte_list_sections  # discover the current sitemap
mcp__svelte_get_documentation  # pass a list of section paths/titles in one call

# Better Auth docs
mcp__better_auth_get_doc(path: "/llms.txt")  # version index
mcp__better_auth_search_docs  # broad lookup

# Drizzle docs
curl https://orm.drizzle.team/llms.txt
```

> Note: this file originally came from two sources (the project's pre-existing `svelte-kit-reference.md` and a fresh `sveltekit-research.md` written after deeper MCP dives). They have been merged into this single file; the originals are deleted.
