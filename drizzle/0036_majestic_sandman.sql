CREATE TYPE "public"."plan_audience" AS ENUM('garage', 'driver', 'vendor', 'broker', 'tow', 'rider');--> statement-breakpoint
CREATE TABLE "account_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_kind" "plan_audience" NOT NULL,
	"owner_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"is_complimentary" boolean DEFAULT false,
	"cancel_at_period_end" boolean DEFAULT false,
	"last_payment_reference" text,
	"pending_payment_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "audience" "plan_audience" DEFAULT 'garage' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_payment_reference" text;--> statement-breakpoint
ALTER TABLE "account_subscriptions" ADD CONSTRAINT "account_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_subscriptions_owner_uniq" ON "account_subscriptions" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "account_subscriptions_plan_idx" ON "account_subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "account_subscriptions_trial_idx" ON "account_subscriptions" USING btree ("status","trial_ends_at");--> statement-breakpoint
ALTER TABLE "account_subscriptions" ENABLE ROW LEVEL SECURITY;