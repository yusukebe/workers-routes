# workers-routes

A file-based routing framework for Cloudflare Workers. Each route file runs as an **independent Dynamic Worker** — fully isolated, loaded via the Worker Loader binding.

> **Status:** experimental. Worker Loader is in closed beta.

## Install

```sh
npm i workers-routes
```

## How it looks

```
my-app/
  routes/
    index.ts        # GET /
    users.ts        # /users/*
    posts.ts        # /posts/*
  src/
    dev.ts          # dev entry — uses runtime bundler, no build step
    prod.ts         # prod entry — uses pre-built routes
  wrangler.jsonc
  package.json
```

Each route is just a worker — typically a Hono app:

```ts
// routes/users.ts
import { Hono } from 'hono'

const app = new Hono()
app.get('/', (c) => c.json({ users: [] }))
app.get('/:id', (c) => c.json({ id: c.req.param('id') }))

export default app
```

The host Worker dispatches by the first path segment (`/users/123` → `users.ts`, then forwards `/123`). Routes are sandboxed from each other.

## Two modes

### Dev: zero build step

`workers-routes/dev` runtime-bundles `routes/*.ts` via `@cloudflare/worker-bundler` on first request. Edit a route and it's reflected immediately (LOADER cache is keyed by source hash).

```ts
// src/dev.ts
import { dev } from 'workers-routes/dev'
import pkg from '../package.json'

export default dev({ dependencies: pkg.dependencies })
```

`dependencies` flows into the bundler so route imports (`hono`, etc.) resolve.

### Prod: pre-built, tiny host

`workers-routes/prod` reads pre-built `.js` bundles from the assets directory. The host worker is **~1.6 KiB** — `@cloudflare/worker-bundler` is fully tree-shaken out.

```ts
// src/prod.ts
export { default } from 'workers-routes/prod'
```

Or with options:

```ts
import { prod } from 'workers-routes/prod'
export default prod({ dir: 'subdir' }) // fetches subdir/<name>.js via ASSETS
```

## Wrangler config

```jsonc
// wrangler.jsonc
{
  "main": "src/dev.ts",
  "assets": { "directory": "routes", "binding": "ASSETS" },
  "worker_loaders": [{ "binding": "LOADER" }],
  "compatibility_date": "2026-03-17"
}
```

## Scripts

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "build": "bun build ./routes/*.ts --outdir=./dist --target=browser --format=esm --minify",
    "deploy": "bun run build && wrangler deploy src/prod.ts --assets dist"
  }
}
```

- `wrangler dev` — starts workerd with `src/dev.ts` as main, ASSETS serves source `.ts` files
- `bun run build` — bundles each route to `dist/<name>.js` (per-route, hono inlined)
- `bun run deploy` — builds, then deploys `src/prod.ts` overriding `--assets` to point at `dist/`

## Try the example

```sh
cd example
bun install
bun run dev
```

## Why

- **Isolation by default.** Each route is its own Worker — bugs, deps, and runtime crashes can't leak between routes.
- **No build step in dev.** Edit `routes/*.ts` and refresh.
- **Tiny prod bundle.** `@cloudflare/worker-bundler` (~14 MiB with esbuild-wasm) lives only in dev — never shipped to production.
- **Per-route bindings (planned).** Each route can eventually have its own scoped set of bindings.

## How it works

|                          | dev                                          | prod                                  |
| ------------------------ | -------------------------------------------- | ------------------------------------- |
| Host entry               | `src/dev.ts` (`workers-routes/dev`)          | `src/prod.ts` (`workers-routes/prod`) |
| Route source on disk     | `routes/<name>.ts`                           | `dist/<name>.js` (built)              |
| ASSETS binding directory | `routes`                                     | `dist` (via `--assets dist`)          |
| Bundling                 | runtime via `@cloudflare/worker-bundler`     | build-time via `bun build`            |
| LOADER cache key         | `<name>:<sha256(source)>` (auto-invalidates) | `<name>`                              |
| Host bundle size         | includes worker-bundler                      | ~1.6 KiB                              |

## References

- [Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/)
- [Worker Loader binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/)
- [`@cloudflare/worker-bundler`](https://www.npmjs.com/package/@cloudflare/worker-bundler)
- [Hono](https://hono.dev/)
