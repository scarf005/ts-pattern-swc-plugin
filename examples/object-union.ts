import { match, P } from "ts-pattern"

export type Event =
  | { type: "ok"; value: number }
  | { type: "error"; message: string }
  | { type: "idle" }

export const inputs = [
  { type: "ok", value: 1 },
  { type: "ok", value: 2 },
  { type: "error", message: "failed" },
  { type: "idle" },
] satisfies Event[]

export const run = (event: Event): string =>
  match(event)
    .with({ type: "ok", value: P.number }, ({ value }) => `ok:${value}`)
    .with({ type: "error" }, ({ message }) => `error:${message}`)
    .otherwise(() => "idle")
