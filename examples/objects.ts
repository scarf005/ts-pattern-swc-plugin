import { match } from "ts-pattern"

export type Input =
  | { type: "user"; name: string }
  | { type: "image"; src: string }
  | { type: "video"; seconds: number }

export const inputs = [
  { type: "user", name: "Gabriel" },
  { type: "image", src: "/photo.png" },
  { type: "video", seconds: 10 },
] satisfies Input[]

export const run = (input: Input): string =>
  match(input)
    .with({ type: "image" }, () => "image")
    .with({ type: "video", seconds: 10 }, () => "video of 10 seconds.")
    .with({ type: "user" }, ({ name }) => `user of name: ${name}`)
    .otherwise(() => "something else")
