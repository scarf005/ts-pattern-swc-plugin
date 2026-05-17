import { match, P } from "ts-pattern"

export const inputs = [-3.141592, 7] as const

export const run = (input: number): string =>
  match(input)
    .with(P.number.negative(), () => "✅")
    .otherwise(() => "❌")
