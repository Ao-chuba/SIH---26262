# Architectural Decisions & Engineering Rationale

**Project:** AICTE Flow — Approval Workflow Automation, Compliance Monitoring & Alert Management System
**Problem Statement:** SIH26262 (Smart India Hackathon 2026) — AICTE

---

## 1. Core Assumptions & Regulatory Baselines

### 1.1 APH Norms vs Operational SLAs

The system maintains a clear separation between two types of configuration:

| Kind | Source | Examples | In Product |
|---|---|---|---|
| APH-aligned norms | Approval Process Handbook themes (faculty ratios, cadre, intake divisions) | >=1:20 faculty:student; cadre 1:2:6; intake multiples of 30/60 | Assistive pass/fail cards on applications. Never auto-approve or auto-reject. Labelled as norms-aligned checks to support officer scrutiny. |
| Operational SLAs | Academic calendar / RO practice — not hard-coded as statutory law | Scrutiny 15 days, Re-Scrutiny 7, reminders T-30/T-7, escalation thresholds | Stored in RuleConfig, editable in Admin without code changes. Labelled "Illustrative placeholder, configure per the official APH / current academic calendar." |

APH quantitative checks live as explicit norm constants with UI badges, kept separate from the deadline engine to prevent conflation of assistive checks with statutory decisions.

### 1.2 Generic Deadline Engine as the Architectural Core

Stage pendency, EVC visit delays, conditional undertaking compliance, and land lease/document expirations share an identical operational model. Rather than writing fragmented cron jobs per feature, we built a single unified `DeadlineItem` table and evaluation engine (`tick()`). Applications, EVC visits, Undertakings, and Documents are producers of `DeadlineItem` rows; the notification dispatcher and escalation manager are consumers. This avoids duplicated logic, simplifies testing, and ensures consistent behaviour across all time-bound regulatory items.

### 1.3 Role-Switch Authentication

For evaluation and development environments, requiring individual passwords introduces friction. We implemented a secure HTTP-only cookie-based session switcher (`aicte_user_id`) with server-side role validation (`requireRole`, `requireAuth`, `canActOnApplication`). A user picker in the top navigation bar allows quick context switching. In a production deployment, this would be replaced by Jan Parichay / MeriPehchan OpenID Connect.

### 1.4 Communication Gateway & Sandbox Dispatcher

Production external gateways (SMS, SMTP, Gov.in email relays) require credentials, which can fail or introduce friction during offline evaluation. The system implements a resilient dual-mode notification engine:
- **Sandbox Mode (Zero Setup):** Reminders and escalations write to the `Notification` table across three channels (INAPP, EMAIL, SMS). The system generates Ethereal test inbox previews and logs formatted outbound payloads in the `/notifications` Delivery Log tab with timestamps.
- **Live Dispatch Mode (Plug-and-Play):** If configured in `.env`, the engine immediately delivers real emails via Resend / SMTP and real SMS alerts via Fast2SMS / Twilio.
- **Interactive Live Tester:** Evaluators can trigger an immediate test notification to their own email address or mobile phone directly from the UI to observe real-time SLA and escalation alerts during live demonstrations.

---

## 2. Engineering Trade-offs

| Trade-off | Option Chosen | Alternative Considered | Rationale |
|---|---|---|---|
| Database Engine | SQLite via Prisma ORM | PostgreSQL / MySQL | Zero local setup required. Enables standalone reproducibility with dev.db. |
| Document Storage | Local disk /uploads + metadata in DB | AWS S3 / Cloud Storage | Prevents external cloud credential friction during local runs. |
| Audit Log Integrity | Cryptographic SHA-256 Hash Chain | Hyperledger / Blockchain | Hash chain gives tamper evidence without the overhead of running blockchain nodes. Instant verification without external infrastructure. |
| Export Formats | RFC-4180 CSV + browser print CSS | Server-side PDF (puppeteer / pdf-lib) | Headless Chrome is fragile across OS environments. CSV fulfils data portability; print-CSS provides clean printed summaries. |
| State Machine Execution | Synchronous ACID transactions | Distributed message queue (Kafka / RabbitMQ) | SQLite prisma.$transaction guarantees atomic stage transitions, deadline closures, and audit entries without eventual consistency bugs. |

---

## 3. Regulatory Safeguards & Design Constraints

1. **No Autonomous Approval / Rejection:** Under AICTE statutory regulations, only designated competent authorities hold statutory authority. Applications strictly halt at DECISION_PENDING. Only an authorised BUREAU_OFFICER can record a final decision (DECIDED) with mandatory human remarks.

2. **Deterministic & Auditable State Transitions:** Automation is strictly limited to queue movement (e.g., a deficiency-free application is placed into EVC_QUEUE after officer sign-off). The officer remains the decision-maker at every substantive step.

3. **Mandatory Deficiency Attribution:** Any return or revert action enforces a mandatory reason (minimum 10 characters), stored permanently in the observation history and the audit chain.

4. **Compliance Badges are Assistive Only:** APH norms cards (ratio, intake, cadre, lab area) support scrutiny; they do not constitute a statutory decision or replace officer verification.

---

## 4. Problem Statement Coverage (SIH26262)

| PS Requirement | Status | Implementation |
|---|---|---|
| Adaptive application routing (scrutiny / EVC / SAC-SHC) | Done | ROUTES + APP_TYPE_ROUTE_MAP + referToSacShc API |
| Stage timelines, reminders, escalation | Done | DeadlineItem + tick() + configurable alert rules |
| Deficiency return + institution response window | Done | returnApplication + dual-clock bar |
| APH / compliance monitoring (assistive) | Done | Intake hard-block, APH clause cards, health score, deficiency prefill |
| Year-round document and undertaking compliance | Done | Document expiry tracking + undertaking deadlines + Compliance Health Score |
| Human-in-the-loop decisions | Done | DECISION_PENDING gate + decide API + UI warning |
| Audit and accountability | Done | SHA-256 hash chain + tamper demo |
| Multi-channel alerts | Done | Notification table + in-app / Email / SMS delivery log |
| Configurable operational SLAs | Done | Admin RuleConfig editor (runtime, no redeploy) |

---

## 5. Production Roadmap

1. **National SSO (Jan Parichay / MeriPehchan):** Replace the demo cookie switcher with OpenID Connect integration into Government of India SSO.
2. **DigiLocker & Land Record Portal Integration:** API adapters to fetch land lease deeds, building stability certificates, and Fire NOCs directly from state registration authorities.
3. **Hardware e-Sign (Aadhaar e-Sign / DSC):** Digital signature certificates for EVC inspection reports and scrutiny recommendation sheets.
4. **NIC SMS Gateway & NeGD Email Relay:** Replace simulated dispatchers with official government gateway endpoints.
5. **PostgreSQL Migration:** Move from SQLite to PostgreSQL for production-scale multi-region concurrent load.
