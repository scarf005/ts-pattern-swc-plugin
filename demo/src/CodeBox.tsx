type Token = {
  className: string
  text: string
}

const tokenPattern = /(\/\/.*|`(?:\\.|[^`])*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|<\/?[A-Za-z][A-Za-z0-9]*|\/?>|\b(?:import|from|type|const|let|switch|case|return|break|if|else)\b|\b(?:match|with|exhaustive|P|Error|Result|Data)\b|\b(?:string|src|content|type|data|error)\b)/g

const classFor = (text: string) => {
  if (text.startsWith('//')) return 'token-comment'
  if (text.startsWith('`') || text.startsWith("'") || text.startsWith('"')) return 'token-string'
  if (/^<\/?[A-Za-z]/.test(text) || text === '>' || text === '/>') return 'token-jsx'
  if (/^(match|with|exhaustive|P|Error|Result|Data)$/.test(text)) return 'token-symbol'
  if (/^(string|src|content|type|data|error)$/.test(text)) return 'token-property'
  return 'token-keyword'
}

const tokensFor = (line: string) => {
  const tokens: Token[] = []
  let cursor = 0

  for (const match of line.matchAll(tokenPattern)) {
    const index = match.index ?? 0
    if (index > cursor) {
      tokens.push({ className: '', text: line.slice(cursor, index) })
    }
    tokens.push({ className: classFor(match[0]), text: match[0] })
    cursor = index + match[0].length
  }

  if (cursor < line.length) {
    tokens.push({ className: '', text: line.slice(cursor) })
  }

  return tokens
}

export const CodeBox = ({ code, label }: { code: string; label: string }) => (
  <pre aria-label={label} aria-readonly="true" className="codebox" role="textbox" tabIndex={0}>
    <code>
      {code.split('\n').map((line, lineIndex) => (
        <span className="code-line" key={lineIndex}>
          {tokensFor(line).map((token, tokenIndex) => token.className
            ? <span className={token.className} key={tokenIndex}>{token.text}</span>
            : <span key={tokenIndex}>{token.text}</span>
          )}
          {'\n'}
        </span>
      ))}
    </code>
  </pre>
)
