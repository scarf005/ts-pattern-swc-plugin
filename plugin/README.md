# ts-pattern-swc-plugin

SWC plugin that compiles supported [`ts-pattern`](https://github.com/gvergnaud/ts-pattern) `match` expressions into plain JavaScript `switch` or `if` chains.

```ts
import { match, P } from "ts-pattern";

const label = match(input)
  .with({ type: "ok", value: P.number }, (value) => value.value)
  .with({ type: "error" }, () => 0)
  .otherwise(() => -1);
```

becomes an IIFE with one evaluated input and early returns:

```js
const label = (() => {
  const _tsPatternInput = input;
  if (_tsPatternInput !== null && typeof _tsPatternInput === "object" && _tsPatternInput.type === "ok" && typeof _tsPatternInput.value === "number") return ((value) => value.value)(_tsPatternInput);
  if (_tsPatternInput !== null && typeof _tsPatternInput === "object" && _tsPatternInput.type === "error") return (() => 0)(_tsPatternInput);
  return (() => -1)(_tsPatternInput);
})();
```

Literal-only top-level matches are emitted as `switch` statements.

## Install

```sh
npm install ts-pattern-swc-plugin
```

## Configure

```json
{
  "jsc": {
    "experimental": {
      "plugins": [["ts-pattern-swc-plugin", {}]]
    }
  }
}
```

## Supported input

The transformer handles chains that start from `match(value)` imported from `ts-pattern` and end in `.otherwise(handler)` or `.exhaustive()`.

Supported patterns:

- primitive literals: string, number, bigint, boolean, `null`, `undefined`
- object and array literal patterns
- `P._`
- `P.string`, `P.number`, `P.boolean`, `P.bigint`, `P.symbol`, `P.nullish`, `P.nonNullable`
- `P.optional(pattern)`, `P.not(pattern)`, `P.union(...patterns)`, `P.array(pattern?)`, `P.instanceOf(Ctor)`, `P.when(predicate)`

Unsupported chains are left unchanged to preserve runtime behavior. `P.select`, custom matcher objects, `.returnType`, and selection arguments are not compiled yet.
