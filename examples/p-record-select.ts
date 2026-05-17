import { match, P } from "ts-pattern"

export const inputs = [{ a: 1, b: 2, c: 3 }] as const

export const run = (input: { a: number; b: number; c: number }): string => {
  const keys = match(input)
    .with(P.record(P.string.select(), P.number), (values) => values.join(","))
    .otherwise(() => "")

  const values = match(input)
    .with(P.record(P.string, P.number.select()), (values) => values.join(","))
    .otherwise(() => "")

  return `${keys}|${values}`
}
