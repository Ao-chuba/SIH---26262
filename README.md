# SIH---26262
# BUILD_SPEC.md — AICTE Approval Workflow Automation, Compliance Monitoring & Alert Management System

> **Problem Statement ID:** 26262
> **Deadline:** submit by the 25th. **Build target: fully working prototype TONIGHT.**
> **Audience of this file:** an autonomous AI coding agent. Read the whole file, then build it in the phase order given. Do not ask clarifying questions; where something is ambiguous, pick the sensible default, note it in `DECISIONS.md`, and keep going.

---

## 0. AGENT OPERATING RULES

1. **Work autonomously.** Do not stop to ask permission between phases. Commit after every phase (`git commit -m "phase N: ..."`).
2. **Working demo beats completeness.** If a feature is running out of time, build the simplest version that visibly works in the UI. Never leave the app in a broken state at the end of a phase: `npm run dev` must always start.
3. **Run it.** After each phase, start the app, hit the new routes/pages, and fix errors before moving on. Run `npm run build` at the end of phases 5 and 9.
4. **Seed data is part of the product.** The demo is only convincing with realistic data (see section 9).
5. **Everything is rule-driven.** Timelines, reminder offsets, escalation ladders and stage routes live in config (`/src/config/rules.ts` plus the DB seed), never hardcoded inside business logic.
6. **Human oversight is a hard requirement.** The system never auto-approves or auto-rejects an application. Automation moves files between queues, raises alerts and drafts summaries; a human officer takes every decision (see section 12).
7. **No external services required.** Email/SMS are simulated by writing to a `Notification` table and showing it in a "Delivery Log" UI. No API keys needed.
8. At the end, produce `README.md`, `DECISIONS.md`, `DEMO_SCRIPT.md` (section 14).

---

## 1. PRODUCT SUMMARY (one paragraph)

A single web platform where AICTE applications are routed automatically through the correct processing stages (Scrutiny, EVC, SAC/SHC, in the combinations defined by the Approval Process Handbook), while a **generic deadline engine** watches every time-bound item (stage timelines, EVC scheduling, institutional undertakings, lease/document expiry), sends reminders at configured offsets, escalates overdue items up an officer ladder, and writes every action to a tamper-evident audit trail. Role-based dashboards give Regional officers, Bureau officers, EVC committees, and Institutions real-time visibility.

**The single most important design idea:** scrutiny pendency, EVC timelines, undertakings and lease expiry are all the same pattern: *an item with a due date, a state, and an escalation ladder.* Build ONE `DeadlineItem` engine and make every module a producer/consumer of it.

---

## 2. TECH STACK (fixed, do not deliberate)

| Concern | Choice |
|---|---|
| Framework | **Next.js 14+ (App Router) + TypeScript** |
| DB | **SQLite via Prisma** (single file `dev.db`, zero setup) |
| UI | **Tailwind CSS** + **shadcn/ui** (or plain Tailwind components if shadcn setup is slow) |
| Charts | **Recharts** |
| Auth | Demo auth: cookie-based **role switcher** with seeded users (see section 3). No passwords. Server-side role checks on every API route. |
| Scheduling | A `tick(now)` function in `/src/lib/engine/tick.ts`, called by (a) `POST /api/engine/tick`, (b) a `setInterval` in a Next route-handler-safe singleton when not simulating, (c) automatically after the "simulate date" control moves the clock. |
| File upload | Save to `/uploads` on local disk; store metadata in DB. Accept PDF/JPG/PNG up to 5 MB. |
| Export | CSV export (required) via server route; PDF export optional (use `pdf-lib` or print-CSS if time allows). |
| Date handling | `date-fns`. **All "now" reads go through `getNow()` which returns the simulated clock** (section 7.1). Never call `new Date()` directly in business logic. |

Project name: `aicte-flow`. Package scripts: `dev`, `build`, `seed` (`prisma db push && tsx prisma/seed.ts`), `tick`.

---

## 3. ROLES & PERMISSIONS

Seed at least one user per role (and 2+ regional officers across regions).

| Role | Can do |
|---|---|
| `INSTITUTION` | Submit/see own applications; respond to deficiency returns; view & upload evidence for own undertakings; view & upload renewed lease/documents; see own notifications. Cannot see other institutions. |
| `REGIONAL_OFFICER` | See applications of own Region; act on stages assigned to them (advance, return with reason, add observation); verify/reject undertaking evidence and document renewals; schedule EVC for own Region. |
| `BUREAU_OFFICER` | See all Regions; act on Bureau-level stages; receive Level-2 escalations; reassign workload. |
| `EVC_COMMITTEE` | See EVC queue; confirm schedule, mark EVC completed, upload report reference. |
| `SAC_SHC_MEMBER` (may be merged into `EVC_COMMITTEE` UI) | Act on SAC/SHC stage items. |
| `ADMIN` | Configure rules (timelines, reminder offsets, escalation ladder), manage users, **simulate date**, view full audit log, run tick. |

Implement a `requireRole(roles[])` helper used in every route handler/server action. The top bar has a **"Switch user"** dropdown (demo convenience) that sets the cookie.

