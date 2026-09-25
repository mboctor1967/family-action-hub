import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * P3 AC-009 (DEC-4). Drive was used only by the statement and invoice ingest that
 * moved to boctor-financials. The hub asks Google only for what it still uses:
 * sign-in plus read-only Gmail for the scanner.
 */
describe('Google OAuth scopes', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/auth.ts'), 'utf8')
  const scope = src.match(/scope:\s*'([^']+)'/)?.[1] ?? ''

  it('requests Gmail read-only for the scanner', () => {
    expect(scope.split(' ')).toContain('https://www.googleapis.com/auth/gmail.readonly')
  })

  it('no longer requests Google Drive', () => {
    expect(scope).not.toMatch(/drive/)
  })

  it('still asks for a refresh token, so the daily scan can run unattended', () => {
    expect(src).toMatch(/access_type:\s*'offline'/)
  })
})
