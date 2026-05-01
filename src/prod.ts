import { makeHandler, type WorkersKitBindings } from './shared.js'

export interface ProdOptions {
  dir?: string
}

const makeLoad = (options: ProdOptions) => {
  const dir = options.dir ?? ''
  const prefix = dir ? `${dir}/` : ''
  return async (env: WorkersKitBindings, routeName: string) => {
    const path = `${prefix}${routeName}.js`
    const head = await env.ASSETS.fetch(new Request(`http://dummy/${path}`, { method: 'HEAD' }))
    if (!head.ok) {
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
