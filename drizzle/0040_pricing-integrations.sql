CREATE TABLE "integration_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"provider" text NOT NULL,
	"label" text,
	"credentials_encrypted" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"last_test_at" timestamp with time zone,
	"last_test_ok" boolean,
	"last_test_message" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_gateway_refs" (
	"reference" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "complimentary_granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "complimentary_note" text;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_providers_cat_provider_uniq" ON "integration_providers" USING btree ("category","provider");--> statement-breakpoint
-- Server-only tables: no client policies, so RLS denies everything but the service role.
ALTER TABLE "integration_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_gateway_refs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Launch prices (pesewas). Only fills prices that are still unset, so a price
-- an admin already entered in /admin/plans is kept.
UPDATE "plans" SET "price_monthly" = 14900, "updated_at" = now() WHERE "code" = 'starter' AND coalesce("price_monthly", 0) = 0;--> statement-breakpoint
UPDATE "plans" SET "price_monthly" = 34900, "updated_at" = now() WHERE "code" = 'growth' AND coalesce("price_monthly", 0) = 0;--> statement-breakpoint
UPDATE "plans" SET "price_monthly" = 79900, "updated_at" = now() WHERE "code" = 'pro' AND coalesce("price_monthly", 0) = 0;--> statement-breakpoint
-- Free entry plans for drivers, parts sellers, brokers, tow operators and riders.
UPDATE "plans" SET "name" = 'Driver', "tagline" = 'Free for every car owner', "updated_at" = now() WHERE "code" = 'driver';--> statement-breakpoint
UPDATE "plans" SET "name" = 'Seller', "tagline" = 'Free to list — a small fee on each paid order', "updated_at" = now() WHERE "code" = 'vendor';--> statement-breakpoint
UPDATE "plans" SET "name" = 'Broker', "tagline" = 'Free listing with a few quotes each month', "updated_at" = now() WHERE "code" = 'broker';--> statement-breakpoint
UPDATE "plans" SET "name" = 'Tow operator', "tagline" = 'Free — a small fee on each paid tow', "updated_at" = now() WHERE "code" = 'tow';--> statement-breakpoint
UPDATE "plans" SET "name" = 'Rider', "tagline" = 'Free — a small fee on each delivery', "updated_at" = now() WHERE "code" = 'rider';--> statement-breakpoint
INSERT INTO "plans" ("code", "name", "audience", "tagline", "price_monthly", "max_branches", "max_staff", "message_allowance", "features", "is_active")
VALUES
  ('vendor_pro', 'Seller Pro', 'vendor', 'Lower order fee and first place in "parts near me"', 9900, NULL, NULL, 1000, ARRAY['marketplace','online_catalogue','priority_support','featured_listing','reduced_commission'], true),
  ('broker_pro', 'Broker Pro', 'broker', 'Unlimited quote requests and top placement', 14900, NULL, NULL, 1000, ARRAY['agent_renewals','priority_support','featured_listing','unlimited_quotes'], true)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "platform_settings" ("key", "value") VALUES
  ('vendor_commission_bp', '600'),
  ('vendor_pro_commission_bp', '300'),
  ('tow_commission_bp', '1000'),
  ('rider_commission_bp', '1000'),
  ('broker_free_quotes_per_month', '5'),
  ('free_garage_places', '10')
ON CONFLICT ("key") DO NOTHING;
