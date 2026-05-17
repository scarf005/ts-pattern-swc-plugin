import { match, P } from "ts-pattern"

export const inputs = ["bonjour", "hello"] as const

export const run = (input: string): string =>
  match(input)
    .with("bonjour", () => "Won‘t match")
    .with(P.string, () => "it is a string!")
    .exhaustive()
