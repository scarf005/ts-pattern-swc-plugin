import "./app.css"
import { signal } from "@preact/signals"
import { match, P } from "ts-pattern"

const objectPatternSource = `import { match, P } from "ts-pattern"

type Event =
  | { type: "ok"; value: number }
  | { type: "error"; message: string }
  | { type: "idle" }

export const inputs = [
  { type: "ok", value: 1 },
  { type: "ok", value: 2 },
  { type: "error", message: "failed" },
  { type: "idle" },
] satisfies Event[]

export const run = (event: Event): string =>
  match(event)
    .with({ type: "ok", value: P.number }, ({ value }) => \`ok:\${value}\`)
    .with({ type: "error" }, ({ message }) => \`error:\${message}\`)
    .otherwise(() => "idle")
`

const commonPatterns = [
  {
    id: "object",
    label: "Object ternary",
    source: objectPatternSource,
  },
  {
    id: "switch",
    label: "Switch cases",
    source: `import { match } from "ts-pattern"

type Command = "start" | "stop" | "pause" | "unknown"

export const inputs = ["start", "stop", "pause", "unknown"] satisfies Command[]

export const run = (command: Command): string =>
  match(command)
    .with("start", () => "running")
    .with("stop", "pause", () => "halted")
    .otherwise(() => "ignored")
`,
  },
  {
    id: "array",
    label: "Array pattern",
    source: `import { match, P } from "ts-pattern"

type Point = [number, number] | []

export const inputs = [[1, 2], [3, 4], []] satisfies Point[]

export const run = (point: Point): string =>
  match(point)
    .with([P.number, P.number], ([x, y]) => \`\${x},\${y}\`)
    .otherwise(() => "empty")
`,
  },
  {
    id: "union",
    label: "Union pattern",
    source: `import { match, P } from "ts-pattern"

type Value = string | number | boolean | null

export const inputs = ["a", 1, true, null] satisfies Value[]

export const run = (value: Value): string =>
  match(value)
    .with(P.union(P.string, P.number), () => "scalar")
    .with(P.boolean, () => "flag")
    .otherwise(() => "empty")
`,
  },
  {
    id: "guard",
    label: "Guard pattern",
    source: `import { match, P } from "ts-pattern"

type Item = { count: number }

export const inputs = [{ count: 0 }, { count: 2 }, { count: 10 }] satisfies Item[]

export const run = (item: Item): string =>
  match(item)
    .with({ count: P.number }, ({ count }) => count > 5, () => "many")
    .with({ count: P.number }, () => "some")
    .otherwise(() => "none")
`,
  },
] as const

const DEFAULT_SOURCE = objectPatternSource
const themeStorageKey = "ts-pattern-swc-playground-theme"

type ModuleType = "es6" | "commonjs"
type TransformOptions = {
  code: string
  plugin: boolean
  moduleType: ModuleType
}
type Runnable = (input: unknown) => unknown
type ModuleExports = { run: Runnable; inputs?: unknown[] }
type BenchResult = { ms: number; checksum: number }
type Theme = "white" | "dark"

type PatternId = typeof commonPatterns[number]["id"] | "custom"

const getInitialTheme = (): Theme => {
  try {
    return localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "white"
  } catch {
    return "white"
  }
}

