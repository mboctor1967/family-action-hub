CREATE TABLE "financial_assumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fy" text NOT NULL,
	"entity_id" uuid,
	"assumption_type" text NOT NULL,
	"value_numeric" numeric(10, 2),
	"value_text" text,
	"rationale" text,
	"approved_by" text,
	"approved_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"color" text DEFAULT '#6b7280',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "financial_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "financial_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'personal' NOT NULL,
	"color" text DEFAULT '#2B579A',
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "financial_entities_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "financial_subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ato_code" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"category_id" uuid,
	"subcategory_id" uuid,
	"entity_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "account_number" text;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_statements" ADD COLUMN "source_type" text DEFAULT 'pdf_text';--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD COLUMN "amount_ex_gst" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD COLUMN "gst_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD COLUMN "gst_applicable" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD COLUMN "transfer_pair_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD COLUMN "ai_suggested_category" text;--> statement-breakpoint
ALTER TABLE "financial_assumptions" ADD CONSTRAINT "financial_assumptions_entity_id_financial_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."financial_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_subcategories" ADD CONSTRAINT "financial_subcategories_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_financial_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."financial_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_subcategory_id_financial_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."financial_subcategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_entity_id_financial_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."financial_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_fin_assumptions_fy_entity_type" ON "financial_assumptions" USING btree ("fy","entity_id","assumption_type");--> statement-breakpoint
CREATE INDEX "idx_fin_subcategories_category" ON "financial_subcategories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_txn_splits_transaction" ON "transaction_splits" USING btree ("transaction_id");--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_entity_id_financial_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."financial_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_fin_txn_transfer_pair" ON "financial_transactions" USING btree ("transfer_pair_id");