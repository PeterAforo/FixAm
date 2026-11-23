CREATE TABLE "part_photo_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"user_id" uuid,
	"garage_id" uuid,
	"top_part_type_id" uuid,
	"top_confidence" numeric(3, 2),
	"sure" boolean DEFAULT false NOT NULL,
	"not_a_part" boolean DEFAULT false NOT NULL,
	"condition" text,
	"provider" text,
	"chosen_part_type_id" uuid,
	"chosen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "part_photo_scans" ADD CONSTRAINT "part_photo_scans_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_photo_scans" ADD CONSTRAINT "part_photo_scans_top_part_type_id_part_types_id_fk" FOREIGN KEY ("top_part_type_id") REFERENCES "public"."part_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_photo_scans" ADD CONSTRAINT "part_photo_scans_chosen_part_type_id_part_types_id_fk" FOREIGN KEY ("chosen_part_type_id") REFERENCES "public"."part_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "part_photo_scans_created_idx" ON "part_photo_scans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "part_photo_scans_user_idx" ON "part_photo_scans" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "part_photo_scans" ENABLE ROW LEVEL SECURITY;
