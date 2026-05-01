# workerskit

A file-based routing framework for Cloudflare Workers. Each route file runs as an **independent Dynamic Worker** loaded via the Worker Loader binding. Hosts ship in two flavors:

- `workerskit/dev` — runtime-bundles `routes/*.ts` via `@cloudflare/worker-bundler`. No build step.
- `workerskit/prod` — reads pre-built `.js` bundles via ASSETS. `@cloudflare/worker-bundler` is fully tree-shaken out, so the prod host bundle is ~1.6 KiB.

The split is intentional: it lets dev have zero build orchestration while prod stays tiny.

## Repository layout

```
workerskit/
  src/
    shared.ts         # shared types (WorkersKitBindings) + makeHandler factory
    dev.ts            # exports default + named `dev(options)` factory
    prod.ts           # exports default + named `prod(options)` factory
    index.ts          # type-only barrel (no runtime re-exports — see below)
  example/
    routes/{index,users}.ts   # source — what dev mode reads
    src/dev.ts        # consumer entry: imports `dev` and passes pkg.dependencies
    src/prod.ts       # consumer entry: re-exports default of `workerskit/prod`
    wrangler.jsonc
    package.json
  package.json        # workerskit (private until API stabilizes)
  tsconfig.json / tsconfig.build.json
  AGENTS.md / README.md
```

`example/` consumes the framework via `"workerskit": "file:.."`. The framework is single-package (no monorepo / `packages/` dir).

## How it works

### Dev mode (`workerskit/dev`)

1. Request → host worker.
2. Host extracts `routeName` from the first path segment (`/users/123` → `users`, `/` → `index`).
3. `env.ASSETS.fetch('/<route>.ts')` reads source from the assets directory (configured to `routes/`).
4. `sha256(source).slice(0, 16)` is computed; LOADER cache key = `<route>:<hash>`. Editing the route changes the hash → fresh worker on next request.
5. On cache miss, dynamically `import('@cloudflare/worker-bundler')` and call `createWorker({ files: { 'index.ts': source, 'package.json': JSON.stringify({ dependencies }) } })`. `dependencies` comes from the consumer's `pkg.dependencies` passed via the `dev({ dependencies })` factory.
6. LOADER mounts the bundled worker; host forwards the request (subpath rewritten).

### Prod mode (`workerskit/prod`)

1. Same routing.
2. `env.ASSETS.fetch('/<dir>/<route>.js')` — `dir` defaults to `''` (no prefix). Configurable via `prod({ dir })`.
3. LOADER cache key = `<route>` (deterministic since `.js` is built ahead of time).
4. On cache miss, fetch the `.js` bundle and pass it as a single `index.js` module to `LOADER.get`. No bundling at runtime.

## Two-file split is load-bearing

Earlier iterations tried a single host with `WORKERSKIT_DEV` `define`-based dead-code elimination. That worked but had two problems:

1. `define` had to be duplicated between top-level and `env.production` in `wrangler.jsonc` (wrangler doesn't inherit env config).
2. esbuild emits `esbuild.wasm` (≈14 MB) as an orphan chunk whenever a dynamic `import('@cloudflare/worker-bundler')` is _statically reachable_ — even if dead at runtime. Tree-shaking of the JS doesn't drop the wasm asset.

Splitting into `dev.ts` and `prod.ts` files (separate subpath exports `workerskit/dev`, `workerskit/prod`) means the prod build never _imports_ `dev.ts`. The dynamic `import()` is never seen → no wasm emission. Confirmed: prod bundle is **1.65 KiB** with no `esbuild.wasm`.

**Do not re-add a barrel that re-exports both `dev` and `prod`.** That triggers the wasm emission again. `src/index.ts` is type-only on purpose.

## Required bindings

The consumer's `wrangler.jsonc`:

```jsonc
{
  "main": "src/dev.ts",
  "assets": { "directory": "routes", "binding": "ASSETS" },
  "worker_loaders": [{ "binding": "LOADER" }],
  "compatibility_date": "2026-03-17"
}
```

For deploy, override `main` and `assets` via CLI to avoid an `env.production` block:

```sh
wrangler deploy src/prod.ts --assets dist
```

`Fetcher` and `WorkerLoader` types come from `@cloudflare/workers-types` or generated `worker-configuration.d.ts`.

## Route contract

A route is a module default-exporting anything with a `fetch(request)` — typically a Hono app:

```ts
// routes/users.ts
import { Hono } from 'hono'
const app = new Hono()
app.get('/', (c) => c.json({ users: [] }))
app.get('/:id', (c) => c.json({ id: c.req.param('id') }))
export default app
```

The host strips the first path segment before forwarding, so the route sees `/`, `/:id`, etc.

## Build details

Per-route bundling uses `bun build`:

```sh
bun build ./routes/*.ts --outdir=./dist --target=browser --format=esm --minify
```

- `--target=browser` is correct for `workerd` (V8, no Node builtins). `--target=bun` would mix in Bun-specific APIs; `--target=node` would pull Node builtins.
- Multi-entry `bun build` does **not** code-split by default — each entry produces a self-contained bundle (hono inlined). This matters because LOADER receives only the route's own `.js` and can't resolve external chunks.

## `/* @__PURE__ */` annotations

`dev.ts` and `prod.ts` end with:

```ts
export default /* @__PURE__ */ dev() // or prod()
```

This lets bundlers tree-shake the unused default export when a consumer only uses the named factory. Removing it can leave a dead handler object in the bundle. Cheap; keep it.

## Running the example

```sh
cd example
bun install
bun run dev          # wrangler dev — uses src/dev.ts, no build step
bun run build        # bun build → dist/
bun run deploy       # bun run build && wrangler deploy src/prod.ts --assets dist
```

`@cloudflare/worker-bundler` only runs inside `workerd`, so dev needs `wrangler dev` (not plain Node).

## Constraints / non-obvious things

- LOADER caches workers by name. In dev we hash the source into the key so edits invalidate; in prod the name alone is fine because `.js` is immutable per build.
- Routes get `hono` (and any other dep) bundled inline at build time. Adding a new dep means rebuilding (and adding it to the consumer's `package.json` so dev mode also resolves it).
- The host always tries `index` for `/`. There's no `index.html`-style fallback or directory listing.
- `assets.directory` in `wrangler.jsonc` is the dev default; prod overrides via `--assets` CLI to keep the config single-source.

## References

- [Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/)
- [Worker Loader binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/)
- [`@cloudflare/worker-bundler`](https://www.npmjs.com/package/@cloudflare/worker-bundler)

## Status / next steps

- [x] Split host into `workerskit/dev` (runtime bundler) and `workerskit/prod` (pre-built)
- [x] Per-route bundling via `bun build` (each entry self-contained)
- [x] Source-hash LOADER cache key in dev
- [ ] Configurable `compatibilityDate` (currently `'2026-03-24'` hardcoded in both modes)
- [ ] Dynamic route segments (`[id].ts`)
- [ ] Per-route binding configuration
- [ ] npm publish (deferred — keep `private: true` until API stabilizes)
