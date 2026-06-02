import { normalizePath, type Plugin, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { transformTsPattern } from '@scarf/ts-pattern-swc-plugin/transform'

const tsPatternSwcPlugin = (): Plugin => {
  let swcRunnerTransformed = false

  return {
    name: 'ts-pattern-swc-plugin-demo',
    enforce: 'pre',
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
