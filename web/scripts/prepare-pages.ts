import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
writeFileSync(resolve(webRoot, "dist/_redirects"), "/* /index.html 200\n")
