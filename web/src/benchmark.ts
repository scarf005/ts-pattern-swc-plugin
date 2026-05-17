import { formatValue, type Runnable } from "./runtime.ts"

export type BenchResult = { ms: number; checksum: number }
export type BenchmarkModule = { code: string; run: Runnable; inputs: unknown[] }
export type BenchmarkComparison =
  | {
    identicalCode: true
    note: string
  }
  | {
    identicalCode: false
    baseline: BenchResult
    optimized: BenchResult
    speedup: number
    sampleCount: number
  }

type BenchmarkOrder = "baseline" | "optimized"
type MeasureFn = (
  run: Runnable,
  inputs: unknown[],
  count: number,
) => BenchResult

const score = (value: unknown) =>
  typeof value === "number" ? value : String(value).length

export const measure = (
  run: Runnable,
  inputs: unknown[],
  count: number,
): BenchResult => {
  let checksum = 0
  const start = performance.now()
  for (let index = 0; index < count; index += 1) {
    checksum += score(run(inputs[index % inputs.length]))
  }
  return { ms: performance.now() - start, checksum }
}

export const benchmarkOrder = (sampleCount: number): BenchmarkOrder[][] =>
  Array.from(
    { length: sampleCount },
    (_, index) =>
      index % 2 === 0 ? ["baseline", "optimized"] : ["optimized", "baseline"],
  )

const median = (results: BenchResult[]): BenchResult =>
  [...results].sort((left, right) => left.ms - right.ms)[
    Math.floor(results.length / 2)
  ]

export const benchmarkModules = (
  options: {
    baseline: BenchmarkModule
    optimized: BenchmarkModule
    count: number
    sampleCount?: number
    warmupCount?: number
    measureFn?: MeasureFn
  },
): BenchmarkComparison => {
  const measureFn = options.measureFn ?? measure
  const sampleCount = Math.max(3, options.sampleCount ?? 7)
  const warmupCount = Math.max(
    1,
    options.warmupCount ??
      Math.min(10000, Math.max(1000, Math.floor(options.count / 10))),
  )

  if (options.baseline.code === options.optimized.code) {
    return {
      identicalCode: true,
      note: "Generated code is identical. No SWC optimization was applied.",
    }
  }

  const baselineResults: BenchResult[] = []
  const optimizedResults: BenchResult[] = []

  for (const order of benchmarkOrder(2)) {
    for (const target of order) {
      const module = target === "baseline"
        ? options.baseline
        : options.optimized
      measureFn(module.run, module.inputs, warmupCount)
    }
  }

  for (const order of benchmarkOrder(sampleCount)) {
    for (const target of order) {
      const module = target === "baseline"
        ? options.baseline
        : options.optimized
      const result = measureFn(module.run, module.inputs, options.count)
      if (target === "baseline") baselineResults.push(result)
      else optimizedResults.push(result)
    }
  }

  const baseline = median(baselineResults)
  const optimized = median(optimizedResults)

  if (baseline.checksum !== optimized.checksum) {
    throw new Error("Benchmark checksums differ")
  }

  return {
    identicalCode: false,
    baseline,
    optimized,
    speedup: baseline.ms / optimized.ms,
    sampleCount,
  }
}

export const benchmarkInputsEqual = (
  baselineInputs: unknown[],
  optimizedInputs: unknown[],
): boolean =>
  baselineInputs.length === optimizedInputs.length &&
  baselineInputs.every((input, index) =>
    formatValue(input) === formatValue(optimizedInputs[index])
  )
