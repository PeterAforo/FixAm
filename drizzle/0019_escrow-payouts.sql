CREATE SEQUENCE "public"."payment_txn_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 999999999999 START WITH 100000000001 CACHE 1;--> statement-breakpoint
CREATE TABLE "escrow_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garage_id" uuid,
	"buyer_user_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"payee_type" text NOT NULL,
	"payee_id" uuid NOT NULL,
	"payment_reference" text,
	"payer_phone" text,
	"payer_network" text,
	"gross_amount" bigint NOT NULL,
	"commission_amount" bigint DEFAULT 0 NOT NULL,
	"fitting_fee_amount" bigint DEFAULT 0 NOT NULL,
	"fitting_garage_id" uuid,
	"net_amount" bigint NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"held_at" timestamp with time zone,
	"release_after" timestamp with time zone,
	"released_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"dispute_reason" text,
	"dispute_opened_by" uuid,
	"dispute_opened_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escrow_hold_id" uuid,
	"payout_id" uuid,
	"debit_account" text NOT NULL,
	"credit_account" text NOT NULL,
	"amount" bigint NOT NULL,
	"memo" text,
	"meta" jsonb,
	"idempotency_key" text NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escrow_hold_id" uuid,
	"purpose" text NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient_id" uuid,
	"method" text NOT NULL,
	"network" text,
	"bank_code" text,
	"account_number" text NOT NULL,
	"account_name" text,
	"amount" bigint NOT NULL,
	"transaction_id" text NOT NULL,
	"provider_reference" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now(),
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_garage_id_garages_id_fk" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_fitting_garage_id_garages_id_fk" FOREIGN KEY ("fitting_garage_id") REFERENCES "public"."garages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_dispute_opened_by_users_id_fk" FOREIGN KEY ("dispute_opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_escrow_hold_id_escrow_holds_id_fk" FOREIGN KEY ("escrow_hold_id") REFERENCES "public"."escrow_holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_escrow_hold_id_escrow_holds_id_fk" FOREIGN KEY ("escrow_hold_id") REFERENCES "public"."escrow_holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_holds_entity_uniq" ON "escrow_holds" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "escrow_holds_status_idx" ON "escrow_holds" USING btree ("status","release_after");--> statement-breakpoint
CREATE INDEX "escrow_holds_payee_idx" ON "escrow_holds" USING btree ("payee_type","payee_id","status");--> statement-breakpoint
CREATE INDEX "escrow_holds_reference_idx" ON "escrow_holds" USING btree ("payment_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_idem_uniq" ON "ledger_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ledger_entries_hold_idx" ON "ledger_entries" USING btree ("escrow_hold_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_transaction_uniq" ON "payouts" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_hold_purpose_uniq" ON "payouts" USING btree ("escrow_hold_id","purpose");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "payouts_recipient_idx" ON "payouts" USING btree ("recipient_type","recipient_id");--> statement-breakpoint
ALTER TABLE "escrow_holds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "ledger_entries_immutable"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'ledger_entries is append-only'; END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "ledger_entries_no_update" BEFORE UPDATE OR DELETE ON "ledger_entries" FOR EACH ROW EXECUTE FUNCTION "ledger_entries_immutable"();