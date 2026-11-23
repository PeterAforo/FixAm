import "server-only"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  customers,
  garageSettings,
  garages,
  jobs,
  repairRequestRecipients,
  repairRequests,
  vehicles,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema"
import { appUrl, sendDirectSms } from "@/lib/messaging/direct"
import { runPrompt } from "@/lib/ai/run"
import { whatsappIntentPrompt, whatsappReplyPrompt } from "@/lib/ai/prompts"
import { transcribeVoiceNote } from "@/lib/ai/speech"
import { downloadWhatsAppMedia, sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/integrations/messaging/whatsapp-cloud"
import { parsePendingGarage, withinServiceWindow, WA_OUTSIDE_WINDOW_TEMPLATE, type WaInbound, type WaIntent } from "./core"
import { normalizeGhPhone } from "@/lib/phone"
import { uuidv7 } from "@/lib/id"

export type WaConversation = typeof whatsappConversations.$inferSelect
export type WaMessage = typeof whatsappMessages.$inferSelect

const ACTIVE_JOB_STATUSES = ["checked_in", "diagnosing", "estimate_sent", "approved", "in_progress", "waiting_parts", "quality_check"] as const

// ---------------------------------------------------------------------------
// Routing: which garage does this sender belong to?
// ---------------------------------------------------------------------------

async function garageByPhoneNumberId(phoneNumberId: string | null): Promise<string | null> {
  if (!phoneNumberId) return null
  const [row] = await db()
    .select({ garageId: garageSettings.garageId })
    .from(garageSettings)
    .where(eq(garageSettings.whatsappPhoneNumberId, phoneNumberId))
    .limit(1)
  return row?.garageId ?? null
}

/** Garages where this phone is a known customer (digits compared, E.164 agnostic). */
async function garagesForPhone(phone: string): Promise<{ id: string; name: string; slug: string }[]> {
  const rows = await db()
    .select({ id: garages.id, name: garages.name, slug: garages.slug })
    .from(customers)
    .innerJoin(garages, eq(garages.id, customers.garageId))
    .where(and(sql`regexp_replace(${customers.phone}, '\\D', '', 'g') = ${phone}`, eq(garages.status, "active"), isNull(customers.deletedAt), isNull(garages.deletedAt)))
    .limit(10)
  const seen = new Map<string, { id: string; name: string; slug: string }>()
  for (const r of rows) seen.set(r.id, r)
  return [...seen.values()]
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function ensureConversation(garageId: string, phone: string): Promise<WaConversation> {
  const [existing] = await db()
    .select()
    .from(whatsappConversations)
    .where(and(eq(whatsappConversations.garageId, garageId), eq(whatsappConversations.customerPhone, phone)))
    .limit(1)
  if (existing) return existing
  const [created] = await db()
    .insert(whatsappConversations)
    .values({ id: uuidv7(), garageId, customerPhone: phone, mode: "ai" })
    .onConflictDoNothing()
    .returning()
  if (created) return created
  const [again] = await db()
    .select()
    .from(whatsappConversations)
    .where(and(eq(whatsappConversations.garageId, garageId), eq(whatsappConversations.customerPhone, phone)))
    .limit(1)
  return again!
}

async function addMessage(convId: string, m: { direction: "in" | "out"; type?: string; body?: string | null; mediaPath?: string | null; transcript?: string | null; providerMessageId?: string | null; sentByUserId?: string | null; aiToolCalls?: unknown }) {
  const [row] = await db()
    .insert(whatsappMessages)
    .values({
      id: uuidv7(),
      conversationId: convId,
      direction: m.direction,
      type: m.type ?? "text",
      body: m.body ?? null,
      mediaPath: m.mediaPath ?? null,
      transcript: m.transcript ?? null,
      providerMessageId: m.providerMessageId ?? null,
      sentByUserId: m.sentByUserId ?? null,
      aiToolCalls: (m.aiToolCalls ?? null) as never,
    })
    .returning()
  return row!
}

async function touchConversation(id: string, inbound: boolean) {
  await db()
    .update(whatsappConversations)
    .set({
      lastMessageAt: new Date(),
      ...(inbound ? { windowStartedAt: new Date(), unreadCount: sql`${whatsappConversations.unreadCount} + 1` } : {}),
      updatedAt: new Date(),
    })
    .where(eq(whatsappConversations.id, id))
}

// ---------------------------------------------------------------------------
// Outbound — respects the 24 h window
// ---------------------------------------------------------------------------

export async function sendWaReply(conv: WaConversation, body: string, opts: { sentByUserId?: string | null } = {}): Promise<{ ok: boolean; error?: string }> {
  const inWindow = withinServiceWindow(conv.windowStartedAt)
  let providerMessageId = ""
  let usedTemplate: string | null = null
  if (inWindow) {
    const r = await sendWhatsAppText(conv.customerPhone, body)
    if (!r.ok) {
      // Window may have just closed — try the approved template once.
      const t = await sendWhatsAppTemplate(conv.customerPhone, WA_OUTSIDE_WINDOW_TEMPLATE, body)
      if (!t.ok) return { ok: false, error: t.error }
      providerMessageId = t.providerMessageId
      usedTemplate = WA_OUTSIDE_WINDOW_TEMPLATE
    } else {
      providerMessageId = r.providerMessageId
    }
  } else {
    const t = await sendWhatsAppTemplate(conv.customerPhone, WA_OUTSIDE_WINDOW_TEMPLATE, body)
    if (!t.ok) {
      // Last resort: SMS so the customer still hears back.
      await sendDirectSms(`+${conv.customerPhone}`, "delivery_update", { number: "FixAm", status: body.slice(0, 140), link: appUrl("/portal") }).catch(() => undefined)
      return { ok: false, error: t.error }
    }
    providerMessageId = t.providerMessageId
    usedTemplate = WA_OUTSIDE_WINDOW_TEMPLATE
  }
  await addMessage(conv.id, {
    direction: "out",
    type: usedTemplate ? "template" : "text",
    body: usedTemplate ? `[template:${usedTemplate}] ${body}` : body,
    providerMessageId,
    sentByUserId: opts.sentByUserId ?? null,
  })
  await db().update(whatsappConversations).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(whatsappConversations.id, conv.id))
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Inbound pipeline
// ---------------------------------------------------------------------------

const HOLDING = "Thanks for messaging! A member of the team will reply here shortly. 🙏"

/** Entry point for each parsed inbound message (called by the webhook route / Inngest). */
export async function handleInbound(raw: unknown, phoneNumberId: string | null): Promise<{ handled: number }> {
  const { parseCloudApiMessages } = await import("./core")
  const msgs = parseCloudApiMessages(raw)
  let handled = 0
  for (const m of msgs) {
    try {
      await handleOne(m, phoneNumberId)
      handled++
    } catch (e) {
      console.error("[whatsapp] inbound failed:", (e as Error).message)
    }
  }
  return { handled }
}

async function handleOne(m: WaInbound, phoneNumberId: string | null) {
  // 1. Route to a garage.
  let garageId = await garageByPhoneNumberId(phoneNumberId)
  let candidates = garageId ? [] : await garagesForPhone(m.from)

  // A pending "which garage?" answer resolves before anything else.
  if (!garageId && candidates.length > 1) {
    // handled below via pendingGarage on an existing conversation — find it by phone across garages
    const existing = await db()
      .select()
      .from(whatsappConversations)
      .where(and(eq(whatsappConversations.customerPhone, m.from), sql`${whatsappConversations.pendingGarage} is not null`))
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(1)
    if (existing[0]) {
      const pick = matchGarageOption(m.text ?? "", parsePendingGarage(existing[0].pendingGarage)?.options ?? [])
      if (pick) {
        await db().update(whatsappConversations)
          .set({ garageId: pick.id, pendingGarage: null, customerId: await customerIdFor(pick.id, m.from), updatedAt: new Date() })
          .where(eq(whatsappConversations.id, existing[0].id))
        garageId = pick.id
        candidates = []
      }
    }
  }

  if (!garageId) {
    if (candidates.length === 1) {
      garageId = candidates[0]!.id
    } else if (candidates.length > 1) {
      // Ask which garage — store under the first option with pendingGarage set.
      const conv = await ensureConversation(candidates[0]!.id, m.from)
      await db().update(whatsappConversations)
        .set({ pendingGarage: { options: candidates.map((c) => ({ id: c.id, name: c.name })), askedAt: new Date().toISOString() }, lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(whatsappConversations.id, conv.id))
      const names = candidates.map((c, i) => `${i + 1}. ${c.name}`).join("\n")
      const askText = `Hi! You have cars with more than one garage on FixAm. Which one is this about?\n${names}\nReply with the number or name.`
      const sent = await sendWhatsAppText(m.from, askText).catch(() => null)
      if (sent?.ok) await addMessage(conv.id, { direction: "out", body: askText, providerMessageId: sent.providerMessageId }).catch(() => undefined)
      return
    } else {
      // Unknown sender on the shared number — can't route; reply once.
      await sendWhatsAppText(m.from, "Hi! This is the FixAm assistant. To get help, message your garage directly on WhatsApp or use the FixAm app. 🙏").catch(() => undefined)
      return
    }
  }

  const conv = await ensureConversation(garageId, m.from)
  if (!conv.customerId) {
    const cid = await customerIdFor(garageId, m.from)
    if (cid) await db().update(whatsappConversations).set({ customerId: cid }).where(eq(whatsappConversations.id, conv.id))
  }

  // 2. Resolve voice notes → transcript.
  let text = m.text
  let transcript: string | null = null
  let type = m.type
  if (m.type === "audio" && m.mediaId) {
    const media = await downloadWhatsAppMedia(m.mediaId)
    if (media) {
      const v = await transcribeVoiceNote({ audio: media.data, mimeType: media.mimeType, language: "en" }, { garageId })
      if (v.ok) {
        transcript = v.transcript
        text = v.english
        type = "audio"
      } else {
        text = null
      }
    }
  }
  if (m.type === "image" || m.type === "document") type = m.type

  // 3. Store inbound + open the service window.
  await addMessage(conv.id, { direction: "in", type, body: text, transcript, providerMessageId: m.wamid })
  await touchConversation(conv.id, true)
  if (conv.pendingGarage) await db().update(whatsappConversations).set({ pendingGarage: null }).where(eq(whatsappConversations.id, conv.id))

  // 4. Human mode or AI off → staff handles it in the inbox.
  const [fresh] = await db().select().from(whatsappConversations).where(eq(whatsappConversations.id, conv.id)).limit(1)
  const [settings] = await db().select({ ai: garageSettings.whatsappAiEnabled }).from(garageSettings).where(eq(garageSettings.garageId, garageId)).limit(1)
  const [customer] = conv.customerId
    ? await db().select({ optIn: customers.whatsappOptIn }).from(customers).where(eq(customers.id, conv.customerId)).limit(1)
    : [null]
  if (!fresh || fresh.mode === "human" || settings?.ai === false || customer?.optIn === false) {
    // Send a holding reply at most once every 6 h so customers aren't left in silence.
    if (!customer || customer.optIn !== false) {
      const lastOut = await db().select({ at: whatsappMessages.createdAt }).from(whatsappMessages)
        .where(and(eq(whatsappMessages.conversationId, conv.id), eq(whatsappMessages.direction, "out")))
        .orderBy(desc(whatsappMessages.createdAt)).limit(1)
      if (!lastOut[0] || Date.now() - lastOut[0].at.getTime() > 6 * 3600_000) {
        await sendWaReply(fresh ?? conv, HOLDING).catch(() => undefined)
      }
    }
    return
  }

  // 5. AI agent.
  await runAgent(conv.id, text ?? (type === "audio" ? "[voice note]" : "[unsupported message]"), garageId, m.from)
}

function matchGarageOption(text: string, options: { id: string; name: string }[]) {
  const t = text.trim().toLowerCase()
  const n = parseInt(t, 10)
  if (n >= 1 && n <= options.length) return options[n - 1]!
  return options.find((o) => t.includes(o.name.toLowerCase()) || o.name.toLowerCase().includes(t)) ?? null
}

async function customerIdFor(garageId: string, phone: string): Promise<string | null> {
  const [c] = await db()
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.garageId, garageId), sql`regexp_replace(${customers.phone}, '\\D', '', 'g') = ${phone}`, isNull(customers.deletedAt)))
    .limit(1)
  return c?.id ?? null
}

