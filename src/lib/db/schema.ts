import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  numeric,
  date,
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

// =====================
// Financial Tables
// =====================

// Financial Categories
export const financialCategories = pgTable('financial_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').default(0),
  color: text('color').default('#6b7280'),
  createdAt: timestamp('created_at').defaultNow(),
})

// Financial Subcategories
export const financialSubcategories = pgTable('financial_subcategories', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoryId: uuid('category_id').notNull().references(() => financialCategories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  atoCode: text('ato_code'), // e.g. D1-D15 for individuals, business schedule codes — populated later
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_fin_subcategories_category').on(table.categoryId),
])

export const financialCategoriesRelations = relations(financialCategories, ({ many }) => ({
  subcategories: many(financialSubcategories),
}))

export const financialSubcategoriesRelations = relations(financialSubcategories, ({ one }) => ({
  category: one(financialCategories, { fields: [financialSubcategories.categoryId], references: [financialCategories.id] }),
}))

// Financial Entities (top-level ownership grouping)
export const financialEntities = pgTable('financial_entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  type: text('type').notNull().default('personal'), // personal, business, trust
  color: text('color').default('#2B579A'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

// Financial Accounts (one row per unique bank account)
export const financialAccounts = pgTable('financial_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  bankName: text('bank_name').notNull(),
  accountName: text('account_name'),
  accountNumber: text('account_number'),
  accountNumberLast4: text('account_number_last4'),
  bsb: text('bsb'),
  accountType: text('account_type'), // personal_cheque, personal_savings, business_cheque, credit_card
  entityId: uuid('entity_id').references(() => financialEntities.id, { onDelete: 'set null' }),
  owner: text('owner'), // maged, family, business (legacy)
  currency: text('currency').notNull().default('AUD'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('fin_accounts_bank_number').on(table.bankName, table.accountNumberLast4),
])

// Financial Statements (one row per PDF statement)
export const financialStatements = pgTable('financial_statements', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').references(() => financialAccounts.id, { onDelete: 'set null' }),
  fileName: text('file_name'),
  gdriveFileId: text('gdrive_file_id').unique(),
  fileHash: text('file_hash').unique(),
  bankName: text('bank_name'),
  statementStart: date('statement_start'),
  statementEnd: date('statement_end'),
  openingBalance: numeric('opening_balance', { precision: 12, scale: 2 }),
  closingBalance: numeric('closing_balance', { precision: 12, scale: 2 }),
  sourceType: text('source_type').default('pdf_text'), // csv, pdf_text, pdf_ocr
  isDuplicate: boolean('is_duplicate').default(false),
  needsReview: boolean('needs_review').default(false),
  importedAt: timestamp('imported_at').defaultNow(),
}, (table) => [
  index('idx_fin_statements_account').on(table.accountId),
  uniqueIndex('fin_statements_account_period').on(table.accountId, table.statementStart, table.statementEnd),
])

// Financial Transactions (one row per line item)
export const financialTransactions = pgTable('financial_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  statementId: uuid('statement_id').references(() => financialStatements.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => financialAccounts.id, { onDelete: 'set null' }),
  transactionDate: date('transaction_date').notNull(),
  descriptionRaw: text('description_raw'),
  merchantName: text('merchant_name'),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  isDebit: boolean('is_debit'),
  runningBalance: numeric('running_balance', { precision: 12, scale: 2 }),
  category: text('category'),
  subcategory: text('subcategory'),
  isSubscription: boolean('is_subscription').default(false),
  subscriptionFrequency: text('subscription_frequency'), // monthly, annual, weekly
  isTaxDeductible: boolean('is_tax_deductible').default(false),
  taxCategory: text('tax_category'), // work_expense, investment, donation
  needsReview: boolean('needs_review').default(false),
  rowIndex: integer('row_index'),
  // v4 additions
  amountExGst: numeric('amount_ex_gst', { precision: 12, scale: 2 }),
  gstAmount: numeric('gst_amount', { precision: 12, scale: 2 }),
  gstApplicable: boolean('gst_applicable').default(false),
  transferPairId: uuid('transfer_pair_id'), // links matching transfer pairs
  aiSuggestedCategory: text('ai_suggested_category'), // AI-suggested category pending user review
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('fin_txn_dedup').on(table.accountId, table.transactionDate, table.amount, table.descriptionRaw, table.rowIndex),
  index('idx_fin_txn_date').on(table.transactionDate),
  index('idx_fin_txn_account').on(table.accountId),
  index('idx_fin_txn_statement').on(table.statementId),
  index('idx_fin_txn_category').on(table.category),
  index('idx_fin_txn_transfer_pair').on(table.transferPairId),
])

