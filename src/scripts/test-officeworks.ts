import { db } from '@/lib/db'
import { accounts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { searchGmailByQuery, getEmailContent } from '@/lib/gmail/search'

async function main() {
  const [account] = await db.select().from(accounts).where(eq(accounts.provider, 'google')).limit(1)
  const token = { accessToken: account!.access_token!, refreshToken: account!.refresh_token, tokenExpiry: account!.expires_at ? new Date(account!.expires_at * 1000) : null }

  const start = new Date('2024-07-01')
  const end = new Date()

  // Test 1: domain only, no keywords
  console.log('Test 1: from:@officeworks.com.au (no keywords)')
  const { messageIds: t1 } = await searchGmailByQuery(token, { senderEmails: ['@officeworks.com.au'], startDate: start, endDate: end }, 20)
  console.log(`  Found: ${t1.length} emails`)
  for (const id of t1.slice(0, 5)) {
    const e = await getEmailContent(token, id)
    console.log(`  ${e.date?.toISOString().split('T')[0]} | ${e.from.slice(0, 45)} | ${e.subject.slice(0, 50)}`)
  }

  // Test 2: domain + keywords
  console.log('\nTest 2: from:@officeworks.com.au + keywords')
  const { messageIds: t2 } = await searchGmailByQuery(token, { senderEmails: ['@officeworks.com.au'], keywords: ['invoice', 'order', 'receipt', 'officeworks'], startDate: start, endDate: end }, 20)
  console.log(`  Found: ${t2.length} emails`)
  for (const id of t2.slice(0, 5)) {
    const e = await getEmailContent(token, id)
    console.log(`  ${e.date?.toISOString().split('T')[0]} | ${e.from.slice(0, 45)} | ${e.subject.slice(0, 50)}`)
  }

  // Test 3: forwarded from dthree with officeworks keyword
  console.log('\nTest 3: from:mboctor@dthree.io + officeworks keyword')
  const { messageIds: t3 } = await searchGmailByQuery(token, { senderEmails: ['mboctor@dthree.io'], keywords: ['officeworks', 'office works'], startDate: start, endDate: end }, 20)
  console.log(`  Found: ${t3.length} emails`)
  for (const id of t3.slice(0, 5)) {
    const e = await getEmailContent(token, id)
    console.log(`  ${e.date?.toISOString().split('T')[0]} | ${e.from.slice(0, 45)} | ${e.subject.slice(0, 50)}`)
  }

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
