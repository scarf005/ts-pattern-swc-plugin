import type { BenchmarkResult, RenderedResult, Renderer, Result } from './runners/types'

export const defaultInput = `[
  // Text branch
  { "type": "ok", "data": { "type": "text", "content": "Hello from ts-pattern" } },
  { "type": "ok", "data": { "type": "img", "src": "https://placehold.co/96x48?text=img" } },
  { "type": "error", "error": { "message": "Network failed" } },
]`

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseResult = (value: unknown): Result => {
  if (!isObject(value) || typeof value.type !== 'string') {
    throw new Error('Each record must be a Result object')
  }

  if (value.type === 'error') {
    const message = isObject(value.error) && typeof value.error.message === 'string'
      ? value.error.message
      : 'Error'
    return { type: 'error', error: new Error(message) }
  }

  if (value.type === 'ok' && isObject(value.data)) {
    if (value.data.type === 'text' && typeof value.data.content === 'string') {
      return { type: 'ok', data: { type: 'text', content: value.data.content } }
    }

    if (value.data.type === 'img' && typeof value.data.src === 'string') {
      return { type: 'ok', data: { type: 'img', src: value.data.src } }
    }
  }

  throw new Error('Expected Result: { type: "ok", data: { type: "text" | "img" } } or { type: "error" }')
}

const stripJsonc = (source: string) => {
  let result = ''
  let inString = false
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      continue
    }

    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1
      result += '\n'
      continue
    }

    if (char === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        result += source[index] === '\n' ? '\n' : ' '
        index += 1
      }
      index += 1
      continue
    }

    result += char
  }

  return result.replace(/,\s*([}\]])/g, '$1')
}

export const parseRecords = (source: string): Result[] => {
  const value = JSON.parse(stripJsonc(source)) as unknown
  if (!Array.isArray(value)) {
    throw new Error('Input must be a JSON array of Result records')
  }
  if (value.length === 0) {
    throw new Error('Input must contain at least one Result record')
  }
  return value.map(parseResult)
}

export const defaultBenchmarkOperations = 100_000

export const parseOperations = (source: string) => {
  const operations = Number(source.replaceAll(',', '').trim())
  if (!Number.isInteger(operations) || operations <= 0) {
    throw new Error('Operations must be a positive integer')
  }
  return operations
}

const nextFrame = async () => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

const checksumFor = (row: RenderedResult) => row.text.length

const benchmarkOrders = (sampleCount: number, runnerCount: number) =>
  Array.from(
    { length: sampleCount },
    (_, sample) => Array.from({ length: runnerCount }, (_, offset) => (sample + offset) % runnerCount),
  )

const median = (results: { elapsedMs: number; checksum: number }[]) =>
  [...results].sort((left, right) => left.elapsedMs - right.elapsedMs)[Math.floor(results.length / 2)]

const runSample = ({
  operations,
  records,
  render,
}: {
  operations: number
  records: Result[]
  render: Renderer
}) => {
  let checksum = 0
  const startedAt = performance.now()

  for (let operation = 0; operation < operations; operation += 1) {
    checksum += checksumFor(render(records[operation % records.length]))
  }

  return { elapsedMs: performance.now() - startedAt, checksum }
}

export const benchmarkRenderer = async ({
  operations,
  records,
  render,
}: {
  operations: number
  records: Result[]
  render: Renderer
}): Promise<BenchmarkResult> => {
  const [result] = await benchmarkRenderers({ operations, records, renders: [render] })
  return result
}

export const benchmarkRenderers = async ({
  operations,
  records,
  renders,
}: {
  operations: number
  records: Result[]
  renders: Renderer[]
}): Promise<BenchmarkResult[]> => {
  await nextFrame()

  const output = renders.map((render) => records.map(render))
  const warmupOperations = Math.min(10_000, Math.max(records.length * 10, Math.floor(operations / 10)))
  const samples = renders.map(() => new Array<{ elapsedMs: number; checksum: number }>())

  for (const order of benchmarkOrders(2, renders.length)) {
    for (const index of order) {
      runSample({ operations: warmupOperations, records, render: renders[index] })
    }
  }

  for (const order of benchmarkOrders(7, renders.length)) {
    for (const index of order) {
      samples[index].push(runSample({ operations, records, render: renders[index] }))
    }
  }

  return renders.map((_, index) => {
    const result = median(samples[index])
    return {
      elapsedMs: result.elapsedMs,
      operations,
      operationsPerSecond: result.elapsedMs === 0 ? 0 : (operations / result.elapsedMs) * 1000,
      checksum: result.checksum,
      output: output[index],
    }
  })
}
