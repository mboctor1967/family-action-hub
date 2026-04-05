/**
 * Extracts metadata from filename patterns.
 * Common Australian bank statement naming patterns:
 * - "ANZ_Statement_Jan2024.pdf"
 * - "CommBank_12345678_2024-01.pdf"
 * - "Westpac Statement - January 2024.pdf"
 * - "NAB_PersonalTransaction_20240101_20240131.pdf"
 */
export function parseFilenameMetadata(filename: string): {
  bank: string | null
  period: string | null
  accountHint: string | null
} {
  const name = filename.replace(/\.pdf$/i, '')

  // Detect bank from filename
  let bank: string | null = null
  const bankPatterns: [RegExp, string][] = [
    [/\banz\b/i, 'ANZ'],
    [/\bcommbank\b|\bcba\b|\bcommonwealth\b/i, 'CommBank'],
    [/\bwestpac\b|\bwbc\b/i, 'Westpac'],
    [/\bnab\b|\bnational\s*australia/i, 'NAB'],
    [/\bst\.?\s*george\b|\bstgeorge\b/i, 'St.George'],
    [/\bmacquarie\b/i, 'Macquarie'],
    [/\bing\b/i, 'ING'],
    [/\bbankwest\b/i, 'Bankwest'],
    [/\bbendigo\b/i, 'Bendigo Bank'],
    [/\bsuncorp\b/i, 'Suncorp'],
    [/\bhsbc\b/i, 'HSBC'],
    [/\bciti\b/i, 'Citi'],
    [/\bups\b/i, 'UPS'],
    [/\bamex\b|\bamerican\s*express\b/i, 'Amex'],
  ]

  for (const [pattern, bankName] of bankPatterns) {
    if (pattern.test(name)) {
      bank = bankName
      break
    }
  }

  // Detect period from filename
  let period: string | null = null

  // Pattern: YYYYMMDD_YYYYMMDD or YYYY-MM-DD_YYYY-MM-DD
  const dateRangeMatch = name.match(/(\d{4})[_-]?(\d{2})[_-]?(\d{2})[_\s-]+(\d{4})[_-]?(\d{2})[_-]?(\d{2})/)
  if (dateRangeMatch) {
    period = `${dateRangeMatch[1]}-${dateRangeMatch[2]}-${dateRangeMatch[3]} to ${dateRangeMatch[4]}-${dateRangeMatch[5]}-${dateRangeMatch[6]}`
  }

  // Pattern: YYYY-MM or YYYY_MM
  if (!period) {
    const yearMonthMatch = name.match(/(\d{4})[_-](\d{2})(?!\d)/)
    if (yearMonthMatch) {
      period = `${yearMonthMatch[1]}-${yearMonthMatch[2]}`
    }
  }

  // Pattern: Month names (Jan, January, etc.)
  if (!period) {
    const monthNames = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
    const monthMatch = name.match(monthNames)
    const yearMatch = name.match(/\b(20\d{2})\b/)
    if (monthMatch && yearMatch) {
      period = `${monthMatch[1]} ${yearMatch[1]}`
    }
  }

  // Detect account hints (sequences of 4-8 digits that could be account numbers)
  let accountHint: string | null = null
  const acctMatch = name.match(/\b(\d{4,8})\b/)
  if (acctMatch && !acctMatch[1].match(/^20\d{2}$/)) {
    // Exclude years
    accountHint = acctMatch[1]
  }

  return { bank, period, accountHint }
}

/**
 * Extracts metadata from the first chunk of PDF text.
 * Looks for bank names, account numbers, BSB, statement dates.
 */
export function parseTextMetadata(text: string): {
  bank: string | null
  accountNumber: string | null
  bsb: string | null
  period: string | null
} {
  // Only look at first 500 chars for speed
  const header = text.slice(0, 1000)

  // Detect bank
  let bank: string | null = null
  const bankTextPatterns: [RegExp, string][] = [
    [/\bANZ\b|Australia and New Zealand/i, 'ANZ'],
    [/\bCommonwealth Bank\b|\bCommBank\b|\bCBA\b/i, 'CommBank'],
    [/\bWestpac\b/i, 'Westpac'],
    [/\bNational Australia Bank\b|\bNAB\b/i, 'NAB'],
    [/\bSt\.?\s*George\b/i, 'St.George'],
    [/\bMacquarie\b/i, 'Macquarie'],
    [/\bING\b/i, 'ING'],
    [/\bBankwest\b/i, 'Bankwest'],
    [/\bHSBC\b/i, 'HSBC'],
    [/\bCiti(?:bank)?\b/i, 'Citi'],
    [/\bAmerican Express\b|\bAmex\b/i, 'Amex'],
  ]

  for (const [pattern, bankName] of bankTextPatterns) {
    if (pattern.test(header)) {
      bank = bankName
      break
    }
  }

  // BSB (xxx-xxx format)
  const bsbMatch = header.match(/\b(\d{3}[-\s]?\d{3})\b/)
  const bsb = bsbMatch ? bsbMatch[1].replace(/\s/g, '') : null

  // Account number (look for "Account" followed by digits)
  const acctMatch = header.match(/Account\s*(?:No\.?|Number|#)?\s*:?\s*(\d[\d\s-]{4,})/i)
  const accountNumber = acctMatch ? acctMatch[1].replace(/\s/g, '').slice(-4) : null

  // Statement period
  let period: string | null = null
  const periodMatch = header.match(/(\d{1,2}[\s/.-]\w+[\s/.-]\d{2,4})\s*(?:to|-|–)\s*(\d{1,2}[\s/.-]\w+[\s/.-]\d{2,4})/i)
  if (periodMatch) {
    period = `${periodMatch[1]} to ${periodMatch[2]}`
  }

  return { bank, accountNumber, bsb, period }
}
