-- FixAm RLS foundation - applies to all tenant tables.
-- Helpers are Supabase-aware (auth.uid()) with JWT-claim fallbacks so the
-- same policies work on plain Postgres when claims are set via
-- SET LOCAL request.jwt.claims / request.jwt.claim.sub.
--
-- Branch-scoped roles (manager, service_advisor, mechanic, storekeeper) are
-- restricted to their membership branch on tables that carry branch_id.
-- Platform admin bypass happens only through the service role in server code
-- anon/authenticated roles get no bypass here.

-- -- Helper functions --------------------------------------------------

create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    (select auth.uid()),
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  )
$$;
--> statement-breakpoint
create or replace function public.is_member(p_garage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.garage_id = p_garage_id
      and m.user_id = public.current_user_id()
      and m.status = 'active'
      and m.deleted_at is null
  )
$$;
--> statement-breakpoint
create or replace function public.member_role(p_garage_id uuid)
returns membership_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.memberships m
  where m.garage_id = p_garage_id
    and m.user_id = public.current_user_id()
    and m.status = 'active'
    and m.deleted_at is null
  order by case m.role
    when 'owner' then 0 when 'accountant' then 1 when 'manager' then 2
    when 'service_advisor' then 3 when 'storekeeper' then 4 else 5 end
  limit 1
$$;
--> statement-breakpoint
create or replace function public.member_branch(p_garage_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  -- branch_id of the membership; null branch_id means "all branches"
  select m.branch_id from public.memberships m
  where m.garage_id = p_garage_id
    and m.user_id = public.current_user_id()
    and m.status = 'active'
    and m.deleted_at is null
  order by m.branch_id nulls last
  limit 1
$$;
--> statement-breakpoint
-- True when the user's role is garage-wide (owner/accountant) or their
-- membership branch covers the row's branch.
create or replace function public.can_access_branch(p_garage_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_branch_id is null then true
    when public.member_role(p_garage_id) in ('owner', 'accountant') then true
    else public.member_branch(p_garage_id) is null
      or public.member_branch(p_garage_id) = p_branch_id
  end
$$;
--> statement-breakpoint
-- -- Enable RLS --------------------------------------------------------

alter table public.users enable row level security;
--> statement-breakpoint
alter table public.garages enable row level security;
--> statement-breakpoint
alter table public.garage_settings enable row level security;
--> statement-breakpoint
alter table public.branches enable row level security;
--> statement-breakpoint
alter table public.bays enable row level security;
--> statement-breakpoint
alter table public.memberships enable row level security;
--> statement-breakpoint
alter table public.document_sequences enable row level security;
--> statement-breakpoint
alter table public.audit_logs enable row level security;
--> statement-breakpoint
alter table public.webhook_events enable row level security;
--> statement-breakpoint
alter table public.plans enable row level security;
--> statement-breakpoint
alter table public.subscriptions enable row level security;
--> statement-breakpoint
alter table public.message_usage enable row level security;
--> statement-breakpoint
alter table public.magic_links enable row level security;
--> statement-breakpoint
alter table public.notifications enable row level security;
--> statement-breakpoint
alter table public.push_subscriptions enable row level security;
--> statement-breakpoint
-- -- Non-tenant tables -------------------------------------------------

-- plans: readable by any authenticated user; writes via service role only.
drop policy if exists plans_select on public.plans;
--> statement-breakpoint
create policy plans_select on public.plans
  for select to authenticated using (true);
--> statement-breakpoint
-- webhook_events: service-role only - no policies for anon/authenticated.
revoke all on public.webhook_events from anon, authenticated;
--> statement-breakpoint
-- push_subscriptions: users manage their own rows via server code
-- keep RLS on with owner-only policy for direct access.
drop policy if exists push_subs_owner on public.push_subscriptions;
--> statement-breakpoint
create policy push_subs_owner on public.push_subscriptions
  for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());
--> statement-breakpoint
-- -- users -------------------------------------------------------------
-- Users see/edit their own row; platform admins see all (service role
-- bypasses RLS anyway, so no admin policy needed here).
drop policy if exists users_self on public.users;
--> statement-breakpoint
create policy users_self on public.users
  for all to authenticated
  using (id = public.current_user_id())
  with check (id = public.current_user_id());
--> statement-breakpoint
-- -- garages -----------------------------------------------------------
-- A garage row is visible to its active members. Creation happens through
-- server code (service role) during onboarding.
drop policy if exists garages_member_select on public.garages;
--> statement-breakpoint
create policy garages_member_select on public.garages
  for select to authenticated
  using (public.is_member(id));
--> statement-breakpoint
drop policy if exists garages_member_update on public.garages;
--> statement-breakpoint
create policy garages_member_update on public.garages
  for update to authenticated
  using (public.member_role(id) = 'owner')
  with check (public.member_role(id) = 'owner');
--> statement-breakpoint
-- -- garage_settings (PK = garage_id) ----------------------------------
drop policy if exists garage_settings_member on public.garage_settings;
--> statement-breakpoint
create policy garage_settings_member on public.garage_settings
  for all to authenticated
  using (public.is_member(garage_id))
  with check (public.is_member(garage_id));
--> statement-breakpoint
-- -- branches ----------------------------------------------------------
drop policy if exists branches_member on public.branches;
--> statement-breakpoint
create policy branches_member on public.branches
  for all to authenticated
  using (
    public.is_member(garage_id)
    and public.can_access_branch(garage_id, id)
  )
  with check (
    public.is_member(garage_id)
    and public.can_access_branch(garage_id, id)
  );
--> statement-breakpoint
-- -- bays (branch-scoped) ----------------------------------------------
drop policy if exists bays_member on public.bays;
--> statement-breakpoint
create policy bays_member on public.bays
  for all to authenticated
  using (
    public.is_member(garage_id)
    and public.can_access_branch(garage_id, branch_id)
  )
  with check (
    public.is_member(garage_id)
    and public.can_access_branch(garage_id, branch_id)
  );
--> statement-breakpoint
-- -- memberships -------------------------------------------------------
-- Members can read memberships in their garage; writes restricted to
-- owner/manager roles (enforced further by app-level permission checks).
drop policy if exists memberships_select on public.memberships;
--> statement-breakpoint
create policy memberships_select on public.memberships
  for select to authenticated
  using (public.is_member(garage_id));
--> statement-breakpoint
drop policy if exists memberships_write on public.memberships;
--> statement-breakpoint
create policy memberships_write on public.memberships
  for all to authenticated
  using (public.member_role(garage_id) in ('owner', 'manager'))
  with check (public.member_role(garage_id) in ('owner', 'manager'));
--> statement-breakpoint
-- -- document_sequences ------------------------------------------------
drop policy if exists doc_sequences_member on public.document_sequences;
--> statement-breakpoint
create policy doc_sequences_member on public.document_sequences
  for all to authenticated
  using (
    public.is_member(garage_id)
    and public.can_access_branch(garage_id, branch_id)
  )
  with check (
    public.is_member(garage_id)
    and public.can_access_branch(garage_id, branch_id)
  );
--> statement-breakpoint
-- -- audit_logs - INSERT-ONLY ------------------------------------------
-- Members may insert audit rows for their garage; nobody can update or
-- delete through the authenticated role. Service role bypasses for
-- platform-level writes.
drop policy if exists audit_logs_insert on public.audit_logs;
--> statement-breakpoint
create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (
    garage_id is null or public.is_member(garage_id)
  );
--> statement-breakpoint
drop policy if exists audit_logs_select on public.audit_logs;
--> statement-breakpoint
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    garage_id is not null and public.is_member(garage_id)
  );
