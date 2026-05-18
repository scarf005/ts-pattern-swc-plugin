# Release

1. Update `plugin/package.json` and `plugin/deno.json` to the same version.
2. Run `just test`.
3. Commit the version change.
4. Create and push a matching tag:

```sh
git tag v0.1.0
git push origin main v0.1.0
```

The `Release` workflow publishes only from `v*` tags after the test job passes.

Required repository setup:

- npm: configure trusted publishing for this repository, or add an `NPM_TOKEN`
  repository secret.
- JSR: create/claim `@scarf/ts-pattern-swc-plugin` and authorize GitHub Actions
  OIDC for this repository.
- GitHub: protect `main` by requiring the `Test` workflow check before merge.
