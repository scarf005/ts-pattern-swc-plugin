import { match, P } from "ts-pattern"

export const inputs = ["Hola!", "Hello"] as const

export const run = (input: string): string =>
  match(input)
    .with(P.string.endsWith("!"), () => "🎉")
    .otherwise(() => "❌")
