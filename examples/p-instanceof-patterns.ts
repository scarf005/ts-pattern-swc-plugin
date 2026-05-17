import { match, P } from "ts-pattern"

export class A {
  a = "a"
}

export class B {
  b = "b"
}

export type Input = { value: A | B }

export const inputs = [{ value: new A() }, { value: new B() }] satisfies Input[]

export const run = (input: Input): string =>
  match(input)
    .with({ value: P.instanceOf(A) }, () => "instance of A!")
    .with({ value: P.instanceOf(B) }, () => "instance of B!")
    .exhaustive()
