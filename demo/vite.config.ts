import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizePath, type Plugin, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { transformTsPattern } from '@scarf/ts-pattern-swc-plugin/transform'

const require = createRequire(import.meta.url)
const demoRoot = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(demoRoot, '../plugin')
const swc = require(resolve(pluginRoot, 'node_modules/@swc/core')) as {
  transform: (code: string, options: Record<string, unknown>) => Promise<{ code: string }>
}
const compiledSnippetId = 'virtual:compiled-benchmark-snippets'
const resolvedCompiledSnippetId = '\0virtual:compiled-benchmark-snippets'

const compileWithoutPlugin = async (code: string, filename: string) =>
  (await swc.transform(code, {
    filename,
    sourceMaps: false,
    module: { type: 'es6' },
    jsc: {
      parser: { syntax: 'typescript', tsx: filename.endsWith('.tsx') },
      target: 'es2022',
      transform: {
        react: {
          runtime: 'automatic',
        },
      },
    },
  })).code

const tsPatternSwcPlugin = (): Plugin => {
  let swcRunnerTransformed = false

  return {
    name: 'ts-pattern-swc-plugin-demo',
    enforce: 'pre',
    resolveId(id) {
      if (id === compiledSnippetId) return resolvedCompiledSnippetId
      return null
    },
    async load(id) {
      if (id !== resolvedCompiledSnippetId) return null

      const compiledTsPatternCode = await compileWithoutPlugin(
        await readFile(resolve(demoRoot, 'src/runners/ts-pattern-as-is.tsx'), 'utf8'),
        'src/runners/ts-pattern-as-is.tsx',
      )

      return `export const compiledTsPatternCode = ${JSON.stringify(compiledTsPatternCode)}`
    },
    async transform(code, id) {
      const filename = id.split('?')[0]
      const normalizedFilename = normalizePath(filename)
      if (!normalizedFilename.endsWith('/src/runners/ts-pattern-swc.tsx')) {
        return null
      }

      const result = await transformTsPattern(code, {
        filename,
        sourceMaps: false,
        swcOptions: {
          module: { type: 'es6' },
          jsc: {
            transform: {
              react: {
                runtime: 'automatic',
              },
            },
          },
        },
      })

      if (normalizedFilename.endsWith('/src/runners/ts-pattern-swc.tsx')) {
        swcRunnerTransformed = true
      }

      return { code: result.code, map: null }
    },
    buildEnd() {
      if (!swcRunnerTransformed) {
        this.error('ts-pattern SWC plugin did not transform src/runners/ts-pattern-swc.tsx')
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [tsPatternSwcPlugin(), react()],
})
