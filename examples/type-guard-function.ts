import { match, P } from "ts-pattern"

const isString = (x: unknown): x is string => typeof x === "string"
const isNumber = (x: unknown): x is number => typeof x === "number"

export const inputs = [{ id: "abc" }, { id: 123 }] as const

export const run = (input: { id: number | string }): string =>
  match(input)
    .with({ id: P.when(isString) }, () => "string")
    .with({ id: P.when(isNumber) }, () => "number")
    .exhaustive()
