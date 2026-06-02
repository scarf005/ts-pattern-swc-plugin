import { match, P } from 'ts-pattern'
import type { RenderedResult, Result } from './types'
import { textForHtml } from './types'

export const renderWithTsPatternSwc = (result: Result): RenderedResult => {
  const html = match(result)
    .with({ type: 'error' }, () => <p>Oups! An error occured</p>)
    .with({ type: 'ok', data: { type: 'text' } }, (res) => <p>{res.data.content}</p>)
    .with({ type: 'ok', data: { type: 'img', src: P.select() } }, (src) => <img src={src} />)
    .exhaustive()

  return { html, text: textForHtml(html) }
}
