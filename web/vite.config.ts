import { defineConfig } from "vite"
import deno from "@deno/vite-plugin"
import preact from "@preact/preset-vite"

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/ts-pattern-swc-plugin/" : "/",
  plugins: [deno(), preact()],
}))
