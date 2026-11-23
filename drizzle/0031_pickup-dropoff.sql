ALTER TYPE "public"."membership_role" ADD VALUE 'garage_driver';--> statement-breakpoint
CREATE TABLE "condition_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garage_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"photos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fuel_level" integer,
	"odometer_km" integer,
	"warning_lights" text[] DEFAULT '{}'::text[] NOT NULL,
	"damage_notes" text,
	"signature_path" text,
	"signed_by_name" text,
	"signed_at" timestamp with time zone,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garage_id" uuid NOT NULL,
	"branch_id" uuid,
	"booking_id" uuid,
	"job_id" uuid,
	"customer_id" uuid,
	"kind" text NOT NULL,
	"contact_name" text,
	"contact_phone" text NOT NULL,
	"vehicle_label" text,
	"plate" text,
	"address" text NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"driver_user_id" uuid,
	"driver_lat" numeric(9, 6),
	"driver_lng" numeric(9, 6),
	"driver_location_at" timestamp with time zone,
	"fee" bigint DEFAULT 0 NOT NULL,
	"fee_job_item_id" uuid,
	"tracker_token_hash" text,
	"notes" text,
	"started_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "garage_settings" ADD COLUMN "pickup_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "garage_settings" ADD COLUMN "pickup_fee" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "garage_settings" ADD COLUMN "pickup_radius_km" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "condition_reports" ADD CONSTRAINT "condition_reports_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_reports" ADD CONSTRAINT "condition_reports_run_id_pickup_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pickup_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_reports" ADD CONSTRAINT "condition_reports_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_runs" ADD CONSTRAINT "pickup_runs_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_runs" ADD CONSTRAINT "pickup_runs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_runs" ADD CONSTRAINT "pickup_runs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_runs" ADD CONSTRAINT "pickup_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_runs" ADD CONSTRAINT "pickup_runs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_runs" ADD CONSTRAINT "pickup_runs_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_runs" ADD CONSTRAINT "pickup_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "condition_reports_run_idx" ON "condition_reports" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "pickup_runs_garage_time_idx" ON "pickup_runs" USING btree ("garage_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "pickup_runs_driver_idx" ON "pickup_runs" USING btree ("driver_user_id","status");--> statement-breakpoint
CREATE INDEX "pickup_runs_booking_idx" ON "pickup_runs" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "pickup_runs_job_idx" ON "pickup_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "pickup_runs_token_idx" ON "pickup_runs" USING btree ("tracker_token_hash");--> statement-breakpoint
ALTER TABLE "pickup_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "condition_reports" ENABLE ROW LEVEL SECURITY;
