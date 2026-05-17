import { match, P } from "ts-pattern"

export const inputs = [Symbol.for("some symbol"), null] as const

export const run = (input: symbol | null): string =>
  match<symbol | null>(input)
    .with(P.symbol, () => "it is a symbol!")
    .otherwise(() => "?")