---

## 4. DATA MODEL (Prisma)

Create `prisma/schema.prisma` with these models (SQLite: use `String` for enums, `Json` → `String` storing JSON, since SQLite has no native Json in older Prisma; use `Json` if the installed Prisma supports it).

```
Region            id, name, headquarters
Institution       id, aicteId, name, type (e.g. ENGINEERING|MANAGEMENT|PHARMACY|ARCH), state, regionId, contactEmail, contactPhone
User              id, name, email, role, regionId?, institutionId?, designation, escalatesToId?   // escalation parent chain
Application       id, refNo, institutionId, regionId, applicationType (NEW_INSTITUTION|NEW_COURSE|EXTENSION|INTAKE_INCREASE|CLOSURE|OTHER),
                  route (ONLY_SCRUTINY|SCRUTINY_EVC|EVC_SAC_SHC|ONLY_EVC|SCRUTINY_EVC_SAC_SHC),
                  currentStageKey, status (IN_PROGRESS|RETURNED|COMPLETED|DECIDED),
                  assignedToId?, submittedAt, stageEnteredAt, createdAt, updatedAt
ApplicationStage  id, applicationId, stageKey, enteredAt, exitedAt?, enteredById?, outcome? (ADVANCED|RETURNED|COMPLETED), notes
Observation       id, applicationId, stageKey, authorId, text, kind (OBSERVATION|DEFICIENCY|CLARIFICATION|REPLY), createdAt
EvcVisit          id, applicationId, status (QUEUED|SCHEDULED|COMPLETED|CANCELLED), queuedAt, scheduledFor?, completedAt?, committeeId?, reportRef?, isNewInstitution(bool)
Undertaking       id, applicationId, institutionId, title, condition, dueDate, status (PENDING|SUBMITTED|VERIFIED|REJECTED|OVERDUE|CLOSED), grantedAt, verifiedById?, verifiedAt?, remarks
InstDocument      id, institutionId, applicationId?, docType (LEASE|NOC|LAND_USE|FIRE_SAFETY|BUILDING_STABILITY|OTHER), title, validFrom, validUntil, status (VALID|EXPIRING|EXPIRED|RENEWAL_SUBMITTED|RENEWAL_VERIFIED|RENEWAL_REJECTED), verifiedById?, verifiedAt?
Evidence          id, ownerType (UNDERTAKING|DOCUMENT|APPLICATION), ownerId, fileName, filePath, mimeType, sizeBytes, uploadedById, uploadedAt, note
DeadlineItem      id, kind (STAGE_TIMELINE|EVC_SCHEDULING|EVC_COMPLETION|UNDERTAKING|DOCUMENT_EXPIRY), refType, refId, institutionId?, regionId?,
                  ownerUserId?   // the officer/institution currently responsible
                  title, dueAt, state (OPEN|SATISFIED|CANCELLED), escalationLevel (0..N), openedAt, closedAt?
AlertLog          id, deadlineItemId, alertKey (e.g. "T-30","T-7","T-0","OVERDUE+3","ESC-L1"), firedAt, UNIQUE(deadlineItemId, alertKey)   // idempotency
Notification      id, toUserId?, toInstitutionId?, channel (INAPP|EMAIL|SMS), kind (REMINDER|OVERDUE|ESCALATION|INFO|RETURN), subject, body, deadlineItemId?, applicationId?, createdAt, readAt?
EscalationEvent   id, deadlineItemId, fromLevel, toLevel, escalatedToUserId, reason, createdAt
AuditLog          seq (autoincrement PK), ts, actorId?, actorRole?, action, entityType, entityId, payload(JSON string), prevHash, hash   // append-only hash chain
RuleConfig        key (PK), value (JSON string), updatedAt, updatedById?    // editable by ADMIN
SystemClock       id=1, simulatedNow? (null = real time), updatedAt
```

Indexes: `DeadlineItem(state, dueAt)`, `Application(currentStageKey, regionId)`, `AuditLog(entityType, entityId)`.

---

## 5. RULES CONFIG (all values are **PLACEHOLDERS**, must be editable)

> The real timelines come from the AICTE Approval Process Handbook (APH). We do not have the exact numbers; use the placeholders below, label them "illustrative, configure per APH" in the Admin UI, and make them editable. Do not claim they are official.

`/src/config/rules.ts` exports defaults that are written into `RuleConfig` at seed time and read from the DB at runtime.

### 5.1 Routes (state machine definition)

```ts
export const ROUTES = {
  ONLY_SCRUTINY:        ["SCRUTINY", "DECISION_PENDING"],
  SCRUTINY_EVC:         ["SCRUTINY", "EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT", "DECISION_PENDING"],
  EVC_SAC_SHC:          ["EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT", "SAC_SHC", "DECISION_PENDING"],
  ONLY_EVC:             ["EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT", "DECISION_PENDING"],
  SCRUTINY_EVC_SAC_SHC: ["SCRUTINY", "EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT", "SAC_SHC", "DECISION_PENDING"],
};
// RE_SCRUTINY is entered only via return/revert, then flows back to the stage it was returned from.
// DECISION_PENDING = waiting for the competent authority's decision. The system NEVER auto-decides.
```

