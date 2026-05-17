import { match, P } from "ts-pattern"

export class KnownError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.code = code
  }
}

export type Post = { title: string; views: number }
export type Input = Post[] | KnownError | null

export const inputs = [
  [{ title: "Hello", views: 10 }],
  new KnownError("E_KNOWN"),
  null,
] satisfies Input[]

export const run = (input: Input): string =>
  match(input)
    .with(P.array({ title: P.string, views: P.number }), (posts) =>
      `posts:${posts.length}`)
    .with(P.instanceOf(KnownError), ({ code }) =>
      `error:${code}`)
    .with(P.nullish, () => "empty")
    .exhaustive()
