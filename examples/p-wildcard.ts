import { match, P } from "ts-pattern"

export const inputs = ["hello", 42, true] as const

export const run = (input: string | number | boolean): string =>
  match(input)
    .with(P._, () => "It will always match")
    .otherwise(() => "This value will never be used")
