import { match, P } from "ts-pattern"

export type Setting = { key?: string | number | boolean }

export const inputs = [
  {},
  { key: "theme" },
  { key: 42 },
  { key: true },
] satisfies Setting[]

export const run = (setting: Setting): string =>
  match(setting)
    .with({ key: P.optional(P.union(P.string, P.number)) }, ({ key }) =>
      key === undefined ? "missing" : `scalar:${key}`)
    .with({ key: P.boolean }, () =>
      "boolean")
    .otherwise(() => "unknown")
