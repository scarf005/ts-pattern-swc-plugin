web:
    cd web && deno task dev

check-examples:
    cd examples && deno task check

bench-ts-pattern:
    cd web && deno task bench
