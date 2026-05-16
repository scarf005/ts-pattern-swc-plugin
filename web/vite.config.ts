import { defineConfig, type Plugin } from "vite"
import deno from "@deno/vite-plugin"
import preact from "@preact/preset-vite"
import { transform } from "@swc/core"
import { spawnSync } from "node:child_process"
import type { IncomingMessage, ServerResponse } from "node:http"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = dirname(fileURLToPath(import.meta.url))
const pluginDir = resolve(rootDir, "../plugin")
const wasmPath = resolve(
  pluginDir,
  "target/wasm32-wasip1/release/ts_pattern_swc_plugin.wasm",
)
let built = false

type ModuleType = "es6" | "commonjs"
type TransformRequest = {
  code?: unknown
  plugin?: unknown
  moduleType?: unknown
}

const ensurePluginWasm = () => {
  if (built && existsSync(wasmPath)) return
  const result = spawnSync("cargo", [
    "build",
    "--release",
    "--target",
    "wasm32-wasip1",
  ], {
    cwd: pluginDir,
    stdio: "inherit",
  })
  if (result.status !== 0) throw new Error("Failed to build SWC plugin")
  if (!existsSync(wasmPath)) throw new Error(`Missing ${wasmPath}`)
  built = true
}

const readBody = (request: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let body = ""
    request.on("data", (chunk) => {
      body += chunk
      if (body.length > 2_000_000) {
        reject(new Error("Request body is too large"))
      }
    })
    request.on("end", () => resolve(body))
    request.on("error", reject)
  })

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
) => {
  response.statusCode = statusCode
  response.setHeader("Content-Type", "application/json")
  response.end(JSON.stringify(payload))
}

const isModuleType = (value: unknown): value is ModuleType =>
  value === "es6" || value === "commonjs"

const handleTransform = async (
  request: IncomingMessage,
  response: ServerResponse,
) => {
  try {
    const payload = JSON.parse(await readBody(request)) as TransformRequest
    if (typeof payload.code !== "string") {
      throw new Error("code must be a string")
    }
    if (!isModuleType(payload.moduleType)) {
      throw new Error("moduleType must be es6 or commonjs")
    }
    ensurePluginWasm()
    const result = await transform(payload.code, {
      filename: "input.ts",
      sourceMaps: false,
      jsc: {
        parser: { syntax: "typescript", tsx: false },
        target: "es2022",
        experimental: payload.plugin
          ? { plugins: [[wasmPath, {}]] }
          : undefined,
      },
      module: { type: payload.moduleType },
    })
    sendJson(response, 200, { code: result.code })
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

const transformApi = (): Plugin => ({
  name: "transform-api",
  buildStart: ensurePluginWasm,
  configureServer: (server) => {
    server.middlewares.use("/api/transform", (request, response) => {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" })
        return
      }
      void handleTransform(request, response)
    })
  },
  configurePreviewServer: (server) => {
    server.middlewares.use("/api/transform", (request, response) => {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" })
        return
      }
      void handleTransform(request, response)
    })
  },
})

export default defineConfig({
  plugins: [deno(), preact(), transformApi()],
})
