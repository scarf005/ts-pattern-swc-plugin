import { match, P } from "ts-pattern"

export const inputs = ["two", "a"] as const

export const run = (input: string): string =>
  match(input)
    .with(P.string.minLength(2), () => "🎉")
    .otherwise(() => "❌")
