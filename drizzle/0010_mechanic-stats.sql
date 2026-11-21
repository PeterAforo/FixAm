CREATE TABLE "mechanic_badge_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garage_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"badge_key" text NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mechanic_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garage_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"jobs_completed" integer DEFAULT 0 NOT NULL,
	"minutes_worked" integer DEFAULT 0 NOT NULL,
	"revenue_pesewas" bigint DEFAULT 0 NOT NULL,
	"comebacks" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mechanic_badge_awards" ADD CONSTRAINT "mechanic_badge_awards_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mechanic_badge_awards" ADD CONSTRAINT "mechanic_badge_awards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mechanic_stats" ADD CONSTRAINT "mechanic_stats_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mechanic_stats" ADD CONSTRAINT "mechanic_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mechanic_badge_awards_uniq" ON "mechanic_badge_awards" USING btree ("garage_id","user_id","badge_key");--> statement-breakpoint
CREATE INDEX "mechanic_badge_awards_user_idx" ON "mechanic_badge_awards" USING btree ("garage_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mechanic_stats_uniq" ON "mechanic_stats" USING btree ("garage_id","user_id");