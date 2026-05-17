import { match, P } from "ts-pattern"

export const inputs = [true, 1, "hello"] as const

export const run = (input: number | string | boolean): string =>
  match<number | string | boolean>(input)
    .with(P.string, () => "it is a string!")
    .with(P.number, () => "it is a number!")
    .with(P.boolean, () => "it is a boolean!")
    .exhaustive()
