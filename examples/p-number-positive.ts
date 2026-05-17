import { match, P } from "ts-pattern"

export const inputs = [7, -3.141592] as const

export const run = (input: number): string =>
  match(input)
    .with(P.number.positive(), () => "✅")
    .otherwise(() => "❌")
