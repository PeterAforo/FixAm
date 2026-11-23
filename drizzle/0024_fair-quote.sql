CREATE TABLE "price_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"part_type_id" uuid,
	"car_class" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"observed_on" date NOT NULL,
	"source_garage_id" uuid NOT NULL,
	"source_invoice_id" uuid NOT NULL,
	"source_invoice_line_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_part_type_id_part_types_id_fk" FOREIGN KEY ("part_type_id") REFERENCES "public"."part_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_source_garage_id_garages_id_fk" FOREIGN KEY ("source_garage_id") REFERENCES "public"."garages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_observations_line_uniq" ON "price_observations" USING btree ("source_invoice_line_id");--> statement-breakpoint
CREATE INDEX "price_observations_lookup_idx" ON "price_observations" USING btree ("kind","part_type_id","car_class","city","observed_on");--> statement-breakpoint
CREATE INDEX "price_observations_invoice_idx" ON "price_observations" USING btree ("source_invoice_id");--> statement-breakpoint
ALTER TABLE "price_observations" ENABLE ROW LEVEL SECURITY;
