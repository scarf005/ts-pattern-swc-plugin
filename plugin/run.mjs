#!/usr/bin/env node
import "./register.mjs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const isDeno = typeof Deno !== "undefined"
const args = isDeno ? Deno.args : process.argv.slice(2)
const [entry, ...entryArgs] = args

if (!entry || entry === "-h" || entry === "--help") {
  console.error("Usage: ts-pattern-swc <entry.ts> [...args]")
  if (isDeno) Deno.exit(entry ? 0 : 1)
  process.exitCode = entry ? 0 : 1
} else {
  if (!isDeno) process.argv = [process.argv[0], resolve(entry), ...entryArgs]
  await import(pathToFileURL(resolve(entry)).href)
}
