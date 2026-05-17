import { match, P } from "ts-pattern"

export const inputs = [null, undefined, 1] as const

export const run = (input: number | null | undefined): string =>
  match<number | null | undefined>(input)
    .with(P.nonNullable, () => "it is a number!")
    .otherwise(() => "it is either null or undefined!")
