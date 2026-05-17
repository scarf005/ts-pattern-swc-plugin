import { match, P } from "ts-pattern"

export type Expression =
  | [number, "+", number]
  | [number, "-", number]
  | [number, "*", number]
  | ["-", number]

export const inputs = [[3, "+", 4], [8, "-", 5], [3, "*", 4], [
  "-",
  7,
]] satisfies Expression[]

export const run = (expression: Expression): number =>
  match(expression)
    .with([P.number, "+", P.number], ([left, , right]) => left + right)
    .with([P.number, "-", P.number], ([left, , right]) => left - right)
    .with([P.number, "*", P.number], ([left, , right]) => left * right)
    .with(["-", P.number], ([, value]) => -value)
    .exhaustive()
