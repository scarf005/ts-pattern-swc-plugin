import { normalizePath, type Plugin, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { transformTsPattern } from '@scarf/ts-pattern-swc-plugin/transform'

const tsPatternSwcPlugin = (): Plugin => {
  let appTransformed = false

  return {
    name: 'ts-pattern-swc-plugin-demo',
    enforce: 'pre',
    async transform(code, id) {
      const filename = id.split('?')[0]
      if (!/\.[cm]?tsx?$/.test(filename) || filename.includes('/node_modules/')) {
        return null
      }

      const result = await transformTsPattern(code, {
        filename,
        sourceMaps: false,
        swcOptions: { module: { type: 'es6' } },
      })

      if (normalizePath(filename).endsWith('/src/App.tsx')) {
        appTransformed = true
      }

      return { code: result.code, map: null }
    },
    buildEnd() {
      if (!appTransformed) {
        this.error('ts-pattern SWC plugin did not transform src/App.tsx')
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [tsPatternSwcPlugin(), react()],
})
