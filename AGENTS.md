# workerskit

A file-based routing framework for Cloudflare Workers built on Hono and the Worker Loader binding. Each route file runs as an **independent Dynamic Worker** — fully isolated, with its own bundle and (eventually) its own bindings.

## Concept

- Drop a worker (typically a Hono app) into `routes/` and it becomes a route, dispatched by URL path.
- The host Worker reads the route source via the Assets binding.
- `@cloudflare/worker-bundler` bundles each route on demand (npm deps included).
- `env.LOADER` (Worker Loader binding) loads the bundle as a Dynamic Worker.
- Routes are sandboxed from each other.

## Repository layout

```
workerskit/
  src/
    index.ts          # framework — the host Worker (default-exports a Hono app)
  example/
    src/index.ts      # consumer entry — re-exports workerskit's default
    routes/
      index.ts        # GET /
      users.ts        # /users/*
    wrangler.jsonc
    package.json
  package.json        # framework package (private for now)
  tsconfig.json
  AGENTS.md
```

`example/` consumes the framework via `"workerskit": "file:.."`. npm publishing is intentionally deferred — once the API stabilizes we can flip `private: false` and add a build step.

## How it works

1. Request hits the host Worker.
2. Host extracts the route name from the first path segment (`/users/123` → `users`, `/` → `index`).
3. `env.ASSETS.fetch('/<route>.ts', { method: 'HEAD' })` checks the route exists; 404 → notFound.
4. `env.LOADER.get(routeName, factory)` returns a cached worker, or runs `factory` on miss:
   - `env.ASSETS.fetch('/<route>.ts')` — fetch source.
   - `createWorker({ files: { 'index.ts': source, 'package.json': ... } })` — bundle.
   - Return `{ mainModule, modules, compatibilityDate, globalOutbound: null }`.
5. Host forwards the request (with subpath rewritten) to `worker.getEntrypoint().fetch(...)`.

The HEAD-then-`LOADER.get` shape matters: bundling lives **inside** the loader factory so it only runs on cache miss. Putting `createWorker` outside the factory makes every request re-bundle, even when the worker is already loaded — that was the original perf bug.

## Required bindings

The consumer's `wrangler.jsonc` must provide:

```jsonc
{
  "main": "src/index.ts",
  "assets": { "directory": "routes", "binding": "ASSETS" },
  "worker_loaders": [{ "binding": "LOADER" }],
  "compatibility_date": "2026-03-17"
}
```

`Fetcher` and `WorkerLoader` types are expected to be globally available (via `@cloudflare/workers-types` or generated `worker-configuration.d.ts`).

## Route contract

A route is a module that default-exports anything with a `fetch(request)` — typically a Hono app:

```ts
// routes/users.ts
import { Hono } from 'hono'
const app = new Hono()
app.get('/', (c) => c.json({ users: [] }))
app.get('/:id', (c) => c.json({ id: c.req.param('id') }))
export default app
```

The host strips the route prefix before forwarding, so the route sees `/`, `/:id`, etc. — not `/users/...`.

## Running the example

```sh
cd example
bun install
bun run dev
```

`@cloudflare/worker-bundler` only runs inside `workerd`, so this needs `wrangler dev` (not Node).

## References

- Dynamic Workers: https://developers.cloudflare.com/dynamic-workers/
- Worker Loader binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/
- @cloudflare/worker-bundler: https://www.npmjs.com/package/@cloudflare/worker-bundler

## Status / next steps

- [x] Host Worker with cached bundling
- [x] Split framework (`src/`) from example app
- [ ] Configurable `compatibilityDate` and route bundling deps (currently hardcoded `hono`)
- [ ] Dynamic route segments (`[id].ts`)
- [ ] Per-route binding configuration
- [ ] npm publish (deferred — keep `private: true` until API stabilizes)
