# Live Demo Script (5-Minute Walkthrough)

> **Platform:** AICTE Flow · **PS:** SIH26262  
> **Prep:** `cd aicte-flow && npm run seed && npm run dev` → http://localhost:3000

---

## Cold start (30s before judges)

1. Fresh terminal: `npm run seed` then `npm run dev`.
2. Prefer accounts: `ro.central.alpha@demo.aicte` (Regional) and `admin@demo.aicte`.
3. Golden case: **DEMO-NEW-INST-001** (seeded with APH fails + return history). Dashboard shows **[JURY] Golden demo applications**.

---

## Act 1 — One engine (0:00–0:40)

1. Open `/`. Read the yellow **[JURY PATH]** card aloud in one sentence.
2. Click **Regional Officer** (lands on Central RO).
3. Say: *"Stage SLAs, EVC timing, undertakings, and lease expiry are one `DeadlineItem` engine with one `tick()`."*

---

## Act 2 — APH + dual-clock (0:40–2:00)

1. On dashboard, click **DEMO-NEW-INST-001**.
2. **APH Norms Compliance Check:** show pass/fail (intentional fails on this golden case).  
   Line: *"Assists scrutiny. Never auto-approves."*
3. **Dual-Clock Accountability:** officer days vs institution deficiency days after the seeded return.
4. Point at the route stepper subtitles (Scrutiny = document & APH verification; EVC = campus inspection).

---

## Act 3 — Time travel + alerts (2:00–3:30)

1. Switch user → **System Admin** (`admin@demo.aicte`) → `/admin`.
2. Click **+7 Days**, then **+30 Days** if time allows.
3. Show **Simulation Impact Summary** (reminders / overdue / escalations) with deep links.
4. Open `/notifications` → **Delivery Log** (simulated EMAIL/SMS). Optional: `/escalations`.

---

## Act 4 — Audit tamper (3:30–4:30)

1. `/audit` → **Verify Chain Integrity** → pass.
2. **Simulate Tamper** → Verify → fail at seq N.
3. **Restore** → Verify → pass.
4. Optional: `/reports` → Export CSV on one card.

---

## Act 5 — Close (4:30–5:00)

1. Footer banner: automation supports; does not replace competent authority.
2. One line: *"Applications stop at Decision Pending — only a human bureau officer records DECIDED."*
3. Offer optional live create-app flow only if judges ask (Institution → New Application → RO return → reply).

---

## Backup lines if something glitches

| Glitch | Recovery |
|---|---|
| Empty dashboards | Re-run `npm run seed` |
| Wrong region RO | Switch user to `ro.central.alpha@demo.aicte` |
| Clock did nothing | Stay on Admin; click **Run tick now** |
| Tamper already active | Click **Restore** first |
