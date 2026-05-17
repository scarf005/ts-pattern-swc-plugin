import { match, P } from "ts-pattern"

export const inputs = [2, 7] as const

export const run = (input: number): string =>
  match(input)
    .with(P.number.lt(7), () => "✅")
    .otherwise(() => "❌")
