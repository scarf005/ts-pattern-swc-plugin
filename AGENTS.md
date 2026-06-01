# Repository Rules

- When the user requests pointer, keyboard, or wheel interaction changes, implement that exact interaction and verify the same gesture locally before finishing.
- Do not replace a requested interaction with suppression behavior unless the user explicitly asks to suppress it.
- In Deno-managed projects, do not run npm install unless a package.json workflow exists or the user explicitly requests npm.
- For Vite demo/plugin changes, verify the dev-served entry module (`/src/App.tsx`) still contains its default export in addition to browser smoke tests.
