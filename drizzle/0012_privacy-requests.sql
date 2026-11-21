CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garage_id" uuid,
	"customer_id" uuid,
	"phone" text,
	"email" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"payload" jsonb,
	"requested_by" text DEFAULT 'customer' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "privacy_requests_status_idx" ON "privacy_requests" USING btree ("status","created_at");