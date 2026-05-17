/// <reference lib="deno.ns" />

import * as tsPattern from "ts-pattern"
import { transformWithSwcWasm } from "./src/swc-wasm-transform.ts"

type BenchModule = {
  inputs: unknown[]
  run: (input: unknown) => number
}

const source = String.raw`
import { match } from "ts-pattern"

type Event =
  | { type: "click"; button: "left" | "right"; x: number; y: number }
  | { type: "keypress"; key: "Enter" | "Escape" | "Space"; repeat: boolean }
  | { type: "resize"; width: number; height: number }
  | { type: "idle" }

export const inputs: Event[] = Array.from({ length: 128 }, (_, index) => {
  switch (index % 8) {
    case 0:
      return { type: "click", button: "left", x: index, y: index * 2 }
    case 1:
      return { type: "click", button: "right", x: index, y: index * 3 }
    case 2:
      return { type: "keypress", key: "Enter", repeat: false }
    case 3:
      return { type: "keypress", key: "Escape", repeat: true }
    case 4:
      return { type: "keypress", key: "Space", repeat: false }
    case 5:
      return { type: "resize", width: 800 + index, height: 600 + index }
    default:
      return { type: "idle" }
  }
})

export const run = (event: Event) =>
  match(event)
    .with({ type: "click", button: "left" }, ({ x, y }) => x + y)
    .with({ type: "click", button: "right" }, ({ x, y }) => x - y)
    .with({ type: "keypress", key: "Enter" }, () => 10)
    .with({ type: "keypress", key: "Escape" }, ({ repeat }) => repeat ? 20 : 21)
    .with({ type: "keypress", key: "Space" }, () => 30)
    .with({ type: "resize" }, ({ width, height }) => width * height)
    .with({ type: "idle" }, () => 0)
    .exhaustive()
`

const tsPatternModule = tsPattern as Record<string, unknown>

const loadModule = (code: string): BenchModule => {
  const exports: Record<string, unknown> = {}
  const module = { exports }
  const requireShim = (name: string) => {
    if (name === "ts-pattern") return tsPatternModule
    throw new Error(`Unsupported import: ${name}`)
  }

  new Function("require", "exports", "module", code)(
    requireShim,
    exports,
    module,
  )

  const loaded = module.exports as Partial<BenchModule>
  if (!Array.isArray(loaded.inputs) || typeof loaded.run !== "function") {
    throw new Error("Bench module must export inputs and run")
  }
  return loaded as BenchModule
}

const baselineCode = (await transformWithSwcWasm({
  code: source,
  moduleType: "commonjs",
  plugin: false,
})).code
const optimizedCode = (await transformWithSwcWasm({
  code: source,
  moduleType: "commonjs",
  plugin: true,
})).code

if (optimizedCode.includes(".with(")) {
  throw new Error("Optimized code still contains ts-pattern .with() calls")
}

const baseline = loadModule(baselineCode)
const optimized = loadModule(optimizedCode)

if (baseline.inputs.length !== optimized.inputs.length) {
  throw new Error("Input length differs between baseline and optimized modules")
}

const runAll = (module: BenchModule) => {
  let total = 0
  for (const input of module.inputs) total += module.run(input)
  return total
}

const expected = runAll(baseline)
const actual = runAll(optimized)
if (actual !== expected) {
  throw new Error(`Output checksum differs: ${actual} !== ${expected}`)
}

let sink = 0

Deno.bench("ts-pattern runtime", () => {
  sink ^= runAll(baseline)
})

Deno.bench("ts-pattern swc plugin runtime", () => {
  sink ^= runAll(optimized)
})

addEventListener("unload", () => {
  if (sink === Number.NaN) console.error(sink)
})
