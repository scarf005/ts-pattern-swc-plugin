import { match, P } from "ts-pattern"

export type Value = string | number | boolean | null

export const inputs = ["hello", 3, true, null] satisfies Value[]

export const run = (value: Value): string =>
  match(value)
    .with(P.not(P.boolean), (scalar) =>
      scalar === null ? "empty" : `scalar:${scalar}`)
    .with(true, () =>
      "enabled")
    .with(false, () => "disabled")
    .exhaustive()
