CREATE TABLE "broker_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"status" text NOT NULL,
	"actor" text NOT NULL,
	"actor_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"broker_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"service_type" text NOT NULL,
	"source" text NOT NULL,
	"requester_phone" text NOT NULL,
	"requester_name" text NOT NULL,
	"requester_user_id" uuid,
	"garage_id" uuid,
	"renewal_request_id" uuid,
	"vehicle_plate" text NOT NULL,
	"vehicle_make" text,
	"vehicle_model" text,
	"vehicle_year" integer,
	"current_expiry" date,
	"notes" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"official_fee" bigint,
	"service_fee" bigint,
	"total" bigint,
	"quote_note" text,
	"insurer_name" text,
	"completion_ref" text,
	"new_expiry" date,
	"paid_at" timestamp with time zone,
	"quoted_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broker_requests_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "brokers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'insurance' NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"city" text,
	"region" text,
	"about" text,
	"logo_url" text,
	"nic_licence_number" text,
	"dvla_agent_number" text,
	"insurers" text[] DEFAULT '{}' NOT NULL,
	"default_service_fee" bigint,
	"status" text DEFAULT 'active' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"rating_avg" numeric(3, 2),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "brokers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "broker_members" ADD CONSTRAINT "broker_members_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_members" ADD CONSTRAINT "broker_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_request_events" ADD CONSTRAINT "broker_request_events_request_id_broker_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."broker_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_requests" ADD CONSTRAINT "broker_requests_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_requests" ADD CONSTRAINT "broker_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_requests" ADD CONSTRAINT "broker_requests_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_requests" ADD CONSTRAINT "broker_requests_renewal_request_id_renewal_requests_id_fk" FOREIGN KEY ("renewal_request_id") REFERENCES "public"."renewal_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "broker_members_broker_user_uniq" ON "broker_members" USING btree ("broker_id","user_id");--> statement-breakpoint
CREATE INDEX "broker_members_user_idx" ON "broker_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "broker_request_events_req_idx" ON "broker_request_events" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "broker_requests_broker_status_idx" ON "broker_requests" USING btree ("broker_id","status","created_at");--> statement-breakpoint
CREATE INDEX "broker_requests_requester_idx" ON "broker_requests" USING btree ("requester_phone");--> statement-breakpoint
CREATE INDEX "broker_requests_garage_idx" ON "broker_requests" USING btree ("garage_id");--> statement-breakpoint
CREATE INDEX "brokers_kind_city_idx" ON "brokers" USING btree ("kind","city");--> statement-breakpoint
-- Platform tables are only accessed server-side (postgres role bypasses RLS); deny the public API.
ALTER TABLE "brokers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "broker_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "broker_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "broker_request_events" ENABLE ROW LEVEL SECURITY;
