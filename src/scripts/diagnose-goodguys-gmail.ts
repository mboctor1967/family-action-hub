/**
 * Diagnose Good Guys Gmail search — test each sender address individually,
 * with and without keywords, to find where the 29 emails live.
 */
import { db } from '@/lib/db'
import { accounts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { searchGmailByQuery, getEmailContent } from '@/lib/gmail/search'

async function main() {
  const [account] = await db.select().from(accounts).where(eq(accounts.provider, 'google')).limit(1)
  const token = { accessToken: account!.access_token!, refreshToken: account!.refresh_token, tokenExpiry: account!.expires_at ? new Date(account!.expires_at * 1000) : null }

  const senders = [
    'info@email.thegoodguys.com.au',
    'no-reply@thegoodguys.com.au',
    'noreply@thegoodguys.com.au',
    'mboctor@dthree.io',
    'mboctor@dthree.net',
  ]
  const keywords = ['order confirmation', 'your order', 'receipt', 'invoice', 'dispatch', 'order number', 'tax invoice']
  const start = new Date('2024-07-01')
  const end = new Date()

  console.log('='.repeat(70))
  console.log('GOOD GUYS — Gmail Search Diagnosis')
  console.log(`Date range: ${start.toISOString().split('T')[0]} → ${end.toISOString().split('T')[0]}`)
  console.log('='.repeat(70))

  // Test 1: Each sender individually WITHOUT keywords
  console.log('\n--- TEST 1: Each sender WITHOUT keywords ---')
  for (const sender of senders) {
    const { messageIds } = await searchGmailByQuery(token, { senderEmails: [sender], startDate: start, endDate: end }, 50)
    console.log(`  from:${sender.padEnd(40)} → ${messageIds.length} emails`)
    if (messageIds.length > 0 && messageIds.length <= 5) {
      for (const id of messageIds.slice(0, 3)) {
        const email = await getEmailContent(token, id)
        console.log(`    ${email.date?.toISOString().split('T')[0] ?? '?'} | ${email.subject.slice(0, 60)}`)
      }
    }
  }

  // Test 2: Each sender WITH keywords
  console.log('\n--- TEST 2: Each sender WITH keywords ---')
  for (const sender of senders) {
    const { messageIds } = await searchGmailByQuery(token, { senderEmails: [sender], keywords, startDate: start, endDate: end }, 50)
    console.log(`  from:${sender.padEnd(40)} + keywords → ${messageIds.length} emails`)
  }

  // Test 3: dthree senders with broader keywords (forwarded emails may have "Fwd:" prefix)
  console.log('\n--- TEST 3: dthree senders with broader keywords ---')
  const broadKeywords = ['good guys', 'goodguys', 'thegoodguys', 'docket', 'invoice']
  for (const sender of ['mboctor@dthree.io', 'mboctor@dthree.net']) {
    const { messageIds } = await searchGmailByQuery(token, { senderEmails: [sender], keywords: broadKeywords, startDate: start, endDate: end }, 50)
    console.log(`  from:${sender.padEnd(40)} + broad kw → ${messageIds.length} emails`)
    for (const id of messageIds.slice(0, 5)) {
      const email = await getEmailContent(token, id)
      console.log(`    ${email.date?.toISOString().split('T')[0] ?? '?'} | ${email.subject.slice(0, 70)}`)
    }
  }

  // Test 4: Just search for "good guys" in ALL mail (no sender filter)
  console.log('\n--- TEST 4: "good guys" in ALL mail (no sender filter) ---')
  const { messageIds: allGG } = await searchGmailByQuery(token, { keywords: ['good guys invoice'], startDate: start, endDate: end }, 20)
  console.log(`  "good guys invoice" → ${allGG.length} emails`)
  for (const id of allGG.slice(0, 5)) {
    const email = await getEmailContent(token, id)
    console.log(`    ${email.date?.toISOString().split('T')[0] ?? '?'} | from: ${email.from.slice(0, 40)} | ${email.subject.slice(0, 50)}`)
  }

  // Test 5: What's in the label the old app used?
  console.log('\n--- TEST 5: Gmail label "GoodGuys 2024-25" (old app method) ---')
  try {
    const { searchGmailByLabel } = await import('@/lib/gmail/search')
    const { messageIds: labelIds } = await searchGmailByLabel(token, 'GoodGuys 2024-25', new Date('2020-01-01'), end, 50)
    console.log(`  label:GoodGuys-2024-25 → ${labelIds.length} emails`)
    for (const id of labelIds.slice(0, 5)) {
      const email = await getEmailContent(token, id)
      console.log(`    ${email.date?.toISOString().split('T')[0] ?? '?'} | from: ${email.from.slice(0, 40)} | ${email.subject.slice(0, 50)}`)
    }
  } catch (e) {
    console.log(`  Label search failed: ${(e as Error).message}`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
