/**
 * One-shot AI categorization of uncategorized financial transactions.
 *
 * Groups unclassified debit transactions by (merchant_name, description_snippet),
 * sends unique keys to Claude Haiku 4.5 in batches of 50, maps suggestions back,
 * writes results to financial_transactions.ai_suggested_category.
 *
 * Cost estimate printed before run; pass --yes to skip confirmation.
 */
import { config } from 'dotenv'
import Anthropic from '@anthropic-ai/sdk'
import { neon } from '@neondatabase/serverless'
import { CATEGORIES } from '../src/types/financials'
import * as readline from 'node:readline'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const MODEL = 'claude-haiku-4-5-20251001'
const BATCH_SIZE = 50
const CATEGORY_KEYS = Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]

type Row = {
  id: string
  merchant_name: string | null
  description_raw: string | null
  amount: string
}

type MerchantKey = string // `${merchant_name || description_raw-snippet}`

function makeKey(r: Row): MerchantKey {
  const m = (r.merchant_name || '').trim()
  if (m.length >= 3) return m.toLowerCase()
  const d = (r.description_raw || '').trim()
  return d.slice(0, 40).toLowerCase()
}

async function classify(keys: string[]): Promise<Record<string, string>> {
  const prompt = `You are classifying Australian bank transactions into categories.

Valid categories (pick exactly one per input): ${CATEGORY_KEYS.join(', ')}

Rules:
- Use TRANSFERS only for internal movement between accounts (payment to credit card, transfer between own accounts).
- Use FINANCIAL for bank fees, interest, loan repayments.
- Use HOUSEHOLD BILLS for utilities (electricity, gas, water, internet, phone, council rates).
- Use SUBSCRIPTIONS & DIGITAL for streaming/software subscriptions.
- Prefer specific over generic: "HOUSING" for mortgage, not "FINANCIAL".
- If genuinely ambiguous, use OTHER.

Respond with ONLY a JSON object mapping each input string to a category key, e.g.
{"woolworths nsw": "GROCERIES", "netflix.com": "SUBSCRIPTIONS & DIGITAL"}

Inputs:
${JSON.stringify(keys)}`

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  // Extract JSON from response
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    console.warn('no JSON in response:', text.slice(0, 200))
    return {}
  }
  try {
    const parsed = JSON.parse(match[0])
    const result: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const cat = String(v).trim().toUpperCase()
      if (CATEGORY_KEYS.includes(cat as any)) result[k] = cat
    }
    return result
  } catch (e) {
    console.warn('parse error:', (e as Error).message)
    return {}
  }
}

async function confirm(msg: string): Promise<boolean> {
  if (process.argv.includes('--yes')) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${msg} [y/N] `, (ans) => {
      rl.close()
      resolve(/^y/i.test(ans.trim()))
    })
  })
}

async function run() {
  console.log('1/5 Loading unclassified debit transactions...')
  const rows = (await sql`
    SELECT id, merchant_name, description_raw, amount
    FROM financial_transactions
    WHERE amount::numeric < 0
      AND (category IS NULL OR category = 'OTHER')
      AND ai_suggested_category IS NULL
  `) as Row[]
  console.log(`   ${rows.length} transactions to process`)
  if (rows.length === 0) {
    console.log('Nothing to do.')
    return
  }

  console.log('2/5 Grouping by merchant key...')
  const keyToRows = new Map<string, Row[]>()
  for (const r of rows) {
    const k = makeKey(r)
    if (!keyToRows.has(k)) keyToRows.set(k, [])
    keyToRows.get(k)!.push(r)
  }
  const uniqueKeys = [...keyToRows.keys()]
  console.log(`   ${uniqueKeys.length} unique merchant keys`)

  const batchCount = Math.ceil(uniqueKeys.length / BATCH_SIZE)
  const estTokensIn = batchCount * 400
  const estTokensOut = batchCount * 800
  const estCost = (estTokensIn * 1 + estTokensOut * 5) / 1_000_000 // Haiku 4.5: $1/M in, $5/M out
  console.log(`3/5 Estimated cost: ${batchCount} batches, ~$${estCost.toFixed(3)} using ${MODEL}`)

  const ok = await confirm('Proceed?')
  if (!ok) {
    console.log('Aborted.')
    return
  }

  console.log('4/5 Calling Claude in batches...')
  const keyToCategory: Record<string, string> = {}
  for (let i = 0; i < uniqueKeys.length; i += BATCH_SIZE) {
    const batch = uniqueKeys.slice(i, i + BATCH_SIZE)
    process.stdout.write(`   batch ${Math.floor(i / BATCH_SIZE) + 1}/${batchCount} (${batch.length} keys)...`)
    try {
      const result = await classify(batch)
      Object.assign(keyToCategory, result)
      process.stdout.write(` ${Object.keys(result).length} classified\n`)
    } catch (e: any) {
      console.warn(`\n   batch failed: ${e.message}`)
    }
  }
  console.log(`   ${Object.keys(keyToCategory).length} / ${uniqueKeys.length} keys classified`)

  console.log('5/5 Writing ai_suggested_category...')
  let updated = 0
  let skipped = 0
  for (const [key, rowsForKey] of keyToRows) {
    const cat = keyToCategory[key]
    if (!cat) { skipped += rowsForKey.length; continue }
    for (const r of rowsForKey) {
      await sql`UPDATE financial_transactions SET ai_suggested_category = ${cat} WHERE id = ${r.id}`
      updated++
    }
    if (updated % 200 === 0) process.stdout.write(`\r   ${updated} rows updated`)
  }
  process.stdout.write('\n')
  console.log(`Done. ${updated} rows updated, ${skipped} rows left unclassified (merchant key not recognized).`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
