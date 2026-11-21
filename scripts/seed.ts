/**
 * FixAm seed script — loads docs/devin-spec/specs/seed-data.json.
 * Idempotent: every insert is guarded by a natural-key lookup or upsert.
 * Creates Supabase auth.users (email + 'Password123!') so seeded roles can log in.
 *
 * Usage: pnpm db:seed   (reads DATABASE_URL from .env.local)
 */
import { config } from "dotenv"
import { randomUUID } from "node:crypto"
import postgres from "postgres"
import seedDataJson from "../docs/devin-spec/specs/seed-data.json"
import plansSpecJson from "../docs/devin-spec/specs/plans.json"
import messageTemplatesSpecJson from "../docs/devin-spec/specs/message-templates.json"
import { VEHICLE_CATALOGUE } from "../lib/catalogue/data"

// Spec JSONs are heterogeneous; the seed maps fields defensively.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const seedData = seedDataJson as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plansSpec = plansSpecJson as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const messageTemplatesSpec = messageTemplatesSpecJson as any

config({ path: ".env.local" })

const SEED_PASSWORD = "Password123!"
const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is not set")

const sql = postgres(url, { ssl: "require", prepare: false, max: 1 })

const ghs = (n: number | null | undefined) =>
  n == null ? null : Math.round(n * 100)
const plateSearch = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "")

