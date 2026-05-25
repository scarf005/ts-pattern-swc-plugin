import type { RenderedResult, Result } from './types'
import { textForHtml } from './types'

export const renderWithPlainSwitch = (result: Result): RenderedResult => {
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
  }

  return { html, text: textForHtml(html) }
}
