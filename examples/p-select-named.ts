import { match, P } from "ts-pattern"

export type Input =
  | { type: "post"; user: { name: string }; content: string }
  | { type: "comment"; text: string }

export const inputs = [
  { type: "post", user: { name: "Gabriel" }, content: "Hello!" },
  { type: "comment", text: "Hi" },
] satisfies Input[]

export const run = (input: Input): string =>
  match(input)
    .with(
      {
        type: "post",
        user: { name: P.select("name") },
        content: P.select("body"),
      },
      ({ name, body }) => `${name} wrote "${body}"`,
    )
    .otherwise(() => "")
