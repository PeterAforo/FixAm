ALTER TABLE "garage_settings" ADD COLUMN "require_old_part_proof" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "job_items" ADD COLUMN "old_part_proof" text;--> statement-breakpoint
ALTER TABLE "job_items" ADD COLUMN "old_part_media_id" uuid;