// ---------------------------------------------------------------------------
// Agent: intent → tool (existing services only) → composed reply
// ---------------------------------------------------------------------------

async function runAgent(convId: string, message: string, garageId: string, phone: string) {
  const [conv] = await db().select().from(whatsappConversations).where(eq(whatsappConversations.id, convId)).limit(1)
  if (!conv) return
  const [garage] = await db().select().from(garages).where(eq(garages.id, garageId)).limit(1)
  if (!garage) return

  // Context for the intent router.
  const custRows = conv.customerId
    ? await db().select().from(customers).where(eq(customers.id, conv.customerId)).limit(1)
    : await db().select().from(customers)
        .where(and(eq(customers.garageId, garageId), sql`regexp_replace(${customers.phone}, '\\D', '', 'g') = ${phone}`, isNull(customers.deletedAt)))
        .limit(1)
  const customer = custRows[0] ?? null
  const customerId = customer?.id ?? conv.customerId

  const vehicleRows = customerId
    ? await db().select({ id: vehicles.id, plate: vehicles.plateNumber, label: sql<string>`${vehicles.make} || ' ' || ${vehicles.model}` })
        .from(vehicles).where(and(eq(vehicles.garageId, garageId), eq(vehicles.currentOwnerId, customerId))).limit(10)
    : []
  const vehicleIds = vehicleRows.map((v) => v.id)
  const jobRows = vehicleIds.length
    ? await db()
        .select({ number: jobs.number, status: jobs.status, promisedAt: jobs.promisedAt, plate: vehicles.plateNumber, vehicleId: jobs.vehicleId })
        .from(jobs)
        .innerJoin(vehicles, eq(vehicles.id, jobs.vehicleId))
        .where(and(eq(jobs.garageId, garageId), inArray(jobs.vehicleId, vehicleIds), inArray(jobs.status, [...ACTIVE_JOB_STATUSES]), isNull(jobs.deletedAt)))
        .orderBy(desc(jobs.createdAt))
        .limit(5)
    : []

  const intentRes = await runPrompt(whatsappIntentPrompt, {
    message,
    customerName: customer?.fullName ?? null,
    vehicles: vehicleRows.map((v) => v.plate),
    activeJobs: jobRows.map((j) => ({ plate: j.plate, status: j.status })),
    garageName: garage.name,
  }, { garageId })

  const intent: WaIntent = intentRes.ok ? intentRes.data : { action: "handoff", params: { text: HOLDING }, confidence: 0 }
  const tools: unknown[] = [{ intent: intent.action, confidence: intent.confidence }]

  // Low confidence or explicit handoff → human takes over.
  if (intent.action === "handoff" || intent.confidence < 0.45) {
    await db().update(whatsappConversations).set({ mode: "human", pendingGarage: null, updatedAt: new Date() }).where(eq(whatsappConversations.id, convId))
    const text = String(intent.params.text ?? HOLDING)
    await sendWaReply(conv, `${text}\n\nI've passed this to a team member who will reply here.`)
    return
  }

  const facts = await executeIntent(intent, { garage, customer, vehicleRows, jobRows, phone, message })
  tools.push({ facts: facts.slice(0, 500) })

  let reply: string
  if (intent.action === "reply") {
    reply = String(intent.params.text ?? "") || HOLDING
  } else {
    const composed = await runPrompt(whatsappReplyPrompt, { facts, customerMessage: message }, { garageId })
    reply = composed.ok ? composed.data.reply : facts
  }

  const sent = await sendWaReply(conv, reply)
  // Record what the agent did on the last inbound message for the inbox UI.
  const [lastIn] = await db().select({ id: whatsappMessages.id }).from(whatsappMessages)
    .where(and(eq(whatsappMessages.conversationId, convId), eq(whatsappMessages.direction, "in")))
    .orderBy(desc(whatsappMessages.createdAt)).limit(1)
  if (lastIn) {
    await db().update(whatsappMessages).set({ aiToolCalls: tools as never }).where(eq(whatsappMessages.id, lastIn.id)).catch(() => undefined)
  }
  void sent
}

