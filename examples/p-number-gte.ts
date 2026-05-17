import { match, P } from "ts-pattern"

export const inputs = [7, 2] as const

export const run = (input: number): string =>
  match(input)
    .with(P.number.gte(7), () => "✅")
    .otherwise(() => "❌")