### 5.2 Stage metadata

```ts
export const STAGES = {
  SCRUTINY:         { label: "Scrutiny",             ownerRole: "REGIONAL_OFFICER", timelineDays: 15 },
  RE_SCRUTINY:      { label: "Re-Scrutiny",          ownerRole: "REGIONAL_OFFICER", timelineDays: 7  },
  EVC_QUEUE:        { label: "EVC Queue",            ownerRole: "REGIONAL_OFFICER", timelineDays: 5  },   // time to schedule
  EVC_SCHEDULED:    { label: "EVC Scheduled",        ownerRole: "EVC_COMMITTEE",    timelineDays: 20 },   // time to complete visit (new institutions: use evcNewInstitutionDays)
  EVC_REPORT:       { label: "EVC Report Review",    ownerRole: "REGIONAL_OFFICER", timelineDays: 7  },
  SAC_SHC:          { label: "SAC/SHC",              ownerRole: "SAC_SHC_MEMBER",   timelineDays: 10 },
  DECISION_PENDING: { label: "Decision Pending",     ownerRole: "BUREAU_OFFICER",   timelineDays: 10 },
};
export const EVC_NEW_INSTITUTION_DAYS = 30;  // tighter tracking for new institutions
```

### 5.3 Reminder offsets and escalation ladder (per `DeadlineItem.kind`)

```ts
export const ALERT_RULES = {
  STAGE_TIMELINE:  { reminders: [-3, -1, 0], overdueEveryDays: 2, escalate: [{ afterOverdueDays: 1, level: 1 }, { afterOverdueDays: 5, level: 2 }, { afterOverdueDays: 10, level: 3 }] },
  EVC_SCHEDULING:  { reminders: [-2, 0],     overdueEveryDays: 2, escalate: [{ afterOverdueDays: 1, level: 1 }, { afterOverdueDays: 4, level: 2 }] },
  EVC_COMPLETION:  { reminders: [-7, -3, 0], overdueEveryDays: 3, escalate: [{ afterOverdueDays: 2, level: 1 }, { afterOverdueDays: 7, level: 2 }] },
  UNDERTAKING:     { reminders: [-30, -15, -7, -1, 0], overdueEveryDays: 7, escalate: [{ afterOverdueDays: 1, level: 1 }, { afterOverdueDays: 15, level: 2 }, { afterOverdueDays: 30, level: 3 }] },
  DOCUMENT_EXPIRY: { reminders: [-90, -60, -30, -7, 0], overdueEveryDays: 7, escalate: [{ afterOverdueDays: 1, level: 1 }, { afterOverdueDays: 15, level: 2 }, { afterOverdueDays: 30, level: 3 }] },
};
// Escalation levels map to the officer chain:
// L0 = owner (institution or assigned officer)
// L1 = Regional Officer (or the owner's `escalatesToId`)
// L2 = Regional Head / Senior Regional Officer
// L3 = Bureau Officer
```

Reminders at offset `-N` fire when `daysToDue <= N` (first time only, idempotent via `AlertLog.alertKey`). Offset `0` fires on the due date. `OVERDUE+k` alerts fire every `overdueEveryDays` after the due date.

---

## 6. WORKFLOW ENGINE (`/src/lib/workflow/`)

### 6.1 `routeApplication(app)`
On application creation, choose `route` from `applicationType` using a configurable mapping (e.g. `NEW_INSTITUTION → SCRUTINY_EVC_SAC_SHC`, `NEW_COURSE → SCRUTINY_EVC`, `EXTENSION → ONLY_SCRUTINY`, `INTAKE_INCREASE → SCRUTINY_EVC`, `CLOSURE → ONLY_SCRUTINY`; make this mapping a `RuleConfig` entry editable by Admin). Set `currentStageKey` to the first stage in the route, create an `ApplicationStage` row, assign an officer from the region (round-robin by lowest open workload), and open a `DeadlineItem(kind=STAGE_TIMELINE)`.

### 6.2 `advance(applicationId, actor, note?)`
- Allowed only if actor's role matches the current stage's `ownerRole` (Admin/Bureau can override, logged).
- Closes the current `ApplicationStage` (outcome `ADVANCED`), closes its `DeadlineItem` (`SATISFIED`), moves to the next stage in the route, opens the new stage's `DeadlineItem`, reassigns owner, writes audit log, and notifies new owner.
- **Auto-advance hooks** (this is the "automatic movement" requirement):
  - Scrutiny complete (officer clicks "Complete scrutiny") → auto-enter `EVC_QUEUE` (if route has EVC) → creates an `EvcVisit(QUEUED)` and a `DeadlineItem(EVC_SCHEDULING)`.
  - Scheduling an EVC (date + committee set) → auto-move `EVC_QUEUE → EVC_SCHEDULED`, closes scheduling deadline, opens `EVC_COMPLETION` deadline (30 days if `isNewInstitution`, else rule default).
  - EVC marked completed with report ref → auto-move to `EVC_REPORT`.
  - Final pre-decision stage completed → move to `DECISION_PENDING` and **stop**. A human must record the decision (`DECIDED`).