const applyTheme = (value: Theme) => {
  document.documentElement.dataset.theme = value
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")

const tokenClass = (token: string) =>
  /^\/\//.test(token) || /^\/\*/.test(token)
    ? "comment"
    : /^[`"']/.test(token)
    ? "string"
    : /^\d/.test(token)
    ? "number"
    : /^(import|from|type|export|const|let|return|if|else|switch|case|default|with|otherwise|satisfies|true|false|null|undefined|new)$/
        .test(
          token,
        )
    ? "keyword"
    : /^(string|number|boolean|unknown|void)$/.test(token)
    ? "type"
    : "punctuation"

const highlight = (code: string) => {
  const tokenPattern =
    /\/\/.*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:import|from|type|export|const|let|return|if|else|switch|case|default|with|otherwise|satisfies|true|false|null|undefined|new|string|number|boolean|unknown|void)\b|\b\d+(?:\.\d+)?\b|[{}()[\].,:?]/g
  let cursor = 0
  let html = ""
  for (const match of code.matchAll(tokenPattern)) {
    const token = match[0]
    const index = match.index ?? 0
    html += escapeHtml(code.slice(cursor, index))
    html += `<span class="token ${tokenClass(token)}">${
      escapeHtml(token)
    }</span>`
    cursor = index + token.length
  }
  return `${html}${escapeHtml(code.slice(cursor))}`
}

const source = signal(DEFAULT_SOURCE)
const compiled = signal("")
const status = signal("Compiling")
const iterations = signal("100000")
const benchmarkStatus = signal("")
const theme = signal(getInitialTheme())
const selectedPattern = signal<PatternId>("object")
let compileVersion = 0

applyTheme(theme.value)

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

const getModule = (code: string): ModuleExports => {
  const exports: Partial<ModuleExports> = {}
  const requireShim = (name: string) => {
    if (name === "ts-pattern") return { match, P }
    throw new Error(`Unsupported import: ${name}`)
  }
  new Function("require", "exports", code)(requireShim, exports)
  if (typeof exports.run !== "function") {
    throw new Error("export const run = ... is required")
  }
  return {
    run: exports.run,
    inputs: Array.isArray(exports.inputs) ? exports.inputs : undefined,
  }
}

const defaultBenchmarkInputs = [
  { type: "ok", value: 1 },
  { type: "ok", value: 2 },
  { type: "error", message: "failed" },
  { type: "idle" },
]

const score = (value: unknown) =>
  typeof value === "number" ? value : String(value).length

const measure = (
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
    const baseline = getModule(baselineCode)
    const optimized = getModule(compiledCode)
    const inputs = baseline.inputs?.length
      ? baseline.inputs
      : defaultBenchmarkInputs
    for (const input of inputs) {
      if (baseline.run?.(input) !== optimized.run?.(input)) {
        throw new Error("Benchmark outputs differ")
      }
    }
    measure(baseline.run, inputs, 1000)
    measure(optimized.run, inputs, 1000)
    const baselineResult = measure(baseline.run, inputs, count)
    const optimizedResult = measure(optimized.run, inputs, count)
    if (baselineResult.checksum !== optimizedResult.checksum) {
      throw new Error("Benchmark checksums differ")
    }
    benchmarkStatus.value = [
      `ts-pattern: ${baselineResult.ms.toFixed(2)} ms`,
      `compiled: ${optimizedResult.ms.toFixed(2)} ms`,
      `speedup: ${(baselineResult.ms / optimizedResult.ms).toFixed(2)}x`,
    ].join("\n")
  } catch (error) {
    benchmarkStatus.value = error instanceof Error
      ? error.message
      : String(error)
  }
}

const onInput = (event: Event) => {
  source.value = (event.currentTarget as HTMLTextAreaElement).value
  selectedPattern.value = "custom"
  benchmarkStatus.value = ""
  void compileSource(source.value)
}

const onEditorScroll = (event: Event) => {
  const textarea = event.currentTarget as HTMLTextAreaElement
  const backdrop = textarea.previousElementSibling as HTMLElement | null
  if (!backdrop) return
  backdrop.scrollTop = textarea.scrollTop
  backdrop.scrollLeft = textarea.scrollLeft
}

const onIterationsInput = (event: Event) => {
  iterations.value = (event.currentTarget as HTMLInputElement).value
}

const onThemeChange = (event: Event) => {
  const value = (event.currentTarget as HTMLSelectElement).value === "dark"
    ? "dark"
    : "white"
  theme.value = value
  applyTheme(value)
  try {
    localStorage.setItem(themeStorageKey, value)
  } catch {
    return
  }
}

const onPatternChange = (event: Event) => {
  const value = (event.currentTarget as HTMLSelectElement).value as PatternId
  const pattern = commonPatterns.find((item) => item.id === value)
  if (!pattern) return
  selectedPattern.value = pattern.id
  source.value = pattern.source
  benchmarkStatus.value = ""
  void compileSource(pattern.source)
}

void compileSource(DEFAULT_SOURCE)

export const App = () => (
  <main>
    <section class="toolbar">
      <h1>Playground</h1>
      <div class="controls">
        <select value={selectedPattern.value} onChange={onPatternChange}>
          {commonPatterns.map((pattern) => (
            <option key={pattern.id} value={pattern.id}>{pattern.label}</option>
          ))}
          <option value="custom">Custom</option>
        </select>
        <select value={theme.value} onChange={onThemeChange}>
          <option value="white">White</option>
          <option value="dark">Dark</option>
        </select>
        <input
          value={iterations.value}
          onInput={onIterationsInput}
          inputMode="numeric"
        />
        <button type="button" onClick={runBenchmark}>Benchmark</button>
      </div>
    </section>
    <section class="panes">
      <label class="pane">
        <span>TypeScript</span>
        <div class="code-editor">
          <pre
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: `${highlight(source.value)}\n` }}
          />
          <textarea
            value={source.value}
            onInput={onInput}
            onScroll={onEditorScroll}
            spellcheck={false}
          />
        </div>
      </label>
      <label class="pane">
        <span>Compiled JS</span>
        <pre
          class="code-output"
          dangerouslySetInnerHTML={{
            __html: highlight(status.value || compiled.value),
          }}
        />
      </label>
    </section>
    {benchmarkStatus.value && (
      <pre class="benchmark-output">{benchmarkStatus.value}</pre>
    )}
  </main>
)
