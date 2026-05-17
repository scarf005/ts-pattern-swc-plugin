import { match, P } from "ts-pattern"

export const inputs = ["TS-Pattern", "Hola"] as const

export const run = (input: string): string =>
  match(input)
    .with(P.string.startsWith("TS"), () => "🎉")
    .otherwise(() => "❌")
