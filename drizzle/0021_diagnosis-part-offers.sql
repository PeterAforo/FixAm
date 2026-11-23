ALTER TABLE "job_findings" ADD COLUMN "recommendation" text;--> statement-breakpoint
ALTER TABLE "job_findings" ADD COLUMN "part_type_id" uuid;--> statement-breakpoint
ALTER TABLE "job_items" ADD COLUMN "part_type_id" uuid;--> statement-breakpoint
ALTER TABLE "job_items" ADD COLUMN "part_type_confidence" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "job_items" ADD COLUMN "supply_mode" text DEFAULT 'garage' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_items" ADD COLUMN "vendor_order_id" uuid;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "part_type_id" uuid;--> statement-breakpoint
ALTER TABLE "job_findings" ADD CONSTRAINT "job_findings_part_type_id_part_types_id_fk" FOREIGN KEY ("part_type_id") REFERENCES "public"."part_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_part_type_id_part_types_id_fk" FOREIGN KEY ("part_type_id") REFERENCES "public"."part_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_vendor_order_id_vendor_orders_id_fk" FOREIGN KEY ("vendor_order_id") REFERENCES "public"."vendor_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_part_type_id_part_types_id_fk" FOREIGN KEY ("part_type_id") REFERENCES "public"."part_types"("id") ON DELETE no action ON UPDATE no action;