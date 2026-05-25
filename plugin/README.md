# @scarf/ts-pattern-swc-plugin

SWC plugin that compiles supported [`ts-pattern`](https://github.com/gvergnaud/ts-pattern) `match` expressions into plain JavaScript ternaries, `switch` statements, or `if` chains.

```ts
import { match, P } from "ts-pattern";

const label = match(input)
  .with({ type: "ok", value: P.number }, (value) => value.value)
  .with({ type: "error" }, () => 0)
  .otherwise(() => -1);
```

becomes a nested ternary when the input can be safely reused:

```js
const label = input !== null && typeof input === "object" && "type" in input && input.type === "ok" && "value" in input && typeof input.value === "number" ? input.value : input !== null && typeof input === "object" && "type" in input && input.type === "error" ? 0 : -1;
```

Arrow-bodied matches are emitted as `switch` statements or `if` blocks when a statement form is faster or preserves single input evaluation.

## Install

```sh
npm install @scarf/ts-pattern-swc-plugin
```

## Configure SWC

```json
{
  "jsc": {
    "experimental": {
      "plugins": [["@scarf/ts-pattern-swc-plugin", {}]]
    }
  }
}
```

## Run TypeScript directly

The package also ships a Node/Deno loader that compiles `.ts`, `.tsx`, `.mts`, and `.cts` files with the plugin before evaluation.

### Node.js

Install the runtime dependencies in your project:

```sh
npm install ts-pattern @scarf/ts-pattern-swc-plugin @swc/core
```

Run an entrypoint through the bundled CLI:

```sh
npx ts-pattern-swc ./foo.ts
```

Or preload the loader for regular Node execution:

```sh
node --import @scarf/ts-pattern-swc-plugin/register ./foo.ts
```

### Deno

Deno needs a version with `node:module` `register()` loader hooks. Use `import { match } from "ts-pattern"` with a `deno.json` import map, or `import { match } from "npm:ts-pattern"`. Run via npm specifiers:

```sh
deno run -A npm:@scarf/ts-pattern-swc-plugin/run ./foo.ts
```

Or preload the loader:

```sh
deno run -A --import npm:@scarf/ts-pattern-swc-plugin/register ./foo.ts
```

For local development from this repository:

```sh
deno run -A --import ./plugin/register.mjs ./foo.ts
```

### Programmatic transform

```ts
import { transformTsPattern } from "@scarf/ts-pattern-swc-plugin/transform";

const result = await transformTsPattern(source, { filename: "foo.ts" });
console.log(result.code);
```

Set `TS_PATTERN_SWC_PLUGIN_PATH` when you want to use a custom-built plugin wasm file.

## Benchmark

The `bench` task compares [`bdbaraban/ts-pattern-benchmark`](https://github.com/bdbaraban/ts-pattern-benchmark) cases across raw `ts-pattern`, native code, and plugin output, then runs the local examples.

<!-- automd:file src="../docs/just-bench.txt" code lang="text" -->

```text [just-bench.txt]
CPU | AMD Ryzen 5 5600G with Radeon Graphics
Runtime | Deno 2.7.14 (x86_64-unknown-linux-gnu)

file:///home/scarf/repo/ts-pattern-swc-plugin/web/ts-pattern_bench.ts

| benchmark               | time/iter (avg) |        iter/s |      (min … max)      |      p75 |      p99 |     p995 |
| ----------------------- | --------------- | ------------- | --------------------- | -------- | -------- | -------- |

group ts-pattern-benchmark/always-last-digit
| ts-pattern raw          |        685.1 ns |     1,460,000 | (659.2 ns … 860.0 ns) | 688.4 ns | 860.0 ns | 860.0 ns |
| native code             |         12.0 ns |    83,090,000 | ( 11.5 ns …  39.4 ns) |  12.0 ns |  14.1 ns |  14.8 ns |
| ts-pattern swc plugin   |         11.8 ns |    84,610,000 | ( 11.3 ns …  22.8 ns) |  11.7 ns |  13.9 ns |  14.4 ns |

summary
  native code
     1.02x slower than ts-pattern swc plugin
    56.92x faster than ts-pattern raw

group ts-pattern-benchmark/random-digit
| ts-pattern raw          |        462.1 ns |     2,164,000 | (439.6 ns … 563.4 ns) | 465.6 ns | 547.6 ns | 563.4 ns |
| native code             |         12.0 ns |    83,110,000 | ( 10.8 ns …  25.3 ns) |  12.3 ns |  14.1 ns |  17.2 ns |
| ts-pattern swc plugin   |         18.4 ns |    54,260,000 | ( 17.5 ns …  34.1 ns) |  18.9 ns |  23.7 ns |  27.1 ns |

summary
  native code
     1.53x faster than ts-pattern swc plugin
    38.40x faster than ts-pattern raw

group ts-pattern-benchmark/nested-objects
| ts-pattern raw          |          1.8 µs |       565,000 | (  1.7 µs …   1.9 µs) |   1.8 µs |   1.9 µs |   1.9 µs |
| native code             |         15.2 ns |    65,720,000 | ( 14.4 ns …  67.9 ns) |  15.2 ns |  18.9 ns |  21.3 ns |
| ts-pattern swc plugin   |         15.4 ns |    64,840,000 | ( 14.3 ns …  30.5 ns) |  15.3 ns |  22.8 ns |  28.4 ns |

summary
  native code
     1.01x faster than ts-pattern swc plugin
   116.30x faster than ts-pattern raw

group intro-html
| ts-pattern raw          |          1.5 µs |       658,900 | (  1.5 µs …   1.6 µs) |   1.5 µs |   1.6 µs |   1.6 µs |
| ts-pattern swc plugin   |         94.6 ns |    10,570,000 | ( 90.1 ns … 137.9 ns) |  95.1 ns | 114.7 ns | 116.5 ns |

summary
  ts-pattern swc plugin
    16.05x faster than ts-pattern raw

group is-matching-curried
| ts-pattern raw          |        358.9 ns |     2,787,000 | (351.3 ns … 386.6 ns) | 364.1 ns | 383.8 ns | 386.6 ns |
| ts-pattern swc plugin   |        364.8 ns |     2,741,000 | (346.3 ns … 407.0 ns) | 370.5 ns | 392.2 ns | 407.0 ns |

summary
  ts-pattern swc plugin
     1.02x slower than ts-pattern raw

group is-matching-direct
| ts-pattern raw          |        348.0 ns |     2,873,000 | (336.6 ns … 377.1 ns) | 351.9 ns | 375.6 ns | 377.1 ns |
| ts-pattern swc plugin   |        347.0 ns |     2,881,000 | (337.1 ns … 374.6 ns) | 353.0 ns | 372.1 ns | 374.6 ns |

summary
  ts-pattern swc plugin
     1.00x faster than ts-pattern raw

group literals
| ts-pattern raw          |        346.3 ns |     2,888,000 | (326.7 ns … 508.0 ns) | 349.0 ns | 501.9 ns | 508.0 ns |
| ts-pattern swc plugin   |         16.7 ns |    59,760,000 | ( 15.8 ns …  32.8 ns) |  16.8 ns |  20.1 ns |  22.6 ns |

summary
  ts-pattern swc plugin
    20.69x faster than ts-pattern raw

group matching-several-patterns
| ts-pattern raw          |        355.0 ns |     2,817,000 | (337.2 ns … 399.1 ns) | 359.4 ns | 397.8 ns | 399.1 ns |
| ts-pattern swc plugin   |         20.5 ns |    48,780,000 | ( 19.5 ns …  42.3 ns) |  20.5 ns |  25.5 ns |  30.9 ns |

summary
  ts-pattern swc plugin
    17.32x faster than ts-pattern raw

group objects
| ts-pattern raw          |        640.4 ns |     1,561,000 | (608.9 ns … 935.6 ns) | 640.1 ns | 935.6 ns | 935.6 ns |
| ts-pattern swc plugin   |         49.5 ns |    20,190,000 | ( 46.9 ns …  70.0 ns) |  50.2 ns |  60.2 ns |  67.1 ns |

summary
  ts-pattern swc plugin
    12.93x faster than ts-pattern raw

group p-array-patterns
| ts-pattern raw          |          1.3 µs |       793,300 | (  1.2 µs …   1.4 µs) |   1.3 µs |   1.4 µs |   1.4 µs |
| ts-pattern swc plugin   |         30.8 ns |    32,490,000 | ( 29.1 ns …  50.7 ns) |  30.7 ns |  43.1 ns |  45.2 ns |

summary
  ts-pattern swc plugin
    40.96x faster than ts-pattern raw

group p-bigint-wildcard
| ts-pattern raw          |         82.1 ns |    12,170,000 | ( 74.6 ns … 147.5 ns) |  84.3 ns | 130.1 ns | 139.0 ns |
| ts-pattern swc plugin   |         11.8 ns |    84,650,000 | ( 11.2 ns …  38.1 ns) |  11.9 ns |  15.7 ns |  19.2 ns |

summary
  ts-pattern swc plugin
     6.95x faster than ts-pattern raw

group p-boolean-wildcard
| ts-pattern raw          |        186.8 ns |     5,353,000 | (172.6 ns … 326.0 ns) | 188.5 ns | 294.2 ns | 317.8 ns |
| ts-pattern swc plugin   |         11.2 ns |    89,060,000 | ( 10.6 ns …  23.5 ns) |  11.1 ns |  14.9 ns |  17.4 ns |

summary
  ts-pattern swc plugin
    16.64x faster than ts-pattern raw

group p-infer
| ts-pattern raw          |          1.6 µs |       635,000 | (  1.5 µs …   1.7 µs) |   1.6 µs |   1.7 µs |   1.7 µs |
| ts-pattern swc plugin   |          1.6 µs |       635,400 | (  1.6 µs …   1.7 µs) |   1.6 µs |   1.7 µs |   1.7 µs |

summary
  ts-pattern swc plugin
     1.00x faster than ts-pattern raw

group p-instanceof-patterns
| ts-pattern raw          |          1.2 µs |       823,600 | (  1.2 µs …   1.6 µs) |   1.2 µs |   1.6 µs |   1.6 µs |
| ts-pattern swc plugin   |         26.9 ns |    37,150,000 | ( 25.8 ns …  69.5 ns) |  27.0 ns |  32.4 ns |  35.3 ns |

summary
  ts-pattern swc plugin
    45.11x faster than ts-pattern raw

group p-intersection-patterns
| ts-pattern raw          |          2.3 µs |       437,500 | (  2.3 µs …   2.4 µs) |   2.3 µs |   2.4 µs |   2.4 µs |
| ts-pattern swc plugin   |         49.1 ns |    20,350,000 | ( 47.0 ns …  97.1 ns) |  48.8 ns |  70.4 ns |  82.2 ns |

summary
  ts-pattern swc plugin
    46.52x faster than ts-pattern raw

group p-map-patterns
| ts-pattern raw          |          1.8 µs |       567,900 | (  1.7 µs …   2.0 µs) |   1.8 µs |   2.0 µs |   2.0 µs |
| ts-pattern swc plugin   |        263.9 ns |     3,789,000 | (253.7 ns … 293.0 ns) | 264.1 ns | 282.9 ns | 283.0 ns |

summary
  ts-pattern swc plugin
     6.67x faster than ts-pattern raw

group p-narrow
| ts-pattern raw          |        414.9 ns |     2,410,000 | (396.9 ns … 477.9 ns) | 421.9 ns | 469.0 ns | 477.9 ns |
| ts-pattern swc plugin   |        117.1 ns |     8,538,000 | (113.2 ns … 136.3 ns) | 117.6 ns | 135.2 ns | 135.6 ns |

summary
  ts-pattern swc plugin
     3.54x faster than ts-pattern raw

group p-nonnullable-wildcard
| ts-pattern raw          |         90.1 ns |    11,090,000 | ( 83.1 ns … 211.3 ns) |  91.8 ns | 125.7 ns | 134.4 ns |
| ts-pattern swc plugin   |         11.2 ns |    89,250,000 | ( 10.5 ns …  20.3 ns) |  11.3 ns |  13.7 ns |  15.0 ns |

summary
  ts-pattern swc plugin
     8.04x faster than ts-pattern raw

group p-not-patterns
| ts-pattern raw          |        570.0 ns |     1,754,000 | (548.4 ns … 686.2 ns) | 574.4 ns | 686.2 ns | 686.2 ns |
| ts-pattern swc plugin   |         11.5 ns |    86,910,000 | ( 10.4 ns …  37.9 ns) |  11.8 ns |  13.9 ns |  15.1 ns |

summary
  ts-pattern swc plugin
    49.54x faster than ts-pattern raw

group p-nullish-wildcard
| ts-pattern raw          |        128.8 ns |     7,763,000 | (118.3 ns … 217.8 ns) | 131.8 ns | 199.8 ns | 212.3 ns |
| ts-pattern swc plugin   |         11.0 ns |    90,790,000 | ( 10.1 ns …  33.0 ns) |  10.7 ns |  21.5 ns |  22.2 ns |

summary
  ts-pattern swc plugin
    11.70x faster than ts-pattern raw

group p-number-between
| ts-pattern raw          |        947.9 ns |     1,055,000 | (921.7 ns …   1.1 µs) | 958.8 ns |   1.1 µs |   1.1 µs |
| ts-pattern swc plugin   |         12.4 ns |    80,750,000 | ( 11.6 ns …  40.1 ns) |  12.6 ns |  15.4 ns |  17.5 ns |

summary
  ts-pattern swc plugin
    76.54x faster than ts-pattern raw

group p-number-finite
| ts-pattern raw          |        930.3 ns |     1,075,000 | (911.9 ns … 999.0 ns) | 933.9 ns | 999.0 ns | 999.0 ns |
| ts-pattern swc plugin   |         11.1 ns |    89,760,000 | ( 10.5 ns …  36.2 ns) |  11.0 ns |  12.8 ns |  13.3 ns |

summary
  ts-pattern swc plugin
    83.51x faster than ts-pattern raw

group p-number-gt
| ts-pattern raw          |        939.8 ns |     1,064,000 | (921.1 ns …   1.0 µs) | 940.3 ns |   1.0 µs |   1.0 µs |
| ts-pattern swc plugin   |         12.5 ns |    80,240,000 | ( 11.5 ns …  30.4 ns) |  12.5 ns |  14.5 ns |  16.1 ns |

summary
  ts-pattern swc plugin
    75.41x faster than ts-pattern raw

group p-number-gte
| ts-pattern raw          |        978.6 ns |     1,022,000 | (946.9 ns …   1.1 µs) | 986.8 ns |   1.1 µs |   1.1 µs |
| ts-pattern swc plugin   |         12.5 ns |    79,820,000 | ( 11.8 ns …  28.8 ns) |  12.5 ns |  14.6 ns |  15.4 ns |

summary
  ts-pattern swc plugin
    78.11x faster than ts-pattern raw

group p-number-int
| ts-pattern raw          |        925.3 ns |     1,081,000 | (907.6 ns …   1.0 µs) | 927.2 ns |   1.0 µs |   1.0 µs |
| ts-pattern swc plugin   |         12.1 ns |    82,480,000 | ( 11.1 ns …  34.4 ns) |  12.4 ns |  13.7 ns |  14.6 ns |

summary
  ts-pattern swc plugin
    76.32x faster than ts-pattern raw

group p-number-lt
| ts-pattern raw          |        938.2 ns |     1,066,000 | (914.3 ns …   1.0 µs) | 942.0 ns |   1.0 µs |   1.0 µs |
| ts-pattern swc plugin   |         13.2 ns |    75,580,000 | ( 12.8 ns …  29.5 ns) |  13.2 ns |  14.9 ns |  15.2 ns |

summary
  ts-pattern swc plugin
    70.91x faster than ts-pattern raw

group p-number-lte
| ts-pattern raw          |        946.0 ns |     1,057,000 | (920.5 ns …   1.0 µs) | 950.4 ns |   1.0 µs |   1.0 µs |
| ts-pattern swc plugin   |         11.9 ns |    83,900,000 | ( 11.0 ns …  27.4 ns) |  12.2 ns |  13.6 ns |  13.8 ns |

summary
  ts-pattern swc plugin
    79.37x faster than ts-pattern raw

group p-number-negative
| ts-pattern raw          |        943.3 ns |     1,060,000 | (923.0 ns … 998.0 ns) | 947.1 ns | 998.0 ns | 998.0 ns |
| ts-pattern swc plugin   |         11.6 ns |    85,950,000 | ( 10.8 ns …  38.7 ns) |  11.7 ns |  13.5 ns |  13.9 ns |

summary
  ts-pattern swc plugin
    81.08x faster than ts-pattern raw

group p-number-positive
| ts-pattern raw          |        938.5 ns |     1,066,000 | (922.8 ns …   1.0 µs) | 939.5 ns |   1.0 µs |   1.0 µs |
| ts-pattern swc plugin   |         11.4 ns |    87,410,000 | ( 10.6 ns …  26.0 ns) |  11.6 ns |  16.9 ns |  18.8 ns |

summary
  ts-pattern swc plugin
    82.03x faster than ts-pattern raw

group p-number-wildcard
| ts-pattern raw          |        138.6 ns |     7,214,000 | (127.5 ns … 185.5 ns) | 142.8 ns | 168.9 ns | 173.8 ns |
| ts-pattern swc plugin   |         11.7 ns |    85,830,000 | ( 10.6 ns …  23.6 ns) |  11.9 ns |  17.6 ns |  19.7 ns |

summary
  ts-pattern swc plugin
    11.90x faster than ts-pattern raw

group p-optional-patterns
| ts-pattern raw          |          1.2 µs |       802,400 | (  1.2 µs …   1.4 µs) |   1.3 µs |   1.4 µs |   1.4 µs |
| ts-pattern swc plugin   |         29.3 ns |    34,140,000 | ( 28.0 ns …  49.6 ns) |  29.4 ns |  32.5 ns |  34.2 ns |

summary
  ts-pattern swc plugin
    42.54x faster than ts-pattern raw

group p-pattern
| ts-pattern raw          |        248.2 ns |     4,029,000 | (235.6 ns … 394.7 ns) | 253.6 ns | 301.1 ns | 312.4 ns |
| ts-pattern swc plugin   |        248.3 ns |     4,028,000 | (237.4 ns … 333.1 ns) | 253.0 ns | 280.4 ns | 287.2 ns |

summary
  ts-pattern swc plugin
     1.00x slower than ts-pattern raw

group p-record-profiles
| ts-pattern raw          |          1.3 µs |       747,400 | (  1.3 µs …   1.5 µs) |   1.4 µs |   1.5 µs |   1.5 µs |
| ts-pattern swc plugin   |        180.8 ns |     5,532,000 | (171.5 ns … 232.8 ns) | 185.0 ns | 209.2 ns | 213.8 ns |

summary
  ts-pattern swc plugin
     7.40x faster than ts-pattern raw

group p-record-scores
| ts-pattern raw          |          1.6 µs |       633,200 | (  1.5 µs …   1.7 µs) |   1.6 µs |   1.7 µs |   1.7 µs |
| ts-pattern swc plugin   |        233.3 ns |     4,286,000 | (223.7 ns … 272.3 ns) | 237.2 ns | 261.2 ns | 268.4 ns |

summary
  ts-pattern swc plugin
     6.77x faster than ts-pattern raw

group p-record-select
| ts-pattern raw          |          4.3 µs |       232,600 | (  4.2 µs …   4.4 µs) |   4.4 µs |   4.4 µs |   4.4 µs |
| ts-pattern swc plugin   |        444.3 ns |     2,251,000 | (425.3 ns … 574.4 ns) | 451.8 ns | 484.4 ns | 574.4 ns |

summary
  ts-pattern swc plugin
     9.68x faster than ts-pattern raw

group p-select-anonymous
| ts-pattern raw          |        971.2 ns |     1,030,000 | (931.9 ns …   1.2 µs) | 972.4 ns |   1.2 µs |   1.2 µs |
| ts-pattern swc plugin   |         42.6 ns |    23,470,000 | ( 40.1 ns …  80.1 ns) |  43.2 ns |  50.1 ns |  57.7 ns |

summary
  ts-pattern swc plugin
    22.79x faster than ts-pattern raw

group p-select-guarded
| ts-pattern raw          |          3.8 µs |       260,400 | (  3.8 µs …   4.1 µs) |   3.9 µs |   4.1 µs |   4.1 µs |
| ts-pattern swc plugin   |         82.4 ns |    12,140,000 | ( 78.2 ns … 108.7 ns) |  82.9 ns |  97.0 ns |  98.5 ns |

summary
  ts-pattern swc plugin
    46.61x faster than ts-pattern raw

group p-select-named
| ts-pattern raw          |          1.4 µs |       691,300 | (  1.4 µs …   1.5 µs) |   1.5 µs |   1.5 µs |   1.5 µs |
| ts-pattern swc plugin   |         77.2 ns |    12,950,000 | ( 74.0 ns … 112.4 ns) |  77.1 ns |  94.3 ns |  96.7 ns |

summary
  ts-pattern swc plugin
    18.73x faster than ts-pattern raw

group p-set-patterns
| ts-pattern raw          |          1.4 µs |       720,300 | (  1.4 µs …   1.5 µs) |   1.4 µs |   1.5 µs |   1.5 µs |
| ts-pattern swc plugin   |         27.4 ns |    36,460,000 | ( 25.2 ns …  61.4 ns) |  26.9 ns |  52.8 ns |  54.1 ns |

summary
  ts-pattern swc plugin
    50.62x faster than ts-pattern raw

group p-string-endswith
| ts-pattern raw          |        915.6 ns |     1,092,000 | (888.9 ns …   1.0 µs) | 919.2 ns |   1.0 µs |   1.0 µs |
| ts-pattern swc plugin   |         12.4 ns |    80,330,000 | ( 11.6 ns …  30.4 ns) |  12.4 ns |  14.6 ns |  15.1 ns |

summary
  ts-pattern swc plugin
    73.55x faster than ts-pattern raw

group p-string-includes
| ts-pattern raw          |        915.8 ns |     1,092,000 | (889.2 ns … 998.5 ns) | 916.0 ns | 998.5 ns | 998.5 ns |
| ts-pattern swc plugin   |         14.6 ns |    68,260,000 | ( 13.4 ns …  29.8 ns) |  15.1 ns |  17.2 ns |  18.5 ns |

summary
  ts-pattern swc plugin
    62.51x faster than ts-pattern raw

group p-string-length
| ts-pattern raw          |        924.4 ns |     1,082,000 | (881.5 ns …   1.0 µs) | 940.9 ns |   1.0 µs |   1.0 µs |
| ts-pattern swc plugin   |         12.4 ns |    80,630,000 | ( 12.0 ns …  18.0 ns) |  12.5 ns |  13.0 ns |  13.7 ns |

summary
  ts-pattern swc plugin
    74.53x faster than ts-pattern raw

group p-string-maxlength
| ts-pattern raw          |        892.9 ns |     1,120,000 | (873.6 ns … 971.5 ns) | 896.2 ns | 971.5 ns | 971.5 ns |
| ts-pattern swc plugin   |         12.0 ns |    83,290,000 | ( 11.6 ns …  25.1 ns) |  12.0 ns |  13.9 ns |  15.2 ns |

summary
  ts-pattern swc plugin
    74.37x faster than ts-pattern raw

group p-string-minlength
| ts-pattern raw          |        897.9 ns |     1,114,000 | (874.6 ns … 987.7 ns) | 906.3 ns | 987.7 ns | 987.7 ns |
| ts-pattern swc plugin   |         12.3 ns |    81,410,000 | ( 11.5 ns …  27.1 ns) |  12.4 ns |  14.2 ns |  14.6 ns |

summary
  ts-pattern swc plugin
    73.10x faster than ts-pattern raw

group p-string-regex
| ts-pattern raw          |        938.1 ns |     1,066,000 | (910.9 ns …   1.2 µs) | 937.8 ns |   1.2 µs |   1.2 µs |
| ts-pattern swc plugin   |         18.2 ns |    54,840,000 | ( 17.1 ns …  43.4 ns) |  18.2 ns |  22.4 ns |  33.2 ns |

summary
  ts-pattern swc plugin
    51.44x faster than ts-pattern raw

group p-string-startswith
| ts-pattern raw          |        910.8 ns |     1,098,000 | (883.7 ns … 970.6 ns) | 913.9 ns | 970.6 ns | 970.6 ns |
| ts-pattern swc plugin   |         12.2 ns |    82,110,000 | ( 11.4 ns …  27.6 ns) |  12.3 ns |  14.5 ns |  15.2 ns |

summary
  ts-pattern swc plugin
    74.78x faster than ts-pattern raw

group p-string-wildcard
| ts-pattern raw          |        141.6 ns |     7,061,000 | (133.5 ns … 186.0 ns) | 145.0 ns | 176.6 ns | 185.0 ns |
| ts-pattern swc plugin   |         12.0 ns |    83,200,000 | ( 11.6 ns …  42.1 ns) |  12.0 ns |  15.6 ns |  17.7 ns |

summary
  ts-pattern swc plugin
    11.78x faster than ts-pattern raw

group p-symbol-wildcard
| ts-pattern raw          |         79.7 ns |    12,540,000 | ( 72.4 ns … 133.2 ns) |  82.3 ns | 103.4 ns | 110.1 ns |
| ts-pattern swc plugin   |         11.9 ns |    84,250,000 | ( 11.1 ns …  28.2 ns) |  11.9 ns |  13.6 ns |  14.2 ns |

summary
  ts-pattern swc plugin
     6.72x faster than ts-pattern raw

group p-union-patterns
| ts-pattern raw          |        902.2 ns |     1,108,000 | (879.1 ns … 965.0 ns) | 905.1 ns | 965.0 ns | 965.0 ns |
| ts-pattern swc plugin   |         36.6 ns |    27,340,000 | ( 34.9 ns …  56.2 ns) |  36.6 ns |  42.9 ns |  47.1 ns |

summary
  ts-pattern swc plugin
    24.66x faster than ts-pattern raw

group p-when-patterns
| ts-pattern raw          |          1.2 µs |       808,300 | (  1.2 µs …   1.5 µs) |   1.2 µs |   1.5 µs |   1.5 µs |
| ts-pattern swc plugin   |        101.0 ns |     9,899,000 | ( 97.0 ns … 124.8 ns) | 101.4 ns | 115.1 ns | 121.7 ns |

summary
  ts-pattern swc plugin
    12.25x faster than ts-pattern raw

group p-wildcard
| ts-pattern raw          |         84.8 ns |    11,790,000 | ( 77.0 ns … 125.7 ns) |  87.5 ns | 105.9 ns | 115.0 ns |
| ts-pattern swc plugin   |         10.3 ns |    97,420,000 | (  9.7 ns …  18.9 ns) |  10.3 ns |  11.5 ns |  12.3 ns |

summary
  ts-pattern swc plugin
     8.26x faster than ts-pattern raw

group patterns-p
| ts-pattern raw          |        223.9 ns |     4,467,000 | (205.8 ns … 393.2 ns) | 226.4 ns | 303.1 ns | 373.6 ns |
| ts-pattern swc plugin   |         18.5 ns |    53,950,000 | ( 17.3 ns …  40.8 ns) |  18.5 ns |  23.9 ns |  27.1 ns |

summary
  ts-pattern swc plugin
    12.08x faster than ts-pattern raw

group patterns-pattern
| ts-pattern raw          |        222.7 ns |     4,489,000 | (208.1 ns … 321.2 ns) | 225.2 ns | 276.6 ns | 282.3 ns |
| ts-pattern swc plugin   |         18.9 ns |    52,850,000 | ( 18.0 ns …  38.0 ns) |  19.0 ns |  21.0 ns |  21.4 ns |

summary
  ts-pattern swc plugin
    11.77x faster than ts-pattern raw

group state-reducer
| ts-pattern raw          |          2.7 µs |       367,900 | (  2.7 µs …   2.9 µs) |   2.7 µs |   2.9 µs |   2.9 µs |
| ts-pattern swc plugin   |         72.5 ns |    13,800,000 | ( 68.5 ns … 110.9 ns) |  72.8 ns |  89.8 ns |  91.7 ns |

summary
  ts-pattern swc plugin
    37.50x faster than ts-pattern raw

group tuples-arrays
| ts-pattern raw          |        764.4 ns |     1,308,000 | (745.9 ns … 842.6 ns) | 768.3 ns | 842.6 ns | 842.6 ns |
| ts-pattern swc plugin   |         41.1 ns |    24,360,000 | ( 39.1 ns …  71.2 ns) |  41.3 ns |  45.1 ns |  50.0 ns |

summary
  ts-pattern swc plugin
    18.62x faster than ts-pattern raw

group type-guard-function
| ts-pattern raw          |        964.1 ns |     1,037,000 | (945.1 ns …   1.0 µs) | 969.7 ns |   1.0 µs |   1.0 µs |
| ts-pattern swc plugin   |         26.6 ns |    37,620,000 | ( 25.1 ns …  56.3 ns) |  26.7 ns |  28.6 ns |  30.1 ns |

summary
  ts-pattern swc plugin
    36.27x faster than ts-pattern raw

group type-narrowing-select
| ts-pattern raw          |          2.4 µs |       409,100 | (  2.4 µs …   2.6 µs) |   2.5 µs |   2.6 µs |   2.6 µs |
| ts-pattern swc plugin   |        215.5 ns |     4,640,000 | (209.4 ns … 241.5 ns) | 216.3 ns | 233.9 ns | 238.6 ns |

summary
  ts-pattern swc plugin
    11.34x faster than ts-pattern raw

group type-narrowing
| ts-pattern raw          |        544.6 ns |     1,836,000 | (528.9 ns … 623.3 ns) | 545.6 ns | 603.7 ns | 623.3 ns |
| ts-pattern swc plugin   |         25.0 ns |    40,080,000 | ( 24.0 ns …  48.6 ns) |  25.2 ns |  28.6 ns |  33.1 ns |

summary
  ts-pattern swc plugin
    21.83x faster than ts-pattern raw
```

<!-- /automd -->

## Supported input

The transformer handles chains that start from `match(value)` imported from `ts-pattern` and end in `.otherwise(handler)` or `.exhaustive()`.

Supported patterns:

- primitive literals: string, number, bigint, boolean, `null`, `undefined`
- object and array literal patterns
- `P._`
- `P.string`, `P.number`, `P.boolean`, `P.bigint`, `P.symbol`, `P.nullish`, `P.nonNullable`
- `P.optional(pattern)`, `P.not(pattern)`, `P.union(...patterns)`, `P.array(pattern?)`, `P.instanceOf(Ctor)`, `P.when(predicate)`

Unsupported chains are left unchanged to preserve runtime behavior. `P.select`, custom matcher objects, `.returnType`, and selection arguments are not compiled yet.
