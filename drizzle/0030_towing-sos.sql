CREATE TABLE "sos_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sos_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sos_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sos_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"distance_km" numeric(6, 1),
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"declined_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sos_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"requester_user_id" uuid,
	"requester_phone" text NOT NULL,
	"requester_name" text,
	"vehicle_make" text,
	"vehicle_model" text,
	"vehicle_year" integer,
	"vehicle_plate" text,
	"problem" text NOT NULL,
	"notes" text,
	"photo_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"landmark" text,
	"radius_km" integer DEFAULT 25 NOT NULL,
	"destination_garage_id" uuid,
	"status" text DEFAULT 'searching' NOT NULL,
	"operator_id" uuid,
	"assigned_user_id" uuid,
	"assigned_at" timestamp with time zone,
	"quote_amount" bigint,
	"quote_note" text,
	"eta_minutes" integer,
	"operator_lat" numeric(9, 6),
	"operator_lng" numeric(9, 6),
	"operator_location_at" timestamp with time zone,
	"payment_method" text,
	"payment_reference" text,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"paid_at" timestamp with time zone,
	"repair_request_id" uuid,
	"arrived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tow_operator_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tow_operators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text NOT NULL,
	"phone" text NOT NULL,
	"city" text,
	"region" text,
	"base_lat" numeric(9, 6),
	"base_lng" numeric(9, 6),
	"service_radius_km" integer DEFAULT 25 NOT NULL,
	"services" text[] DEFAULT '{flatbed}'::text[] NOT NULL,
	"base_fee" bigint DEFAULT 0 NOT NULL,
	"per_km_fee" bigint DEFAULT 0 NOT NULL,
	"is_available" boolean DEFAULT false NOT NULL,
	"last_lat" numeric(9, 6),
	"last_lng" numeric(9, 6),
	"last_location_at" timestamp with time zone,
	"payout_details_encrypted" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"completed_jobs" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_sos_id_sos_requests_id_fk" FOREIGN KEY ("sos_id") REFERENCES "public"."sos_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_recipients" ADD CONSTRAINT "sos_recipients_sos_id_sos_requests_id_fk" FOREIGN KEY ("sos_id") REFERENCES "public"."sos_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_recipients" ADD CONSTRAINT "sos_recipients_operator_id_tow_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."tow_operators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_requests" ADD CONSTRAINT "sos_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_requests" ADD CONSTRAINT "sos_requests_destination_garage_id_garages_id_fk" FOREIGN KEY ("destination_garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_requests" ADD CONSTRAINT "sos_requests_operator_id_tow_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."tow_operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_requests" ADD CONSTRAINT "sos_requests_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tow_operator_members" ADD CONSTRAINT "tow_operator_members_operator_id_tow_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."tow_operators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tow_operator_members" ADD CONSTRAINT "tow_operator_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sos_events_sos_idx" ON "sos_events" USING btree ("sos_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sos_recipients_uniq" ON "sos_recipients" USING btree ("sos_id","operator_id");--> statement-breakpoint
CREATE INDEX "sos_recipients_operator_idx" ON "sos_recipients" USING btree ("operator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sos_requests_number_uniq" ON "sos_requests" USING btree ("number");--> statement-breakpoint
CREATE INDEX "sos_requests_status_idx" ON "sos_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "sos_requests_operator_idx" ON "sos_requests" USING btree ("operator_id","status");--> statement-breakpoint
CREATE INDEX "sos_requests_requester_idx" ON "sos_requests" USING btree ("requester_user_id","created_at");--> statement-breakpoint
CREATE INDEX "sos_requests_payment_ref_idx" ON "sos_requests" USING btree ("payment_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "tow_operator_members_uniq" ON "tow_operator_members" USING btree ("operator_id","user_id");--> statement-breakpoint
CREATE INDEX "tow_operator_members_user_idx" ON "tow_operator_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tow_operators_available_idx" ON "tow_operators" USING btree ("is_available","status");--> statement-breakpoint
ALTER TABLE "tow_operators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tow_operator_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sos_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sos_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sos_events" ENABLE ROW LEVEL SECURITY;
