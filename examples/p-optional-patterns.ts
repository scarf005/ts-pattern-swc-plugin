import { match, P } from "ts-pattern"

export type Input = { key?: string | number }

export const inputs = [{}, { key: "hi" }, { key: 1 }] satisfies Input[]

export const run = (input: Input): string | number | undefined =>
  match(input)
    .with({ key: P.optional(P.string) }, (value) => value.key)
    .with({ key: P.optional(P.number) }, (value) => value.key)
    .exhaustive()
