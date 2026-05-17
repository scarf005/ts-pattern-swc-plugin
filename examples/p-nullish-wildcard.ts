import { match, P } from "ts-pattern"

export const inputs = [null, undefined, 1] as const

export const run = (input: number | null | undefined): string =>
  match<number | null | undefined>(input)
    .with(P.number, () => "it is a number!")
    .with(P.nullish, () => "it is either null or undefined!")
    .exhaustive()
