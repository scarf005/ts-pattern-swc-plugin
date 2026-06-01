import { useEffect, useState } from 'react'
import { benchmarkRenderer, defaultInput, iterationsFor, parseRecords } from './benchmark'
import { CodeBox } from './CodeBox'
import { renderWithPlainSwitch } from './runners/plain'
import { renderWithTsPatternAsIs } from './runners/ts-pattern-as-is'
import { renderWithTsPatternSwc } from './runners/ts-pattern-swc'
import type { BenchmarkResult, Renderer } from './runners/types'
import { plainSwitchCode, tsPatternCode } from './snippets'
import './App.css'

type Runner = {
  id: string
  title: string
  render: Renderer
}

type RunnerState = Runner & {
  result?: BenchmarkResult
}

type BenchmarkState =
  | { status: 'running'; parseMs?: number; records?: number; runners: RunnerState[] }
  | { status: 'done'; parseMs: number; records: number; runners: RunnerState[] }
  | { status: 'error'; message: string; runners: RunnerState[] }

const runners: Runner[] = [
  {
    id: 'ts-pattern-as-is',
    title: 'ts-pattern AS-IS',
    render: renderWithTsPatternAsIs,
  },
  {
    id: 'ts-pattern-swc',
    title: 'ts-pattern with swc-plugin',
    render: renderWithTsPatternSwc,
  },
  {
    id: 'plain-js',
    title: 'plain JS with switch/if',
    render: renderWithPlainSwitch,
  },
]

const runningState = (): BenchmarkState => ({ status: 'running', runners })

const formatMs = (value: number) => `${value.toFixed(2)} ms`
const formatRate = (value: number) => `${Math.round(value).toLocaleString()} ops/s`

function App() {
  const [source, setSource] = useState(defaultInput)
  const [state, setState] = useState<BenchmarkState>(() => runningState())

  useEffect(() => {
    let cancelled = false

    const timeout = window.setTimeout(async () => {
      setState(runningState())
      try {
        const parseStartedAt = performance.now()
        const records = parseRecords(source)
        const parseMs = performance.now() - parseStartedAt
        const iterations = iterationsFor(records.length)

        const results = await Promise.all(
          runners.map(async (runner) => ({
            ...runner,
            result: await benchmarkRenderer({
              iterations,
              records,
              render: runner.render,
            }),
          })),
        )

        if (!cancelled) {
          setState({ status: 'done', parseMs, records: records.length, runners: results })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
            runners,
          })
        }
      }
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [source])

  return (
    <main>
      <h1>ts-pattern SWC plugin benchmark</h1>

      <label className="input-panel">
        <span>JSON Result records to parse and render</span>
        <textarea
          aria-label="JSON Result records to parse and render"
          spellCheck={false}
          value={source}
          onChange={(event) => setSource(event.currentTarget.value)}
        />
      </label>

      <p className="summary" role="status">
        {state.status === 'running' && 'Running benchmark asynchronously…'}
        {state.status === 'done' &&
          `Parsed ${state.records} records in ${formatMs(state.parseMs)}. Each column ran ${state.runners[0]?.result?.iterations.toLocaleString()} iterations.`}
        {state.status === 'error' && `Parse error: ${state.message}`}
      </p>

      <section className="code-grid" aria-label="matching code">
        <CodeBox code={tsPatternCode} label="ts-pattern code" />
        <CodeBox code={plainSwitchCode} label="plain switch if code" />
      </section>

      <section className="columns" aria-label="benchmark comparison">
        {state.runners.map((runner) => (
          <article className="column" key={runner.id}>
            <h2>{runner.title}</h2>
            {runner.result ? (
              <>
                <dl>
                  <div>
                    <dt>Time</dt>
                    <dd>{formatMs(runner.result.elapsedMs)}</dd>
                  </div>
                  <div>
                    <dt>Throughput</dt>
                    <dd>{formatRate(runner.result.operationsPerSecond)}</dd>
                  </div>
                  <div>
                    <dt>Operations</dt>
                    <dd>{runner.result.operations.toLocaleString()}</dd>
                  </div>
                </dl>
                <div className="output-list">
                  {runner.result.output.map(({ html, text }, index) => (
                    <div className="output-item" key={`${runner.id}-${index}-${text}`}>
                      {html}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="pending">Waiting for valid JSON input.</p>
            )}
          </article>
        ))}
      </section>
    </main>
  )
}

export default App
