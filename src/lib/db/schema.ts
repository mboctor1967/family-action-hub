import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Users / Profiles
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  emailVerified: timestamp('email_verified'),
  image: text('image'),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('member'), // admin, family_admin, member
  preferences: jsonb('preferences').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Gmail Accounts
export const gmailAccounts = pgTable('gmail_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiry: timestamp('token_expiry'),
  lastScanAt: timestamp('last_scan_at'), // last SUCCESSFUL scan — never set on failure
  lastError: text('last_error'), // human-readable failure message; cleared on success
  lastErrorCode: text('last_error_code'), // invalid_client | invalid_grant | transient | unknown
  lastErrorAt: timestamp('last_error_at'),
  scanConfig: jsonb('scan_config').default({ frequency: 'manual', window: 'since_last' }),
  createdAt: timestamp('created_at').defaultNow(),
})

// Topics (folder structure)
export const topics = pgTable('topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => topics.id, { onDelete: 'set null' }),
  icon: text('icon').default('folder'),
  color: text('color').default('#2B579A'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

// Scanned Emails
export const emailsScanned = pgTable('emails_scanned', {
  id: uuid('id').primaryKey().defaultRandom(),
  gmailAccountId: uuid('gmail_account_id').notNull().references(() => gmailAccounts.id, { onDelete: 'cascade' }),
  messageId: text('message_id').notNull(),
  threadId: text('thread_id'),
  fromAddress: text('from_address'),
  fromName: text('from_name'),
  subject: text('subject'),
  date: timestamp('date'),
  classification: text('classification').notNull(), // actionable, informational, noise
  confidenceScore: real('confidence_score').default(0),
  aiSummary: text('ai_summary'),
  rawSnippet: text('raw_snippet'),
  gmailLabels: text('gmail_labels').array().default([]),
  triageStatus: text('triage_status'), // unreviewed, confirmed, rejected — null for non-actionable
  aiSuggestions: text('ai_suggestions'), // JSON blob: { urgency, suggested_assignee, suggested_topic, due_date, action_summary }
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('emails_unique_msg').on(table.gmailAccountId, table.messageId),
  index('idx_emails_gmail_account').on(table.gmailAccountId),
  index('idx_emails_classification').on(table.classification),
  index('idx_emails_triage_status').on(table.triageStatus),
])

// Tasks
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('new'), // new, in_progress, waiting, done, dismissed
  priority: text('priority').notNull().default('medium'), // urgent, high, medium, low
  dueDate: timestamp('due_date'),
  assigneeId: uuid('assignee_id').references(() => profiles.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').notNull().references(() => profiles.id),
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
  sourceEmailId: uuid('source_email_id').references(() => emailsScanned.id, { onDelete: 'set null' }),
  gmailLink: text('gmail_link'),
  isRecurring: boolean('is_recurring').default(false),
  recurrenceRule: text('recurrence_rule'),
  snoozedUntil: timestamp('snoozed_until'),
  dismissedReason: text('dismissed_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_tasks_assignee').on(table.assigneeId),
  index('idx_tasks_status').on(table.status),
  index('idx_tasks_topic').on(table.topicId),
  index('idx_tasks_due_date').on(table.dueDate),
])

// Comments
export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => profiles.id),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_comments_task').on(table.taskId),
])

// Subtasks
export const subtasks = pgTable('subtasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  isComplete: boolean('is_complete').default(false),
  sortOrder: integer('sort_order').default(0),
}, (table) => [
  index('idx_subtasks_task').on(table.taskId),
])

// AI Feedback
export const aiFeedback = pgTable('ai_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailId: uuid('email_id').references(() => emailsScanned.id, { onDelete: 'cascade' }),
  field: text('field').notNull(),
  aiValue: text('ai_value'),
  userCorrection: text('user_correction'),
  createdAt: timestamp('created_at').defaultNow(),
})

// AI Skill Versions
export const aiSkillVersions = pgTable('ai_skill_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: integer('version').notNull(),
  promptText: text('prompt_text').notNull(),
  accuracyScore: real('accuracy_score'),
  isActive: boolean('is_active').default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

// Scan Runs
export const scanRuns = pgTable('scan_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  gmailAccountId: uuid('gmail_account_id').notNull().references(() => gmailAccounts.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  emailsScanned: integer('emails_scanned').default(0),
  actionableCount: integer('actionable_count').default(0),
  informationalCount: integer('informational_count').default(0),
  noiseCount: integer('noise_count').default(0),
  status: text('status').default('running'), // running, completed, failed
  errorMessage: text('error_message'), // populated when status = 'failed'
})

