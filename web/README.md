# Playground

```sh
deno task dev
```

The playground runs the plugin-enabled SWC wasm binding in the browser and passes the Rust plugin bytes through the wasm binding's experimental plugin bytes resolver. Vite only serves static assets during development and copies the plugin wasm into `dist/` for production builds.
