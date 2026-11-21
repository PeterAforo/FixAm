ALTER TABLE "portal_profiles" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "portal_profiles" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "portal_profiles" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "portal_profiles" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "portal_profiles" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "portal_profiles" ADD CONSTRAINT "portal_profiles_username_unique" UNIQUE("username");