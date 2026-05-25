import initSwc, { transform } from "./vendor/swc-binding-core-wasm/wasm.js"

export type ModuleType = "es6" | "commonjs"

type TransformOptions = {
  code: string
  plugin: boolean
  moduleType: ModuleType
}

const pluginName = "@scarf/ts-pattern-swc-plugin"
const pluginWasmUrl = `${import.meta.env.BASE_URL}ts_pattern_swc_plugin.wasm`

let swcReady: Promise<void> | undefined
let pluginBytes: Promise<Uint8Array> | undefined

const ensureSwcReady = async () => {
  swcReady ??= initSwc(
    new URL("./vendor/swc-binding-core-wasm/wasm_bg.wasm", import.meta.url),
  ).then(() => undefined)
  await swcReady
}

const getPluginBytes = async () => {
  pluginBytes ??= fetch(pluginWasmUrl).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to load ${pluginWasmUrl}: ${response.status}`)
    }
    return new Uint8Array(await response.arrayBuffer())
  })
  return await pluginBytes
}

export const transformInBrowser = async (
  { code, moduleType, plugin }: TransformOptions,
) => {
  await ensureSwcReady()
  const plugins: [string, Record<string, never>][] = plugin
    ? [[pluginName, {}]]
    : []
  const pluginResolver = plugin
    ? { [pluginName]: await getPluginBytes() }
    : undefined

  return await transform(
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
    pluginResolver,
  )
}
