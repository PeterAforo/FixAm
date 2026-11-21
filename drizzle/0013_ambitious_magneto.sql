CREATE TABLE "vehicle_makes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"country" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_makes_name_unique" UNIQUE("name"),
	CONSTRAINT "vehicle_makes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "vehicle_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"make_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"year_start" integer,
	"year_end" integer,
	"body_type" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_profiles" (
	"phone" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"avatar_url" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"terms_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"plate_number" text,
	"plate_search" text,
	"vin" text,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer,
	"color" text,
	"body_type" text,
	"catalog_make_id" uuid,
	"catalog_model_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "garage_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garage_id" uuid NOT NULL,
	"portal_phone" text NOT NULL,
	"customer_id" uuid,
	"rating" smallint NOT NULL,
	"comment" text,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "garage_vehicle_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garage_id" uuid NOT NULL,
	"catalog_make_id" uuid,
	"catalog_model_id" uuid,
	"make" text NOT NULL,
	"model" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "is_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_make_id_vehicle_makes_id_fk" FOREIGN KEY ("make_id") REFERENCES "public"."vehicle_makes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_vehicles" ADD CONSTRAINT "portal_vehicles_phone_portal_profiles_phone_fk" FOREIGN KEY ("phone") REFERENCES "public"."portal_profiles"("phone") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garage_reviews" ADD CONSTRAINT "garage_reviews_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garage_reviews" ADD CONSTRAINT "garage_reviews_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garage_vehicle_coverage" ADD CONSTRAINT "garage_vehicle_coverage_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garage_vehicle_coverage" ADD CONSTRAINT "garage_vehicle_coverage_catalog_make_id_vehicle_makes_id_fk" FOREIGN KEY ("catalog_make_id") REFERENCES "public"."vehicle_makes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garage_vehicle_coverage" ADD CONSTRAINT "garage_vehicle_coverage_catalog_model_id_vehicle_models_id_fk" FOREIGN KEY ("catalog_model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_models_make_slug_uniq" ON "vehicle_models" USING btree ("make_id","slug");--> statement-breakpoint
CREATE INDEX "vehicle_models_make_idx" ON "vehicle_models" USING btree ("make_id");--> statement-breakpoint
CREATE INDEX "portal_vehicles_phone_idx" ON "portal_vehicles" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "portal_vehicles_plate_idx" ON "portal_vehicles" USING btree ("plate_search");--> statement-breakpoint
CREATE UNIQUE INDEX "garage_reviews_garage_phone_uniq" ON "garage_reviews" USING btree ("garage_id","portal_phone");--> statement-breakpoint
CREATE INDEX "garage_reviews_garage_status_idx" ON "garage_reviews" USING btree ("garage_id","status");--> statement-breakpoint
CREATE INDEX "garage_coverage_garage_idx" ON "garage_vehicle_coverage" USING btree ("garage_id","is_active");--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;