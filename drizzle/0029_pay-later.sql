ALTER TYPE "public"."payment_method" ADD VALUE 'financing';--> statement-breakpoint
CREATE TABLE "financing_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"garage_id" uuid NOT NULL,
	"customer_id" uuid,
	"job_id" uuid,
	"estimate_id" uuid,
	"invoice_id" uuid,
	"applicant_name" text NOT NULL,
	"applicant_phone" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decline_reason" text,
	"amount_requested" bigint NOT NULL,
	"amount_financed" bigint,
	"months" integer NOT NULL,
	"max_months" integer,
	"monthly_rate_bp" integer,
	"rate_label" text,
	"total_repayable" bigint,
	"monthly_payment" bigint,
	"payment_id" uuid,
	"disbursement_ref" text,
	"consent_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"disbursed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financing_repayments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount" bigint NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"reminder_stage" integer DEFAULT 0 NOT NULL,
	"last_reminded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "financing_applications" ADD CONSTRAINT "financing_applications_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_applications" ADD CONSTRAINT "financing_applications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_applications" ADD CONSTRAINT "financing_applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_applications" ADD CONSTRAINT "financing_applications_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_applications" ADD CONSTRAINT "financing_applications_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_repayments" ADD CONSTRAINT "financing_repayments_application_id_financing_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."financing_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financing_applications_reference_uniq" ON "financing_applications" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "financing_applications_phone_idx" ON "financing_applications" USING btree ("applicant_phone");--> statement-breakpoint
CREATE INDEX "financing_applications_job_idx" ON "financing_applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "financing_applications_invoice_idx" ON "financing_applications" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "financing_applications_status_idx" ON "financing_applications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "financing_repayments_app_seq_uniq" ON "financing_repayments" USING btree ("application_id","sequence");--> statement-breakpoint
CREATE INDEX "financing_repayments_due_idx" ON "financing_repayments" USING btree ("due_date");--> statement-breakpoint
ALTER TABLE "financing_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "financing_repayments" ENABLE ROW LEVEL SECURITY;
