import { Hono } from 'hono'
import { createWorker } from '@cloudflare/worker-bundler'

export interface WorkersKitBindings {
  ASSETS: Fetcher
  LOADER: WorkerLoader
}

const app = new Hono<{ Bindings: WorkersKitBindings }>()

app.all('/:route{.+}', async (c) => {
  const routeName = c.req.param('route').split('/')[0]
  const subPath = '/' + c.req.param('route').split('/').slice(1).join('/')

  const worker = await loadWorker(c.env, routeName)
  if (!worker) {
    return c.notFound()
  }

  const subUrl = new URL(subPath, c.req.url)
  subUrl.search = new URL(c.req.url).search
  const subRequest = new Request(subUrl.toString(), {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body
  })

  return worker.getEntrypoint().fetch(subRequest)
})

app.all('/', async (c) => {
  const worker = await loadWorker(c.env, 'index')
  if (!worker) {
    return c.notFound()
  }
  return worker.getEntrypoint().fetch(c.req.raw)
})

async function loadWorker(env: WorkersKitBindings, routeName: string) {
  const head = await env.ASSETS.fetch(new Request(`http://dummy/${routeName}.ts`, { method: 'HEAD' }))
  if (!head.ok) {
    return null
  }

  return env.LOADER.get(routeName, async () => {
    const assetResponse = await env.ASSETS.fetch(new Request(`http://dummy/${routeName}.ts`))
    const sourceCode = await assetResponse.text()

    const { mainModule, modules } = await createWorker({
      files: {
        'index.ts': sourceCode,
        'package.json': JSON.stringify({
          dependencies: { hono: '^4.7.0' }
        })
      }
    })

    return {
      compatibilityDate: '2026-03-24',
      mainModule,
      modules,
      globalOutbound: null
    }
  })
}

export default app
