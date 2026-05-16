import "./app.css"
import { signal } from "@preact/signals"
import { match, P } from "ts-pattern"

const DEFAULT_SOURCE = `import { match, P } from "ts-pattern"

type Event =
  | { type: "ok"; value: number }
  | { type: "error"; message: string }
  | { type: "idle" }

export const run = (event: Event): string =>
  match(event)
    .with({ type: "ok", value: P.number }, ({ value }) => \`ok:\${value}\`)
    .with({ type: "error" }, ({ message }) => \`error:\${message}\`)
    .otherwise(() => "idle")
`

type ModuleType = "es6" | "commonjs"
type TransformOptions = {
  code: string
  plugin: boolean
  moduleType: ModuleType
}
type Runnable = (input: unknown) => unknown
type BenchResult = { ms: number; checksum: number }

const source = signal(DEFAULT_SOURCE)
const compiled = signal("")
const status = signal("Compiling")
const iterations = signal("100000")
const benchmarkStatus = signal("")
let compileVersion = 0

const transformSource = async (options: TransformOptions) => {
  const response = await fetch("/api/transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  })
  const payload = await response.json() as { code?: string; error?: string }
  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? "Transform failed")
  }
  return payload.code ?? ""
}

const compileSource = async (code: string) => {
  const version = ++compileVersion
  status.value = "Compiling"
  try {
    const output = await transformSource({
      code,
      plugin: true,
      moduleType: "es6",
    })
    if (version !== compileVersion) return
    compiled.value = output
    status.value = ""
  } catch (error) {
    if (version !== compileVersion) return
    compiled.value = ""
    status.value = error instanceof Error ? error.message : String(error)
  }
}

const getRun = (code: string): Runnable => {
  const exports: { run?: Runnable } = {}
  const requireShim = (name: string) => {
    if (name === "ts-pattern") return { match, P }
    throw new Error(`Unsupported import: ${name}`)
  }
  new Function("require", "exports", code)(requireShim, exports)
  if (typeof exports.run !== "function") {
    throw new Error("export const run = ... is required")
  }
  return exports.run
}

const benchmarkInputs = [
  { type: "ok", value: 1 },
  { type: "ok", value: 2 },
  { type: "error", message: "failed" },
  { type: "idle" },
]

const score = (value: unknown) =>
  typeof value === "number" ? value : String(value).length

const measure = (run: Runnable, count: number): BenchResult => {
  let checksum = 0
  const start = performance.now()
  for (let index = 0; index < count; index += 1) {
    checksum += score(run(benchmarkInputs[index % benchmarkInputs.length]))
  }
  return { ms: performance.now() - start, checksum }
}

const runBenchmark = async () => {
  benchmarkStatus.value = "Running"
  try {
    const count = Math.max(1, Math.floor(Number(iterations.value)))
    const [baselineCode, compiledCode] = await Promise.all([
      transformSource({
        code: source.value,
        plugin: false,
        moduleType: "commonjs",
      }),
      transformSource({
        code: source.value,
        plugin: true,
        moduleType: "commonjs",
      }),
    ])
    const baselineRun = getRun(baselineCode)
    const compiledRun = getRun(compiledCode)
    for (const input of benchmarkInputs) {
      if (baselineRun(input) !== compiledRun(input)) {
        throw new Error("Benchmark outputs differ")
      }
    }
    measure(baselineRun, 1000)
    measure(compiledRun, 1000)
    const baseline = measure(baselineRun, count)
    const optimized = measure(compiledRun, count)
    if (baseline.checksum !== optimized.checksum) {
      throw new Error("Benchmark checksums differ")
    }
    benchmarkStatus.value = [
      `ts-pattern: ${baseline.ms.toFixed(2)} ms`,
      `compiled: ${optimized.ms.toFixed(2)} ms`,
      `speedup: ${(baseline.ms / optimized.ms).toFixed(2)}x`,
    ].join("\n")
  } catch (error) {
    benchmarkStatus.value = error instanceof Error
      ? error.message
      : String(error)
  }
}

const onInput = (event: Event) => {
  source.value = (event.currentTarget as HTMLTextAreaElement).value
  void compileSource(source.value)
}

const onIterationsInput = (event: Event) => {
  iterations.value = (event.currentTarget as HTMLInputElement).value
}

void compileSource(DEFAULT_SOURCE)

export const App = () => (
  <main>
    <section class="toolbar">
      <h1>Playground</h1>
      <div class="benchmark">
        <input
          value={iterations.value}
          onInput={onIterationsInput}
          inputMode="numeric"
        />
        <button type="button" onClick={runBenchmark}>Benchmark</button>
      </div>
    </section>
    <section class="panes">
      <label>
        <span>TypeScript</span>
        <textarea value={source.value} onInput={onInput} spellcheck={false} />
      </label>
      <label>
        <span>Compiled JS</span>
        <pre>{status.value || compiled.value}</pre>
      </label>
    </section>
    {benchmarkStatus.value && (
      <pre class="benchmark-output">{benchmarkStatus.value}</pre>
    )}
  </main>
)
