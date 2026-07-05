// @ts-self-types="./register.d.ts"
import { register } from "node:module"
import { fileURLToPath } from "node:url"

const env = () => {
  try {
    return globalThis.process?.env?.TS_PATTERN_SWC_PLUGIN_PATH
  } catch {
    return undefined
  }
}

const pluginPath = env()
  ?? fileURLToPath(new URL("./target/wasm32-wasip1/release/ts_pattern_swc_plugin.wasm.bin", import.meta.url))

register(new URL("./loader.mjs", import.meta.url), {
  parentURL: import.meta.url,
  data: { pluginPath },
})