let counts = { inserted: 0, skipped: 0 }
function log(step: string, detail = "") {
  console.log(`  ${step}${detail ? ` — ${detail}` : ""}`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function one(q: Promise<any[]>): Promise<any> {
  const rows = await q
  return rows[0]
}

/** Find-or-create a Supabase auth user; returns auth.users.id. */
async function ensureAuthUser(email: string, fullName: string, phone?: string | null) {
  const existing = await one(sql`select id from auth.users where email = ${email}`)
  if (existing) return existing.id as string

  const id = randomUUID()
  const meta = { full_name: fullName, name: fullName }
  const instance = await one(sql`select instance_id from auth.users limit 1`)
  await sql`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, phone, phone_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      ${id}::uuid, ${instance?.instance_id ?? "00000000-0000-0000-0000-000000000000"}::uuid,
      'authenticated', 'authenticated', ${email},
      crypt(${SEED_PASSWORD}, gen_salt('bf')),
      now(), ${phone ?? null}, ${phone ? new Date() : null},
      ${sql.json({ provider: "email", providers: ["email"] })},
      ${sql.json(meta)}, now(), now(), '', '', '', ''
    )`
  await sql`
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      ${randomUUID()}::uuid, ${id}, ${id}::uuid,
      ${sql.json({ sub: id, email, ...meta })}, 'email', now(), now(), now()
    )
    on conflict do nothing`
  counts.inserted++
  log("auth user", email)
  return id
}

async function ensurePublicUser(id: string, fullName: string, email: string, phone: string | null, isPlatformAdmin = false) {
  const existing = await one(sql`select id from public.users where id = ${id}::uuid`)
  if (existing) {
    await sql`update public.users set full_name=${fullName}, phone=${phone}, is_platform_admin=${isPlatformAdmin}, updated_at=now() where id=${id}::uuid`
    counts.skipped++
    return
  }
  await sql`
    insert into public.users (id, full_name, email, phone, is_platform_admin)
    values (${id}::uuid, ${fullName}, ${email}, ${phone}, ${isPlatformAdmin})`
  counts.inserted++
  log("user", `${fullName} <${email}>`)
}

async function main() {
  console.log("Seeding FixAm demo data…")

  // -- plans ---------------------------------------------------------------
  for (const p of plansSpec.plans) {
    await sql`
      insert into public.plans (code, name, price_monthly, max_branches, max_staff, message_allowance, features, paystack_plan_code, is_active)
      values (${p.code}, ${p.name}, ${Math.round((p.price_monthly_ghs ?? 0) * 100)},
        ${p.max_branches ?? null}, ${p.max_staff ?? null}, ${p.message_allowance},
        ${p.features}, ${p.paystack_plan_code ?? null}, true)
      on conflict (code) do update set
        name = excluded.name, max_branches = excluded.max_branches, max_staff = excluded.max_staff,
        message_allowance = excluded.message_allowance, features = excluded.features, is_active = true`
  }
  log("plans", plansSpec.plans.map((p: { code: string }) => p.code).join(", "))

  // -- platform admin ------------------------------------------------------
  const admin = seedData.platform_admin
  const adminId = await ensureAuthUser(admin.email, admin.full_name, admin.phone)
  await ensurePublicUser(adminId, admin.full_name, admin.email, admin.phone, true)

  // -- insurance partners (platform) ---------------------------------------
  const partnerIds = new Map<string, string>()
  for (const p of seedData.insurance_partners) {
    const ex = await one(sql`select id from public.insurance_partners where name = ${p.name}`)
    if (ex) {
      partnerIds.set(p.name, ex.id as string)
      counts.skipped++
      continue
    }
    const row = await one(sql`
      insert into public.insurance_partners (name, nic_licence_number, contact_name, contact_phone, contact_email, commission_rule, is_active)
      values (${p.name}, ${p.nic_licence_number}, ${p.contact_name}, ${p.contact_phone}, ${p.contact_email}, ${sql.json(p.commission_rule)}, true)
      returning id`)
    partnerIds.set(p.name, row!.id as string)
    counts.inserted++
    log("insurance partner", p.name)
  }

  // -- DVLA fee table (platform, sample) ------------------------------------
  for (const f of seedData.dvla_fees_sample) {
    const ex = await one(sql`
      select id from public.dvla_fees
      where record_type=${f.record_type} and vehicle_category=${f.vehicle_category} and effective_from=${f.effective_from}`)
    if (ex) { counts.skipped++; continue }
    await sql`
      insert into public.dvla_fees (record_type, vehicle_category, description, amount, effective_from)
      values (${f.record_type}, ${f.vehicle_category}, ${f.description}, ${ghs(f.amount_ghs) ?? 0}, ${f.effective_from})`
    counts.inserted++
    log("dvla fee", `${f.record_type}/${f.vehicle_category}`)
  }

  // -- garage -----------------------------------------------------------------
  const g = seedData.garage
  const garage = await one(sql`
    insert into public.garages (name, slug, phone, email, address, city, region, gps_lat, gps_lng, status, onboarding_completed_at)
    values (${g.name}, ${g.slug}, ${g.phone}, ${g.email}, ${g.address}, ${g.city}, ${g.region},
      ${String(g.gps[0])}, ${String(g.gps[1])}, 'active', now())
    on conflict (slug) do update set
      name=excluded.name, phone=excluded.phone, email=excluded.email, address=excluded.address,
      city=excluded.city, region=excluded.region, gps_lat=excluded.gps_lat, gps_lng=excluded.gps_lng,
      status='active', updated_at=now()
    returning id`)
  const garageId = garage!.id as string
  log("garage", `${g.name} (${g.slug})`)

  const s = g.settings
  await sql`
    insert into public.garage_settings (garage_id, tax_rules, prices_include_tax, default_labour_rate,
      advisor_discount_limit_percent, quiet_hours, currency)
    values (${garageId}::uuid, ${sql.json(s.tax_rules)}, ${s.prices_include_tax}, ${ghs(s.default_labour_rate_ghs) ?? 0},
      ${s.advisor_discount_limit_percent}, '{"start":"21:00","end":"07:00"}'::jsonb, 'GHS')
    on conflict (garage_id) do update set
      tax_rules=excluded.tax_rules, prices_include_tax=excluded.prices_include_tax,
      default_labour_rate=excluded.default_labour_rate,
      advisor_discount_limit_percent=excluded.advisor_discount_limit_percent, updated_at=now()`

  // -- branches + bays ---------------------------------------------------------
  const branchIds = new Map<string, string>() // code -> id
  const bayIds = new Map<string, string>() // "CODE|name" -> id
  for (const b of g.branches) {
    let row = await one(sql`select id from public.branches where garage_id=${garageId}::uuid and code=${b.code}`)
    if (!row) {
      row = await one(sql`
        insert into public.branches (garage_id, name, code, is_default)
        values (${garageId}::uuid, ${b.name}, ${b.code}, ${!!b.is_default}) returning id`)
      counts.inserted++
      log("branch", `${b.name} (${b.code})`)
    } else counts.skipped++
    const branchId = row!.id as string
    branchIds.set(b.code, branchId)

    for (const [i, bayName] of b.bays.entries()) {
      const key = `${b.code}|${bayName}`
      let bay = await one(sql`select id from public.bays where branch_id=${branchId}::uuid and name=${bayName}`)
      if (!bay) {
        bay = await one(sql`
          insert into public.bays (garage_id, branch_id, name, sort_order)
          values (${garageId}::uuid, ${branchId}::uuid, ${bayName}, ${i}) returning id`)
        counts.inserted++
      } else counts.skipped++
      bayIds.set(key, bay!.id as string)
    }
  }

  // -- staff: auth users + public.users + memberships --------------------------
  const userIds = new Map<string, string>() // email -> user id
  for (const st of g.staff) {
    const uid = await ensureAuthUser(st.email, st.full_name, st.phone)
    await ensurePublicUser(uid, st.full_name, st.email, st.phone)
    userIds.set(st.email, uid)

    const branchId = st.branch ? branchIds.get(st.branch) ?? null : null
    const ex = await one(sql`
      select id from public.memberships
      where garage_id=${garageId}::uuid and user_id=${uid}::uuid and role=${st.role}
        and branch_id is not distinct from ${branchId}::uuid`)
    if (!ex) {
      await sql`
        insert into public.memberships (garage_id, user_id, branch_id, role, status)
        values (${garageId}::uuid, ${uid}::uuid, ${branchId}::uuid, ${st.role}, 'active')`
      counts.inserted++
      log("membership", `${st.full_name} → ${st.role}${st.branch ? ` @ ${st.branch}` : ""}`)
    } else counts.skipped++
  }

  // -- subscription --------------------------------------------------------------
  const plan = await one(sql`select id from public.plans where code = ${g.subscription.plan_code}`)
  if (plan) {
    await sql`
      insert into public.subscriptions (garage_id, plan_id, status, is_complimentary, current_period_start, current_period_end)
      values (${garageId}::uuid, ${plan.id}::uuid, ${g.subscription.status}, ${!!g.subscription.is_complimentary}, now(), now() + interval '1 year')
      on conflict (garage_id) do update set plan_id=excluded.plan_id, status=excluded.status,
        is_complimentary=excluded.is_complimentary, updated_at=now()`
  } else {
    console.warn(`  ! plan '${g.subscription.plan_code}' not found — subscription skipped`)
  }

  // -- job templates ---------------------------------------------------------------
  const templateIds = new Map<string, string>()
  for (const t of g.job_templates) {
    const ex = await one(sql`select id from public.job_templates where garage_id=${garageId}::uuid and name=${t.name}`)
    if (ex) { templateIds.set(t.name, ex.id as string); counts.skipped++; continue }
    const row = await one(sql`
      insert into public.job_templates (garage_id, name, estimated_minutes, creates_due_item_type, deposit_percent, default_items, checklist, is_active)
      values (${garageId}::uuid, ${t.name}, ${t.estimated_minutes}, ${t.creates_due_item_type ?? null},
        ${t.deposit_percent ?? null}, ${sql.json(t.items)}, ${sql.json((t.checklist ?? []).map((c: string) => ({ label: c, required: true })))}, true)
      returning id`)
    templateIds.set(t.name, row!.id as string)
    counts.inserted++
    log("job template", t.name)
  }

  // -- parts + stock -----------------------------------------------------------------
  const partIds = new Map<string, string>() // sku -> id
  const partBySku = new Map<string, { price: number; cost: number }>()
  for (const p of g.parts) {
    const ex = await one(sql`select id from public.parts where garage_id=${garageId}::uuid and sku=${p.sku}`)
    let id: string
    if (ex) {
      id = ex.id as string
      counts.skipped++
    } else {
      const row = await one(sql`
        insert into public.parts (garage_id, sku, name, brand, category, cost_price, selling_price, online_visible, is_active)
        values (${garageId}::uuid, ${p.sku}, ${p.name}, ${p.brand ?? null}, ${p.category ?? null},
          ${ghs(p.cost_ghs) ?? 0}, ${ghs(p.price_ghs) ?? 0}, ${!!p.online_visible}, true)
        returning id`)
      id = row!.id as string
      counts.inserted++
      log("part", p.sku)
    }
    partIds.set(p.sku, id)
    partBySku.set(p.sku, { price: ghs(p.price_ghs) ?? 0, cost: ghs(p.cost_ghs) ?? 0 })

    for (const [branchCode, qty] of Object.entries(p.stock ?? {}) as [string, number][]) {
      const branchId = branchIds.get(branchCode)
      if (!branchId) continue
      const exStock = await one(sql`
        select id from public.stock_levels where garage_id=${garageId}::uuid and branch_id=${branchId}::uuid and part_id=${id}::uuid`)
      if (exStock) {
        await sql`update public.stock_levels set quantity_on_hand=${qty}, reorder_level=${p.reorder_level ?? 0},
          reorder_quantity=${p.reorder_quantity ?? 0}, average_cost=${ghs(p.cost_ghs) ?? 0}, updated_at=now()
          where id=${exStock.id}::uuid`
        counts.skipped++
      } else {
        await sql`
          insert into public.stock_levels (garage_id, branch_id, part_id, quantity_on_hand, reorder_level, reorder_quantity, average_cost)
          values (${garageId}::uuid, ${branchId}::uuid, ${id}::uuid, ${qty}, ${p.reorder_level ?? 0}, ${p.reorder_quantity ?? 0}, ${ghs(p.cost_ghs) ?? 0})`
        counts.inserted++
      }
    }
  }

  // link preferred vendors later (vendor ids unknown yet) — parts.preferred_vendor_id stays null.

  // -- customers + vehicles ---------------------------------------------------------
  const customerIds = new Map<string, string>() // phone -> id
  const vehicleIds = new Map<string, string>() // plateSearch -> id
  const ownerUserId = userIds.get(g.staff.find((s: { role: string }) => s.role === "owner")?.email ?? "")

  for (const c of g.customers) {
    let cust = await one(sql`
      select id from public.customers where garage_id=${garageId}::uuid and phone=${c.phone}`)
    if (!cust) {
      cust = await one(sql`
        insert into public.customers (garage_id, type, full_name, company_name, phone, email,
          preferred_channels, whatsapp_opt_in)
        values (${garageId}::uuid, ${c.type}, ${c.full_name ?? c.company_name}, ${c.company_name ?? null},
          ${c.phone}, ${c.email ?? null}, ${c.preferred_channels ?? ["whatsapp", "sms"]}, true)
        returning id`)
      counts.inserted++
      log("customer", c.full_name ?? c.company_name)
    } else counts.skipped++
    const customerId = cust!.id as string
    customerIds.set(c.phone, customerId)

    for (const v of c.vehicles ?? []) {
      const ps = plateSearch(v.plate_number)
      let veh = await one(sql`
        select id from public.vehicles where garage_id=${garageId}::uuid and plate_search=${ps}`)
      if (!veh) {
        veh = await one(sql`
          insert into public.vehicles (garage_id, plate_number, plate_search, make, model, year, color, color_hex,
            body_type, fuel_type, transmission, usage, current_owner_id)
          values (${garageId}::uuid, ${v.plate_number}, ${ps}, ${v.make}, ${v.model}, ${v.year},
            ${v.color ?? null}, ${v.color_hex ?? null}, ${v.body_type ?? "sedan"}, ${v.fuel_type ?? null},
            ${v.transmission ?? null}, ${v.usage ?? "private"}, ${customerId}::uuid)
          returning id`)
        counts.inserted++
        log("vehicle", `${v.plate_number} (${v.make} ${v.model})`)
      } else counts.skipped++
      const vehicleId = veh!.id as string
      vehicleIds.set(ps, vehicleId)

      // ownership
      const own = await one(sql`
        select id from public.vehicle_ownerships
        where vehicle_id=${vehicleId}::uuid and customer_id=${customerId}::uuid and is_primary`)
      if (!own) {
        await sql`
          insert into public.vehicle_ownerships (garage_id, vehicle_id, customer_id, from_date, is_primary)
          values (${garageId}::uuid, ${vehicleId}::uuid, ${customerId}::uuid, '2020-01-01', true)`
        counts.inserted++
      } else counts.skipped++

      // odometer history (latest becomes current)
      const readings = [...(v.odometer_history ?? [])].sort((a, b) => a[0].localeCompare(b[0]))
      for (const [date, km] of readings) {
        const ex = await one(sql`
          select id from public.odometer_readings
          where vehicle_id=${vehicleId}::uuid and reading_km=${km} and read_at::date = ${date}::date`)
        if (!ex) {
          await sql`
            insert into public.odometer_readings (garage_id, vehicle_id, reading_km, read_at, source, recorded_by_user_id)
            values (${garageId}::uuid, ${vehicleId}::uuid, ${km}, ${date + "T12:00:00Z"}::timestamptz, 'import', ${ownerUserId ?? null}::uuid)`
          counts.inserted++
        } else counts.skipped++
      }
      const last = readings[readings.length - 1]
      if (last) {
        await sql`update public.vehicles set last_odometer_km=${last[1]}, last_odometer_at=${last[0] + "T12:00:00Z"}::timestamptz, updated_at=now() where id=${vehicleId}::uuid`
      }

      // insurance
      if (v.insurance) {
        const ins = v.insurance
        const ex = await one(sql`
          select id from public.insurance_policies
          where vehicle_id=${vehicleId}::uuid and start_date=${ins.start_date} and end_date=${ins.end_date}`)
        if (!ex) {
          await sql`
            insert into public.insurance_policies (garage_id, vehicle_id, customer_id, insurer_name, partner_id,
              policy_type, policy_number, start_date, end_date, premium, is_current)
            values (${garageId}::uuid, ${vehicleId}::uuid, ${customerId}::uuid, ${ins.insurer_name},
              ${partnerIds.get(ins.insurer_name) ?? null}::uuid, ${ins.policy_type}, ${ins.policy_number ?? null},
              ${ins.start_date}, ${ins.end_date}, ${ghs(ins.premium_ghs) ?? null}, true)`
          counts.inserted++
          log("insurance", `${v.plate_number} → ${ins.insurer_name}`)
        } else counts.skipped++
      }

      // dvla records
      for (const d of v.dvla ?? []) {
        const ex = await one(sql`
          select id from public.dvla_records
          where vehicle_id=${vehicleId}::uuid and type=${d.type} and expiry_date=${d.expiry_date}`)
        if (!ex) {
          await sql`
            insert into public.dvla_records (garage_id, vehicle_id, customer_id, type, expiry_date, is_current)
            values (${garageId}::uuid, ${vehicleId}::uuid, ${customerId}::uuid, ${d.type}, ${d.expiry_date}, true)`
          counts.inserted++
        } else counts.skipped++
      }
    }
  }

  // -- credit account (fleet customer) ---------------------------------------------
  const fleet = g.customers.find((c: { type: string }) => c.type === "fleet")
  if (fleet?.credit_account) {
    const cid = customerIds.get(fleet.phone)
    if (cid) {
      await sql`
        insert into public.credit_accounts (garage_id, customer_id, credit_limit, payment_terms_days, statement_day, status, approved_by)
        values (${garageId}::uuid, ${cid}::uuid, ${ghs(fleet.credit_account.credit_limit_ghs) ?? 0},
          ${fleet.credit_account.payment_terms_days}, ${fleet.credit_account.statement_day}, 'active', ${ownerUserId ?? null}::uuid)
        on conflict (garage_id, customer_id) do update set
          credit_limit=excluded.credit_limit, payment_terms_days=excluded.payment_terms_days,
          statement_day=excluded.statement_day, updated_at=now()`
      log("credit account", fleet.full_name ?? fleet.company_name)
    }
  }

  // -- vendors + members + products ----------------------------------------------------
  const vendorIds = new Map<string, string>() // slug -> id
  for (const v of seedData.vendors) {
    let vendor = await one(sql`select id from public.vendors where slug=${v.slug}`)
    if (!vendor) {
      vendor = await one(sql`
        insert into public.vendors (business_name, slug, phone, email, city, region, delivery_zones, status)
        values (${v.business_name}, ${v.slug}, ${v.phone}, ${v.email ?? null}, ${v.city ?? null}, ${v.region ?? null},
          ${sql.json(v.delivery_zones)}, ${v.status})
        returning id`)
      counts.inserted++
      log("vendor", v.business_name)
    } else {
      await sql`update public.vendors set business_name=${v.business_name}, phone=${v.phone}, email=${v.email ?? null},
        city=${v.city ?? null}, region=${v.region ?? null}, delivery_zones=${sql.json(v.delivery_zones)},
        status=${v.status}, updated_at=now() where id=${vendor.id}::uuid`
      counts.skipped++
    }
    const vendorId = vendor!.id as string
    vendorIds.set(v.slug, vendorId)

    // vendor owner auth user + member
    if (v.owner?.email) {
      const vid = await ensureAuthUser(v.owner.email, v.owner.full_name, null)
      await ensurePublicUser(vid, v.owner.full_name, v.owner.email, null)
      const exMem = await one(sql`select id from public.vendor_members where vendor_id=${vendorId}::uuid and user_id=${vid}::uuid`)
      if (!exMem) {
        await sql`insert into public.vendor_members (vendor_id, user_id, role) values (${vendorId}::uuid, ${vid}::uuid, 'vendor_owner')`
        counts.inserted++
      } else counts.skipped++
    }

    for (const prod of v.products ?? []) {
      const ex = await one(sql`select id from public.vendor_products where vendor_id=${vendorId}::uuid and sku=${prod.sku}`)
      if (ex) { counts.skipped++; continue }
      await sql`
        insert into public.vendor_products (garage_id, vendor_id, sku, name, category, price, quantity_available, stock_status, is_active)
        values (${garageId}::uuid, ${vendorId}::uuid, ${prod.sku}, ${prod.name}, ${prod.category},
          ${ghs(prod.price_ghs) ?? 0}, ${prod.quantity_available ?? null},
          ${prod.quantity_available === 0 ? "out" : "in_stock"}, true)`
      counts.inserted++
      log("vendor product", `${v.slug}/${prod.sku}`)
    }
  }

  // link parts.preferred_vendor_id by slug -> vendor id
  for (const p of g.parts) {
    if (!p.preferred_vendor) continue
    const vid = vendorIds.get(p.preferred_vendor)
    const pid = partIds.get(p.sku)
    if (vid && pid) {
      await sql`update public.parts set preferred_vendor_id=${vid}::uuid, updated_at=now() where id=${pid}::uuid and preferred_vendor_id is null`
    }
  }

  // -- platform message templates -------------------------------------------------------
  for (const t of messageTemplatesSpec.templates) {
    for (const [channel, content] of Object.entries(t.channels)) {
      const body = (content as { body?: string }).body ?? (content as { subject?: string }).subject ?? ""
      const ex = await one(sql`
        select id from public.message_templates
        where garage_id is null and key=${t.key} and channel=${channel}`)
      if (ex) { counts.skipped++; continue }
      await sql`
        insert into public.message_templates (garage_id, key, channel, subject, body, whatsapp_template_name, is_active)
        values (null, ${t.key}, ${channel}, ${(content as { subject?: string }).subject ?? null},
          ${body}, ${(content as { template_name?: string }).template_name ?? null}, true)`
      counts.inserted++
    }
  }
  log("message templates", `${messageTemplatesSpec.templates.length} keys`)

  // -- sample jobs -----------------------------------------------------------------------
  const defaultBranch = branchIds.get(g.branches.find((b: { is_default?: boolean }) => b.is_default)?.code ?? g.branches[0].code)!
  let jobSeq = 0
  for (const sj of g.sample_jobs) {
    jobSeq++
    const number = `JOB-DEMO-${String(jobSeq).padStart(3, "0")}`
    const ex = await one(sql`select id from public.jobs where garage_id=${garageId}::uuid and number=${number}`)
    if (ex) { counts.skipped++; continue }
    const ps = plateSearch(sj.plate)
    const vehicleId = vehicleIds.get(ps)
    const customerId = vehicleId
      ? (await one(sql`select current_owner_id as id from public.vehicles where id=${vehicleId}::uuid`))?.id as string
      : undefined
    if (!vehicleId || !customerId) { console.warn(`  ! sample job ${number}: vehicle ${sj.plate} not found`); continue }

    const bayId = sj.bay ? bayIds.get(`${g.branches[0].code}|${sj.bay}`) ?? null : null
    const advisorId = sj.assigned?.[0] ? userIds.get(sj.assigned[0]) ?? null : null
    const templateId = sj.template ? templateIds.get(sj.template) ?? null : null

    const job = await one(sql`
      insert into public.jobs (garage_id, branch_id, number, vehicle_id, customer_id, bay_id, status,
        complaint, service_advisor_id, checked_in_at, promised_at)
      values (${garageId}::uuid, ${defaultBranch}::uuid, ${number}, ${vehicleId}::uuid, ${customerId}::uuid,
        ${bayId}::uuid, ${sj.status}, ${sj.complaint ?? null}, ${advisorId}::uuid, now() - interval '1 day',
        now() + interval '1 day')
      returning id`)
    const jobId = job!.id as string
    counts.inserted++
    log("job", `${number} [${sj.status}] ${sj.plate}`)

    // job items from template
    const tpl = sj.template ? g.job_templates.find((t: { name: string }) => t.name === sj.template) : undefined
    let sort = 0
    for (const item of tpl?.items ?? []) {
      let unitPrice = 0
      let partId: string | null = null
      if (item.type === "part" && item.sku) {
        partId = partIds.get(item.sku) ?? null
        unitPrice = partBySku.get(item.sku)?.price ?? 0
      } else if (item.labour_hours != null) {
        unitPrice = Math.round((s.default_labour_rate_ghs ?? 150) * 100 * item.labour_hours)
      }
      await sql`
        insert into public.job_items (garage_id, job_id, type, description, part_id, quantity, unit_price, labour_hours, sort_order)
        values (${garageId}::uuid, ${jobId}::uuid, ${item.type}, ${item.description ?? item.sku ?? item.type}, ${partId}::uuid,
          ${item.quantity ?? 1}, ${unitPrice}, ${item.labour_hours ?? null}, ${sort++})`
    }

    // assignments
    for (const email of sj.assigned ?? []) {
      const uid = userIds.get(email)
      if (!uid) continue
      await sql`
        insert into public.job_assignments (garage_id, job_id, user_id, is_lead)
        values (${garageId}::uuid, ${jobId}::uuid, ${uid}::uuid, true)
        on conflict do nothing`
    }

    // findings
    for (const f of sj.findings ?? []) {
      await sql`
        insert into public.job_findings (garage_id, job_id, title, severity, created_by)
        values (${garageId}::uuid, ${jobId}::uuid, ${f.title}, ${f.severity}, ${advisorId}::uuid)`
    }

    // status event
    await sql`
      insert into public.job_status_events (garage_id, job_id, to_status, actor_user_id, note)
      values (${garageId}::uuid, ${jobId}::uuid, ${sj.status}, ${advisorId}::uuid, 'Seeded demo job')`
  }

  // ── Vehicle catalogue (platform reference data) ──────────────────────
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  for (const make of VEHICLE_CATALOGUE) {
    const [mk] = await sql`
      insert into public.vehicle_makes (name, slug, country, sort_order)
      values (${make.name}, ${make.slug}, ${make.country}, ${make.sortOrder})
      on conflict (slug) do update set name = excluded.name
      returning id`
    for (const [i, m] of make.models.entries()) {
      await sql`
        insert into public.vehicle_models (make_id, name, slug, year_start, year_end, body_type, sort_order)
        values (${mk.id}::uuid, ${m.name}, ${slugify(m.name)}, ${m.yearStart ?? null}, ${m.yearEnd ?? null}, ${m.bodyType ?? null}, ${i})
        on conflict (make_id, slug) do nothing`
    }
  }
  log("vehicle catalogue", `${VEHICLE_CATALOGUE.length} makes`)

  console.log(`\nDone. inserted=${counts.inserted} skipped(existing)=${counts.skipped}`)
  console.log(`Login: any seeded email + password '${SEED_PASSWORD}'`)
  console.log(`  admin@fixam.test (platform admin)`)
  for (const st of g.staff) console.log(`  ${st.email} (${st.role}${st.branch ? ` @ ${st.branch}` : ""})`)
  for (const v of seedData.vendors) if (v.owner?.email) console.log(`  ${v.owner.email} (vendor)`)
}

main()
  .catch((e) => {
    console.error("SEED FAILED:", e)
    process.exitCode = 1
  })
  .finally(() => sql.end())
