import swc, { transform as namedTransform } from "@swc/core"
import { fileURLToPath } from "node:url"

const transform = namedTransform ?? swc.transform
const wasmUrl = new URL("./target/wasm32-wasip1/release/ts_pattern_swc_plugin.wasm", import.meta.url)

export const defaultPluginPath = () => fileURLToPath(wasmUrl)

const parserFor = (filename) => ({
  syntax: "typescript",
  tsx: /\.tsx$/i.test(filename),
  decorators: false,
})

const moduleTypeFor = (filename) => /\.cts$/i.test(filename) ? "commonjs" : "es6"

export const transformTsPattern = async (source, options = {}) => {
  const filename = options.filename ?? "input.ts"
  const pluginPath = options.pluginPath ?? defaultPluginPath()
  const swcOptions = options.swcOptions ?? {}
  const result = await transform(source, {
    ...swcOptions,
    filename,
    sourceMaps: options.sourceMaps ?? swcOptions.sourceMaps ?? "inline",
    jsc: {
      ...swcOptions.jsc,
      parser: swcOptions.jsc?.parser ?? parserFor(filename),
      target: swcOptions.jsc?.target ?? "es2022",
      experimental: {
        ...swcOptions.jsc?.experimental,
        plugins: [
          [pluginPath, options.pluginOptions ?? {}],
          ...(swcOptions.jsc?.experimental?.plugins ?? []),
        ],
      },
    },
    module: swcOptions.module ?? { type: moduleTypeFor(filename) },
  })
  return result
}
