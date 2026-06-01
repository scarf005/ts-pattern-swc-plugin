import { useEffect, useState } from 'react'
import { benchmarkRenderer, defaultInput, parseRecords } from './benchmark'
import { CodeBox } from './CodeBox'
import { JsonTextarea } from './JsonTextarea'
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

const repositoryUrl = 'https://github.com/scarf005/ts-pattern-swc-plugin'
const playgroundUrl = 'https://ts-pattern-swc-plugin.pages.dev/'

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

const throughputComparison = (runner: RunnerState, baseline?: BenchmarkResult) => {
  if (!runner.result || !baseline || runner.id === 'ts-pattern-as-is') return undefined

  const ratio = runner.result.operationsPerSecond / baseline.operationsPerSecond
  const percent = Math.abs((ratio - 1) * 100)
  return {
    className: ratio >= 1 ? 'faster' : 'slower',
    text: `(${percent.toFixed(1)}% ${ratio >= 1 ? 'faster' : 'slower'} than ts-pattern)`,
  }
}

const resultTextFor = (result?: BenchmarkResult) =>
  result ? JSON.stringify(result.output.map(({ text }) => text), null, 2) : ''

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

        const results = await Promise.all(
          runners.map(async (runner) => ({
            ...runner,
            result: await benchmarkRenderer({
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

  const baseline = state.runners.find((runner) => runner.id === 'ts-pattern-as-is')?.result

  return (
    <main>
      <header className="app-header">
        <h1>ts-pattern SWC plugin benchmark</h1>
        <nav aria-label="links">
          <a href={repositoryUrl} rel="noreferrer" target="_blank">
            <svg aria-hidden="true" viewBox="0 0 98 96">
              <path d="M48.85 0C21.9 0 0 22 0 49.1c0 21.7 14 40.1 33.4 46.6 2.45.45 3.35-1.06 3.35-2.38 0-1.17-.04-4.26-.07-8.36-13.59 2.97-16.45-6.58-16.45-6.58-2.22-5.66-5.43-7.17-5.43-7.17-4.44-3.05.34-2.99.34-2.99 4.9.35 7.48 5.06 7.48 5.06 4.36 7.5 11.43 5.33 14.22 4.08.44-3.17 1.7-5.33 3.1-6.56-10.85-1.24-22.26-5.45-22.26-24.26 0-5.36 1.9-9.74 5.03-13.17-.5-1.24-2.18-6.23.48-13 0 0 4.11-1.32 13.45 5.03a46.5 46.5 0 0 1 24.48 0c9.34-6.35 13.44-5.03 13.44-5.03 2.67 6.77.99 11.76.49 13 3.13 3.43 5.02 7.81 5.02 13.17 0 18.86-11.43 23-22.32 24.22 1.75 1.52 3.32 4.52 3.32 9.11 0 6.58-.06 11.88-.06 13.5 0 1.32.88 2.86 3.36 2.37C84 89.17 98 70.77 98 49.1 98 22 76.1 0 48.85 0Z" />
            </svg>
            GitHub
          </a>
          <a href={playgroundUrl} rel="noreferrer" target="_blank">Playground</a>
        </nav>
      </header>

      <div className="layout">
        <section className="left-pane">
          <label className="input-panel">
            <span>Input</span>
            <JsonTextarea label="Input" value={source} onChange={setSource} />
          </label>

          <section className="code-grid" aria-label="matching code">
            <CodeBox code={tsPatternCode} label="ts-pattern code" />
            <CodeBox code={plainSwitchCode} label="plain switch if code" />
          </section>
        </section>

        <section className="right-pane">
          <p className="summary" role="status">
            {state.status === 'running' && 'Running benchmark asynchronously…'}
            {state.status === 'done' &&
              `Parsed ${state.records} records in ${formatMs(state.parseMs)}. Each column ran ${state.runners[0]?.result?.operations.toLocaleString()} operations.`}
            {state.status === 'error' && `Parse error: ${state.message}`}
          </p>

          <section className="runner-list" aria-label="benchmark comparison">
            {state.runners.map((runner) => {
              const comparison = throughputComparison(runner, baseline)

              return (
                <article className="runner-card" key={runner.id}>
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
                          <dd>
                            <span>{formatRate(runner.result.operationsPerSecond)}</span>
                            {comparison && <span className={comparison.className}> {comparison.text}</span>}
                          </dd>
                        </div>
                        <div>
                          <dt>Operations</dt>
                          <dd>{runner.result.operations.toLocaleString()}</dd>
                        </div>
                      </dl>
                      <label className="input-panel">
                        <span>Result</span>
                        <JsonTextarea label={`${runner.title} Result`} readOnly value={resultTextFor(runner.result)} />
                      </label>
                    </>
                  ) : (
                    <p className="pending">Waiting for valid JSON input.</p>
                  )}
                </article>
              )
            })}
          </section>
        </section>
      </div>
    </main>
  )
}

export default App
