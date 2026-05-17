import { match, P } from "ts-pattern"

export const inputs = [3, 1, 5, 7] as const

export const run = (input: number): string =>
  match(input)
    .with(P.number.between(1, 5), () => "✅")
    .otherwise(() => "❌")
