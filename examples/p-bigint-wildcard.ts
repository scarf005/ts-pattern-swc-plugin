import { match, P } from "ts-pattern"

export const inputs = [20000000n, null] as const

export const run = (input: bigint | null): string =>
  match<bigint | null>(input)
    .with(P.bigint, () => "it is a bigint!")
    .otherwise(() => "?")
