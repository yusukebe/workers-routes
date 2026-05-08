import { InMemoryFileSystem, type FileSystem, type JsxMode } from '@cloudflare/worker-bundler'
import * as resolveExports from 'resolve.exports'
import { makeHandler, type KakeraBindings } from './shared.js'

export interface DevOptions {
  dependencies?: Record<string, string>
  extensions?: string[]
  conditions?: string[]
  jsx?: JsxMode
  jsxImportSource?: string
}

const DEFAULT_CONDITIONS = ['workerd', 'worker', 'browser', 'import']

const parsePackageSpecifier = (specifier: string) => {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    if (parts.length >= 2) {
      return {
        packageName: `${parts[0]}/${parts[1]}`,
        subpath: parts.slice(2).join('/') || undefined
      }
    }
  }
  const slash = specifier.indexOf('/')
  if (slash === -1) return { packageName: specifier, subpath: undefined }
  return {
    packageName: specifier.slice(0, slash),
    subpath: specifier.slice(slash + 1)
  }
}

const stripDotSlash = (path: string) => (path.startsWith('./') ? path.slice(2) : path)

const makeResolverPlugin = (fs: FileSystem, conditions: string[]) => ({
  name: 'kakera-resolver',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setup(build: any) {
    build.onResolve({ filter: /^[^./]/ }, (args: { path: string }) => {
      if (args.path.startsWith('cloudflare:') || args.path.startsWith('node:')) return null
      const { packageName, subpath } = parsePackageSpecifier(args.path)
      const pkgJson = fs.read(`node_modules/${packageName}/package.json`)
      if (!pkgJson) return null
      let pkg: Record<string, unknown>
      try {
        pkg = JSON.parse(pkgJson)
      } catch {
        return null
      }
      const entry = subpath ? `./${subpath}` : '.'
      try {
        const resolved = resolveExports.resolve(pkg, entry, { conditions })
        if (resolved && resolved[0]) {
          const fullPath = `node_modules/${packageName}/${stripDotSlash(resolved[0])}`
          if (fs.read(fullPath) !== null) {
            return { path: fullPath, namespace: 'virtual' }
          }
        }
      } catch {}
      return null
    })
  }
})

const makeLoad = (options: DevOptions) => {
  const dependencies = options.dependencies ?? {}
  const extensions = options.extensions ?? ['ts', 'tsx']
  const conditions = options.conditions ?? DEFAULT_CONDITIONS
  const jsx = options.jsx ?? 'automatic'
  const jsxImportSource = options.jsxImportSource
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
      const fs = new InMemoryFileSystem({
        [entryPoint]: source,
        'package.json': JSON.stringify({ dependencies })
      })
      const { mainModule, modules } = await createWorker({
        entryPoint,
        files: fs,
        conditions,
        jsx,
        ...(jsxImportSource ? { jsxImportSource } : {}),
        __dangerouslyUseEsBuildPluginsDoNotUseOrYouWillBeFired: [
          makeResolverPlugin(fs, conditions)
        ] as unknown[]
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