async function executeIntent(
  intent: WaIntent,
  ctx: {
    garage: typeof garages.$inferSelect
    customer: typeof customers.$inferSelect | null
    vehicleRows: { id: string; plate: string; label: string }[]
    jobRows: { number: string; status: string; promisedAt: Date | null; plate: string | null; vehicleId: string }[]
    phone: string
    message: string
  }
): Promise<string> {
  const { garage, customer, vehicleRows, jobRows, message } = ctx
  const p = intent.params as Record<string, unknown>

  switch (intent.action) {
    case "job_status": {
      const wanted = String(p.plate ?? "mine").trim().toLowerCase()
      const job = wanted === "mine" || !wanted
        ? jobRows[0]
        : jobRows.find((j) => (j.plate ?? "").toLowerCase().replace(/\s/g, "") === wanted.replace(/\s/g, ""))
      if (!job) {
        return vehicleRows.length
          ? `No active job found for ${garage.name}'s records. Their vehicles: ${vehicleRows.map((v) => v.plate).join(", ")}.`
          : "No vehicle or active job found for this phone number at this garage."
      }
      const statusText = JOB_STATUS_TEXT[job.status] ?? job.status
      const eta = job.promisedAt ? ` Promised by ${job.promisedAt.toLocaleDateString("en-GH", { weekday: "short", day: "numeric", month: "short" })}${job.promisedAt.toLocaleTimeString("en-GH", { hour: "numeric", minute: "2-digit" }) ? ` ${job.promisedAt.toLocaleTimeString("en-GH", { hour: "numeric", minute: "2-digit" })}` : ""}.` : ""
      const link = await latestLinkFor(garage.id, ctx.phone)
      return `Job ${job.number} for ${job.plate ?? "the vehicle"} is currently: ${statusText}.${eta}${link ? ` Customer's latest link: ${link}` : ""}`
    }

    case "opening_hours": {
      const [branch] = await db().select({ name: branches.name, phone: branches.phone, address: branches.address, openingHours: branches.openingHours }).from(branches)
        .where(and(eq(branches.garageId, garage.id), isNull(branches.deletedAt))).limit(1)
      const hours = branch?.openingHours ? JSON.stringify(branch.openingHours) : "Mon–Sat 8:00–17:00"
      const maps = garage.gpsLat && garage.gpsLng ? ` https://www.google.com/maps/search/?api=1&query=${garage.gpsLat},${garage.gpsLng}` : garage.address ? ` https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${garage.name} ${garage.address} ${garage.city ?? ""}`)}` : ""
      return `${garage.name} — ${branch?.name ?? "main branch"}. Hours: ${hours}. Address: ${garage.address ?? "see map"}${garage.city ? `, ${garage.city}` : ""}. Phone: ${garage.phone}.${maps ? ` Directions: ${maps}` : ""}`
    }

    case "book": {
      const service = String(p.service ?? "Service visit").slice(0, 120)
      const plate = String(p.plate ?? vehicleRows[0]?.plate ?? "").slice(0, 20) || undefined
      const dateStr = typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null
      const timeStr = typeof p.time === "string" && /^\d{2}:\d{2}$/.test(p.time) ? p.time : null
      const [branch] = await db().select({ id: branches.id }).from(branches).where(and(eq(branches.garageId, garage.id), isNull(branches.deletedAt))).limit(1)
      if (!branch) return "This garage has no branch set up for bookings — a team member will call to arrange it."
      const day = dateStr ?? new Date(Date.now() + 86400_000).toISOString().slice(0, 10)
      const { getPublicAvailability, requestPublicBooking } = await import("@/lib/bookings/actions")
      const avail = await getPublicAvailability({ garageId: garage.id, branchId: branch.id, date: day })
      const slot = avail.ok ? avail.data.find((s) => s.available && (!timeStr || s.label.startsWith(timeStr.slice(0, 2)))) ?? avail.data.find((s) => s.available) : null
      if (!slot) return `No open slots on ${day} — try another day or a team member will call.`
      const res = await requestPublicBooking({
        garageId: garage.id,
        branchId: branch.id,
        serviceType: service,
        guestName: customer?.fullName ?? "WhatsApp customer",
        guestPhone: normalizeGhPhone(ctx.phone) ?? ctx.phone,
        guestPlate: plate,
        notes: "Booked via WhatsApp assistant",
        startsAt: slot.start,
        endsAt: slot.end,
      })
      if (!res.ok) return `Couldn't create the booking (${res.error.message}) — a team member will call to arrange it.`
      return `Booking REQUESTED for ${day} at ${slot.label} for "${service}"${plate ? ` (${plate})` : ""}. The customer gets an SMS code to confirm — the booking shows in the garage's bookings as soon as they confirm.`
    }

    case "repair_request": {
      const complaint = String(p.complaint ?? message).slice(0, 1000)
      if (complaint.length < 10) return "The complaint is too short — ask the customer to describe the problem."
      const { triageComplaint } = await import("@/lib/repair-requests/service")
      const { nextRequestNumber } = await import("@/lib/repair-requests/service")
      const plate = String(p.plate ?? vehicleRows[0]?.plate ?? "").slice(0, 20) || null
      const veh = vehicleRows.find((v) => v.plate === plate) ?? vehicleRows[0] ?? null
      const id = uuidv7()
      const number = await nextRequestNumber()
      const vehicleLabel = veh ? `${veh.label} ${veh.plate}` : null
      const triage = await triageComplaint({ complaint, vehicle: vehicleLabel, warningLights: [], photos: [], ctx: { userId: null } })
      await db().insert(repairRequests).values({
        id,
        number,
        requesterUserId: customer?.userId ?? null,
        requesterPhone: `+${ctx.phone}`,
        requesterName: customer?.fullName ?? null,
        vehicleMake: veh ? veh.label.split(" ")[0] : null,
        vehicleModel: veh ? veh.label.split(" ").slice(1).join(" ") : null,
        vehiclePlate: plate,
        complaint,
        mode: "preferred",
        preferredGarageId: garage.id,
        radiusKm: 15,
        status: "open",
        triage,
        urgency: triage.urgency,
        specialty: triage.specialty,
        expiresAt: new Date(Date.now() + 72 * 3600_000),
      })
      await db().insert(repairRequestRecipients).values({ requestId: id, garageId: garage.id }).onConflictDoNothing()
      const { notifyGaragesOfLead } = await import("@/lib/repair-requests/service")
      await notifyGaragesOfLead([garage.id], { number, summary: triage.summary, urgency: triage.urgency }).catch(() => undefined)
      return `Repair request ${number} created and sent to ${garage.name}'s leads inbox. Triage: ${triage.summary} A team member will send an offer — the customer can also ask for a quote here.`
    }

    case "send_links": {
      const link = await latestLinkFor(garage.id, ctx.phone)
      return link
        ? `The customer's latest link from ${garage.name}: ${link}`
        : "No recent estimate/approval/payment link on file for this customer — a team member will resend it."
    }

    default:
      return ""
  }
}

