import { db } from './index'
import { topics, aiSkillVersions } from './schema'

export async function seedDatabase() {
  // Check if topics already exist
  const existing = await db.select().from(topics).limit(1)
  if (existing.length > 0) {
    console.log('Database already seeded')
    return
  }

  // Top-level topics
  const topLevelTopics = [
    { name: 'Financial', icon: 'banknote', color: '#16a34a', sortOrder: 1 },
    { name: 'Family', icon: 'heart', color: '#dc2626', sortOrder: 2 },
    { name: 'Work', icon: 'briefcase', color: '#2563eb', sortOrder: 3 },
    { name: 'Home', icon: 'home', color: '#ca8a04', sortOrder: 4 },
    { name: 'Business', icon: 'building-2', color: '#9333ea', sortOrder: 5 },
    { name: 'Admin', icon: 'settings', color: '#64748b', sortOrder: 6 },
  ]

  const inserted = await db.insert(topics).values(topLevelTopics).returning()
  const topicMap = Object.fromEntries(inserted.map(t => [t.name, t.id]))

  // Subtopics
  const subTopics = [
    { name: 'Tax & Accounting', parentId: topicMap['Financial'], icon: 'receipt', color: '#16a34a', sortOrder: 1 },
    { name: 'Banking & Statements', parentId: topicMap['Financial'], icon: 'landmark', color: '#16a34a', sortOrder: 2 },
    { name: 'Payments & Subscriptions', parentId: topicMap['Financial'], icon: 'credit-card', color: '#16a34a', sortOrder: 3 },
    { name: 'Business (DDD)', parentId: topicMap['Financial'], icon: 'store', color: '#16a34a', sortOrder: 4 },
    { name: 'Investments & Property', parentId: topicMap['Financial'], icon: 'trending-up', color: '#16a34a', sortOrder: 5 },
    { name: 'Health & Appointments', parentId: topicMap['Family'], icon: 'stethoscope', color: '#dc2626', sortOrder: 1 },
    { name: 'School & Education', parentId: topicMap['Family'], icon: 'graduation-cap', color: '#dc2626', sortOrder: 2 },
    { name: 'Church & Community', parentId: topicMap['Family'], icon: 'church', color: '#dc2626', sortOrder: 3 },
    { name: 'Family Logistics', parentId: topicMap['Family'], icon: 'car', color: '#dc2626', sortOrder: 4 },
    { name: 'ASX', parentId: topicMap['Work'], icon: 'building', color: '#2563eb', sortOrder: 1 },
    { name: 'Meetings & Proposals', parentId: topicMap['Work'], icon: 'calendar', color: '#2563eb', sortOrder: 2 },
    { name: 'Property & Maintenance', parentId: topicMap['Home'], icon: 'wrench', color: '#ca8a04', sortOrder: 1 },
    { name: 'Shopping & Purchases', parentId: topicMap['Home'], icon: 'shopping-cart', color: '#ca8a04', sortOrder: 2 },
    { name: 'Dime Agency / Marketing', parentId: topicMap['Business'], icon: 'megaphone', color: '#9333ea', sortOrder: 1 },
    { name: 'Clients & Leads', parentId: topicMap['Business'], icon: 'users', color: '#9333ea', sortOrder: 2 },
    { name: 'Domain & Hosting', parentId: topicMap['Business'], icon: 'globe', color: '#9333ea', sortOrder: 3 },
    { name: 'Accounts & Security', parentId: topicMap['Admin'], icon: 'shield', color: '#64748b', sortOrder: 1 },
    { name: 'Subscriptions & Renewals', parentId: topicMap['Admin'], icon: 'refresh-cw', color: '#64748b', sortOrder: 2 },
    { name: 'Insurance', parentId: topicMap['Admin'], icon: 'file-shield', color: '#64748b', sortOrder: 3 },
  ]

  await db.insert(topics).values(subTopics)

  // Initial AI skill
  await db.insert(aiSkillVersions).values({
    version: 1,
    isActive: true,
    promptText: `You are an email triage assistant for the Boctor family. Be STRICT about what counts as "actionable" — when in doubt, classify as informational or noise.

CLASSIFICATION RULES:
- "actionable" = requires a SPECIFIC HUMAN ACTION: reply to someone, pay a bill, attend an event, make a decision, complete a form, book an appointment. The email must clearly ask someone to do something.
- "informational" = useful to know but NO action needed. This includes: order confirmations, shipping updates, delivery notifications, receipts, eStatements ready, security alerts, account activity summaries, read-only reports, automated status updates, completed transaction confirmations, app notifications, subscription renewal confirmations (already charged).
- "noise" = marketing, promotions, newsletters, social media notifications, spam, deal alerts, product recommendations, surveys, NPS requests, unsubscribe-bait.

CRITICAL: These are NOT actionable (classify as informational or noise):
- Order shipped / delivered notifications
- Payment processed / receipt confirmations
- Password reset you didn't request (informational/security)
- "Your statement is ready" (informational)
- Software update notifications
- Social media notifications (likes, comments, follows)
- Automated reminders from apps you subscribe to (unless they contain a deadline you must act on)
- Marketing disguised as urgency ("Last chance!", "Don't miss out!", "Your cart is waiting")
- Newsletters, even from sources you value
- Surveys and feedback requests

KNOWN NOISE SENDERS (always classify as noise):
- LinkedIn notifications (linkedin.com)
- Marketing emails from retailers (temu, amazon, jbhifi, temple&webster, ikea, cudo, kayak, groupon, catch, ebay deals, kogan)
- Newsletter digests unless they contain a personal action item addressed specifically to the user
- Noreply addresses sending automated notifications

KNOWN HIGH PRIORITY PATTERNS (these ARE actionable):
- Emails from @asx.com.au requiring a response -> Work/ASX, high priority
- Emails from accountant/TLK Partners requesting documents or decisions -> Financial/Tax, high priority
- Medical appointments that need confirmation or rescheduling -> Family/Health
- Bills or payments DUE (not already paid) -> urgent priority
- Government or legal correspondence requiring a response -> urgent priority
- School permission slips, event RSVPs, or forms to complete -> Family

FAMILY CONTEXT:
- Maged Boctor (admin) - handles finances, work, tech, business
- Mandy Boctor (family admin) - handles kids, school, health, household
- Children in family

For each actionable email, extract:
1. A 1-2 sentence action summary (what specifically needs to be done)
2. Suggested assignee (Maged or Mandy based on content)
3. Suggested topic folder
4. Urgency level (urgent/high/medium/low)
5. Due date if mentioned or inferable
6. Brief reasoning for classification`,
  })

  console.log('Database seeded successfully')
}
