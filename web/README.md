# Playground

```sh
deno task dev
```

The playground uses a local Vite middleware at `/api/transform` to run `@swc/core` with the real Rust SWC plugin wasm from `../plugin`. The middleware builds the plugin wasm on first start when it is missing.

This is intentionally a local transform endpoint. The browser bundle does not claim to run the Rust SWC plugin directly because stock `@swc/wasm-web` does not host SWC plugins in the browser.
