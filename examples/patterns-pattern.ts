import { match, Pattern } from "ts-pattern"

export const inputs = ["hello", 12.345, true, null] as const

export const run = (value: unknown): string =>
  match(value)
    .with(Pattern.string, (str) => str)
    .with(Pattern.number, (num) => num.toFixed(2))
    .with(Pattern.boolean, (bool) => `${bool}`)
    .otherwise(() => "Unknown")
