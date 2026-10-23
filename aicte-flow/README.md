# AICTE Flow — Approval Workflow Automation & Compliance Monitoring System

**Problem Statement:** SIH 2024 PS-26262
**Domain:** e-Governance / EdTech

---

## Overview

AICTE Flow is a unified digital platform for automating and monitoring the AICTE institutional approval lifecycle — from initial application intake through scrutiny, Expert Visit Committee (EVC) inspection, Standing Advisory Committee (SAC/SHC) review, and final decision — in full alignment with the AICTE Approval Process Handbook (APH).

The platform addresses three interconnected problems that currently create bottlenecks in the AICTE approval system:

1. **Manual stage routing** — Applications move between functional queues by email and physical file handoffs, with no automated SLA tracking or escalation.
2. **Reactive compliance monitoring** — Lease deed expirations, conditional approval undertakings, and document validity lapses are discovered late, often after statutory deadlines have passed.
3. **Fragmented accountability** — No single system tracks who held a file, for how long, and why it was delayed, making audit reconstruction manual and error-prone.

---

## Technology Stack

| Component | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Database | SQLite via Prisma ORM |
| Visualizations | Recharts |
| Date & Time | `date-fns` + centralised `getNow()` |
| Audit Integrity | Node.js Crypto — SHA-256 hash-chained ledger |
| Notifications | In-app + simulated Email/SMS delivery log |
| Icons | Lucide React |

---

## Key Features

### 1. Multi-Route Approval State Machine
Applications are automatically classified into one of four APH-aligned processing routes at submission:

| Route | Used For |
|---|---|
| SCRUTINY_EVC_SAC_SHC | New institutions (full statutory route) |
| SCRUTINY_EVC | New courses, intake increases requiring campus verification |
| ONLY_SCRUTINY | Extension of Approval (EoA), standard annual renewal |
| EVC_SAC_SHC | Cases referred directly to Standing Hearing Committee |

Stage transitions are atomic ACID transactions. The route can be dynamically changed mid-process (e.g., Refer to SAC/SHC) by an authorised officer.

### 2. Generic Deadline & Escalation Engine
All time-bound regulatory items — application stages, EVC visits, undertakings, and documents — are modelled as a single `DeadlineItem` entity. A unified `tick(now)` evaluator runs against this table to:
- Fire T-minus reminder alerts at configurable offsets (T-30, T-7, T-3, T-0)
- Automatically escalate overdue items up the hierarchy
- Write every action to the immutable audit chain

SLA thresholds are stored in `RuleConfig` (Admin-editable at runtime without code changes) and are labelled as operational placeholders, not statutory mandates.

### 3. APH Norms Compliance Card
Each application shows an assistive compliance card checking faculty-to-student ratio, intake divisions, faculty cadre composition, and infrastructure readiness indicators. These checks are **assistive only** — they support officer scrutiny but never auto-approve or auto-reject an application.

### 4. Dual-Clock Accountability
The application detail view separates **officer processing time** from **institution response time** (days spent in deficiency/return state), surfacing where delays actually originate.

### 5. Institution Compliance Health Score (0-100)
A composite score computed from APH metrics, document validity, and undertaking compliance status. Dynamically updated. Not a statutory grade — labelled accordingly throughout the UI.

### 6. Tamper-Evident SHA-256 Audit Chain
Every system action is appended to a hash chain: `SHA256(prevHash + timestamp + actor + action + entity + payload)`. The audit page provides chain integrity verification and a tamper simulation for demonstration.

### 7. Regulatory Safeguards
- Applications never auto-approve or auto-reject. They halt at DECISION_PENDING; only a human Bureau Officer records DECIDED with mandatory remarks.
- Document renewals and undertaking evidence remain in SUBMITTED state until verified by a Regional Officer.
- Applications cannot be returned without a deficiency reason of at least 10 characters.

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Installation
```bash
cd aicte-flow
npm install
```

