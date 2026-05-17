import { defineConfig } from "vite"
import deno from "@deno/vite-plugin"
import preact from "@preact/preset-vite"

export default defineConfig({
  base: "./",
  plugins: [deno(), preact()],
})
