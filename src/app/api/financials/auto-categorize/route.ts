import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialCategories } from '@/lib/db/schema'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { merchants } = await request.json() as {
    merchants: Array<{ merchantName: string; totalAmount: number; txnCount: number; sampleDescriptions?: string[] }>
  }

  if (!merchants?.length) return NextResponse.json({ error: 'No merchants' }, { status: 400 })

  // Get categories from DB
  const categories = await db.query.financialCategories.findMany({
    orderBy: (c, { asc }) => [asc(c.sortOrder)],
  })
  const categoryNames = categories.map(c => c.name)

  // Batch merchants (max 50 at a time to stay within token limits)
  const batchSize = 50
  const results: Record<string, string> = {}

  for (let i = 0; i < merchants.length; i += batchSize) {
    const batch = merchants.slice(i, i + batchSize)

    const merchantList = batch.map((m, idx) =>
      `${idx + 1}. "${m.merchantName}" (${m.txnCount} txns, $${Math.abs(m.totalAmount).toFixed(0)} total${m.sampleDescriptions?.length ? `, examples: ${m.sampleDescriptions.slice(0, 2).join('; ')}` : ''})`
    ).join('\n')

    try {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: `You are a financial transaction categorizer for an Australian family.

Available categories (use EXACTLY these names):
${categoryNames.join('\n')}

For each merchant, respond with ONLY a JSON object mapping merchant name to category.
Example: {"Woolworths": "GROCERIES", "Netflix": "SUBSCRIPTIONS & DIGITAL"}

Rules:
- Use the EXACT category name from the list above
- If truly unsure, use "OTHER"
- Australian context: Coles/Woolworths = GROCERIES, Opal/Transportfornsw = TRANSPORT, etc.
- Bank transfers between own accounts = TRANSFERS
- Salary/payroll credits = INCOME`,
        messages: [{
          role: 'user',
          content: `Categorize these merchants:\n${merchantList}`,
        }],
      })

      const text = message.content[0].type === 'text' ? message.content[0].text : ''
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      try {
        const parsed = JSON.parse(jsonStr)
        for (const [name, cat] of Object.entries(parsed)) {
          if (typeof cat === 'string' && categoryNames.includes(cat)) {
            results[name] = cat
          }
        }
      } catch {}
    } catch (err: any) {
      console.error('AI categorize error:', err.message)
    }
  }

  // Estimate cost: ~500 input tokens + ~200 output tokens per batch of 50
  const batches = Math.ceil(merchants.length / batchSize)
  const estimatedCost = batches * 0.001 // ~$0.001 per batch with haiku

  return NextResponse.json({
    suggestions: results,
    total: Object.keys(results).length,
    estimated_cost: estimatedCost,
  })
}