### Database Setup and Seed
Seeds 8 AICTE regions, approx 60 institutions, approx 200 applications across all approval routes, EVC visits, conditional undertakings, document validity records, and initialises the SHA-256 audit ledger.
```bash
npm run seed
```

### Development Server
```bash
npm run dev
```
Open http://localhost:3000

### Production Build
```bash
npm run build
npm start
```

---

## Role Accounts

Switch between roles using the user switcher dropdown in the top navigation bar, or select from the role cards on the login page.

| Role | Email | Scope |
|---|---|---|
| System Admin | admin@demo.aicte | Clock simulation, APH rules editor, user directory, audit chain verification |
| Bureau Officer | bo.alpha@demo.aicte | All-region oversight, final decisions, L2/L3 escalation management |
| Regional Officer (Central) | ro.central.alpha@demo.aicte | Central region scrutiny, EVC scheduling, undertaking verification |
| Regional Officer (Southern) | ro.southern.alpha@demo.aicte | Southern region applications and document renewals |
| EVC Committee | evc.member1@demo.aicte | Inspection queue, visit scheduling, report submission |
| SAC/SHC Member | sac.member@demo.aicte | Standing Advisory/Hearing Committee stage evaluations |
| Institution | inst.1.apex@demo.aicte | Application submission, deficiency responses, undertaking uploads |

---

## Repository Structure

```
aicte-flow/
├── app/
│   ├── (app)/
│   │   ├── admin/                # Admin control centre — clock, rules, user directory
│   │   ├── applications/         # Application list, search, filter, detail view
│   │   │   ├── [id]/             # Stage stepper, timeline, observations, action panel
│   │   │   └── new/              # Institution new application submission form
│   │   ├── audit/                # SHA-256 audit log, chain verification, tamper demo
│   │   ├── dashboard/            # Role-specific dashboards
│   │   ├── documents/            # Lease deed and NOC expiry surveillance, renewal tracking
│   │   ├── escalations/          # Escalation hierarchy view and resolution
│   │   ├── evc/                  # EVC inspection queue, scheduling, report workflow
│   │   ├── notifications/        # In-app inbox, simulated email/SMS delivery log
│   │   ├── reports/              # 6 analytical reports with CSV export
│   │   ├── undertakings/         # Conditional approval undertaking compliance
│   │   └── layout.tsx            # App shell — sidebar, topbar, role switcher
│   ├── api/                      # RESTful API route handlers for all mutations
│   ├── globals.css               # Design system tokens, SLA chips
│   └── page.tsx                  # Login page with role selection
├── prisma/
│   ├── schema.prisma             # Relational schema with indexes
│   └── seed.ts                   # Seed generating approx 200 realistic applications
├── src/
│   ├── config/
│   │   └── rules.ts              # APH route mappings, stage timelines, alert thresholds
│   └── lib/
│       ├── aph.ts                # APH compliance health score computation
│       ├── audit.ts              # SHA-256 hash chain append-only ledger
│       ├── auth.ts               # Cookie-based auth, server-side role validation
│       ├── clock.ts              # Simulated clock provider (getNow)
│       ├── db.ts                 # Prisma client singleton
│       ├── notify.ts             # Notification dispatcher (in-app, email, SMS)
│       ├── engine/
│       │   └── tick.ts           # Core deadline and escalation evaluation engine
│       └── workflow/
│           └── workflow.ts       # Route state machine, stage transitions
└── README.md
```

---

## Production Roadmap

1. **National SSO (Jan Parichay / MeriPehchan)** — Replace the demo cookie switcher with OpenID Connect integration into the Government of India SSO.
2. **DigiLocker Integration** — Fetch land lease deeds, building certificates, and Fire NOCs directly from DigiLocker, eliminating manual document submission.
3. **Aadhaar e-Sign / DSC** — Digital signature certificates for EVC inspection reports and scrutiny recommendation sheets.
4. **NIC SMS Gateway and NeGD Email Relay** — Replace simulated notification dispatchers with official government gateway endpoints.
5. **PostgreSQL Migration** — Move from SQLite to PostgreSQL for production-scale concurrent load.
