import { defineConfig, type Plugin } from "vite"
import deno from "@deno/vite-plugin"
import preact from "@preact/preset-vite"
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { pluginPath, pluginRoot } from "./src/swc-wasm-transform.ts"

const root = dirname(fileURLToPath(import.meta.url))
const indexPath = resolve(root, "index.html")
const pluginAssetName = "ts_pattern_swc_plugin.wasm"

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

const playgroundAssets = (): Plugin => ({
  name: "ts-pattern-swc-playground-assets",
  buildStart() {
    ensurePluginBuilt()
  },
  writeBundle(options) {
    ensurePluginBuilt()
    const outputDir = resolve(root, String(options.dir ?? "dist"))
    mkdirSync(outputDir, { recursive: true })
    copyFileSync(pluginPath, resolve(outputDir, pluginAssetName))
  },
  configureServer(server) {
    ensurePluginBuilt()
    server.middlewares.use(`/${pluginAssetName}`, (request, response) => {
      response.setHeader("content-type", "application/wasm")
      if (request.method === "HEAD") {
        response.end()
        return
      }
      response.end(readFileSync(pluginPath))
    })
    server.middlewares.use(async (request, response, next) => {
      if (
        (request.method !== "GET" && request.method !== "HEAD") ||
        !request.url?.startsWith("/examples/")
      ) {
        next()
        return
      }

      const html = await server.transformIndexHtml(
        request.url,
        readFileSync(indexPath, "utf8"),
      )
      response.setHeader("content-type", "text/html")
      response.end(request.method === "HEAD" ? undefined : html)
    })
  },
})

export default defineConfig({
  plugins: [deno(), preact(), playgroundAssets()],
})
