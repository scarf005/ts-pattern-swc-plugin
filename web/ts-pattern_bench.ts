/// <reference lib="deno.ns" />

import { formatValue, getModule, type ModuleExports } from "./src/runtime.ts"
import { pluginPath, transformWithSwcWasm } from "./src/swc-wasm-transform.ts"

type BenchExample = {
  id: string
  baseline: Required<ModuleExports>
  optimized: Required<ModuleExports>
}

const examplesRoot = new URL("../examples/", import.meta.url)

const getExampleNames = async () => {
  const names: string[] = []
  for await (const entry of Deno.readDir(examplesRoot)) {
    if (entry.isFile && entry.name.endsWith(".ts")) names.push(entry.name)
  }
  names.sort()
  if (names.length === 0) throw new Error("No examples found")
  return names
}

const transformExample = async (source: string, options: { plugin: boolean }) =>
  getModule(
    (await transformWithSwcWasm({
      code: source,
      moduleType: "commonjs",
      plugin: options.plugin,
    })).code,
  )

const loadExample = async (name: string): Promise<BenchExample> => {
  const source = await Deno.readTextFile(new URL(name, examplesRoot))
  const [baseline, optimized] = await Promise.all([
    transformExample(source, { plugin: false }),
    transformExample(source, { plugin: true }),
  ])

  if (!baseline.inputs?.length) throw new Error(`${name}: missing inputs`)
  if (!optimized.inputs?.length) {
    throw new Error(`${name}: missing optimized inputs`)
  }
  if (baseline.inputs.length !== optimized.inputs.length) {
    throw new Error(`${name}: input length differs`)
  }

  for (const [index, baselineInput] of baseline.inputs.entries()) {
    const optimizedInput = optimized.inputs[index]
    if (formatValue(baselineInput) !== formatValue(optimizedInput)) {
      throw new Error(`${name}: input ${index} differs`)
    }
    if (
      formatValue(baseline.run(baselineInput)) !==
        formatValue(optimized.run(optimizedInput))
    ) {
      throw new Error(`${name}: output ${index} differs`)
    }
  }

  return {
    id: name.replace(/\.ts$/, ""),
    baseline: { run: baseline.run, inputs: baseline.inputs },
    optimized: { run: optimized.run, inputs: optimized.inputs },
  }
}

const createRunner = (module: Required<ModuleExports>) => {
  let index = 0
  return () => {
    const input = module.inputs[index]
    index = (index + 1) % module.inputs.length
    return module.run(input)
  }
}

await Deno.stat(pluginPath)
const examples = await Promise.all((await getExampleNames()).map(loadExample))

let sink: unknown

for (const example of examples) {
  const runBaseline = createRunner(example.baseline)
  const runOptimized = createRunner(example.optimized)

  Deno.bench({
    name: "ts-pattern runtime",
    group: example.id,
  }, () => {
    sink = runBaseline()
  })

  Deno.bench({
    name: "ts-pattern swc plugin runtime",
    group: example.id,
    baseline: true,
  }, () => {
    sink = runOptimized()
  })
}

addEventListener("unload", () => {
  if (Object.is(sink, globalThis)) console.error(sink)
})
