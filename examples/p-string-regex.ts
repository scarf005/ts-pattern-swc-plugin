import { match, P } from "ts-pattern"

export const inputs = ["gabriel", "two words"] as const

export const run = (input: string): string =>
  match(input)
    .with(P.string.regex(/^[a-z]+$/), () => "single word")
    .otherwise(() => "other strings")
