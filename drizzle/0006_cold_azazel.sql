ALTER TABLE "bookings" ADD COLUMN "otp_hash" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "otp_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "confirmed_at" timestamp with time zone;