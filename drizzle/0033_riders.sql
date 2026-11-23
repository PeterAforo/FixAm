CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"vendor_order_id" uuid,
	"kind" text DEFAULT 'part' NOT NULL,
	"courier" text DEFAULT 'fixam_rider' NOT NULL,
	"rider_id" uuid,
	"pickup" jsonb NOT NULL,
	"dropoff" jsonb NOT NULL,
	"pickup_pin" text,
	"dropoff_pin" text,
	"fee" bigint DEFAULT 0 NOT NULL,
	"rider_earning" bigint,
	"status" text DEFAULT 'offered' NOT NULL,
	"proof_photo_path" text,
	"offer_radius_km" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone,
	"offered_at" timestamp with time zone,
	"assigned_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliveries_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "delivery_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"rider_id" uuid NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"declined_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "riders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text,
	"bike_plate" text,
	"motorbike_photo_path" text,
	"licence_photo_path" text,
	"ghana_card_encrypted" text,
	"ghana_card_last4" text,
	"ghana_card_verified" boolean DEFAULT false NOT NULL,
	"payout_details_encrypted" text,
	"is_online" boolean DEFAULT false NOT NULL,
	"last_lat" numeric(9, 6),
	"last_lng" numeric(9, 6),
	"last_location_at" timestamp with time zone,
	"rating_avg" numeric(3, 2),
	"completed_jobs" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_vendor_order_id_vendor_orders_id_fk" FOREIGN KEY ("vendor_order_id") REFERENCES "public"."vendor_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riders" ADD CONSTRAINT "riders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_rider_idx" ON "deliveries" USING btree ("rider_id","status");--> statement-breakpoint
CREATE INDEX "deliveries_order_idx" ON "deliveries" USING btree ("vendor_order_id");--> statement-breakpoint
CREATE INDEX "deliveries_status_idx" ON "deliveries" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_offers_uniq" ON "delivery_offers" USING btree ("delivery_id","rider_id");--> statement-breakpoint
CREATE INDEX "delivery_offers_rider_idx" ON "delivery_offers" USING btree ("rider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "riders_user_uniq" ON "riders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "riders_online_idx" ON "riders" USING btree ("is_online","status");
ALTER TABLE "riders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_offers" ENABLE ROW LEVEL SECURITY;
