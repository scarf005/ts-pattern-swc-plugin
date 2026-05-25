# ts-pattern SWC plugin Vite demo

Create Vite React TypeScript app that installs the local npm package:

```sh
npm install
npm run build
npm run test:browser
```

`vite.config.ts` imports `@scarf/ts-pattern-swc-plugin/transform` from the installed package and runs it before React's Vite plugin. The browser test fails on page errors so runtime regressions such as missing React imports are caught.
