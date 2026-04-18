import type { ParsedStatement, ParsedTransaction } from '@/types/financials'

interface QIFParseResult {
  success: boolean
  data?: ParsedStatement
  error?: string
  format?: string
}

/**
 * Parses a QIF (Quicken Interchange Format) bank statement.
 * QIF is line-based: each line starts with a type code letter followed by the value.
 * Records are separated by `^` on its own line. Cost: $0 — no AI needed.
 *
 * Limitation: QIF files don't carry account number / BSB, so the returned
 * `account_number_last4` will be empty. The user must manually attach each
 * imported QIF statement to the correct account via the post-import mapping UI.
 */
export function parseQIF(content: string, fileName: string): QIFParseResult {
  try {
    const lines = content.split(/\r?\n/)
    if (lines.length === 0) return { success: false, error: 'QIF file is empty' }

    // Detect header (e.g. "!Type:Bank", "!Type:CCard", "!Type:Cash")
    let accountType: ParsedStatement['account_type'] = 'personal_cheque'
    let headerLine = ''
    for (const raw of lines) {
      const l = raw.trim()
      if (l.startsWith('!')) {
        headerLine = l
        break
      }
      if (l === '' ) continue
      break
    }
    if (headerLine) {
      const h = headerLine.toLowerCase()
      if (h.includes('ccard')) accountType = 'credit_card'
      else if (h.includes('cash')) accountType = 'personal_cheque'
      else if (h.includes('bank')) accountType = 'personal_cheque'
      else if (h.includes('oth a')) accountType = 'personal_savings'
    }

    const transactions: ParsedTransaction[] = []
    let current: Partial<ParsedTransaction> & { _payee?: string; _memo?: string; _dateRaw?: string; _amountRaw?: string } = {}

    const commit = () => {
      const dateRaw = current._dateRaw
      const amtRaw = current._amountRaw
      if (!dateRaw || !amtRaw) {
        current = {}
        return
      }
      const isoDate = parseQIFDate(dateRaw)
      if (!isoDate) {
        current = {}
        return
      }
      const amount = parseFloat(amtRaw.replace(/,/g, ''))
      if (isNaN(amount)) {
        current = {}
        return
      }
      const description = (current._memo || current._payee || '').trim()
      transactions.push({
        transaction_date: isoDate,
        description_raw: description,
        amount,
        is_debit: amount < 0,
        running_balance: null,
        merchant_name: inferMerchant(current._payee || current._memo || ''),
        category: 'OTHER',
        subcategory: null,
        is_subscription: false,
        subscription_frequency: null,
        is_tax_deductible: false,
        tax_category: null,
      })
      current = {}
    }

    for (const raw of lines) {
      const line = raw.replace(/\r$/, '')
      if (line.startsWith('!')) continue
      if (line.trim() === '^') {
        commit()
        continue
      }
      if (line.length === 0) continue

      const code = line.charAt(0)
      const value = line.slice(1).trim()

      switch (code) {
        case 'D':
          current._dateRaw = value
          break
        case 'T':
        case 'U':
          current._amountRaw = value
          break
        case 'P':
          current._payee = value
          break
        case 'M':
          current._memo = value
          break
        // N (check num), C (cleared), L (category), S (split category), A (address) — ignored
      }
    }
    // Flush trailing record if file didn't end with ^
    if (current._dateRaw && current._amountRaw) commit()

    if (transactions.length === 0) {
      return { success: false, error: 'No transactions found in QIF file' }
    }

    const dates = transactions.map((t) => t.transaction_date).sort()
    const statementStart = dates[0]
    const statementEnd = dates[dates.length - 1]

    return {
      success: true,
      format: 'QIF',
      data: {
        bank_name: detectBankFromFilename(fileName),
        account_name: '',
        account_number_last4: '',
        bsb: null,
        account_type: accountType,
        statement_start: statementStart,
        statement_end: statementEnd,
        opening_balance: 0,
        closing_balance: 0,
        transactions,
      },
    }
  } catch (err: any) {
    return { success: false, error: `QIF parse error: ${err.message}` }
  }
}

/**
 * Parse QIF date. Accepts D/M/YYYY (Australian default), M/D/YYYY, or ISO.
 * QIF allows `/`, `-`, `.` as separators and 2- or 4-digit years.
 * Heuristic: if first field > 12, it's day-first. If second > 12, month-first.
 * Otherwise assume day-first (AU convention).
 */
function parseQIFDate(raw: string): string | null {
  const cleaned = raw.replace(/['"]/g, '').trim()
  const m = cleaned.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/)
  if (!m) return null
  const a = parseInt(m[1], 10)
  const b = parseInt(m[2], 10)
  const c = parseInt(m[3], 10)

  // ISO: YYYY-MM-DD
  if (m[1].length === 4) {
    return `${m[1]}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`
  }

  // Year is last field — normalize 2-digit year
  let year = c
  if (m[3].length === 2) year = c >= 70 ? 1900 + c : 2000 + c

  let day: number
  let month: number
  if (a > 12) {
    day = a
    month = b
  } else if (b > 12) {
    month = a
    day = b
  } else {
    // Ambiguous — assume day-first (Australian)
    day = a
    month = b
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function detectBankFromFilename(fileName: string): string {
  const s = fileName.toLowerCase()
  if (/commbank|commonwealth|cba/.test(s)) return 'CBA'
  if (/\banz\b/.test(s)) return 'ANZ'
  if (/westpac|wbc/.test(s)) return 'WBC'
  if (/\bnab\b/.test(s)) return 'NAB'
  if (/st\.?\s*george/.test(s)) return 'St.George'
  if (/macquarie/.test(s)) return 'Macquarie'
  if (/ing/.test(s)) return 'ING'
  return 'Unknown'
}

function inferMerchant(desc: string): string | null {
  if (!desc) return null
  const clean = desc
    .replace(/^(EFTPOS|VISA|MASTERCARD|DIRECT DEBIT|TRANSFER|BPAY|ATM|INT'L|TFR)\s*/i, '')
    .replace(/\s+\d{2}\/\d{2}.*$/, '')
    .replace(/\s+(AU|AUS|AUSTRALIA|NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s*$/i, '')
    .replace(/\s+\d{4,}.*$/, '')
    .trim()
  if (clean.length < 2) return null
  return clean
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
