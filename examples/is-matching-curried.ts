import { isMatching, P } from "ts-pattern"

const isBlogPost = isMatching({
  type: "blogpost",
  title: P.string,
  description: P.string,
})

export type Input =
  | { type: "blogpost"; title: string; description: string }
  | { type: "note"; title: string }

export const inputs = [
  { type: "blogpost", title: "Hello", description: "World" },
  { type: "note", title: "Draft" },
] satisfies Input[]

export const run = (value: Input): string =>
  isBlogPost(value) ? `${value.title}:${value.description}` : "not-blogpost"
