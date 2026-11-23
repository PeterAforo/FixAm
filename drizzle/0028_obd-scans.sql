CREATE TABLE "obd_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garage_id" uuid,
	"user_id" uuid,
	"customer_id" uuid,
	"vehicle_id" uuid,
	"job_id" uuid,
	"repair_request_id" uuid,
	"inspection_id" uuid,
	"source" text NOT NULL,
	"adapter_name" text,
	"protocol" text,
	"vin" text,
	"mil_on" boolean,
	"dtcs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"freeze_frame" jsonb,
	"live" jsonb,
	"explanation" jsonb,
	"clear_requested_at" timestamp with time zone,
	"cleared_at" timestamp with time zone,
	"cleared_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obd_scans" ADD CONSTRAINT "obd_scans_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obd_scans" ADD CONSTRAINT "obd_scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obd_scans" ADD CONSTRAINT "obd_scans_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obd_scans" ADD CONSTRAINT "obd_scans_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obd_scans" ADD CONSTRAINT "obd_scans_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obd_scans" ADD CONSTRAINT "obd_scans_cleared_by_users_id_fk" FOREIGN KEY ("cleared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "obd_scans_job_idx" ON "obd_scans" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "obd_scans_vehicle_idx" ON "obd_scans" USING btree ("vehicle_id","created_at");--> statement-breakpoint
CREATE INDEX "obd_scans_user_idx" ON "obd_scans" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "obd_scans_request_idx" ON "obd_scans" USING btree ("repair_request_id");--> statement-breakpoint
ALTER TABLE "obd_scans" ENABLE ROW LEVEL SECURITY;
