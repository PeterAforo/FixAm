ALTER TYPE "public"."vendor_order_origin" ADD VALUE 'customer_direct';--> statement-breakpoint
ALTER TABLE "vendor_order_events" ALTER COLUMN "garage_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_order_items" ALTER COLUMN "garage_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_orders" ALTER COLUMN "garage_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "garage_settings" ADD COLUMN "accepts_customer_parts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "garage_settings" ADD COLUMN "customer_part_fitting_fee" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "garages" ADD COLUMN "payout_details_encrypted" text;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "buyer_user_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "buyer_phone" text;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "destination_type" text DEFAULT 'garage' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "delivery_address" text;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "delivery_region" text;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "delivery_city" text;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "fitting_fee" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "courier" text;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "rider_name" text;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "rider_phone" text;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "courier_reference" text;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "received_photo_path" text;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD COLUMN "received_by" uuid;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_orders_buyer_idx" ON "vendor_orders" USING btree ("buyer_user_id","created_at");--> statement-breakpoint
CREATE INDEX "vendor_orders_garage_idx" ON "vendor_orders" USING btree ("garage_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_idem_uniq" ON "payouts" USING btree ("idempotency_key");