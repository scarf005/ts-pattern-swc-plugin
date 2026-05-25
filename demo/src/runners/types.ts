import type { ReactElement } from 'react'

export type Data =
  | { type: 'text'; content: string }
  | { type: 'img'; src: string }

export type Result =
  | { type: 'ok'; data: Data }
  | { type: 'error'; error: Error }

export type RenderedResult = {
  html: ReactElement
  text: string
}

export type Renderer = (result: Result) => RenderedResult

export type BenchmarkResult = {
  elapsedMs: number
  iterations: number
  operations: number
  operationsPerSecond: number
  checksum: number
  output: RenderedResult[]
}

const stringifyChildren = (children: unknown): string => {
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(stringifyChildren).join('')
  return ''
}

export const textForHtml = (html: ReactElement) => {
  if (html.type === 'img' && typeof html.props === 'object' && html.props !== null) {
    const props = html.props as { src?: unknown }
    return typeof props.src === 'string' ? `<img src="${props.src}" />` : '<img />'
  }

  if (typeof html.props === 'object' && html.props !== null) {
    return stringifyChildren((html.props as { children?: unknown }).children)
  }

  return ''
}
