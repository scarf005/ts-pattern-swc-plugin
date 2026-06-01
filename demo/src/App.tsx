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
    text: `${percent.toFixed(1)}% ${ratio >= 1 ? 'faster' : 'slower'} than ts-pattern`,
  }
}

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
            <svg aria-hidden="true" viewBox="0 0 16 16">
              <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.49c-2.25.49-2.73-.96-2.73-.96-.36-.93-.9-1.18-.9-1.18-.74-.5.06-.49.06-.49.81.06 1.24.84 1.24.84.73 1.24 1.9.88 2.36.67.07-.52.28-.88.51-1.08-1.79-.2-3.68-.9-3.68-3.99 0-.88.31-1.6.83-2.17-.08-.2-.36-1.03.08-2.14 0 0 .68-.22 2.22.83A7.66 7.66 0 0 1 8 2.78c.69 0 1.37.09 2.02.27 1.54-1.05 2.22-.83 2.22-.83.44 1.11.16 1.94.08 2.14.52.57.83 1.29.83 2.17 0 3.1-1.89 3.78-3.69 3.98.29.25.55.74.55 1.5v2.2c0 .21.15.46.56.38A8 8 0 0 0 8 0Z" />
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
                            {comparison && <span className={comparison.className}>{comparison.text}</span>}
                          </dd>
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
              )
            })}
          </section>
        </section>
      </div>
    </main>
  )
}

export default App