- Every transition is initiated by an authorised human action *or* by the system moving an item between *queues* after a human completed the prior stage. The system never records a decision.

### 6.3 `returnApplication(applicationId, actor, reason, toStageKey?)`
- Reason is **mandatory** (min 10 chars), stored as `Observation(kind=DEFICIENCY)` and in the audit log.
- Status becomes `RETURNED`; owner becomes the Institution for a deficiency/clarification return, or the previous stage owner for an internal revert. Opens a `DeadlineItem(STAGE_TIMELINE)` for the institution's response window (config `RESPONSE_WINDOW_DAYS`, default 7).
- When the institution replies (`Observation(kind=REPLY)` + optional evidence), the application re-enters `RE_SCRUTINY` (or the stage it was returned from) automatically.

### 6.4 Guard rails
Server-side validation of every transition against `ROUTES`; illegal transitions return 409 with a clear message. All transitions run in a DB transaction together with their audit-log entry.

### 6.5 Electronic case summary
`GET /api/applications/:id/summary` builds a deterministic, templated case summary (institution, type, route, stage history with durations, observations, open deadlines, undertakings) rendered as a printable page. It is clearly labelled **"System-generated summary to support, not replace, officer verification."**

---

## 7. DEADLINE & ESCALATION ENGINE (`/src/lib/engine/`), THE CORE

### 7.1 Clock
`getNow()` returns `SystemClock.simulatedNow ?? new Date()`. Admin UI has:
- **Date picker + "Set simulated date"**
- Buttons **"+1 day", "+7 days", "+30 days", "Reset to real time"**
Setting the clock runs `tick()` immediately and returns a summary `{ remindersFired, overdueMarked, escalations }`, which the UI shows as a toast. This is the main demo moment.

### 7.2 Producers (create/maintain `DeadlineItem`s)
| Event | DeadlineItem |
|---|---|
| Application enters a stage | `STAGE_TIMELINE`, due = enteredAt + stage.timelineDays |
| Application enters `EVC_QUEUE` | `EVC_SCHEDULING` |
| EVC scheduled | `EVC_COMPLETION` (due per new-institution rule) |
| Approval granted with undertaking | one `UNDERTAKING` per undertaking, due = `Undertaking.dueDate` |
| Lease/document registered | `DOCUMENT_EXPIRY`, due = `validUntil` |
| Renewed doc verified | old item `SATISFIED`, new `DOCUMENT_EXPIRY` opened for new `validUntil` |
| Undertaking verified | item `SATISFIED`, undertaking `VERIFIED/CLOSED` |

### 7.3 `tick(now = getNow())` (must be idempotent and safe to call repeatedly)

```
for each DeadlineItem where state = OPEN:
  daysToDue = differenceInCalendarDays(item.dueAt, now)
  rules = ALERT_RULES[item.kind]

  1. Pre-due reminders: for each offset in rules.reminders (e.g. -30):
        if daysToDue <= abs(offset) AND daysToDue >= 0 AND no AlertLog(item, "T"+offset):
            create Notification to the owner (and institution contact if institution-facing)
            insert AlertLog(item, "T"+offset); audit "ALERT_FIRED"
     (If the clock jumps past several offsets at once, fire only the most urgent unfired one, and mark skipped ones as fired to avoid spam.)

  2. Overdue: if daysToDue < 0:
        update status on the underlying entity (Undertaking→OVERDUE, InstDocument→EXPIRED, etc.)
        overdueDays = -daysToDue
        recurring "OVERDUE+k" alerts every rules.overdueEveryDays (idempotent via AlertLog key "OVERDUE+" + floor(overdueDays/overdueEveryDays)*overdueEveryDays)

  3. Escalation: for each step in rules.escalate sorted ascending:
        if overdueDays >= step.afterOverdueDays AND item.escalationLevel < step.level:
            resolve escalation target via owner.escalatesToId chain / role (L1 Regional, L2 Regional Head, L3 Bureau)
            create EscalationEvent + Notification (kind=ESCALATION) to the target, plus an info notification to the owner
            item.escalationLevel = step.level; AlertLog key "ESC-L"+level; audit "ESCALATED"
```

Return a summary object. Log `TICK_RUN` in the audit trail with counts.

### 7.4 Closing items
Items close only via explicit human verification actions (e.g. officer verifies undertaking evidence or renewed document, officer advances stage). Upload alone moves status to `SUBMITTED` / `RENEWAL_SUBMITTED` but **does not** close the deadline; verification does. Show "Awaiting verification" separately in dashboards.

---

## 8. FEATURE MODULES & PAGES

Use a left sidebar layout with the role-appropriate menu, a top bar (user switcher, simulated-clock badge `🕒 Simulated: 12 Nov 2026` when active, notification bell with unread count).

### 8.1 Auth/Landing — `/`
Role-card login ("Enter as: Institution / Regional Officer / Bureau Officer / EVC Committee / Admin") plus a user picker. Sets cookie, redirects to `/dashboard`.

