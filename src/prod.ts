import { makeHandler, type KakeraBindings } from './shared.js'

export interface ProdOptions {
  dir?: string
  extensions?: string[]
}

const makeLoad = (options: ProdOptions) => {
  const dir = options.dir ?? ''
  const prefix = dir ? `${dir}/` : ''
  const extensions = options.extensions ?? ['js']
  return async (env: KakeraBindings, routeName: string) => {
    let path: string | null = null
    for (const ext of extensions) {
      const candidate = `${prefix}${routeName}.${ext}`
      const head = await env.ASSETS.fetch(new Request(`http://dummy/${candidate}`, { method: 'HEAD' }))
      if (head.ok) {
        path = candidate
        break
      }
    }
    if (path === null) {
      return null
    }
    return env.LOADER.get(routeName, async () => {
      const res = await env.ASSETS.fetch(new Request(`http://dummy/${path}`))
      const body = await res.text()
      return {
        compatibilityDate: '2026-03-24',
        mainModule: 'index.js',
        modules: { 'index.js': body },
        globalOutbound: null
      }
    })
  }
}

export const prod = (options: ProdOptions = {}) => makeHandler(makeLoad(options))

export default /* @__PURE__ */ prod()
