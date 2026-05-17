import { match, P } from "ts-pattern"

export const inputs = [12, -3.141592] as const

export const run = (input: number): string =>
  match(input)
    .with(P.number.int(), () => "✅")
    .otherwise(() => "❌")