### 8.2 Role dashboards — `/dashboard`
Render different content per role:

**Regional Officer**: KPI cards (My pending, Due ≤3 days, Overdue, Awaiting my verification); stage-wise pendency bar chart for own Region; ageing buckets (0-7, 8-15, 16-30, 30+ days); worklist table (sortable/filterable) with SLA chips (green/amber/red); EVC queue count; expiring documents and overdue undertakings in own Region.

**Bureau Officer**: All-Regions heatmap/table (Region × Stage counts); Region-wise performance (avg days per stage, % within timeline); bottleneck view (stage with highest avg age); Level-2/3 escalations inbox; workload distribution per officer (bar chart).

**EVC Committee**: EVC queue, scheduled visits calendar/list, due/overdue EVCs, new-institution flag.

**Institution**: My applications with stage tracker (stepper UI showing route and current stage), pending actions (deficiency replies, undertakings due, documents expiring) sorted by due date with countdown chips.

**Admin**: System health (last tick, open deadline items, alerts fired today), clock control, quick links to rules/audit/users/reports.

All charts use Recharts. Every KPI card links to a pre-filtered list.

### 8.3 Applications — `/applications`, `/applications/[id]`
- List with filters (Region, Stage, Route, Status, Officer, Ageing, Overdue only), search by ref/institution, pagination.
- Detail page: header (institution, type, route stepper, current stage, SLA chip), tabs: **Timeline** (stage history with durations), **Observations** (threaded), **Deadlines** (all DeadlineItems for the case), **Undertakings & Documents**, **Audit** (filtered), **Case Summary** (printable).
- Action panel (role-aware): `Advance`, `Return with reason` (modal, reason required), `Add observation`, `Schedule EVC`, `Record decision` (Bureau/competent-authority role only, with a banner that this is a human decision), `Reassign`.
- Institution can create a new application via `/applications/new` (simple form: type, course/intake details, upload documents).

### 8.4 EVC Management — `/evc`
Queue (applications waiting scheduling, with days-in-queue and SLA chip), schedule modal (date, committee/members text, new-institution toggle), scheduled list, completion form (report ref + file), overdue list with escalation level badge.

### 8.5 Undertakings — `/undertakings`
- Officer view: all undertakings, filter by status/Region/due window; detail drawer with condition text, evidence files, verify/reject with remarks (rejection reopens with new response window).
- Institution view: my undertakings with countdown, upload evidence form.
- "Grant approval with undertakings" action on an application's `DECISION_PENDING` stage (human action) lets the officer add 1..n undertakings (title, condition, due date) → creates records + DeadlineItems.

### 8.6 Lease & Document Validity — `/documents`
- Table of documents with validity bar and status chips: `Valid`, `Expiring (≤90d)`, `Expired`, `Renewal submitted`, `Verified`.
- Buckets: Expiring in 90/60/30 days, Expired, Awaiting verification.
- Institution can upload renewal (new validFrom/validUntil + file); officer verifies/rejects.
- Institution view shows only its own documents.

### 8.7 Notifications & Delivery Log — `/notifications`
- User inbox (in-app) with read/unread, kind filter, deep link to the related entity.
- Admin/Officer **Delivery Log** tab: simulated EMAIL/SMS entries with channel, recipient, subject, body preview, timestamp. For each reminder, create an INAPP row **and** simulated EMAIL (and SMS for urgent kinds: T-0, overdue, escalation).

### 8.8 Escalations — `/escalations`
Table of open escalated items with current level, owner, escalated-to, overdue days, trail of EscalationEvents; officers can "Acknowledge & act" which deep-links to the item.

### 8.9 Reports — `/reports`
Six report cards, each with filters (Region, date range) and **Export CSV** (and print view):
1. Application pendency (stage-wise, with ageing)
2. EVC status (queued/scheduled/completed/overdue, new-institution split)
3. Undertaking compliance (granted/verified/overdue, % compliance)
4. Document validity (valid/expiring/expired by bucket)
5. Overdue cases (all kinds, with escalation level)
6. Region-wise processing performance (avg days per stage, % within SLA)

### 8.10 Audit Trail — `/audit`
Searchable/filterable table (actor, action, entity, date range) with expandable payload JSON. A **"Verify chain integrity"** button recomputes the hash chain and shows ✅ intact / ❌ broken at seq N. Export CSV. Visible to Admin, Bureau; officers see entries for their Region's entities.

### 8.11 Admin — `/admin`
- **Rules editor**: stage timelines, EVC new-institution days, reminder offsets and escalation steps per kind, application-type→route mapping, response window days. Saving writes `RuleConfig` and an audit entry. Show "illustrative, align with APH" notice.
- **Clock control** (section 7.1).
- **User management**: list users and roles, set escalation parent.
- **Run tick now** button + last 20 tick summaries.

---

## 9. SEED DATA (`prisma/seed.ts`), IMPORTANT FOR DEMO

Deterministic (use a seeded PRNG so results are reproducible). Seed relative to a fixed "demo today" of **the real current date** at seed time.

