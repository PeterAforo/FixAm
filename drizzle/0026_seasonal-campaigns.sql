CREATE TABLE "seasonal_campaign_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garage_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"channel" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasonal_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garage_id" uuid NOT NULL,
	"season" text NOT NULL,
	"send_on" date NOT NULL,
	"zone" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"offer_text" text,
	"recipients_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"bookings_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "garage_settings" ADD COLUMN "seasonal_campaigns" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "seasonal_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "seasonal_campaign_sends" ADD CONSTRAINT "seasonal_campaign_sends_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonal_campaign_sends" ADD CONSTRAINT "seasonal_campaign_sends_campaign_id_seasonal_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."seasonal_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonal_campaign_sends" ADD CONSTRAINT "seasonal_campaign_sends_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonal_campaign_sends" ADD CONSTRAINT "seasonal_campaign_sends_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonal_campaigns" ADD CONSTRAINT "seasonal_campaigns_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seasonal_campaign_sends_campaign_customer_uniq" ON "seasonal_campaign_sends" USING btree ("campaign_id","customer_id");--> statement-breakpoint
CREATE INDEX "seasonal_campaign_sends_pending_idx" ON "seasonal_campaign_sends" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "seasonal_campaign_sends_customer_idx" ON "seasonal_campaign_sends" USING btree ("customer_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seasonal_campaigns_garage_season_day_uniq" ON "seasonal_campaigns" USING btree ("garage_id","season","send_on");--> statement-breakpoint
CREATE INDEX "seasonal_campaigns_status_idx" ON "seasonal_campaigns" USING btree ("status","send_on");--> statement-breakpoint
ALTER TABLE "seasonal_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seasonal_campaign_sends" ENABLE ROW LEVEL SECURITY;
