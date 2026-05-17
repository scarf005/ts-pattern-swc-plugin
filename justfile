web:
    cd web && deno task dev

test:
    cd web && deno task test

bench:
    cd web && deno task bench

check-examples:
    cd examples && deno task check

bench-ts-pattern: bench