- **8 Regions** (illustrative: Central, Eastern, North-Eastern, Northern, South-Central, South-Western, Southern, Western).
- **~60 institutions** with plausible names/states spread across regions (fictional names only; do not use real institutions).
- **Users**: per region 2 Regional Officers (one is the senior/head: `escalatesToId` chain), 2 Bureau Officers, 3 EVC committee users, 1 SAC/SHC member, 1 Admin, and ~10 Institution users (login into specific seeded institutions). Give them memorable demo emails like `ro.southern@demo.aicte`.
- **~200 applications** across all 5 routes and all stages with realistic `stageEnteredAt` so the dashboards show: a healthy majority within SLA, ~20% amber (due ≤3 days), ~15% red (overdue by 1–20 days), a few escalated to L1/L2/L3.
- **EVC visits**: ~25 queued, ~20 scheduled (some due within a week, 3–4 overdue, mix of new institutions), ~15 completed.
- **~40 undertakings** across statuses: pending (some due in 30/15/7 days), submitted-awaiting-verification, verified, 6 overdue with escalation levels 1–3.
- **~50 documents** (mostly LEASE) with `validUntil` spread: ~6 expiring ≤30d, ~8 expiring 31–60d, ~8 expiring 61–90d, ~5 already expired, ~4 renewal submitted awaiting verification.
- After seeding, **run `tick()` once** so notifications, alert logs, escalation events and the audit trail are pre-populated.
- Seed ~100 notifications read/unread across users so the bell is not empty.
- Include 1 **"golden demo" application** per route, named obviously (e.g. refNo `DEMO-NEW-INST-001`), whose state is set up so that clicking through shows the full flow in the live demo.

Add a clearly-labelled "Reset demo data" button on the Admin page (re-runs seed).

---

## 10. API SURFACE (Next.js route handlers, JSON, role-checked)

```
POST /api/auth/switch                 {userId}
GET  /api/me

GET  /api/applications?filters...     POST /api/applications
GET  /api/applications/:id            GET  /api/applications/:id/summary
POST /api/applications/:id/advance    {note}
POST /api/applications/:id/return     {reason, toStageKey?}
POST /api/applications/:id/reply      {text, evidence?}
POST /api/applications/:id/observe    {text, kind}
POST /api/applications/:id/reassign   {userId}
POST /api/applications/:id/decide     {decision, remarks}     // competent-authority role only

GET  /api/evc?status=...              POST /api/evc/:id/schedule   {date, committee, isNewInstitution}
POST /api/evc/:id/complete            {reportRef, file?}

GET  /api/undertakings                POST /api/applications/:id/undertakings   {items[]}
POST /api/undertakings/:id/submit     {evidence}
POST /api/undertakings/:id/verify     {verified: bool, remarks}

GET  /api/documents                   POST /api/documents/:id/renew   {validFrom, validUntil, file}
POST /api/documents/:id/verify        {verified: bool, remarks}

GET  /api/dashboard/:role             // aggregated KPI + chart data
GET  /api/notifications               POST /api/notifications/:id/read
GET  /api/escalations
GET  /api/reports/:type?format=csv|json&region=&from=&to=
GET  /api/audit?filters...            GET /api/audit/verify
GET/PUT /api/admin/rules              POST /api/admin/clock   {simulatedNow|null|addDays}
POST /api/engine/tick                 POST /api/admin/reset
POST /api/upload                      GET  /api/files/:id     // access-checked file download
```

All mutating handlers: validate input (use `zod`), check role + scope (Region/Institution), run in a transaction, write the audit entry, return the updated entity.

---

## 11. AUDIT TRAIL: TAMPER-EVIDENT HASH CHAIN

`appendAudit({actor, action, entityType, entityId, payload})`:
```
prev = last AuditLog row (by seq) or genesis "0"*64
hash = sha256( prevHash + ts.toISOString() + actorId + action + entityType + entityId + JSON.stringify(payload) )
insert row
```
Audit actions to log (minimum): `APPLICATION_CREATED, ROUTED, STAGE_ADVANCED, RETURNED, REPLY_RECEIVED, OBSERVATION_ADDED, REASSIGNED, DECISION_RECORDED, EVC_QUEUED, EVC_SCHEDULED, EVC_COMPLETED, UNDERTAKING_GRANTED, EVIDENCE_UPLOADED, UNDERTAKING_VERIFIED, UNDERTAKING_REJECTED, DOCUMENT_REGISTERED, RENEWAL_SUBMITTED, RENEWAL_VERIFIED, RENEWAL_REJECTED, ALERT_FIRED, OVERDUE_MARKED, ESCALATED, DEADLINE_CLOSED, RULE_CHANGED, CLOCK_CHANGED, TICK_RUN, LOGIN_SWITCH`.
The log is append-only: no update/delete code paths exist. `GET /api/audit/verify` walks the chain and returns `{ok, brokenAtSeq?}`.

---

## 12. REGULATORY SAFEGUARDS (must be visible in the product)

