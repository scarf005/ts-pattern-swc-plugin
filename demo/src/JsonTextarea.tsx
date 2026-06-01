import { useRef } from 'react'

type JsonToken = {
  className: string
  text: string
}

const jsonTokenPattern = /(\/\/.*|\/\*.*?\*\/|"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|\b(?:true|false|null)\b|[{}[\],:])/gi

const jsonClassFor = (text: string) => {
  if (text.startsWith('//') || text.startsWith('/*')) return 'json-comment'
  if (/^"/.test(text)) return 'json-string'
  if (/^-?\d/.test(text)) return 'json-number'
  if (/^(true|false)$/i.test(text)) return 'json-boolean'
  if (/^null$/i.test(text)) return 'json-null'
  return 'json-punctuation'
}

const jsonTokensFor = (line: string) => {
  const tokens: JsonToken[] = []
  let cursor = 0

  for (const match of line.matchAll(jsonTokenPattern)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ className: '', text: line.slice(cursor, index) })
    const text = match[0]
    const nextNonSpace = line.slice(index + text.length).trimStart()[0]
    tokens.push({ className: text.startsWith('"') && nextNonSpace === ':' ? 'json-key' : jsonClassFor(text), text })
    cursor = index + text.length
  }

  if (cursor < line.length) tokens.push({ className: '', text: line.slice(cursor) })
  return tokens
}

export const JsonTextarea = ({
  label,
  onChange,
  readOnly = false,
  value,
}: {
  label: string
  onChange?: (value: string) => void
  readOnly?: boolean
  value: string
}) => {
  const highlightRef = useRef<HTMLPreElement>(null)

  return (
    <div className={readOnly ? 'json-input readonly' : 'json-input'}>
      <pre aria-hidden="true" className="json-highlight" ref={highlightRef}>
        <code>
          {value.split('\n').map((line, lineIndex) => (
            <span className="code-line" key={lineIndex}>
              {jsonTokensFor(line).map((token, tokenIndex) => token.className
                ? <span className={token.className} key={tokenIndex}>{token.text}</span>
                : <span key={tokenIndex}>{token.text}</span>
              )}
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
      <textarea
        aria-label={label}
        className="json-textarea"
        spellCheck={false}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        onScroll={(event) => {
          if (highlightRef.current) {
            highlightRef.current.scrollTop = event.currentTarget.scrollTop
            highlightRef.current.scrollLeft = event.currentTarget.scrollLeft
          }
        }}
      />
    </div>
  )
}
