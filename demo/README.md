# ts-pattern SWC plugin Vite demo

Create Vite React TypeScript app that installs the local npm package:

```sh
npm install
npm run build
npm run test:browser
```

The page accepts a JSON textarea of Result records to parse and render, then compares three async benchmark columns:

- `ts-pattern AS-IS`
- `ts-pattern with swc-plugin`
- `plain JS with switch/if`