const JOB_STATUS_TEXT: Record<string, string> = {
  checked_in: "checked in",
  diagnosing: "being diagnosed",
  estimate_sent: "estimate sent — waiting for approval",
  approved: "approved — work starting",
  in_progress: "in progress",
  waiting_parts: "waiting for parts",
  quality_check: "in quality check",
  ready: "READY for pickup",
  delivered: "delivered",
  closed: "closed",
}

/** Latest outbound message containing a URL (tracker/estimate/payment links). */
async function latestLinkFor(garageId: string, phone: string): Promise<string | null> {
  const rows = await db()
    .select({ body: whatsappMessages.body })
    .from(whatsappMessages)
    .innerJoin(whatsappConversations, eq(whatsappConversations.id, whatsappMessages.conversationId))
    .where(and(
      eq(whatsappConversations.garageId, garageId),
      eq(whatsappConversations.customerPhone, phone),
      eq(whatsappMessages.direction, "out"),
    ))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(10)
  for (const r of rows) {
    const m = /https?:\/\/\S+/.exec(r.body ?? "")
    if (m) return m[0]
  }
  // Fall back to any recent garage→customer message with a link (SMS logs live elsewhere).
  return null
}

// ---------------------------------------------------------------------------
// Staff inbox reads
// ---------------------------------------------------------------------------

