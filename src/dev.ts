import { makeHandler, type WorkersKitBindings } from './shared.js'

export interface DevOptions {
  dependencies?: Record<string, string>
}

const makeLoad = (options: DevOptions) => {
  const dependencies = options.dependencies ?? {}
  return async (env: WorkersKitBindings, routeName: string) => {
    const tsRes = await env.ASSETS.fetch(new Request(`http://dummy/${routeName}.ts`))
    if (!tsRes.ok) {
      return null
    }
    const source = await tsRes.text()
    const hash = await sha256(source)

    return env.LOADER.get(`${routeName}:${hash}`, async () => {
      const { createWorker } = await import('@cloudflare/worker-bundler')
      const { mainModule, modules } = await createWorker({
        files: {
          'index.ts': source,
          'package.json': JSON.stringify({ dependencies })
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
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

export const dev = (options: DevOptions = {}) => makeHandler(makeLoad(options))

export default /* @__PURE__ */ dev()
