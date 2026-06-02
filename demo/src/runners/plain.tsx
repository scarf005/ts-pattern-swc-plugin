import type { RenderedResult, Result } from './types'
import { textForHtml } from './types'

export const renderWithPlainSwitch = (result: Result): RenderedResult => {
  let html

  switch (result.type) {
    case 'error':
      html = <p>Oups! An error occured</p>
      break
    case 'ok': {
      const data = result.data
      switch (data.type) {
        case 'text':
          html = <p>{data.content}</p>
          break
        case 'img':
          html = <img src={data.src} />
          break
      }
      break
    }
  }

  return { html, text: textForHtml(html) }
}
