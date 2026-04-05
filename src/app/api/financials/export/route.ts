import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions } from '@/lib/db/schema'
import { and, eq, gte, lte } from 'drizzle-orm'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }
  if ((session.user as any).role !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const fyYear = parseInt(searchParams.get('fy') || String(new Date().getFullYear()), 10)
  const fyStart = `${fyYear}-07-01`
  const fyEnd = `${fyYear + 1}-06-30`

  const transactions = await db.select({
    transactionDate: financialTransactions.transactionDate,
    descriptionRaw: financialTransactions.descriptionRaw,
    merchantName: financialTransactions.merchantName,
    amount: financialTransactions.amount,
    category: financialTransactions.category,
    subcategory: financialTransactions.subcategory,
    taxCategory: financialTransactions.taxCategory,
  })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.isTaxDeductible, true),
      gte(financialTransactions.transactionDate, fyStart),
      lte(financialTransactions.transactionDate, fyEnd),
    ))
    .orderBy(financialTransactions.transactionDate)

  // Build CSV
  const headers = ['Date', 'Description', 'Merchant', 'Amount', 'Category', 'Subcategory', 'Tax Category']
  const rows = transactions.map((t) => [
    t.transactionDate,
    `"${(t.descriptionRaw || '').replace(/"/g, '""')}"`,
    `"${(t.merchantName || '').replace(/"/g, '""')}"`,
    t.amount,
    t.category || '',
    t.subcategory || '',
    t.taxCategory || '',
  ].join(','))

  const csv = [headers.join(','), ...rows].join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="tax-deductions-FY${fyYear}-${fyYear + 1}.csv"`,
    },
  })
}
