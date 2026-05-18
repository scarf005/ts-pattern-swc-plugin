/// <reference lib="deno.ns" />

import { transformWithSwcWasm } from "../web/src/swc-wasm-transform.ts"

const testsRoot = new URL("../vendor/ts-pattern/tests/", import.meta.url)

const rewriteImports = (source: string) =>
  source
    .replaceAll("from '../src';", 'from "ts-pattern";')
    .replaceAll('from "../src";', 'from "ts-pattern";')
    .replaceAll("from '../src/index';", 'from "ts-pattern";')
    .replaceAll('from "../src/index";', 'from "ts-pattern";')

const testFiles = async () => {
  const files: string[] = []
  for await (const entry of Deno.readDir(testsRoot)) {
    if (entry.isFile && entry.name.endsWith(".test.ts")) files.push(entry.name)
  }
  files.sort()
  if (files.length === 0) throw new Error("No vendored ts-pattern tests found")
  return files
}

const files = await testFiles()
const failures: string[] = []

for (const file of files) {
  const url = new URL(file, testsRoot)
  const source = rewriteImports(await Deno.readTextFile(url))
  try {
    await transformWithSwcWasm({
      code: source,
      moduleType: "commonjs",
      plugin: true,
    })
  } catch (error) {
    failures.push(
      `${file}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

if (failures.length > 0) {
  throw new Error(
    `Vendored ts-pattern SWC transform failed:\n${failures.join("\n")}`,
  )
}

console.log(`Transformed ${files.length} vendored ts-pattern test files`)
