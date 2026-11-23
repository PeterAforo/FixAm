ALTER TYPE "public"."membership_role" ADD VALUE 'inspector';--> statement-breakpoint
CREATE TABLE "inspection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"section" text NOT NULL,
	"item_key" text NOT NULL,
	"label" text NOT NULL,
	"result" text DEFAULT 'na' NOT NULL,
	"photo_path" text,
	"note" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"garage_id" uuid NOT NULL,
	"branch_id" uuid,
	"customer_id" uuid,
	"driver_phone" text NOT NULL,
	"driver_user_id" uuid,
	"vehicle_details" jsonb NOT NULL,
	"vehicle_id" uuid,
	"location_kind" text DEFAULT 'garage' NOT NULL,
	"seller_name" text,
	"seller_phone" text,
	"seller_address" text,
	"seller_lat" numeric(9, 6),
	"seller_lng" numeric(9, 6),
	"scheduled_at" timestamp with time zone,
	"price" bigint DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"payment_reference" text,
	"status" text DEFAULT 'awaiting_payment' NOT NULL,
	"inspector_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"share_token_hash" text,
	"share_token_issued_at" timestamp with time zone,
	"ai_report" jsonb,
	"test_drive_notes" text,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "inspections_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "garage_settings" ADD COLUMN "offers_inspections" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "garage_settings" ADD COLUMN "inspection_price" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inspection_items_uniq" ON "inspection_items" USING btree ("inspection_id","item_key");--> statement-breakpoint
CREATE INDEX "inspection_items_insp_idx" ON "inspection_items" USING btree ("inspection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inspections_number_uniq" ON "inspections" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "inspections_share_uniq" ON "inspections" USING btree ("share_token_hash");--> statement-breakpoint
CREATE INDEX "inspections_garage_idx" ON "inspections" USING btree ("garage_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "inspections_driver_idx" ON "inspections" USING btree ("driver_phone","created_at");--> statement-breakpoint
CREATE INDEX "inspections_payment_idx" ON "inspections" USING btree ("payment_reference");
--> statement-breakpoint
ALTER TABLE "inspections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "inspection_items" ENABLE ROW LEVEL SECURITY;
