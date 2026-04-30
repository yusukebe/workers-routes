# workerskit

A file-based routing framework for Cloudflare Workers. Each route file runs as an **independent Dynamic Worker** — fully isolated, bundled on demand, loaded via the Worker Loader binding.

> **Status:** experimental. Not yet published to npm. Worker Loader is in closed beta.

## How it looks

```
my-app/
  routes/
    index.ts        # GET /
    users.ts        # /users/*
    posts.ts        # /posts/*
  src/
    index.ts        # export { default } from 'workerskit'
  wrangler.jsonc
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

The host Worker dispatches by the first path segment (`/users/123` → `users.ts`, then forwards `/123`). Routes are sandboxed from each other and bundled on first request, then cached.

## Required bindings

```jsonc
// wrangler.jsonc
{
  "main": "src/index.ts",
  "assets": { "directory": "routes", "binding": "ASSETS" },
  "worker_loaders": [{ "binding": "LOADER" }],
  "compatibility_date": "2026-03-17"
}
```

## Try the example

```sh
cd example
bun install
bun run dev
```

`@cloudflare/worker-bundler` only runs inside `workerd`, so this needs `wrangler dev` (not Node).

## Why

- **Isolation by default.** Each route is its own Worker — bugs, dependencies, and runtime crashes can't leak between routes.
- **No build step for the user.** Routes are bundled on demand at the edge.
- **Per-route bindings (planned).** Each route can eventually have its own scoped set of bindings.

## References

- [Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/)
- [Worker Loader binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/)
- [`@cloudflare/worker-bundler`](https://www.npmjs.com/package/@cloudflare/worker-bundler)
- [Hono](https://hono.dev/)