1. A persistent footer/banner on workflow pages: *"Automated alerts and workflow actions support the approval process. They do not replace statutory scrutiny, verification, inspection or decisions of the competent authority."*
2. **No auto-decisions.** `decide` endpoint requires `BUREAU_OFFICER` (or configured competent-authority role) and a human-entered remark. Applications stop at `DECISION_PENDING`.
3. **No auto-verification** of undertakings or documents. Uploads become `SUBMITTED`; only an officer can mark `VERIFIED`.
4. Return/revert always requires a recorded reason.
5. Rules page shows the "configure per APH" notice; rule changes are audited.
6. Role-based access with Region/Institution scoping enforced **server-side**; file downloads access-checked.
7. Case summary is labelled system-generated.

---

## 13. BUILD ORDER (tonight), phase by phase

> Aim for roughly the suggested time boxes. If behind schedule, cut from the "Cut list" (section 15), never from phases 1–6.

| Phase | Deliverable | Time box |
|---|---|---|
| **1. Scaffold** | `create-next-app` (TS, Tailwind, App Router), install `prisma @prisma/client zod date-fns recharts lucide-react tsx`, shadcn/ui init, Prisma schema (section 4), `db push`, folder structure, `getNow()`, `appendAudit()`, `requireRole()`, layout shell with sidebar/topbar and role switcher | 45 min |
| **2. Rules + seed** | `rules.ts`, `RuleConfig` seed, full seed script (section 9) without tick | 60 min |
| **3. Workflow engine** | `routeApplication`, `advance`, `returnApplication`, reply flow, guard rails, producer hooks that create `DeadlineItem`s, application list/detail pages with action panel | 90 min |
| **4. Deadline engine** | `tick()`, escalation resolution, notifications (INAPP + simulated EMAIL/SMS), idempotency via `AlertLog`, clock control + toast summary; run tick inside seed | 60 min |
| **5. Dashboards** | Aggregation queries + role dashboards (Regional, Bureau, EVC, Institution, Admin) with charts and SLA chips | 75 min |
| **6. Modules** | EVC page, Undertakings page (+ grant-with-undertakings), Documents page (+ renewal/verify), Escalations page, Notifications + Delivery Log | 90 min |
| **7. Audit + Reports** | Audit page with chain verify, six reports with CSV export, printable case summary | 45 min |
| **8. Admin** | Rules editor, user list, reset demo, tick history | 30 min |
| **9. Polish & docs** | Empty/loading/error states, responsive check, safeguards banners, `README.md`, `DECISIONS.md`, `DEMO_SCRIPT.md`, `npm run build` passes, final seed + smoke test | 45 min |

---

## 14. ACCEPTANCE CHECKLIST (verify each; fix failures)

**Workflow**
- [ ] Creating an application of each type routes it to the correct route and first stage with an owner and a stage deadline.
- [ ] Advancing through a `SCRUTINY_EVC` application auto-creates the EVC queue entry, scheduling moves it to `EVC_SCHEDULED`, completion moves it to `EVC_REPORT`, and final stage stops at `DECISION_PENDING`.
- [ ] Return without a reason is rejected; return with a reason is recorded; institution reply auto-moves to `RE_SCRUTINY`.
- [ ] Illegal transitions and wrong-role actions are rejected server-side.

**Deadlines & alerts**
- [ ] Setting the simulated date forward fires T-minus reminders exactly once each (no duplicates when ticking repeatedly).
- [ ] Items past due flip status (Undertaking→OVERDUE, Document→EXPIRED) and show red in dashboards.
- [ ] Escalation levels climb per the ladder and notify the correct superior; EscalationEvents are recorded.
- [ ] Uploading evidence/renewal does not close the item; verification does.
- [ ] Reset clock returns the system to real time without errors.

**Visibility**
- [ ] Each role sees only its own scope and its own dashboard.
- [ ] Stage-wise pendency, ageing buckets, region performance and bottleneck views display seeded data sensibly.
- [ ] Notification bell, inbox and Delivery Log show EMAIL/SMS simulations.

**Audit & reports**
- [ ] Every action above appears in the audit log; "Verify chain" returns intact; manually corrupting a row in the DB makes it report broken.
- [ ] All six reports render and export CSV.

**Safeguards**
- [ ] Banner visible; no auto-approve/verify anywhere; decision requires human role + remark.

**Quality**
- [ ] `npm run build` succeeds with no type errors; `npm run seed` is repeatable; app starts fresh on a clean clone with `npm i && npm run seed && npm run dev`.

---

## 15. CUT LIST (drop in this order if time is short)

1. PDF export (keep CSV and browser print).
2. SAC/SHC as a separate role UI (let `EVC_COMMITTEE` or Bureau act on that stage).
3. SMS channel simulation (keep INAPP + EMAIL).
4. Rules editor for escalation steps (keep timelines + reminder offsets editable).
5. Calendar view for EVC (keep list).
6. File upload storage (store filename + metadata only, mock the download).

**Never cut:** the deadline engine, simulate-date control, role dashboards, undertaking tracking, document expiry tracking, escalation, audit trail with chain verify, safeguards banner.

---

## 16. DOCUMENTATION DELIVERABLES

