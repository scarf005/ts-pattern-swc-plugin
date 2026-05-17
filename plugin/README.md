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

## Configure SWC

```json
{
  "jsc": {
    "experimental": {
      "plugins": [["ts-pattern-swc-plugin", {}]]
    }
  }
}
```

## Run TypeScript directly

The package also ships a Node/Deno loader that compiles `.ts`, `.tsx`, `.mts`, and `.cts` files with the plugin before evaluation.

### Node.js

Install the runtime dependencies in your project:

```sh
npm install ts-pattern ts-pattern-swc-plugin @swc/core
```

Run an entrypoint through the bundled CLI:

```sh
npx ts-pattern-swc ./foo.ts
```

Or preload the loader for regular Node execution:

```sh
node --import ts-pattern-swc-plugin/register ./foo.ts
```

### Deno

Deno needs a version with `node:module` `register()` loader hooks. Use `import { match } from "ts-pattern"` with a `deno.json` import map, or `import { match } from "npm:ts-pattern"`. Run via npm specifiers:

```sh
deno run -A npm:ts-pattern-swc-plugin/run ./foo.ts
```

Or preload the loader:

```sh
deno run -A --import npm:ts-pattern-swc-plugin/register ./foo.ts
```

For local development from this repository:

```sh
deno run -A --import ./plugin/register.mjs ./foo.ts
```

### Programmatic transform

```ts
import { transformTsPattern } from "ts-pattern-swc-plugin/transform";

const result = await transformTsPattern(source, { filename: "foo.ts" });
console.log(result.code);
```

Set `TS_PATTERN_SWC_PLUGIN_PATH` when you want to use a custom-built plugin wasm file.

## Supported input

The transformer handles chains that start from `match(value)` imported from `ts-pattern` and end in `.otherwise(handler)` or `.exhaustive()`.

Supported patterns:

- primitive literals: string, number, bigint, boolean, `null`, `undefined`
- object and array literal patterns
- `P._`
- `P.string`, `P.number`, `P.boolean`, `P.bigint`, `P.symbol`, `P.nullish`, `P.nonNullable`
- `P.optional(pattern)`, `P.not(pattern)`, `P.union(...patterns)`, `P.array(pattern?)`, `P.instanceOf(Ctor)`, `P.when(predicate)`

Unsupported chains are left unchanged to preserve runtime behavior. `P.select`, custom matcher objects, `.returnType`, and selection arguments are not compiled yet.
