import { match, P } from "ts-pattern"

export const inputs = ["Good job! 🎉", "Nope"] as const

export const run = (input: string): string =>
  match(input)
    .with(P.string.includes("!"), () => "✅")
    .otherwise(() => "❌")
