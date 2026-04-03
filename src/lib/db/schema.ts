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
  lastScanAt: timestamp('last_scan_at'),
  scanConfig: jsonb('scan_config').default({ frequency: 'manual', window: 'since_last' }),
  createdAt: timestamp('created_at').defaultNow(),
})

// Topics (folder structure)
export const topics = pgTable('topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  parentId: uuid('parent_id').references((): any => topics.id, { onDelete: 'set null' }),
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
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('emails_unique_msg').on(table.gmailAccountId, table.messageId),
  index('idx_emails_gmail_account').on(table.gmailAccountId),
  index('idx_emails_classification').on(table.classification),
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
