/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"
import { fromFileUrl } from "jsr:@std/path/from-file-url"
import { transform } from "@swc/core"
import { formatValue, getModule } from "./runtime.ts"

const pluginPath = fromFileUrl(
  new URL(
    "../../plugin/target/wasm32-wasip1/release/ts_pattern_swc_plugin.wasm",
    import.meta.url,
  ),
)
const examplesRoot = new URL("../../examples/", import.meta.url)

const transformExample = async (
  source: string,
  options: { plugin: boolean },
) =>
  getModule(
    (await transform(source, {
      filename: "input.ts",
      sourceMaps: false,
      jsc: {
        parser: { syntax: "typescript", tsx: false },
        target: "es2022",
        experimental: {
          plugins: options.plugin ? [[pluginPath, {}]] : [],
        },
      },
      module: { type: "commonjs" },
    })).code,
  )

Deno.test("formatValue formats playground runtime values", () => {
  assertEquals(formatValue(20n), "20n")
  assertEquals(formatValue(Symbol.for("ok")), "Symbol(ok)")
  assertEquals(formatValue(new Set([1, "a"])), 'Set(2) { 1, "a" }')
  assertEquals(
    formatValue(new Map([["a", 1]])),
    'Map(1) { "a" => 1 }',
  )
})

Deno.test("all examples run in the playground runtime", async () => {
  await Deno.stat(pluginPath)

  const names: string[] = []
  for await (const entry of Deno.readDir(examplesRoot)) {
    if (entry.isFile && entry.name.endsWith(".ts")) names.push(entry.name)
  }
  names.sort()
  assert(names.length > 0)

  for (const name of names) {
    const source = await Deno.readTextFile(new URL(name, examplesRoot))
    const [baseline, optimized] = await Promise.all([
      transformExample(source, { plugin: false }),
      transformExample(source, { plugin: true }),
    ])

    assert(baseline.inputs?.length, `${name}: missing baseline inputs`)
    assert(optimized.inputs?.length, `${name}: missing optimized inputs`)
    assertEquals(
      baseline.inputs.length,
      optimized.inputs.length,
      `${name}: input length differs`,
    )

    for (const [index, baselineInput] of baseline.inputs.entries()) {
      const optimizedInput = optimized.inputs[index]
      assertEquals(
        formatValue(baselineInput),
        formatValue(optimizedInput),
        `${name}: input ${index} differs`,
      )
      assertEquals(
        formatValue(baseline.run(baselineInput)),
        formatValue(optimized.run(optimizedInput)),
        `${name}: output ${index} differs`,
      )
    }
  }
})
