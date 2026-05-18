web:
    cd web && deno task dev

test:
    cargo test --manifest-path plugin/Cargo.toml
    cargo build --manifest-path plugin/Cargo.toml --release --target wasm32-wasip1
    cd web && deno task check
    cd web && deno task test
    just check-examples
    just test-vendored-ts-pattern

bench:
    cd web && deno task bench

check-examples:
    cd examples && deno task check

test-vendored-ts-pattern:
    deno run -A --unstable-detect-cjs scripts/check-vendored-ts-pattern-swc.ts
    cd vendor/ts-pattern && npm ci
    cd vendor/ts-pattern && npm test

bench-ts-pattern: bench

update-readme-bench:
    mkdir -p docs
    NO_COLOR=1 just bench > docs/just-bench.txt
    deno run -A npm:automd --input plugin/README.md
