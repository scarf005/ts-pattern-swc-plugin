/// <reference types="vite/client" />

import "./app.css"
import { signal } from "@preact/signals"
import { useEffect, useRef } from "preact/hooks"
import { match, P } from "ts-pattern"
import initSwc, { transform } from "@swc/wasm-web"
import swcWasmUrl from "@swc/wasm-web/wasm_bg.wasm?url"
import * as monaco from "monaco-editor/esm/vs/editor/editor.api"
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution"
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution"
import * as tsRuntime from "monaco-editor/esm/vs/language/typescript/monaco.contribution"
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"

type MonacoTypeScript =
  typeof import("monaco-editor/esm/vs/editor/editor.main").typescript

const ts = tsRuntime as unknown as MonacoTypeScript
const monacoGlobals = globalThis as typeof globalThis & {
  MonacoEnvironment?: monaco.Environment
}

monacoGlobals.MonacoEnvironment = {
  getWorker: (_workerId, label) =>
    label === "typescript" || label === "javascript"
      ? new TsWorker()
      : new EditorWorker(),
}

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
const tsPatternTypes = import.meta.glob<string>(
  "/node_modules/ts-pattern/dist/**/*.d.ts",
  { eager: true, query: "?raw", import: "default" },
)

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

type TypeScriptEditorProps = {
  value: string
  theme: Theme
  onChange: (value: string) => void
}

type CodeViewerProps = {
  value: string
  theme: Theme
}

const getInitialTheme = (): Theme => {
  try {
    return localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "white"
  } catch {
    return "white"
  }
}

const applyTheme = (value: Theme) => {
  document.documentElement.dataset.theme = value
  monaco.editor.setTheme(value === "dark" ? "vs-dark" : "vs")
}

const configureTypeScript = () => {
  ts.typescriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
  })
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  })
  for (const [path, content] of Object.entries(tsPatternTypes)) {
    ts.typescriptDefaults.addExtraLib(
      content,
      `file:///node_modules/ts-pattern/dist/${path.split("/dist/")[1]}`,
    )
  }
  ts.typescriptDefaults.addExtraLib(
    'export * from "./dist/index"',
    "file:///node_modules/ts-pattern/index.d.ts",
  )
}

configureTypeScript()

const swcReady = initSwc({ module_or_path: swcWasmUrl })

const findMatch = (source: string, openIndex: number) => {
  let depth = 0
  let quote = ""
  let escaped = false
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      escaped = !escaped && char === "\\"
      if (!escaped && char === quote) quote = ""
      if (char !== "\\") escaped = false
      continue
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char
      continue
    }
    if (char === "(" || char === "{" || char === "[") depth += 1
    if (char === ")" || char === "}" || char === "]") depth -= 1
    if (depth === 0) return index
  }
  return -1
}

