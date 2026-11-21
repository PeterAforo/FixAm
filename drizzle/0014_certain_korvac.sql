ALTER TABLE "vehicles" ADD COLUMN "catalog_make_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "catalog_model_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_catalog_make_id_vehicle_makes_id_fk" FOREIGN KEY ("catalog_make_id") REFERENCES "public"."vehicle_makes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_catalog_model_id_vehicle_models_id_fk" FOREIGN KEY ("catalog_model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE no action ON UPDATE no action;