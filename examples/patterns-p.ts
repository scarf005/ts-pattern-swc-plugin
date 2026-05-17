import { match, P } from "ts-pattern"

export const inputs = ["hello", 12.345, true, null] as const

export const run = (value: unknown): string =>
  match(value)
    .with(P.string, (str) => str)
    .with(P.number, (num) => num.toFixed(2))
    .with(P.boolean, (bool) => `${bool}`)
    .otherwise(() => "Unknown")