- **README.md**: what it is, stack, setup (`npm i`, `npm run seed`, `npm run dev`), demo logins table, architecture diagram (Mermaid: modules → DeadlineItem engine → Notifications/Escalations/Audit), folder structure, how rules are configured.
- **DECISIONS.md**: assumptions (placeholder timelines, demo auth, simulated email/SMS), trade-offs, future work (SSO, integration with existing AICTE systems via adapter interfaces, real email/SMS gateway, PDF exports, e-sign).
- **DEMO_SCRIPT.md**: a 5-minute walkthrough script (below).

### Demo script outline (put this in DEMO_SCRIPT.md, polished)
1. **(30s)** Problem and the one-engine idea: every time-bound item flows through one deadline engine.
2. **(60s)** Institution creates an application → auto-routed → Regional Officer dashboard shows it in Scrutiny with SLA chip.
3. **(60s)** Officer returns it with a reason → institution replies → auto Re-Scrutiny → officer completes → lands in EVC queue → schedule EVC → auto-moves; show the audit trail growing.
4. **(60s)** **Fast-forward the clock +7/+30 days:** reminders fire, items turn amber then red, escalations climb, Bureau dashboard lights up, Delivery Log shows emails/SMS.
5. **(45s)** Undertaking: institution uploads evidence → "awaiting verification" → officer verifies. Lease expiry: renewal flow and verification.
6. **(30s)** Reports + CSV export, audit chain verification (and a demo of tamper detection).
7. **(15s)** Safeguards: no auto-decisions, human oversight, configurable per APH.

---

## 17. SUGGESTED FOLDER STRUCTURE

```
aicte-flow/
  prisma/ schema.prisma  seed.ts
  uploads/
  src/
    app/
      page.tsx (login)  dashboard/  applications/  evc/  undertakings/  documents/
      notifications/  escalations/  reports/  audit/  admin/
      api/ ... (route handlers per section 10)
    components/ (ui, charts, SlaChip, RouteStepper, DataTable, ActionPanel, ClockBadge, Banner)
    config/ rules.ts
    lib/
      db.ts  clock.ts  auth.ts  audit.ts  notify.ts
      workflow/ route.ts advance.ts return.ts guards.ts summary.ts
      engine/ tick.ts producers.ts escalate.ts
      reports/ pendency.ts evc.ts undertakings.ts documents.ts overdue.ts regionPerformance.ts
      seed/ helpers.ts
  README.md  DECISIONS.md  DEMO_SCRIPT.md  BUILD_SPEC.md
```

---

## 18. UI/UX NOTES

- Clean, government-portal-appropriate look: neutral background, a single deep-blue primary, status colours used consistently (green = on track, amber = due ≤3 days, red = overdue, purple = escalated, grey = closed).
- Every list shows **SLA chips** with days remaining/overdue; every deadline shows a countdown.
- Desktop-first, but pages must not break at tablet width.
- Always show empty states and loading skeletons; never show raw JSON or stack traces to users.
- Clock badge in the top bar whenever the simulated date is active, so nobody is confused during the demo.

---

## 19. NEXT BUILD — POST-PROTOTYPE ENHANCEMENTS (phases 1–9 already shipped in `aicte-flow/`)

Phases 1–9 are done on `main`. Build the items below in order. Do not recreate the scaffold. Prefer editing existing pages/components. Keep `npm run dev` runnable after each item. Mark each checkbox done in this file when complete. Update `aicte-flow/DEMO_SCRIPT.md` and `aicte-flow/README.md` only after the related UI ships (do not claim unfinished features).

### Rules honesty (judge Q&A)

| Kind | Examples | How we treat them |
|---|---|---|
| APH-style norms (assistive checks) | Faculty–student ≥ 1:20; cadre 1:2:6; intake multiples of 30/60 | Encode as labelled norms on the application; pass/fail badges only — **never** auto-approve/reject |
| Operational SLAs (placeholders) | Scrutiny 15d, reminders T-30/T-7, escalation ladders | Stay in `RuleConfig` / Admin editor; banner: illustrative, configure per current APH calendar |

### Build checklist

- [x] **19.1 APH Compliance Snapshot** — `metricsJson` on `Application`; seed + `AphNormsCard` on `/applications/[id]` (1:20, intake 30/60, cadre 1:2:6, lab area). Assistive only.
- [x] **19.2 Dual-Clock Accountability Bar** — Officer vs institution days on app detail from stage history / RETURNED windows.
- [x] **19.3 Audit Tamper Demo** — Admin **Simulate Tamper** / **Restore** on `/audit` + `/api/audit/tamper`.
- [x] **19.4 UI distinction (light GovTech)** — Stage subtitles, document validity bars, Simulation Impact Summary on Admin clock, role accent stripe + persona badge.
- [x] **19.5 Docs sync** — `DEMO_SCRIPT.md` + product README notes for §19 features.

### Out of scope for this pass

Live SMS/email gateways, real SSO, DigiLocker, PointNet/OCR-as-core, dark/neon themes, claiming official APH calendar day counts as fixed law.

---

**Phases 1–9:** already built — do not restart from Phase 1.  
**Next:** implement Section 19 in order, commit meaningfully when asked.
