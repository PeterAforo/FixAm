-- Broker office pin for the public /brokers "near me" finder.
-- (0036's SQL was edited by hand after its snapshot was taken; this
-- migration's snapshot brings the snapshot back in line, so only the broker
-- columns are new here.)
ALTER TABLE "brokers" ADD COLUMN "gps_lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "gps_lng" numeric(9, 6);
