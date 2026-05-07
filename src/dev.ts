import { makeHandler, type KakeraBindings } from './shared.js'

export interface DevOptions {
  dependencies?: Record<string, string>
  extensions?: string[]
}

const makeLoad = (options: DevOptions) => {
  const dependencies = options.dependencies ?? {}
  const extensions = options.extensions ?? ['ts', 'tsx']
  return async (env: KakeraBindings, routeName: string) => {
    let source: string | null = null
    let ext: string | null = null
    for (const candidate of extensions) {
      const res = await env.ASSETS.fetch(new Request(`http://dummy/${routeName}.${candidate}`))
      if (res.ok) {
        source = new TextDecoder().decode(await res.arrayBuffer())
        ext = candidate
        break
      }
    }
    if (source === null || ext === null) {
      return null
    }
    const hash = await sha256(source)

    return env.LOADER.get(`${routeName}:${hash}`, async () => {
      const { createWorker } = await import('@cloudflare/worker-bundler')
      const entryPoint = `index.${ext}`
      const { mainModule, modules } = await createWorker({
        entryPoint,
        files: {
          [entryPoint]: source,
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
