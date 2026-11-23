CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garage_id" uuid,
	"user_id" uuid,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"prompt_key" text,
	"prompt_version" integer,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"audio_seconds" numeric(8, 2),
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"error_code" text,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_garage_idx" ON "ai_calls" USING btree ("garage_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_user_idx" ON "ai_calls" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_created_idx" ON "ai_calls" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "ai_calls" ENABLE ROW LEVEL SECURITY;