export async function listInbox(garageId: string) {
  const rows = await db()
    .select({
      id: whatsappConversations.id,
      phone: whatsappConversations.customerPhone,
      mode: whatsappConversations.mode,
      assignedUserId: whatsappConversations.assignedUserId,
      lastMessageAt: whatsappConversations.lastMessageAt,
      unread: whatsappConversations.unreadCount,
      customerName: customers.fullName,
      lastBody: sql<string | null>`(select body from whatsapp_messages m where m.conversation_id = ${whatsappConversations.id} order by m.created_at desc limit 1)`,
    })
    .from(whatsappConversations)
    .leftJoin(customers, eq(customers.id, whatsappConversations.customerId))
    .where(eq(whatsappConversations.garageId, garageId))
    .orderBy(desc(whatsappConversations.lastMessageAt))
    .limit(100)
  return rows.map((r) => ({ ...r, lastMessageAt: r.lastMessageAt?.toISOString() ?? null }))
}

export async function getThread(garageId: string, conversationId: string, viewerUserId: string) {
  const [conv] = await db().select().from(whatsappConversations)
    .where(and(eq(whatsappConversations.id, conversationId), eq(whatsappConversations.garageId, garageId))).limit(1)
  if (!conv) return null
  const msgs = await db().select().from(whatsappMessages)
    .where(eq(whatsappMessages.conversationId, conv.id))
    .orderBy(whatsappMessages.createdAt)
    .limit(300)
  // Opening the thread marks it read.
  if (conv.unreadCount > 0) {
    await db().update(whatsappConversations).set({ unreadCount: 0 }).where(eq(whatsappConversations.id, conv.id))
  }
  const [customer] = conv.customerId ? await db().select({ fullName: customers.fullName, phone: customers.phone }).from(customers).where(eq(customers.id, conv.customerId)).limit(1) : [null]
  void viewerUserId
  return {
    conversation: { ...conv, lastMessageAt: conv.lastMessageAt?.toISOString() ?? null, windowStartedAt: conv.windowStartedAt?.toISOString() ?? null },
    messages: msgs.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
    customer,
  }
}

export async function totalUnread(garageId: string): Promise<number> {
  const [r] = await db().select({ n: sql<number>`coalesce(sum(${whatsappConversations.unreadCount}),0)::int` })
    .from(whatsappConversations).where(eq(whatsappConversations.garageId, garageId))
  return r?.n ?? 0
}
