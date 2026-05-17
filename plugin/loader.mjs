import { access, readFile } from "node:fs/promises"
import { extname, isAbsolute, resolve as resolvePath } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { transformTsPattern } from "./transform.mjs"

const extensions = new Set([".ts", ".tsx", ".mts", ".cts"])
const extensionOrder = [".ts", ".tsx", ".mts", ".cts"]
let options = {}

export const initialize = (data = {}) => {
  options = data
}

const isRelativeSpecifier = (specifier) =>
  specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")

const maybeFile = async (url) => {
  try {
    await access(fileURLToPath(url))
    return true
  } catch {
    return false
  }
}

export const resolve = async (specifier, context, nextResolve) => {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (!isRelativeSpecifier(specifier) || extname(specifier)) throw error

    const cwd = globalThis.process?.cwd?.() ?? globalThis.Deno?.cwd?.() ?? "."
    const base = context.parentURL?.startsWith("file:")
      ? fileURLToPath(new URL(".", context.parentURL))
      : cwd
    const withoutExtension = isAbsolute(specifier)
      ? specifier
      : resolvePath(base, specifier)

    for (const extension of extensionOrder) {
      const url = pathToFileURL(`${withoutExtension}${extension}`).href
      if (await maybeFile(url)) return { url, shortCircuit: true }
    }

    throw error
  }
}

export const load = async (url, context, nextLoad) => {
  if (!url.startsWith("file:")) return nextLoad(url, context)

  const filename = fileURLToPath(url)
  if (!extensions.has(extname(filename))) return nextLoad(url, context)

  const source = await readFile(filename, "utf8")
  const result = await transformTsPattern(source, {
    ...options,
    filename,
    pluginPath: options.pluginPath,
  })

  return {
    format: extname(filename) === ".cts" ? "commonjs" : "module",
    shortCircuit: true,
    source: result.code,
  }
}
