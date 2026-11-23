CREATE TABLE "insurance_claim_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"status" text NOT NULL,
	"actor" text NOT NULL,
	"actor_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"user_id" uuid NOT NULL,
	"customer_id" uuid,
	"vehicle_id" uuid,
	"vehicle_ref" text NOT NULL,
	"broker_id" uuid,
	"insurer_name" text,
	"insurer_contact" text,
	"garage_id" uuid,
	"job_id" uuid,
	"estimate_id" uuid,
	"occurred_at" timestamp with time zone,
	"location" text,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"police_report_no" text,
	"other_party" jsonb,
	"injuries" boolean,
	"description" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimate_amount" bigint,
	"approved_amount" bigint,
	"draft" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insurance_claims_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "insurance_claim_events" ADD CONSTRAINT "insurance_claim_events_claim_id_insurance_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."insurance_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insurance_claim_events_claim_idx" ON "insurance_claim_events" USING btree ("claim_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "insurance_claims_number_uniq" ON "insurance_claims" USING btree ("number");--> statement-breakpoint
CREATE INDEX "insurance_claims_user_idx" ON "insurance_claims" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "insurance_claims_broker_idx" ON "insurance_claims" USING btree ("broker_id","status");--> statement-breakpoint
CREATE INDEX "insurance_claims_garage_idx" ON "insurance_claims" USING btree ("garage_id","status");
ALTER TABLE "insurance_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurance_claim_events" ENABLE ROW LEVEL SECURITY;
