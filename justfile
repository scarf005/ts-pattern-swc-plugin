web:
    cd web && deno task dev

test:
    cd web && deno task test

bench:
    cd web && deno task bench

check-examples:
    cd examples && deno task check

bench-ts-pattern: bench

update-readme-bench:
    mkdir -p docs
    NO_COLOR=1 just bench > docs/just-bench.txt
    deno run -A npm:automd --input plugin/README.md
