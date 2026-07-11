# Release

1. Update `plugin/package.json`, `plugin/deno.json`, and `plugin/Cargo.toml` to the same version.
2. Run `just test`.
3. Commit the version change.
4. Create and push a matching tag:

```sh
git tag v0.1.0
git push origin main v0.1.0
```

The `Release` workflow publishes to both npm and JSR only from `v*` tags after the test job passes.

Required repository setup:

- npm: create `@scarf005/ts-pattern-swc-plugin`, then configure trusted publishing
  for `.github/workflows/release.yml`, or add an `NPM_TOKEN` repository secret.
- JSR: create/claim `@scarf005/ts-pattern-swc-plugin` and authorize GitHub Actions
  OIDC for this repository.
- GitHub: protect `main` by requiring the `Test` workflow check before merge.
