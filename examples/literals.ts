import { match } from "ts-pattern"

export const inputs = [2, true, "hello", undefined, null, 20n, "other"] as const

export const run = (input: unknown): string =>
  match(input)
    .with(2, () => "number: two")
    .with(true, () => "boolean: true")
    .with("hello", () => "string: hello")
    .with(undefined, () => "undefined")
    .with(null, () => "null")
    .with(20n, () => "bigint: 20n")
    .otherwise(() => "something else")
