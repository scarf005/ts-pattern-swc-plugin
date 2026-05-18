# Playground

```sh
deno task dev
deno task bench
```

The `bench` task compares the vendored `ts-pattern-benchmark` cases across raw `ts-pattern`, native code, and plugin output, then compares every example with `Deno.bench`.

The playground runs the plugin-enabled SWC wasm binding in the browser and passes the Rust plugin bytes through the wasm binding's experimental plugin bytes resolver. The `prepare-assets` task copies the plugin wasm into `public/`, and the production build copies it into `dist/`. Cloudflare Pages serves routes through `dist/_redirects`.
