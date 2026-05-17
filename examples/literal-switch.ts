import { match } from "ts-pattern"

export type Command = "start" | "stop" | "pause" | "unknown"

export const inputs = ["start", "stop", "pause", "unknown"] satisfies Command[]

export const run = (command: Command): string =>
  match(command)
    .with("start", () => "running")
    .with("stop", "pause", () => "halted")
    .otherwise(() => "ignored")
