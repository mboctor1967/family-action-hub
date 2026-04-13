import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { gmailAccounts, emailsScanned, tasks, topics, scanRuns } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { fetchEmails, preFilterEmails } from '@/lib/gmail/client'
import { classifyEmails, type EmailInput } from '@/lib/ai/classify'
import { buildClassificationPrompt } from '@/lib/ai/build-prompt'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { gmailAccountId, scanWindow = '7d', forceRescan = false } = body

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Step 1: Connect
        send('progress', { step: 1, total: 5, label: 'Connecting to Gmail...', percent: 5 })

        let account
        if (gmailAccountId) {
          const results = await db.select().from(gmailAccounts).where(eq(gmailAccounts.id, gmailAccountId)).limit(1)
          account = results[0]
        } else {
          const results = await db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, session.user!.id!)).limit(1)
          account = results[0]
        }

        if (!account) {
          send('error', { error: 'No Gmail account connected. Go to Settings to connect.' })
          controller.close()
          return
        }

        const [scanRun] = await db.insert(scanRuns).values({
          gmailAccountId: account.id,
          status: 'running',
        }).returning()

        // Step 2: Fetch emails
        send('progress', { step: 2, total: 5, label: 'Fetching emails from Gmail...', percent: 15 })

        const windowDays = scanWindow === '24h' ? 1 : scanWindow === '7d' ? 7 : scanWindow === '30d' ? 30 : 7
        const afterDate = new Date()
        afterDate.setDate(afterDate.getDate() - windowDays)
        const query = `after:${afterDate.getFullYear()}/${afterDate.getMonth() + 1}/${afterDate.getDate()}`

        const { emails: allEmails, newAccessToken } = await fetchEmails(
          {
            accessToken: account.accessToken!,
            refreshToken: account.refreshToken,
            tokenExpiry: account.tokenExpiry,
          },
          query,
          100
        )

        if (newAccessToken) {
          await db.update(gmailAccounts).set({
            accessToken: newAccessToken,
            tokenExpiry: new Date(Date.now() + 3600 * 1000),
          }).where(eq(gmailAccounts.id, account.id))
        }

        send('progress', { step: 2, total: 5, label: `Found ${allEmails.length} emails`, percent: 30 })

        // Step 3: Filter
        let newEmails = allEmails
        if (!forceRescan) {
          const existingEmails = await db.select({ messageId: emailsScanned.messageId })
            .from(emailsScanned)
            .where(eq(emailsScanned.gmailAccountId, account.id))
          const existingIds = new Set(existingEmails.map(e => e.messageId))
          newEmails = allEmails.filter(e => !existingIds.has(e.messageId))
        } else {
          const messageIds = allEmails.map(e => e.messageId)
          if (messageIds.length > 0) {
            const existingScanned = await db.select({ id: emailsScanned.id })
              .from(emailsScanned)
              .where(and(
                eq(emailsScanned.gmailAccountId, account.id),
                inArray(emailsScanned.messageId, messageIds)
              ))
            const scannedIds = existingScanned.map(e => e.id)
            if (scannedIds.length > 0) {
              await db.delete(tasks).where(inArray(tasks.sourceEmailId, scannedIds))
              await db.delete(emailsScanned).where(inArray(emailsScanned.id, scannedIds))
            }
          }
        }

        if (newEmails.length === 0) {
          await db.update(scanRuns).set({
            completedAt: new Date(),
            emailsScanned: 0,
            status: 'completed',
          }).where(eq(scanRuns.id, scanRun.id))

          send('done', {
            scanRunId: scanRun.id,
            emailsScanned: 0,
            newEmails: 0,
            alreadyScanned: allEmails.length,
            message: allEmails.length > 0
              ? `All ${allEmails.length} emails in this window were already scanned. New emails will appear when they arrive.`
              : 'No emails found in this time window.',
          })
          controller.close()
          return
        }

        // Pre-filter noise
        const filtered = preFilterEmails(newEmails)
        const noiseCount = newEmails.length - filtered.length

        send('progress', { step: 3, total: 5, label: `${newEmails.length} new emails, ${noiseCount} pre-filtered as noise, ${filtered.length} to classify`, percent: 40 })

        // Store noise emails
        const noiseEmails = newEmails.filter(e => !filtered.includes(e))
        if (noiseEmails.length > 0) {
          await db.insert(emailsScanned).values(
            noiseEmails.map(e => ({
              gmailAccountId: account.id,
              messageId: e.messageId,
              threadId: e.threadId,
              fromAddress: e.fromAddress,
              fromName: e.fromName,
              subject: e.subject,
              date: e.date ? new Date(e.date) : new Date(),
              classification: 'noise',
              confidenceScore: 1.0,
              aiSummary: 'Pre-filtered as promotional/social',
              rawSnippet: e.snippet,
              gmailLabels: e.labels,
            }))
          )
        }

        // Step 4: AI classification
        send('progress', { step: 4, total: 5, label: `Classifying ${filtered.length} emails with AI...`, percent: 50 })

        const skillPrompt = buildClassificationPrompt()
        const topicResults = await db.select({ name: topics.name }).from(topics)
        const topicNames = topicResults.map(t => t.name)

        const emailInputs: EmailInput[] = filtered.map(e => ({
          messageId: e.messageId,
          from: e.from,
          fromAddress: e.fromAddress,
          subject: e.subject,
          date: e.date,
          snippet: e.snippet,
          body: e.body,
        }))

        const classifications = await classifyEmails(emailInputs, skillPrompt, topicNames)

        send('progress', { step: 5, total: 5, label: 'Saving results...', percent: 80 })

        // Step 5: Store results
        let actionableCount = 0
        let informationalCount = 0

        for (const classification of classifications) {
          const email = filtered.find(e => e.messageId === classification.messageId)
          if (!email) continue

          const isActionable = classification.classification === 'actionable'

          await db.insert(emailsScanned).values({
            gmailAccountId: account.id,
            messageId: email.messageId,
            threadId: email.threadId,
            fromAddress: email.fromAddress,
            fromName: email.fromName,
            subject: email.subject,
            date: email.date ? new Date(email.date) : new Date(),
            classification: classification.classification,
            confidenceScore: classification.confidence,
            aiSummary: classification.action_summary || classification.reasoning,
            rawSnippet: email.snippet,
            gmailLabels: email.labels,
            triageStatus: isActionable ? 'unreviewed' : null,
            aiSuggestions: isActionable ? JSON.stringify({
              urgency: classification.urgency || 'medium',
              suggested_assignee: classification.suggested_assignee,
              suggested_topic: classification.suggested_topic,
              due_date: classification.due_date,
              action_summary: classification.action_summary,
            }) : null,
          })

          if (isActionable) {
            actionableCount++
          } else if (classification.classification === 'informational') {
            informationalCount++
          }
        }

        await db.update(scanRuns).set({
          completedAt: new Date(),
          emailsScanned: newEmails.length,
          actionableCount,
          informationalCount,
          noiseCount: noiseCount + classifications.filter(c => c.classification === 'noise').length,
          status: 'completed',
        }).where(eq(scanRuns.id, scanRun.id))

        await db.update(gmailAccounts).set({ lastScanAt: new Date() }).where(eq(gmailAccounts.id, account.id))

        send('done', {
          scanRunId: scanRun.id,
          emailsScanned: newEmails.length,
          actionable: actionableCount,
          informational: informationalCount,
          noise: noiseCount + classifications.filter(c => c.classification === 'noise').length,
        })
      } catch (error) {
        console.error('Scan error:', error)
        send('error', { error: error instanceof Error ? error.message : 'Scan failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
