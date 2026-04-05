import type { ParsedStatement, ParsedTransaction } from '@/types/financials'

interface QFXParseResult {
  success: boolean
  data?: ParsedStatement
  error?: string
  format?: string
}

/**
 * Parses a QFX/OFX bank statement file into structured data.
 * QFX is an XML-like format (SGML) with tagged financial data.
 * Cost: $0 — no AI needed.
 */
export function parseQFX(content: string, fileName: string): QFXParseResult {
  try {
    // Extract key fields using regex (OFX/QFX is SGML, not proper XML)
    const bankId = extractTag(content, 'BANKID') || extractTag(content, 'BROKERID')
    const acctId = extractTag(content, 'ACCTID')
    const acctType = extractTag(content, 'ACCTTYPE')
    const isCreditCard = /<CCACCTFROM>/i.test(content)
    const currency = extractTag(content, 'CURDEF') || 'AUD'
    const dtStart = extractTag(content, 'DTSTART')
    const dtEnd = extractTag(content, 'DTEND')
    const ledgerBal = extractTag(content, 'BALAMT')
    const orgName = extractTag(content, 'ORG')

    // Parse transactions
    const transactions: ParsedTransaction[] = []
    const txnBlocks = content.split(/<STMTTRN>/).slice(1)

    for (let i = 0; i < txnBlocks.length; i++) {
      const block = txnBlocks[i].split(/<\/STMTTRN>/)[0] || txnBlocks[i]

      const trnType = extractTag(block, 'TRNTYPE')
      const dtPosted = extractTag(block, 'DTPOSTED')
      const amount = extractTag(block, 'TRNAMT')
      const name = extractTag(block, 'NAME')
      const memo = extractTag(block, 'MEMO')
      const fitId = extractTag(block, 'FITID')

      if (!dtPosted || !amount) continue

      const isoDate = parseOFXDate(dtPosted)
      if (!isoDate) continue

      const amountNum = parseFloat(amount)
      if (isNaN(amountNum)) continue

      const description = memo || name || ''

      transactions.push({
        transaction_date: isoDate,
        description_raw: description,
        amount: amountNum,
        is_debit: amountNum < 0,
        running_balance: null,
        merchant_name: inferMerchant(name || memo || ''),
        category: 'OTHER',
        subcategory: null,
        is_subscription: false,
        subscription_frequency: null,
        is_tax_deductible: false,
        tax_category: null,
      })
    }

    if (transactions.length === 0) {
      return { success: false, error: 'No transactions found in QFX/OFX file' }
    }

    // Determine date range
    const dates = transactions.map((t) => t.transaction_date).sort()
    const statementStart = dtStart ? parseOFXDate(dtStart) || dates[0] : dates[0]
    const statementEnd = dtEnd ? parseOFXDate(dtEnd) || dates[dates.length - 1] : dates[dates.length - 1]

    // Detect bank name
    const bankName = detectBank(orgName, bankId, fileName)

    // Format BSB from BANKID (Australian BSBs are 6 digits)
    let bsb: string | null = null
    if (bankId) {
      const digits = bankId.replace(/\D/g, '')
      if (digits.length === 6) {
        bsb = `${digits.slice(0, 3)}-${digits.slice(3)}`
      } else if (bankId.includes('-')) {
        bsb = bankId
      }
    }

    // Map OFX account type
    const accountType = isCreditCard ? 'credit_card' as const : mapAccountType(acctType)

    return {
      success: true,
      format: 'QFX/OFX',
      data: {
        bank_name: bankName,
        account_name: '',
        account_number_last4: acctId ? acctId.slice(-4) : '',
        bsb,
        account_type: accountType,
        statement_start: statementStart,
        statement_end: statementEnd,
        opening_balance: 0,
        closing_balance: ledgerBal ? parseFloat(ledgerBal) : 0,
        transactions,
      },
    }
  } catch (err: any) {
    return { success: false, error: `QFX parse error: ${err.message}` }
  }
}

// --- Helpers ---

/** Extract a tag value from OFX/SGML content */
function extractTag(content: string, tag: string): string | null {
  // OFX tags can be: <TAG>value or <TAG>value</TAG> or <TAG>value\n
  const regex = new RegExp(`<${tag}>([^<\\n]+)`, 'i')
  const match = content.match(regex)
  return match ? match[1].trim() : null
}

/** Parse OFX date format: YYYYMMDD or YYYYMMDDHHMMSS */
function parseOFXDate(raw: string): string | null {
  const clean = raw.replace(/\[.*$/, '').trim() // Remove timezone bracket
  if (clean.length >= 8) {
    const year = clean.slice(0, 4)
    const month = clean.slice(4, 6)
    const day = clean.slice(6, 8)
    return `${year}-${month}-${day}`
  }
  return null
}

function detectBank(org: string | null, bankId: string | null, fileName: string): string {
  const text = `${org || ''} ${bankId || ''} ${fileName}`.toLowerCase()
  if (/commbank|commonwealth|cba/.test(text)) return 'CommBank'
  if (/\banz\b/.test(text)) return 'ANZ'
  if (/westpac|wbc/.test(text)) return 'Westpac'
  if (/\bnab\b|national australia/.test(text)) return 'NAB'
  if (/st\.?\s*george/.test(text)) return 'St.George'
  if (/macquarie/.test(text)) return 'Macquarie'
  if (/ing/.test(text)) return 'ING'
  if (org) return org
  return 'Unknown'
}

function mapAccountType(ofxType: string | null): 'personal_cheque' | 'personal_savings' | 'business_cheque' | 'credit_card' {
  switch (ofxType?.toUpperCase()) {
    case 'CHECKING': return 'personal_cheque'
    case 'SAVINGS': return 'personal_savings'
    case 'CREDITLINE':
    case 'CREDITCARD': return 'credit_card'
    default: return 'personal_cheque'
  }
}

function inferMerchant(desc: string): string | null {
  if (!desc) return null
  let clean = desc
    .replace(/^(EFTPOS|VISA|MASTERCARD|DIRECT DEBIT|TRANSFER|BPAY|ATM|INT'L)\s*/i, '')
    .replace(/\s+\d{2}\/\d{2}.*$/, '')
    .replace(/\s+(AU|AUS|AUSTRALIA|NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s*$/i, '')
    .replace(/\s+\d{4,}.*$/, '')
    .trim()
  if (clean.length < 2) return null
  return clean.split(/\s+/).map((w) =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(' ')
}
