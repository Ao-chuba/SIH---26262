# 📋 Architectural Decisions & Engineering Rationale

> **Project:** AICTE Flow — Approval Workflow Automation, Compliance Monitoring & Alert Management System  
> **Problem Statement ID:** 26262

---

## 1. Key Assumptions & Regulatory Baselines

### 1.1 Illustrative SLA Timelines vs. Official APH
- **Assumption:** In the prototype, stage timelines (e.g. Scrutiny 15 days, Re-Scrutiny 7 days, EVC Queue 5 days, EVC Scheduled 20 days, EVC Report 7 days, SAC/SHC 10 days, Decision Pending 10 days) and alert reminder offsets (`-30, -15, -7, -3, -1, 0` days) are **illustrative placeholders** derived from representative approval cycles.
- **Design Decision:** These numbers are never hardcoded inside business logic. They are initialized into `RuleConfig` at seed time and made editable via the **Admin Control Center** (`/admin`). The UI prominently displays statutory guidance: *"Illustrative placeholder, configure in alignment with the official AICTE Approval Process Handbook (APH)"*.

### 1.2 "Generic Deadline Engine" as the Architectural Core
- **Assumption:** Stage pendency, EVC visit delays, conditional undertaking compliance, and land lease/document expirations share an identical operational model:
  $$\text{Item} = \langle \text{dueAt}, \text{state}, \text{escalationLevel}, \text{ownerUserId}, \text{escalationLadder} \rangle$$
- **Design Decision:** Rather than writing fragmented cron jobs for each feature, we built a single unified `DeadlineItem` table and evaluation engine (`tick()`). Applications, EVC visits, Undertakings, and Documents are producers of `DeadlineItem` rows; the notification dispatcher and escalation manager are consumers.

### 1.3 Role-Switch Demo Authentication
- **Assumption:** For hackathon and jury evaluation, requiring individual passwords or OTP logins introduces friction and delays during evaluation.
- **Design Decision:** We implemented a secure HTTP-only cookie-based session switcher (`aicte_user_id`) coupled with server-side role validation (`requireRole`, `requireAuth`, `canActOnApplication`). A user picker in the top navigation bar allows the evaluator to switch contexts seamlessly between an Institution, Regional Officer, Bureau Officer, and Admin.

### 1.4 Communication Simulation (Zero External Dependency)
- **Assumption:** Production external gateways (SMS gateways, SMTP servers, Gov.in e-mail relays) require external API keys, credentials, and internet connectivity, which can fail or get rate-limited during a live demonstration.
- **Design Decision:** Reminders and escalation notices write to the `Notification` table across three channels (`INAPP`, `EMAIL`, `SMS`). An in-app Notification Inbox displays real-time badges to users, while a dedicated **"Delivery Log"** tab in `/notifications` demonstrates simulated outbound email bodies and SMS payloads with timestamps and recipients.

---

## 2. Engineering Trade-offs

| Trade-off | Option Chosen | Alternative Considered | Rationale |
|---|---|---|---|
| **Database Engine** | **SQLite via Prisma ORM** | PostgreSQL / MySQL | Zero local setup required. Enables standalone reproducibility with `dev.db`, allowing any reviewer to run `npm i && npm run seed && npm run dev` immediately. |
| **Document Storage** | **Local Disk (`/uploads`) + Metadata in DB** | AWS S3 / Cloud Storage | Prevents external cloud credential friction. Local files are preserved with mime types, file sizes, and owner references. |
| **Audit Log Integrity** | **Cryptographic SHA-256 Hash Chain** | Hyperledger / Blockchain | Blockchain nodes add immense overhead and slow down page loads. A cryptographic SHA-256 hash chain (`prevHash + ts + actor + action + entity + payload`) guarantees tamper evidence and supports instant verification without external nodes. |
| **Export Formats** | **RFC-4180 Standard CSV + Browser Print CSS** | Server-side PDF generation (`puppeteer` / `pdf-lib`) | Server-side headless Chrome is fragile across operating systems and heavy on memory. CSV export fulfills all data portability requirements, and print-CSS provides clean printable summary pages. |
| **State Machine Execution** | **Synchronous ACID Transactions** | Distributed message queue (Kafka / RabbitMQ) | SQLite transactional guarantees (`prisma.$transaction`) ensure atomic stage transitions, deadline item closures, and audit entries without eventual consistency bugs. |

---

## 3. Regulatory Safeguards & Ethical AI Alignment

1. **Strict Prohibition of Autonomous Approval / Rejection:**
   - Under AICTE statutory regulations, only designated competent authorities (Regional Committees, SAC/SHC, Executive Committee, Chairman AICTE) hold statutory authority.
   - The system is architected so that applications strictly halt at `DECISION_PENDING`. Only an authorized `BUREAU_OFFICER` can record a final decision (`DECIDED`) along with mandatory human remarks.
2. **Deterministic & Auditable State Moves:**
   - Automation is strictly limited to moving files between functional queues (e.g., when a scrutiny officer signs off on a deficiency-free application, the system automatically places it into the `EVC_QUEUE`).
3. **Mandatory Deficiency Attribution:**
   - Any return or revert action enforces a mandatory reason (minimum 10 characters) stored in the permanent observation history and audit log.

---

## 4. Production Roadmap & Future Integrations

If transitioning this prototype into AICTE's national production ecosystem:

1. **National Single Sign-On (Jan Parichay / MeriPehchan):**
   - Replace the demo cookie switcher with OpenID Connect (OIDC) integration into Government of India SSO.
2. **DigiLocker & Land Record Portal Integration:**
   - Implement API adapters to fetch land lease deeds, building stability certificates, and Fire NOCs directly from state registration authorities and DigiLocker repositories, eliminating manual document fraud.
3. **Hardware / e-Sign (Aadhaar e-Sign / DSC):**
   - Integrate digital signature certificates for EVC inspection reports and scrutiny recommendation sheets.
4. **NIC SMS Gateway & National e-Governance Division (NeGD) Email Relay:**
   - Replace simulated notification dispatchers with official government gateway endpoints.
