import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url))

const result = await build({
  root,
  configFile,
  build: {
    write: false,
  },
})

const outputs = Array.isArray(result) ? result.flatMap(({ output }) => output) : result.output
const code = outputs
  .filter((output) => output.type === 'chunk')
  .map((output) => output.code)
  .join('\n')

const rawSourceIndex = code.indexOf("import { match, P } from 'ts-pattern'")
assert.notEqual(rawSourceIndex, -1, 'expected source code pane raw string in build output')

const runtimeCode = code.slice(0, rawSourceIndex)

assert.match(
  runtimeCode,
  /switch\([^)]*\.type\)\{case[`'"]error[`'"][\s\S]*case[`'"]ok[`'"]:[\s\S]*=\w+\.data;[\s\S]*switch\([^)]*\.type\)\{case[`'"]text[`'"][\s\S]*case[`'"]img[`'"][\s\S]*[`'"]src[`'"]in/,
  'expected built ts-pattern runner to contain optimized nested switch code',
)
assert.match(runtimeCode, /throw new \w+\(\w+\)/, 'expected built ts-pattern runner to preserve exhaustive failure behavior')
assert.doesNotMatch(runtimeCode, /match\([^)]*\)\.with/, 'runtime build output must not execute ts-pattern match chains')
