import { match, P } from "ts-pattern"

export type Item = { count: number }

export const inputs = [{ count: 0 }, { count: 2 }, {
  count: 10,
}] satisfies Item[]

export const run = (item: Item): string =>
  match(item)
    .with({ count: P.number }, ({ count }) => count > 5, () => "many")
    .with({ count: P.number }, () => "some")
    .otherwise(() => "none")
