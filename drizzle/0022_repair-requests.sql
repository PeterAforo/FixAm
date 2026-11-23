CREATE SEQUENCE "public"."repair_request_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "repair_request_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_request_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"garage_id" uuid NOT NULL,
	"price_min" bigint,
	"price_max" bigint,
	"inspection_fee" bigint DEFAULT 0 NOT NULL,
	"earliest_at" timestamp with time zone NOT NULL,
	"message" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_request_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"garage_id" uuid NOT NULL,
	"distance_km" numeric(6, 1),
	"viewed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"requester_user_id" uuid,
	"requester_phone" text NOT NULL,
	"requester_name" text,
	"vehicle_make" text,
	"vehicle_model" text,
	"vehicle_year" integer,
	"vehicle_plate" text,
	"complaint" text NOT NULL,
	"complaint_original" text,
	"complaint_language" text DEFAULT 'en' NOT NULL,
	"warning_lights" text[] DEFAULT '{}'::text[] NOT NULL,
	"gps_lat" numeric(9, 6),
	"gps_lng" numeric(9, 6),
	"region" text,
	"city" text,
	"mode" text DEFAULT 'broadcast' NOT NULL,
	"preferred_garage_id" uuid,
	"radius_km" integer DEFAULT 15 NOT NULL,
	"triage" jsonb,
	"urgency" text,
	"specialty" text,
	"status" text DEFAULT 'open' NOT NULL,
	"accepted_offer_id" uuid,
	"booking_id" uuid,
	"job_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repair_requests_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "garage_settings" ADD COLUMN "specialties" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "repair_request_id" uuid;--> statement-breakpoint
ALTER TABLE "repair_request_media" ADD CONSTRAINT "repair_request_media_request_id_repair_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."repair_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_request_offers" ADD CONSTRAINT "repair_request_offers_request_id_repair_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."repair_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_request_offers" ADD CONSTRAINT "repair_request_offers_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_request_offers" ADD CONSTRAINT "repair_request_offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_request_recipients" ADD CONSTRAINT "repair_request_recipients_request_id_repair_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."repair_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_request_recipients" ADD CONSTRAINT "repair_request_recipients_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_requests" ADD CONSTRAINT "repair_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_requests" ADD CONSTRAINT "repair_requests_preferred_garage_id_garages_id_fk" FOREIGN KEY ("preferred_garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repair_request_media_req_idx" ON "repair_request_media" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repair_request_offers_uniq" ON "repair_request_offers" USING btree ("request_id","garage_id");--> statement-breakpoint
CREATE INDEX "repair_request_offers_req_idx" ON "repair_request_offers" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repair_request_recipients_uniq" ON "repair_request_recipients" USING btree ("request_id","garage_id");--> statement-breakpoint
CREATE INDEX "repair_request_recipients_garage_idx" ON "repair_request_recipients" USING btree ("garage_id","created_at");--> statement-breakpoint
CREATE INDEX "repair_requests_requester_idx" ON "repair_requests" USING btree ("requester_user_id","created_at");--> statement-breakpoint
CREATE INDEX "repair_requests_phone_idx" ON "repair_requests" USING btree ("requester_phone");--> statement-breakpoint
CREATE INDEX "repair_requests_status_idx" ON "repair_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "repair_requests_booking_idx" ON "repair_requests" USING btree ("booking_id");--> statement-breakpoint
ALTER TABLE "repair_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "repair_request_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "repair_request_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "repair_request_offers" ENABLE ROW LEVEL SECURITY;