// Auth.js required tables (must use snake_case property names for adapter compatibility)
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
})

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  expires: timestamp('expires').notNull(),
})

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull().unique(),
  expires: timestamp('expires').notNull(),
})

// Relations
export const profilesRelations = relations(profiles, ({ many }) => ({
  gmailAccounts: many(gmailAccounts),
  assignedTasks: many(tasks, { relationName: 'assignee' }),
  createdTasks: many(tasks, { relationName: 'creator' }),
  comments: many(comments),
}))

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  assignee: one(profiles, { fields: [tasks.assigneeId], references: [profiles.id], relationName: 'assignee' }),
  creator: one(profiles, { fields: [tasks.createdBy], references: [profiles.id], relationName: 'creator' }),
  topic: one(topics, { fields: [tasks.topicId], references: [topics.id] }),
  sourceEmail: one(emailsScanned, { fields: [tasks.sourceEmailId], references: [emailsScanned.id] }),
  comments: many(comments),
  subtasks: many(subtasks),
}))

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  user: one(profiles, { fields: [comments.userId], references: [profiles.id] }),
}))

export const subtasksRelations = relations(subtasks, ({ one }) => ({
  task: one(tasks, { fields: [subtasks.taskId], references: [tasks.id] }),
}))

export const gmailAccountsRelations = relations(gmailAccounts, ({ one }) => ({
  user: one(profiles, { fields: [gmailAccounts.userId], references: [profiles.id] }),
}))

export const emailsScannedRelations = relations(emailsScanned, ({ one }) => ({
  gmailAccount: one(gmailAccounts, { fields: [emailsScanned.gmailAccountId], references: [gmailAccounts.id] }),
}))

// The 14 financial tables (financial_*, transaction_splits, parse_errors, ato_codes,
// invoice_*, invoices, export_jobs) are owned by boctor-financials and were removed
// from this schema in P3. They still exist in the shared database — never drop
// them, and never let drizzle-kit see them (see drizzle.config.ts).

// App Settings — key-value store for shared admin configuration
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value'),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
})

// Notion Dedupe
export const notionDedupeReports = pgTable('notion_dedupe_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  uploadedBy: text('uploaded_by').notNull(),
  filename: text('filename').notNull(),
  scanTimestamp: text('scan_timestamp').notNull(),
  totalClusters: integer('total_clusters').notNull(),
  totalPages: integer('total_pages').notNull(),
  report: jsonb('report').notNull(),
  decisions: jsonb('decisions').notNull().default({}),
}, (table) => [
  index('idx_notion_dedupe_uploaded_at').on(table.uploadedAt),
])

// WhatsApp processed message log (idempotency)
export const whatsappProcessedMessages = pgTable('whatsapp_processed_messages', {
  id: text('id').primaryKey(), // Meta message.id
  receivedAt: timestamp('received_at').notNull().defaultNow(),
})

// WhatsApp digest snapshots — reply-number → emailId resolution for daily digest replies
export const whatsappDigestSnapshots = pgTable('whatsapp_digest_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipient: text('recipient').notNull(), // E.164 phone, e.g. "+61412408587"
  sentAt: timestamp('sent_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'), // NULL = active; set when superseded
  positions: text('positions').notNull(), // JSON array: [{pos:1,emailId:"..."},...]
  messageId: text('message_id'), // WhatsApp wamid returned by send API
}, (table) => [
  index('idx_digest_snapshots_recipient').on(table.recipient),
])

// WhatsApp outbound message log — one row per send, updated by Meta `statuses`
// webhooks so a rejected or undelivered message is visible instead of silent.
export const whatsappOutboundMessages = pgTable('whatsapp_outbound_messages', {
  id: text('id').primaryKey(), // Meta wamid returned by the send API
  recipient: text('recipient').notNull(), // E.164
  kind: text('kind').notNull(), // digest_notice | digest_full | ops_alert | reply
  status: text('status').notNull().default('accepted'), // accepted | sent | delivered | read | failed
  errorCode: integer('error_code'),
  errorTitle: text('error_title'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  statusAt: timestamp('status_at'),
}, (table) => [
  index('idx_wa_outbound_recipient_created').on(table.recipient, table.createdAt),
])
