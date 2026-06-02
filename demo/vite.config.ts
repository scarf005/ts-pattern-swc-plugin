import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizePath, type Plugin, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { transformTsPattern } from '@scarf/ts-pattern-swc-plugin/transform'

const demoRoot = dirname(fileURLToPath(import.meta.url))
const compiledSnippetId = 'virtual:compiled-benchmark-snippets'
const resolvedCompiledSnippetId = '\0virtual:compiled-benchmark-snippets'

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

      const compiledTsPatternSwcCode = (await transformTsPattern(
        await readFile(resolve(demoRoot, 'src/runners/ts-pattern-swc.tsx'), 'utf8'),
        {
          filename: 'src/runners/ts-pattern-swc.tsx',
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
        },
      )).code

      return `export const compiledTsPatternSwcCode = ${JSON.stringify(compiledTsPatternSwcCode)}`
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
