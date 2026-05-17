import { match, P } from "ts-pattern"

export const inputs = [12, 7] as const

export const run = (input: number): string =>
  match(input)
    .with(P.number.gt(7), () => "✅")
    .otherwise(() => "❌")