const splitTopLevel = (value: string) => {
  const parts: string[] = []
  let depth = 0
  let quote = ""
  let escaped = false
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (quote) {
      escaped = !escaped && char === "\\"
      if (!escaped && char === quote) quote = ""
      if (char !== "\\") escaped = false
      continue
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char
      continue
    }
    if (char === "(" || char === "{" || char === "[") depth += 1
    if (char === ")" || char === "}" || char === "]") depth -= 1
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

const propExpr = (input: string, key: string) =>
  /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${input}.${key}`
    : `${input}[${JSON.stringify(key)}]`

const patternTest = (input: string, pattern: string): string => {
  const trimmed = pattern.trim()
  if (trimmed.startsWith("P.union(") && trimmed.endsWith(")")) {
    return splitTopLevel(trimmed.slice(8, -1))
      .map((item) => patternTest(input, item))
      .join(" || ")
  }
  if (trimmed === "P.string") return `typeof ${input} === "string"`
  if (trimmed === "P.number") return `typeof ${input} === "number"`
  if (trimmed === "P.boolean") return `typeof ${input} === "boolean"`
  if (trimmed === "P.bigint") return `typeof ${input} === "bigint"`
  if (trimmed === "P.symbol") return `typeof ${input} === "symbol"`
  if (trimmed === "P._") return "true"
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const entries = splitTopLevel(trimmed.slice(1, -1))
      .map((entry) =>
        entry.split(/:(.*)/s).slice(0, 2).map((item) => item.trim())
      )
      .filter((entry) => entry.length === 2)
    return [
      `${input} !== null && typeof ${input} === "object"`,
      ...entries.map(([key, value]) =>
        patternTest(propExpr(input, key.replace(/^['\"]|['\"]$/g, "")), value)
      ),
    ].join(" && ")
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const items = splitTopLevel(trimmed.slice(1, -1))
    return [
      `Array.isArray(${input})`,
      `${input}.length === ${items.length}`,
      ...items.map((item, index) => patternTest(`${input}[${index}]`, item)),
    ].join(" && ")
  }
  return `${input} === ${trimmed}`
}

const arrowBody = (handler: string) => {
  const arrow = handler.indexOf("=>")
  if (arrow === -1) return undefined
  const params = handler.slice(0, arrow).trim()
  const body = handler.slice(arrow + 2).trim()
  return { params, body }
}

const handlerResult = (handler: string, input: string) => {
  const arrow = arrowBody(handler)
  if (!arrow) return `(${handler})(${input})`
  if (arrow.params === "()" && !arrow.body.startsWith("{")) return arrow.body
  return `(${handler})(${input})`
}

const guardResult = (guard: string, input: string) => {
  const arrow = arrowBody(guard)
  return arrow ? `(${guard})(${input})` : `${guard}(${input})`
}

const isLiteralPattern = (pattern: string) =>
  /^(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|-?\d+(?:\.\d+)?|true|false|null)$/
    .test(pattern.trim())

const isSafeInput = (input: string) =>
  /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(input.trim())

const compileMatch = (
  input: string,
  withArgs: string[][],
  fallback: string,
) => {
  const arms = withArgs.map((args) => ({
    patterns: args.slice(0, args.length >= 3 ? -2 : -1),
    guard: args.length >= 3 ? args.at(-2) : undefined,
    handler: args.at(-1) ?? "() => undefined",
  }))
  const inputExpr = input.trim()
  if (arms.every((arm) => !arm.guard && arm.patterns.every(isLiteralPattern))) {
    return `(()=>{switch(${inputExpr}){${
      arms.map((arm) =>
        `${arm.patterns.map((pattern) => `case ${pattern}:`).join("")}return ${
          handlerResult(arm.handler, inputExpr)
        };`
      ).join("")
    }default:return ${handlerResult(fallback, inputExpr)};}})()`
  }
  const value = isSafeInput(inputExpr) ? inputExpr : "_tsPatternInput"
  const ternary = arms.reduceRight(
    (alternate, arm) => {
      const test = arm.patterns.map((pattern) => patternTest(value, pattern))
        .join(" || ")
      const guarded = arm.guard
        ? `${test} && ${guardResult(arm.guard, value)}`
        : test
      return `${guarded} ? ${handlerResult(arm.handler, value)} : ${alternate}`
    },
    handlerResult(fallback, value),
  )
  return value === inputExpr
    ? ternary
    : `(()=>{const ${value}=${inputExpr};return ${ternary};})()`
}

const skipWhitespace = (value: string, index: number) => {
  while (/\s/.test(value[index] ?? "")) index += 1
  return index
}

const transformTsPatternSource = (code: string) => {
  let output = ""
  let cursor = 0
  while (true) {
    const matchIndex = code.indexOf("match(", cursor)
    if (matchIndex === -1) return output + code.slice(cursor)
    const inputStart = matchIndex + "match".length
    const inputEnd = findMatch(code, inputStart)
    if (inputEnd === -1) return output + code.slice(cursor)
    let chainCursor = skipWhitespace(code, inputEnd + 1)
    const withArgs: string[][] = []
    while (code.startsWith(".with(", chainCursor)) {
      const argsStart = chainCursor + ".with".length
      const argsEnd = findMatch(code, argsStart)
      if (argsEnd === -1) return output + code.slice(cursor)
      withArgs.push(splitTopLevel(code.slice(argsStart + 1, argsEnd)))
      chainCursor = skipWhitespace(code, argsEnd + 1)
    }
    if (!code.startsWith(".otherwise(", chainCursor) || withArgs.length === 0) {
      output += code.slice(cursor, chainCursor)
      cursor = chainCursor
      continue
    }
    const fallbackStart = chainCursor + ".otherwise".length
    const fallbackEnd = findMatch(code, fallbackStart)
    if (fallbackEnd === -1) return output + code.slice(cursor)
    const fallback = code.slice(fallbackStart + 1, fallbackEnd).trim()
    output += code.slice(cursor, matchIndex)
    output += compileMatch(
      code.slice(inputStart + 1, inputEnd),
      withArgs,
      fallback,
    )
    cursor = fallbackEnd + 1
  }
}

const source = signal(DEFAULT_SOURCE)
const compiled = signal("")
const status = signal("Compiling")
const iterations = signal("100000")
const benchmarkStatus = signal("")
const runStatus = signal("")
const theme = signal(getInitialTheme())
const selectedPattern = signal<PatternId>("object")
let compileVersion = 0

applyTheme(theme.value)

const transformSource = async (options: TransformOptions) => {
  await swcReady
  const result = await transform(
    options.plugin ? transformTsPatternSource(options.code) : options.code,
    {
      filename: "input.ts",
      sourceMaps: false,
      jsc: {
        parser: { syntax: "typescript", tsx: false },
        target: "es2022",
      },
      module: { type: options.moduleType },
    },
  )
  return result.code
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

const runCurrent = async () => {
  runStatus.value = "Running"
  try {
    const code = await transformSource({
      code: source.value,
      plugin: true,
      moduleType: "commonjs",
    })
    const module = getModule(code)
    const inputs = module.inputs?.length
      ? module.inputs
      : defaultBenchmarkInputs
    runStatus.value = inputs
      .map((input) =>
        `${JSON.stringify(input)} => ${JSON.stringify(module.run(input))}`
      )
      .join("\n")
  } catch (error) {
    runStatus.value = error instanceof Error ? error.message : String(error)
  }
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
      if (baseline.run(input) !== optimized.run(input)) {
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

const onEditorChange = (value: string) => {
  source.value = value
  selectedPattern.value = "custom"
  benchmarkStatus.value = ""
  runStatus.value = ""
  void compileSource(value)
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
  runStatus.value = ""
  void compileSource(pattern.source)
}

const TypeScriptEditor = (
  { value, theme, onChange }: TypeScriptEditorProps,
) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)

  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return
    const model = monaco.editor.createModel(
      value,
      "typescript",
      monaco.Uri.parse("file:///playground.ts"),
    )
    const editor = monaco.editor.create(hostRef.current, {
      automaticLayout: true,
      fontFamily:
        "Sarasa Mono K Nerd Font, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 14,
      minimap: { enabled: false },
      model,
      scrollBeyondLastLine: false,
      tabSize: 2,
      theme: theme === "dark" ? "vs-dark" : "vs",
    })
    editorRef.current = editor
    const subscription = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue())
    })
    return () => {
      subscription.dispose()
      editor.dispose()
      model.dispose()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || editor.getValue() === value) return
    editor.setValue(value)
  }, [value])

  useEffect(() => {
    monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs")
  }, [theme])

  return <div class="monaco-host" ref={hostRef} />
}

const CodeViewer = ({ value, theme }: CodeViewerProps) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const model = monaco.editor.createModel(
      value,
      "javascript",
      monaco.Uri.parse("file:///compiled.js"),
    )
    const editor = monaco.editor.create(hostRef.current, {
      automaticLayout: true,
      fontFamily:
        "Sarasa Mono K Nerd Font, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 14,
      minimap: { enabled: false },
      model,
      readOnly: true,
      scrollBeyondLastLine: false,
      tabSize: 2,
      theme: theme === "dark" ? "vs-dark" : "vs",
    })
    editorRef.current = editor
    return () => {
      editor.dispose()
      model.dispose()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || editor.getValue() === value) return
    editor.setValue(value)
  }, [value])

  useEffect(() => {
    monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs")
  }, [theme])

  return <div class="monaco-host" ref={hostRef} />
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
        <button type="button" onClick={runCurrent}>Run</button>
        <button type="button" onClick={runBenchmark}>Benchmark</button>
      </div>
    </section>
    <section class="panes">
      <label class="pane">
        <span>TypeScript</span>
        <TypeScriptEditor
          value={source.value}
          theme={theme.value}
          onChange={onEditorChange}
        />
      </label>
      <label class="pane">
        <span>Compiled JS</span>
        <CodeViewer
          value={status.value || compiled.value}
          theme={theme.value}
        />
      </label>
    </section>
    {runStatus.value && <pre class="run-output">{runStatus.value}</pre>}
    {benchmarkStatus.value && (
      <pre class="benchmark-output">{benchmarkStatus.value}</pre>
    )}
  </main>
)
