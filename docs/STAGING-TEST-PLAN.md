# Staging test plan — owner checklist

Work through this on a **real phone** against the staging deployment
(`https://<staging-domain>`). Tick each box; if "what you should see" doesn't
match, note it and tell Devin — it is a bug.

Legend: ✅ tick when verified · 📷 means a photo/screenshot helps.

## 1. Accounts & tenant isolation

- [ ] **SMS sign-in.** Open the app → sign in with your phone number → enter
      the SMS code. **See:** you land on your workspace dashboard.
- [ ] **Second garage can't see you.** Sign in on a second phone/account that
      belongs to a different garage → open the first garage's job URL.
      **See:** "not found" / no data — never the other garage's records.
- [ ] **Workspace switcher.** If your account has two roles (e.g. driver +
      garage owner), use the switcher. **See:** each workspace loads its own
      dashboard.

## 2. Money — theTeller

- [ ] **Real test payment.** Book/pay something small (e.g. an inspection or
      an invoice) → choose MoMo → complete the theTeller test checkout.
      **See:** payment shows as paid; a receipt/SMS arrives.
- [ ] **Escrow → payout.** After a vendor order or rider delivery settles,
      check the admin/vendor payout queue. **See:** payout queued, then paid
      to MoMo (test float) after confirmation.
- [ ] **Failed payment.** Cancel mid-checkout. **See:** order stays unpaid,
      no receipt, you can retry.

## 3. Hardware — OBD

- [ ] **ELM327 scan.** Android phone + Chrome (HTTPS only) → open a vehicle →
      OBD scan → pick your adapter from the Bluetooth list.
      **See:** VIN/DTCs read, check-engine explanation shows.
      (Needs the physical adapter; allow 5–15 s for first connect.)

## 4. AI features

- [ ] **Part-photo accuracy.** Put ~30 real garage part photos in
      `tests/fixtures/part-photos/` (update `manifest.json`), then run
      `npx tsx scripts/eval-part-photos.ts`. **See:** ≥80% top-1 accuracy.
- [ ] **Voice notes.** Record a job note in Twi/Ga/Ewe/Hausa → transcribe.
      **See:** transcript appears in the job notes.

## 5. Live location

- [ ] **Two phones.** Tow operator phone + customer phone → SOS → accept →
      watch live position update.
      **See:** marker moves on the map every few seconds.
- [ ] Repeat for a **pickup run** and a **rider delivery**.

## 6. Offline & resilience

- [ ] **Mechanic offline.** Airplane mode → open a job card → add a note/photo
      → reconnect. **See:** note/photo syncs after reconnect; nothing lost.
- [ ] **Photo retry.** Throttle network → upload a large photo → restore.
      **See:** upload retries and completes.

## 7. WhatsApp assistant

- [ ] **Live message.** Text the shared FixAm WhatsApp number "is my car
      ready?" **See:** AI replies with the real job status.
- [ ] **Voice note in Twi.** Send a Twi voice note asking the same.
      **See:** transcribed and answered correctly.
- [ ] **Staff takeover.** In `/g/<slug>/inbox` take over the conversation →
      send a message as staff → hand back to AI.
      **See:** AI pauses while human mode is on, resumes after hand-back.
- [ ] **Outside 24h.** Message after 24 h of silence. **See:** approved
      template `fixam_assistant_reply` is used (or SMS fallback).

## 8. Inspections (P8-20)

- [ ] **Book + pay.** Driver portal → book inspection → pay via theTeller.
      **See:** booking appears in the garage inspections queue.
- [ ] **Checklist + report.** Inspector completes items, attaches OBD scan +
      photos → complete. **See:** AI summary + repair estimate on the report.
- [ ] **Share + PDF.** Open `/i/<token>` on the phone → download/print PDF.
      **See:** report renders, checklist/photos/OBD codes visible, no private
      customer data exposed.

## 9. Speed

- [ ] **Lighthouse.** Run Lighthouse (mobile, throttled) on the owner
      dashboard. **See:** performance score targets — page interactive
      < 2.5 s.

## 10. Restore drill

- [ ] Follow `docs/OPERATIONS.md` → **Restore drill** on staging: restore the
      latest backup into a scratch project, run `pnpm check:rls`, open the
      app. **See:** app works, all tables have RLS.
