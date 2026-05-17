import { match, P } from "ts-pattern"

export type Input =
  | { type: "user"; name: string }
  | { type: "org"; name: string }
  | { type: "text"; content: string }
  | { type: "img"; src: string }

export const inputs = [
  { type: "user", name: "Ada" },
  { type: "org", name: "ACME" },
  { type: "text", content: "hello" },
] satisfies Input[]

export const run = (input: Input): string =>
  match(input)
    .with({ type: P.union("user", "org") }, (userOrOrg) => userOrOrg.name)
    .otherwise(() => "")
