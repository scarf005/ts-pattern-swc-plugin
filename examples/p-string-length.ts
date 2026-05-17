import { match, P } from "ts-pattern"

export const inputs = ["ok", "toolong"] as const

export const run = (input: string): string =>
  match(input)
    .with(P.string.length(2), () => "🎉")
    .otherwise(() => "❌")
