import { match, P } from "ts-pattern"

export const inputs = ["short", "is this too long?"] as const

export const run = (input: string): string =>
  match(input)
    .with(P.string.maxLength(5), () => "🎉")
    .otherwise(() => "too long")
