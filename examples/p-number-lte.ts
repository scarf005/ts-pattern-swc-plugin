import { match, P } from "ts-pattern"

export const inputs = [7, 12] as const

export const run = (input: number): string =>
  match(input)
    .with(P.number.lte(7), () => "✅")
    .otherwise(() => "❌")
