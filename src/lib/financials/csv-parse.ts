import type { ParsedStatement, ParsedTransaction } from '@/types/financials'

interface CSVParseResult {
  success: boolean
  data?: ParsedStatement
  error?: string
  format?: string
}

/**
 * Parses a bank statement CSV file into structured data.
 * Auto-detects bank format from headers and content patterns.
 * Cost: $0 — no AI needed.
 */
export function parseCSV(content: string, fileName: string): CSVParseResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    return { success: false, error: 'CSV file is empty or has no data rows' }
  }

  // Try each bank format
  const parsers = [
    tryCommBankNoHeader,
    tryCommBank,
    tryANZ,
    tryWestpac,
    tryNAB,
    tryGenericCSV,
  ]

  for (const parser of parsers) {
    const result = parser(lines, fileName)
    if (result.success) return result
  }

  return { success: false, error: 'Could not detect CSV format. Supported: CommBank, ANZ, Westpac, NAB.' }
}

/**
 * CommBank CSV format WITHOUT header row:
 * DD/MM/YYYY,"+/-amount","description","+/-balance"
 * e.g.: 31/03/2026,"-8000.00","Transfer to xx9563 CommBank app","+1377.44"
 */
function tryCommBankNoHeader(lines: string[], fileName: string): CSVParseResult {
  // Check if first line matches the pattern: date, quoted amount with +/-, quoted description, quoted balance
  const firstCols = parseCSVLine(lines[0])
  if (firstCols.length < 3) return { success: false }

  // Check: first col is a date, second col starts with + or - or is a number
  const firstDate = parseAusDate(firstCols[0]?.trim())
  const firstAmount = firstCols[1]?.trim().replace(/["+$,]/g, '')
  if (!firstDate || isNaN(parseFloat(firstAmount))) return { success: false }

  // Looks like headerless CommBank format: Date, Amount, Description, Balance
  const transactions: ParsedTransaction[] = []
  let minDate = '9999-12-31'
  let maxDate = '0000-01-01'
  let firstBalance: number | null = null
  let lastBalance: number | null = null

  for (let i = 0; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length < 3) continue

    const rawDate = cols[0]?.trim()
    const rawAmount = cols[1]?.trim().replace(/["+$,]/g, '')
    const rawDesc = cols[2]?.trim()
    const rawBalance = cols.length >= 4 ? cols[3]?.trim().replace(/["+$,]/g, '') : null

    if (!rawDate || !rawAmount) continue

    const isoDate = parseAusDate(rawDate)
    if (!isoDate) continue

    const amount = parseFloat(rawAmount)
    if (isNaN(amount)) continue

    if (isoDate < minDate) minDate = isoDate
    if (isoDate > maxDate) maxDate = isoDate

    const balance = rawBalance ? parseFloat(rawBalance) : null
    if (balance !== null && !isNaN(balance)) {
      if (firstBalance === null) firstBalance = balance
      lastBalance = balance
    }

    transactions.push({
      transaction_date: isoDate,
      description_raw: rawDesc,
      amount,
      is_debit: amount < 0,
      running_balance: balance,
      merchant_name: inferMerchant(rawDesc),
      category: 'OTHER',
      subcategory: null,
      is_subscription: false,
      subscription_frequency: null,
      is_tax_deductible: false,
      tax_category: null,
    })
  }

  if (transactions.length === 0) return { success: false }

  // Detect bank from filename or descriptions
  const isCommBank = /commbank|cba|commonwealth/i.test(fileName) ||
    lines.some((l) => /commbank|CommBank app|NetBank|CBA Account/i.test(l))

  const openBal = firstBalance !== null && transactions[0]
    ? firstBalance - transactions[0].amount
    : firstBalance ?? 0

  return {
    success: true,
    format: 'CommBank CSV (no header)',
    data: {
      bank_name: isCommBank ? 'CommBank' : detectBankFromContent(lines, fileName),
      account_name: '',
      account_number_last4: '',
      bsb: null,
      account_type: 'personal_cheque',
      statement_start: minDate,
      statement_end: maxDate,
      opening_balance: openBal,
      closing_balance: lastBalance ?? 0,
      transactions,
    },
  }
}

/**
 * CommBank CSV format WITH header row:
 * Date,Amount,Description,Balance
 * Date format: DD/MM/YYYY
 */
function tryCommBank(lines: string[], fileName: string): CSVParseResult {
  // Find the header row
  const headerIdx = lines.findIndex((l) =>
    /date/i.test(l) && /amount/i.test(l) && /description/i.test(l)
  )
  if (headerIdx === -1) return { success: false }

  const headers = parseCSVLine(lines[headerIdx]).map((h) => h.toLowerCase().trim())
  const dateCol = headers.findIndex((h) => h === 'date')
  const amountCol = headers.findIndex((h) => h === 'amount')
  const descCol = headers.findIndex((h) => h.includes('description') || h.includes('narrative'))
  const balanceCol = headers.findIndex((h) => h === 'balance')

  if (dateCol === -1 || amountCol === -1 || descCol === -1) return { success: false }

  const transactions: ParsedTransaction[] = []
  let minDate = '9999-12-31'
  let maxDate = '0000-01-01'
  let firstBalance: number | null = null
  let lastBalance: number | null = null

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length <= Math.max(dateCol, amountCol, descCol)) continue

    const rawDate = cols[dateCol]?.trim()
    const rawAmount = cols[amountCol]?.trim().replace(/[,$"]/g, '')
    const rawDesc = cols[descCol]?.trim()
    const rawBalance = balanceCol >= 0 ? cols[balanceCol]?.trim().replace(/[,$"]/g, '') : null

    if (!rawDate || !rawAmount) continue

    const isoDate = parseAusDate(rawDate)
    if (!isoDate) continue

    const amount = parseFloat(rawAmount)
    if (isNaN(amount)) continue

    if (isoDate < minDate) minDate = isoDate
    if (isoDate > maxDate) maxDate = isoDate

    const balance = rawBalance ? parseFloat(rawBalance) : null
    if (balance !== null && !isNaN(balance)) {
      if (firstBalance === null) firstBalance = balance
      lastBalance = balance
    }

    transactions.push({
      transaction_date: isoDate,
      description_raw: rawDesc,
      amount,
      is_debit: amount < 0,
      running_balance: balance,
      merchant_name: inferMerchant(rawDesc),
      category: 'OTHER',
      subcategory: null,
      is_subscription: false,
      subscription_frequency: null,
      is_tax_deductible: false,
      tax_category: null,
    })
  }

  if (transactions.length === 0) return { success: false }

  // Detect bank from filename or content
  const isCommBank = /commbank|cba|commonwealth/i.test(fileName) ||
    lines.some((l) => /commbank|commonwealth/i.test(l))

  // Estimate opening balance from first transaction
  const openBal = firstBalance !== null && transactions[0]
    ? firstBalance - transactions[0].amount
    : firstBalance ?? 0

  return {
    success: true,
    format: 'CommBank CSV',
    data: {
      bank_name: isCommBank ? 'CommBank' : detectBankFromContent(lines, fileName),
      account_name: extractAccountInfo(lines, headerIdx) || '',
      account_number_last4: extractAccountNumber(lines, headerIdx) || '',
      bsb: null,
      account_type: 'personal_cheque',
      statement_start: minDate,
      statement_end: maxDate,
      opening_balance: openBal,
      closing_balance: lastBalance ?? 0,
      transactions,
    },
  }
}

/**
 * ANZ CSV format:
 * Often: Date,Amount,Description or Type,Details,Date,Debit,Credit,Balance
 */
function tryANZ(lines: string[], fileName: string): CSVParseResult {
  if (!/anz/i.test(fileName) && !lines.some((l) => /\banz\b/i.test(l))) {
    return { success: false }
  }

  // ANZ sometimes has: Type,Details,Particulars,Code,Reference,Amount,Date,ForeignCurrencyAmount,ConversionCharge
  const headerIdx = lines.findIndex((l) =>
    (/type/i.test(l) && /details/i.test(l)) ||
    (/date/i.test(l) && (/debit/i.test(l) || /credit/i.test(l)))
  )

  if (headerIdx === -1) return { success: false }
  return tryGenericCSVWithBank(lines, fileName, headerIdx, 'ANZ')
}

/**
 * Westpac CSV format:
 * Often: Bank Account,Date,Narrative,Debit Amount,Credit Amount,Balance,Categories,Serial Number
 */
function tryWestpac(lines: string[], fileName: string): CSVParseResult {
  if (!/westpac|wbc/i.test(fileName) && !lines.some((l) => /westpac/i.test(l))) {
    return { success: false }
  }

  const headerIdx = lines.findIndex((l) =>
    /bank\s*account/i.test(l) || (/narrative/i.test(l) && /debit/i.test(l))
  )

  if (headerIdx === -1) return { success: false }
  return tryGenericCSVWithBank(lines, fileName, headerIdx, 'Westpac')
}

/**
 * NAB CSV format
 */
function tryNAB(lines: string[], fileName: string): CSVParseResult {
  if (!/\bnab\b/i.test(fileName) && !lines.some((l) => /\bnab\b|national australia/i.test(l))) {
    return { success: false }
  }
  return tryGenericCSVWithBank(lines, fileName, -1, 'NAB')
}

/**
 * Generic CSV parser — tries to find date/amount/description columns by header names.
 */
function tryGenericCSV(lines: string[], fileName: string): CSVParseResult {
  return tryGenericCSVWithBank(lines, fileName, -1, detectBankFromContent(lines, fileName))
}

function tryGenericCSVWithBank(lines: string[], fileName: string, knownHeaderIdx: number, bankName: string): CSVParseResult {
  // Find header row
  let headerIdx = knownHeaderIdx
  if (headerIdx === -1) {
    headerIdx = lines.findIndex((l) => /date/i.test(l) && (/amount|debit|credit/i.test(l)))
  }
  if (headerIdx === -1) {
    // Try first row
    headerIdx = 0
  }

  const headers = parseCSVLine(lines[headerIdx]).map((h) => h.toLowerCase().trim())

  // Find columns
  const dateCol = headers.findIndex((h) => /^date$|transaction.?date/i.test(h))
  const amountCol = headers.findIndex((h) => /^amount$/i.test(h))
  const debitCol = headers.findIndex((h) => /debit/i.test(h))
  const creditCol = headers.findIndex((h) => /credit/i.test(h))
  const descCol = headers.findIndex((h) => /desc|narrative|details|particular|memo/i.test(h))
  const balanceCol = headers.findIndex((h) => /balance/i.test(h))

  if (dateCol === -1) return { success: false }
  if (amountCol === -1 && debitCol === -1 && creditCol === -1) return { success: false }

  const transactions: ParsedTransaction[] = []
  let minDate = '9999-12-31'
  let maxDate = '0000-01-01'
  let firstBalance: number | null = null
  let lastBalance: number | null = null

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length < 3) continue

    const rawDate = cols[dateCol]?.trim()
    if (!rawDate) continue
    const isoDate = parseAusDate(rawDate)
    if (!isoDate) continue

    let amount: number
    if (amountCol >= 0) {
      amount = parseFloat((cols[amountCol] || '').replace(/[,$"]/g, ''))
    } else {
      const debit = parseFloat((cols[debitCol] || '').replace(/[,$"]/g, '')) || 0
      const credit = parseFloat((cols[creditCol] || '').replace(/[,$"]/g, '')) || 0
      amount = credit > 0 ? credit : -Math.abs(debit)
    }
    if (isNaN(amount) || amount === 0) continue

    if (isoDate < minDate) minDate = isoDate
    if (isoDate > maxDate) maxDate = isoDate

    const desc = descCol >= 0 ? (cols[descCol] || '').trim() : ''
    const balance = balanceCol >= 0 ? parseFloat((cols[balanceCol] || '').replace(/[,$"]/g, '')) : null
    if (balance !== null && !isNaN(balance)) {
      if (firstBalance === null) firstBalance = balance
      lastBalance = balance
    }

    transactions.push({
      transaction_date: isoDate,
      description_raw: desc,
      amount,
      is_debit: amount < 0,
      running_balance: balance !== null && !isNaN(balance) ? balance : null,
      merchant_name: inferMerchant(desc),
      category: 'OTHER',
      subcategory: null,
      is_subscription: false,
      subscription_frequency: null,
      is_tax_deductible: false,
      tax_category: null,
    })
  }

  if (transactions.length === 0) return { success: false }

  const openBal = firstBalance !== null && transactions[0]
    ? firstBalance - transactions[0].amount
    : 0

  return {
    success: true,
    format: `${bankName} CSV`,
    data: {
      bank_name: bankName,
      account_name: extractAccountInfo(lines, headerIdx) || '',
      account_number_last4: extractAccountNumber(lines, headerIdx) || '',
      bsb: null,
      account_type: 'personal_cheque',
      statement_start: minDate,
      statement_end: maxDate,
      opening_balance: openBal,
      closing_balance: lastBalance ?? 0,
      transactions,
    },
  }
}

// ---- Helpers ----

/** Parse a CSV line respecting quotes */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result.map((s) => s.replace(/^"|"$/g, '').trim())
}

/** Parse DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD to ISO date */
function parseAusDate(raw: string): string | null {
  // YYYY-MM-DD
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return raw

  // DD/MM/YYYY or DD-MM-YYYY
  const ausMatch = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (ausMatch) {
    const day = ausMatch[1].padStart(2, '0')
    const month = ausMatch[2].padStart(2, '0')
    let year = ausMatch[3]
    if (year.length === 2) year = `20${year}`
    return `${year}-${month}-${day}`
  }

  return null
}

/** Infer merchant name from raw description */
function inferMerchant(desc: string): string | null {
  if (!desc) return null
  // Remove common prefixes and codes
  let clean = desc
    .replace(/^(EFTPOS|VISA|MASTERCARD|DIRECT DEBIT|TRANSFER|BPAY|ATM|INT'L)\s*/i, '')
    .replace(/\s+\d{2}\/\d{2}.*$/, '') // trailing dates
    .replace(/\s+(AU|AUS|AUSTRALIA|NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s*$/i, '') // state codes
    .replace(/\s+\d{4,}.*$/, '') // trailing numbers
    .trim()

  if (clean.length < 2) return null
  // Title case
  return clean.split(/\s+/).map((w) =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(' ')
}

function detectBankFromContent(lines: string[], fileName: string): string {
  const text = lines.slice(0, 5).join(' ') + ' ' + fileName
  if (/commbank|commonwealth|cba/i.test(text)) return 'CommBank'
  if (/\banz\b/i.test(text)) return 'ANZ'
  if (/westpac|wbc/i.test(text)) return 'Westpac'
  if (/\bnab\b|national australia/i.test(text)) return 'NAB'
  if (/st\.?\s*george/i.test(text)) return 'St.George'
  if (/macquarie/i.test(text)) return 'Macquarie'
  return 'Unknown'
}

function extractAccountInfo(lines: string[], headerIdx: number): string | null {
  // Look in lines before header for account info
  for (let i = 0; i < Math.min(headerIdx, 5); i++) {
    const match = lines[i].match(/account\s*(?:name|title)?\s*:?\s*(.+)/i)
    if (match) return match[1].replace(/[",]/g, '').trim()
  }
  return null
}

function extractAccountNumber(lines: string[], headerIdx: number): string | null {
  for (let i = 0; i < Math.min(headerIdx, 5); i++) {
    const match = lines[i].match(/account\s*(?:no|number|#)?\s*:?\s*(\d[\d\s-]{3,})/i)
    if (match) return match[1].replace(/[\s-]/g, '').slice(-4)
  }
  return null
}
