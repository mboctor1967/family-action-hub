export function parseCommand(text: string): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  while (tokens.length && tokens[0].startsWith('@')) tokens.shift()
  return (tokens[0] ?? '').toLowerCase()
}
