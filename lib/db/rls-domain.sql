-- RLS for P1 domain tables (customers, workshop, inventory, renewals, money).
-- Garage-scoped tables: members of the garage may read/write; branch-scoped
-- tables additionally restrict to the member's assigned branch (or NULL branch
-- for garage-wide roles), matching the foundation helper functions.
-- Platform tables (vendors, vendor_members, vendor_reviews, insurance_partners,
-- dvla_fees) get RLS enabled; directory tables get authenticated read policies.
-- message_templates with NULL garage_id exposes platform defaults to all authenticated.

DO $$
DECLARE
  t text;
  has_branch boolean;
  garage_tables text[] := ARRAY[
    'customers','vehicles','vehicle_ownerships','odometer_readings','documents',
    'insurance_policies','dvla_records',
    'job_templates','bookings','jobs','job_status_events','job_assignments',
    'job_findings','job_media','job_items','job_tasks','time_logs',
    'estimates','approvals','parts','stock_levels','stock_movements','pos_sales',
    'vendor_products','vendor_orders','vendor_order_items','vendor_order_events',
    'purchase_orders','purchase_order_items','goods_receipts',
    'renewal_requests','renewal_events','due_items','message_sends','message_logs',
    'invoices','invoice_lines','payments','payment_allocations','refunds',
    'credit_notes','payment_plans','instalments','credit_accounts',
    'credit_statements','expense_categories','expenses','cash_ups','report_snapshots'
  ];
  platform_tables text[] := ARRAY[
    'vendors','vendor_members','vendor_reviews','insurance_partners'
  ];
BEGIN
  FOREACH t IN ARRAY garage_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_member_policy', t);
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=t AND column_name='branch_id'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
             USING (public.is_member(garage_id) AND public.can_access_branch(garage_id, branch_id))
             WITH CHECK (public.is_member(garage_id) AND public.can_access_branch(garage_id, branch_id))',
          t || '_member_policy', t
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
             USING (public.is_member(garage_id))
             WITH CHECK (public.is_member(garage_id))',
          t || '_member_policy', t
        );
      END IF;
    END IF;
  END LOOP;

  FOREACH t IN ARRAY platform_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- message_templates: garage rows visible to members; platform defaults (NULL garage_id) readable by all authenticated.
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_templates_policy ON public.message_templates;
CREATE POLICY message_templates_policy ON public.message_templates FOR ALL TO authenticated
  USING (garage_id IS NULL OR public.is_member(garage_id))
  WITH CHECK (garage_id IS NULL OR public.is_member(garage_id));

-- dvla_fees: platform reference data; readable by any authenticated user, writes via service role only.
ALTER TABLE public.dvla_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dvla_fees_select ON public.dvla_fees;
CREATE POLICY dvla_fees_select ON public.dvla_fees FOR SELECT TO authenticated USING (true);

-- insurance_partners: platform directory; readable by authenticated staff, writes via service role only.
DROP POLICY IF EXISTS insurance_partners_select ON public.insurance_partners;
CREATE POLICY insurance_partners_select ON public.insurance_partners FOR SELECT TO authenticated USING (true);
