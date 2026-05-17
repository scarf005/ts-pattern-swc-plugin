/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"
import {
  benchmarkInputsEqual,
  benchmarkModules,
  benchmarkOrder,
  type BenchResult,
  formatBenchmarkComparison,
  getBenchmarkSink,
  measure,
} from "./benchmark.ts"

Deno.test("benchmarkOrder alternates execution order", () => {
  assertEquals(benchmarkOrder(5), [
    ["baseline", "optimized"],
    ["optimized", "baseline"],
    ["baseline", "optimized"],
    ["optimized", "baseline"],
    ["baseline", "optimized"],
  ])
})

Deno.test("benchmarkInputsEqual compares formatted values", () => {
  assertEquals(
    benchmarkInputsEqual([1n, new Set([1, 2])], [1n, new Set([1, 2])]),
    true,
  )
  assertEquals(benchmarkInputsEqual([1], [2]), false)
})

Deno.test("measure times run(input) without formatting results", () => {
  const result = {
    toString: () => {
      throw new Error("should not format")
    },
  }
  const bench = measure(() => result, [1], 3)

  assertEquals(typeof bench.ms, "number")
  assertEquals(getBenchmarkSink(), result)
})

Deno.test("benchmarkModules reports identical generated code", () => {
  const run = (input: unknown) => input
  const result = benchmarkModules({
    baseline: { code: "same", run, inputs: [1] },
    optimized: { code: "same", run, inputs: [1] },
    count: 10,
  })

  assertEquals(result, {
    identicalCode: true,
    note: "Generated code is identical. No SWC optimization was applied.",
  })
})

Deno.test("formatBenchmarkComparison labels samples and iterations", () => {
  assertEquals(
    formatBenchmarkComparison({
      identicalCode: false,
      baseline: { ms: 94 },
      optimized: { ms: 2 },
      speedup: 47,
      sampleCount: 7,
    }, {
      count: 100000,
      inputCount: 3,
      runtimeLabel: "browser benchmark",
    }),
    [
      "browser benchmark: 7 samples × 100000 iterations/sample",
      "inputs: 3 values, cycled during each sample",
      "ts-pattern: 94.00 ms/sample (0.940 µs/iteration)",
      "compiled: 2.00 ms/sample (0.020 µs/iteration)",
      "ts-pattern SWC plugin: 47.00x faster than ts-pattern",
    ].join("\n"),
  )
})

Deno.test("benchmarkModules uses alternating samples and median", () => {
  const baselineRun = (input: unknown) => input
  const optimizedRun = (input: unknown) => input
  const calls: string[] = []
  const times = {
    baseline: [50, 30, 20, 10, 40],
    optimized: [35, 25, 15, 5, 45],
  }
  const measureFn = (run: typeof baselineRun): BenchResult => {
    const key = run === baselineRun ? "baseline" : "optimized"
    calls.push(key)
    return { ms: times[key].shift() ?? 0 }
  }

  const result = benchmarkModules({
    baseline: { code: "baseline", run: baselineRun, inputs: [1] },
    optimized: { code: "optimized", run: optimizedRun, inputs: [1] },
    count: 10,
    sampleCount: 3,
    warmupCount: 1,
    measureFn,
  })

  assertEquals(calls, [
    "baseline",
    "optimized",
    "optimized",
    "baseline",
    "baseline",
    "optimized",
    "optimized",
    "baseline",
    "baseline",
    "optimized",
  ])
  assertEquals(result, {
    identicalCode: false,
    baseline: { ms: 20 },
    optimized: { ms: 15 },
    speedup: 20 / 15,
    sampleCount: 3,
  })
})
