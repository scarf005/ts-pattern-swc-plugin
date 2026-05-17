import { defineConfig, type Plugin } from "vite"
import deno from "@deno/vite-plugin"
import preact from "@preact/preset-vite"
import { transform } from "@swc/core"
import { existsSync } from "node:fs"
import { Buffer } from "node:buffer"
import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type ModuleType = "es6" | "commonjs"
type TransformRequest = {
  code?: unknown
  plugin?: unknown
  moduleType?: unknown
}

const root = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(root, "../plugin")
const pluginPath = resolve(
  pluginRoot,
  "target/wasm32-wasip1/release/ts_pattern_swc_plugin.wasm",
)

const ensurePluginBuilt = () => {
  if (existsSync(pluginPath)) return
  const result = spawnSync("cargo", [
    "build",
    "--release",
    "--target",
    "wasm32-wasip1",
  ], {
    cwd: pluginRoot,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    throw new Error("Failed to build ts-pattern SWC plugin wasm")
  }
}

const readJson = async (request: import("node:http").IncomingMessage) =>
  await new Promise<TransformRequest>((resolveRequest, reject) => {
    const chunks: Uint8Array[] = []
    request.on("data", (chunk) => chunks.push(chunk))
    request.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8")
        resolveRequest(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    request.on("error", reject)
  })

const transformApi = (): Plugin => ({
  name: "ts-pattern-swc-transform-api",
  configureServer(server) {
    ensurePluginBuilt()
    server.middlewares.use("/api/transform", async (request, response) => {
      if (request.method !== "POST") {
        response.statusCode = 405
        response.end(JSON.stringify({ error: "Method not allowed" }))
        return
      }

      try {
        const body = await readJson(request)
        if (typeof body.code !== "string") {
          response.statusCode = 400
          response.end(JSON.stringify({ error: "code must be a string" }))
          return
        }

        const moduleType: ModuleType = body.moduleType === "commonjs"
          ? "commonjs"
          : "es6"
        const plugins: [string, Record<string, never>][] = body.plugin === false
          ? []
          : [[pluginPath, {}]]
        const result = await transform(body.code, {
          filename: "input.ts",
          sourceMaps: false,
          jsc: {
            parser: { syntax: "typescript", tsx: false },
            target: "es2022",
            experimental: { plugins },
          },
          module: { type: moduleType },
        })

        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify({ code: result.code }))
      } catch (error) {
        response.statusCode = 500
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }))
      }
    })
  },
})

export default defineConfig({
  plugins: [deno(), preact(), transformApi()],
})
