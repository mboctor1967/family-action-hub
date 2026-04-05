CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "ai_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid,
	"field" text NOT NULL,
	"ai_value" text,
	"user_correction" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_skill_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"prompt_text" text NOT NULL,
	"accuracy_score" real,
	"is_active" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "emails_scanned" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gmail_account_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text,
	"from_address" text,
	"from_name" text,
	"subject" text,
	"date" timestamp,
	"classification" text NOT NULL,
	"confidence_score" real DEFAULT 0,
	"ai_summary" text,
	"raw_snippet" text,
	"gmail_labels" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_name" text NOT NULL,
	"account_name" text,
	"account_number_last4" text,
	"bsb" text,
	"account_type" text,
	"owner" text,
	"currency" text DEFAULT 'AUD' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"file_name" text,
	"gdrive_file_id" text,
	"file_hash" text,
	"bank_name" text,
	"statement_start" date,
	"statement_end" date,
	"opening_balance" numeric(12, 2),
	"closing_balance" numeric(12, 2),
	"is_duplicate" boolean DEFAULT false,
	"needs_review" boolean DEFAULT false,
	"imported_at" timestamp DEFAULT now(),
	CONSTRAINT "financial_statements_gdrive_file_id_unique" UNIQUE("gdrive_file_id"),
	CONSTRAINT "financial_statements_file_hash_unique" UNIQUE("file_hash")
);
--> statement-breakpoint
CREATE TABLE "financial_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid,
	"account_id" uuid,
	"transaction_date" date NOT NULL,
	"description_raw" text,
	"merchant_name" text,
	"amount" numeric(12, 2) NOT NULL,
	"is_debit" boolean,
	"running_balance" numeric(12, 2),
	"category" text,
	"subcategory" text,
	"is_subscription" boolean DEFAULT false,
	"subscription_frequency" text,
	"is_tax_deductible" boolean DEFAULT false,
	"tax_category" text,
	"needs_review" boolean DEFAULT false,
	"row_index" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gmail_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expiry" timestamp,
	"last_scan_at" timestamp,
	"scan_config" jsonb DEFAULT '{"frequency":"manual","window":"since_last"}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parse_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text,
	"gdrive_file_id" text,
	"error_message" text,
	"error_type" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"email_verified" timestamp,
	"image" text,
	"avatar_url" text,
	"role" text DEFAULT 'member' NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "scan_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gmail_account_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"emails_scanned" integer DEFAULT 0,
	"actionable_count" integer DEFAULT 0,
	"informational_count" integer DEFAULT 0,
	"noise_count" integer DEFAULT 0,
	"status" text DEFAULT 'running'
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"is_complete" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"due_date" timestamp,
	"assignee_id" uuid,
	"created_by" uuid NOT NULL,
	"topic_id" uuid,
	"source_email_id" uuid,
	"gmail_link" text,
	"is_recurring" boolean DEFAULT false,
	"recurrence_rule" text,
	"snoozed_until" timestamp,
	"dismissed_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"icon" text DEFAULT 'folder',
	"color" text DEFAULT '#2B579A',
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_email_id_emails_scanned_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails_scanned"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails_scanned" ADD CONSTRAINT "emails_scanned_gmail_account_id_gmail_accounts_id_fk" FOREIGN KEY ("gmail_account_id") REFERENCES "public"."gmail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_statement_id_financial_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."financial_statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_accounts" ADD CONSTRAINT "gmail_accounts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD CONSTRAINT "scan_runs_gmail_account_id_gmail_accounts_id_fk" FOREIGN KEY ("gmail_account_id") REFERENCES "public"."gmail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_email_id_emails_scanned_id_fk" FOREIGN KEY ("source_email_id") REFERENCES "public"."emails_scanned"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_id_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_comments_task" ON "comments" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emails_unique_msg" ON "emails_scanned" USING btree ("gmail_account_id","message_id");--> statement-breakpoint
CREATE INDEX "idx_emails_gmail_account" ON "emails_scanned" USING btree ("gmail_account_id");--> statement-breakpoint
CREATE INDEX "idx_emails_classification" ON "emails_scanned" USING btree ("classification");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_accounts_bank_number" ON "financial_accounts" USING btree ("bank_name","account_number_last4");--> statement-breakpoint
CREATE INDEX "idx_fin_statements_account" ON "financial_statements" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_statements_account_period" ON "financial_statements" USING btree ("account_id","statement_start","statement_end");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_txn_dedup" ON "financial_transactions" USING btree ("account_id","transaction_date","amount","description_raw","row_index");--> statement-breakpoint
CREATE INDEX "idx_fin_txn_date" ON "financial_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "idx_fin_txn_account" ON "financial_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_fin_txn_statement" ON "financial_transactions" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "idx_fin_txn_category" ON "financial_transactions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_subtasks_task" ON "subtasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_assignee" ON "tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_status" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tasks_topic" ON "tasks" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_due_date" ON "tasks" USING btree ("due_date");