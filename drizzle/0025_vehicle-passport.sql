CREATE TABLE "vehicle_passports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plate_search" text NOT NULL,
	"owner_phone" text NOT NULL,
	"token" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"show_mileage" boolean DEFAULT true NOT NULL,
	"show_garage_names" boolean DEFAULT true NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"regenerated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_passports_plate_uniq" ON "vehicle_passports" USING btree ("plate_search");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_passports_token_uniq" ON "vehicle_passports" USING btree ("token");--> statement-breakpoint
CREATE INDEX "vehicle_passports_owner_idx" ON "vehicle_passports" USING btree ("owner_phone");--> statement-breakpoint
ALTER TABLE "vehicle_passports" ENABLE ROW LEVEL SECURITY;
