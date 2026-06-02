import { NonExhaustiveError } from 'ts-pattern'
import type { RenderedResult, Result } from './types'
import { textForHtml } from './types'

export const renderWithTsPatternSwc = (result: Result): RenderedResult => {
  let html

  if (!(result !== null && typeof result === 'object' && 'type' in result)) {
    throw new NonExhaustiveError(result)
  }

  switch (result.type) {
    case 'error':
      html = <p>Oups! An error occured</p>
      break
    case 'ok': {
      const _tsPatternData = result.data
      if (!(_tsPatternData !== null && typeof _tsPatternData === 'object' && 'type' in _tsPatternData)) {
        throw new NonExhaustiveError(result)
      }

      switch (_tsPatternData.type) {
        case 'text':
          html = <p>{_tsPatternData.content}</p>
          break
        case 'img':
          if ('src' in _tsPatternData) {
            html = <img src={_tsPatternData.src} />
            break
          }
          throw new NonExhaustiveError(result)
        default:
          throw new NonExhaustiveError(result)
      }
      break
    }
    default:
      throw new NonExhaustiveError(result)
  }

  return { html, text: textForHtml(html) }
}
