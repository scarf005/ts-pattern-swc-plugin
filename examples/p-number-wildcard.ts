import { match, P } from "ts-pattern"

export const inputs = [2, "hello"] as const

export const run = (input: number | string): string =>
  match<number | string>(input)
    .with(P.string, () => "it is a string!")
    .with(P.number, () => "it is a number!")
    .exhaustive()