--> statement-breakpoint
-- Explicitly no UPDATE/DELETE policies → denied by default (RLS).

-- -- subscriptions (tenant) --------------------------------------------
drop policy if exists subscriptions_member on public.subscriptions;
--> statement-breakpoint
create policy subscriptions_member on public.subscriptions
  for all to authenticated
  using (public.is_member(garage_id))
  with check (public.is_member(garage_id));
--> statement-breakpoint
-- -- message_usage (tenant) --------------------------------------------
drop policy if exists message_usage_member on public.message_usage;
--> statement-breakpoint
create policy message_usage_member on public.message_usage
  for all to authenticated
  using (public.is_member(garage_id))
  with check (public.is_member(garage_id));
--> statement-breakpoint
-- -- magic_links (tenant) ----------------------------------------------
-- Staff can read/manage links in their garage; creation/consumption by
-- customer flows goes through server code (service role).
drop policy if exists magic_links_member on public.magic_links;
--> statement-breakpoint
create policy magic_links_member on public.magic_links
  for all to authenticated
  using (public.is_member(garage_id))
  with check (public.is_member(garage_id));
--> statement-breakpoint
-- -- notifications (per-user within tenant) ----------------------------
drop policy if exists notifications_own on public.notifications;
--> statement-breakpoint
create policy notifications_own on public.notifications
  for all to authenticated
  using (
    user_id = public.current_user_id()
    and public.is_member(garage_id)
  )
  with check (
    user_id = public.current_user_id()
    and public.is_member(garage_id)
  );