// Transaction Splits (v4) — one parent transaction can be split across multiple categories/entities
export const transactionSplits = pgTable('transaction_splits', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => financialTransactions.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => financialCategories.id, { onDelete: 'set null' }),
  subcategoryId: uuid('subcategory_id').references(() => financialSubcategories.id, { onDelete: 'set null' }),
  entityId: uuid('entity_id').references(() => financialEntities.id, { onDelete: 'set null' }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_txn_splits_transaction').on(table.transactionId),
])

// Financial Assumptions (v4) — WFH%, phone%, vehicle%, etc. — per FY, per entity
export const financialAssumptions = pgTable('financial_assumptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  fy: text('fy').notNull(), // e.g. "FY2025"
  entityId: uuid('entity_id').references(() => financialEntities.id, { onDelete: 'cascade' }),
  assumptionType: text('assumption_type').notNull(), // wfh_percentage, phone_business_pct, home_office_method, vehicle_method, vehicle_business_pct, etc.
  valueNumeric: numeric('value_numeric', { precision: 10, scale: 2 }),
  valueText: text('value_text'), // for enum values (e.g. "fixed_rate_70c", "actual_cost", "logbook", "cents_per_km")
  rationale: text('rationale'),
  approvedBy: text('approved_by'),
  approvedDate: timestamp('approved_date'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  uniqueIndex('idx_fin_assumptions_fy_entity_type').on(table.fy, table.entityId, table.assumptionType),
])

// Parse Errors log
export const parseErrors = pgTable('parse_errors', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileName: text('file_name'),
  gdriveFileId: text('gdrive_file_id'),
  errorMessage: text('error_message'),
  errorType: text('error_type'), // image_pdf, parse_failure, ai_error
  createdAt: timestamp('created_at').defaultNow(),
})

// Financial Relations
export const financialEntitiesRelations = relations(financialEntities, ({ many }) => ({
  accounts: many(financialAccounts),
}))

export const financialAccountsRelations = relations(financialAccounts, ({ one, many }) => ({
  entity: one(financialEntities, { fields: [financialAccounts.entityId], references: [financialEntities.id] }),
  statements: many(financialStatements),
  transactions: many(financialTransactions),
}))

export const financialStatementsRelations = relations(financialStatements, ({ one, many }) => ({
  account: one(financialAccounts, { fields: [financialStatements.accountId], references: [financialAccounts.id] }),
  transactions: many(financialTransactions),
}))

export const financialTransactionsRelations = relations(financialTransactions, ({ one, many }) => ({
  statement: one(financialStatements, { fields: [financialTransactions.statementId], references: [financialStatements.id] }),
  account: one(financialAccounts, { fields: [financialTransactions.accountId], references: [financialAccounts.id] }),
  splits: many(transactionSplits),
}))

export const transactionSplitsRelations = relations(transactionSplits, ({ one }) => ({
  transaction: one(financialTransactions, { fields: [transactionSplits.transactionId], references: [financialTransactions.id] }),
  category: one(financialCategories, { fields: [transactionSplits.categoryId], references: [financialCategories.id] }),
  subcategory: one(financialSubcategories, { fields: [transactionSplits.subcategoryId], references: [financialSubcategories.id] }),
  entity: one(financialEntities, { fields: [transactionSplits.entityId], references: [financialEntities.id] }),
}))

export const financialAssumptionsRelations = relations(financialAssumptions, ({ one }) => ({
  entity: one(financialEntities, { fields: [financialAssumptions.entityId], references: [financialEntities.id] }),
}))
