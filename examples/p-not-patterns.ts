import { match, P } from "ts-pattern"

export type Input = boolean | number

export const inputs = [2, true, false] as const satisfies Input[]

export const run = (input: Input): number =>
  match(input)
    .with(P.not(P.boolean), (n) => n)
    .with(true, () => 1)
    .with(false, () => 0)
    .exhaustive()
