import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const redirectKey = "ts-pattern-swc-playground-redirect"

writeFileSync(
  resolve(webRoot, "dist/404.html"),
  `<!doctype html>
<meta charset="utf-8">
<script>
  sessionStorage.setItem(${
    JSON.stringify(redirectKey)
  }, location.pathname + location.search + location.hash)
  location.replace("/ts-pattern-swc-plugin/")
</script>
`,
)
