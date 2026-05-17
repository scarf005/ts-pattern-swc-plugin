import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export type ModuleType = "es6" | "commonjs"

type SwcOutput = { code: string; diagnostics?: unknown[] }
type SwcWasmBinding = {
  transform: (
    code: string,
    options: unknown,
    experimentalPluginBytesResolver?: Record<string, Uint8Array>,
  ) => Promise<SwcOutput>
}

type TransformOptions = {
  code: string
  moduleType: ModuleType
  plugin: boolean
}

export const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const pluginRoot = resolve(webRoot, "../plugin")
export const pluginPath = resolve(
  pluginRoot,
  "target/wasm32-wasip1/release/ts_pattern_swc_plugin.wasm",
)

const pluginName = "ts-pattern-swc-plugin"
const require = createRequire(import.meta.url)
const swcWasmPackagePath = resolve(
  pluginRoot,
  "node_modules/@swc/binding_core_wasm",
)

export const hasSwcWasmBinding = () => existsSync(swcWasmPackagePath)

const loadSwcWasm = () => require(swcWasmPackagePath) as SwcWasmBinding

export const transformWithSwcWasm = async (
  { code, moduleType, plugin }: TransformOptions,
) => {
  const plugins: [string, Record<string, never>][] = plugin
    ? [[pluginName, {}]]
    : []
  const pluginBytes = plugin
    ? { [pluginName]: readFileSync(pluginPath) }
    : undefined

  return await loadSwcWasm().transform(
    code,
    {
      filename: "input.ts",
      sourceMaps: false,
      jsc: {
        parser: { syntax: "typescript", tsx: false },
        target: "es2022",
        experimental: { plugins },
      },
      module: { type: moduleType },
    },
    pluginBytes,
  )
}
