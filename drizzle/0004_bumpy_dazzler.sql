ALTER TABLE "vendor_orders" DROP CONSTRAINT "vendor_orders_job_id_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_warranty_parent_job_id_jobs_id_fk" FOREIGN KEY ("warranty_parent_job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;