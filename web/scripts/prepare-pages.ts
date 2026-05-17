import { copyFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
copyFileSync(
  resolve(webRoot, "dist/index.html"),
  resolve(webRoot, "dist/404.html"),
)
