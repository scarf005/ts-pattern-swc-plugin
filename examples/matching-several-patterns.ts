import { match } from "ts-pattern"

export const inputs = ["text", "span", "p", "btn", "button", "other"] as const

export const run = (name: (typeof inputs)[number]): string =>
  match(name)
    .with("text", "span", "p", () => "text")
    .with("btn", "button", () => "button")
    .otherwise(() => name)
