export const tsPatternCode = `import { match, P } from 'ts-pattern'

type Data =
  | { type: 'text'; content: string }
  | { type: 'img'; src: string }

type Result =
  | { type: 'ok'; data: Data }
  | { type: 'error'; error: Error }

const result: Result = ...

const html = match(result)
  .with({ type: 'error' }, () => <p>Oups! An error occured</p>)
  .with({ type: 'ok', data: { type: 'text' } }, (res) => <p>{res.data.content}</p>)
  .with({ type: 'ok', data: { type: 'img', src: P.select() } }, (src) => <img src={src} />)
  .exhaustive()`

export const plainSwitchCode = `type Data =
  | { type: 'text'; content: string }
  | { type: 'img'; src: string }

type Result =
  | { type: 'ok'; data: Data }
  | { type: 'error'; error: Error }

const result: Result = ...

let html

switch (result.type) {
  case 'error':
    html = <p>Oups! An error occured</p>
    break
  case 'ok':
    if (result.data.type === 'text') {
      html = <p>{result.data.content}</p>
      break
    }
    html = <img src={result.data.src} />
    break
}`
