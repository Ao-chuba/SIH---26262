# 🎙️ Live Demo Script (5-Minute Walkthrough)

> **Platform:** AICTE Flow  
> **Problem Statement ID:** 26262  
> **Target Audience:** Hackathon Jury, AICTE Evaluators & Technical Reviewers

---

## ⏱️ Step-by-Step Walkthrough (5 Minutes Total)

### Act 1: The Core Innovation (0:00 – 0:30)
1. **Open the Homepage (`/`):**
   - *"Welcome to AICTE Flow. AICTE processes tens of thousands of institutional applications every year across Scrutiny, Expert Visit Committees (EVC), and Standing Appeal Committees (SAC)."*
   - *"Our central architectural breakthrough is the **Generic Deadline & Escalation Engine**. Rather than siloed tracking, we unified stage pendency, EVC inspection deadlines, conditional undertakings, and lease document validity under ONE generic state machine."*
   - Show the role selector card and click **"Institution"**.

---

### Act 2: New Application & Automated Routing (0:30 – 1:30)
1. **Institution Dashboard (`/dashboard`):**
   - Note the clean, institutional view showing *My Applications* and *Pending Actions*.
   - Click **"+ New Application"** (`/applications/new`).
2. **Submit Application:**
   - Select **"New Course / Additional Specialisation"** (Program: Engineering, Intake: 60).
   - Point to the **Workflow Route Preview**:
     *`Scrutiny → EVC Queue → EVC Scheduled → EVC Report → Decision Pending`*
   - Click **"Submit Application"**.
3. **Application Detail Page (`/applications/[id]`):**
   - Highlight the **Route Stepper** showing stage 1: *Scrutiny* (with a 🟢 15-day SLA chip).
   - Show that the system automatically assigned a Regional Officer from the institution's region.

---

### Act 3: Scrutiny, Deficiency Return & EVC Auto-Hooks (1:30 – 2:30)
1. **Switch Role to Regional Officer:**
   - Using the topbar **"Switch user"** dropdown, select `[REGIONAL] Regional Officer (Alpha)`.
   - The Regional Officer dashboard displays KPI cards (My Pending, Due ≤3d, Overdue, Awaiting Verification).
2. **Return with Deficiency:**
   - Open the application. In the action panel, click **"Return Application"**.
   - Enter deficiency reason: *"Building fire safety NOC certificate is missing seal of municipal authority."* (Notice that reasons < 10 characters are strictly rejected).
   - Status transitions to `RETURNED`. The institution is given a 7-day cure window deadline.
3. **Institution Responds & Auto Re-Scrutiny:**
   - Switch back to `Institution`.
   - In the action panel, click **"Reply to Return"**, enter: *"Attached verified municipal fire NOC with requisite stamp."*
   - Click Submit. **Watch the automation in action:** The application immediately transitions into `RE_SCRUTINY`!
4. **Advance to EVC Queue:**
   - Switch to `Regional Officer`, click **"Advance to Next Stage"**.
   - Because the route is `SCRUTINY_EVC`, the system **automatically enqueues the application for an EVC visit** and opens an `EVC_SCHEDULING` deadline.

---

### Act 4: Fast-Forward Time — Engine Tick & Escalations (2:30 – 3:30)
*(The Showstopper Demo Moment)*

1. **Switch to System Admin (`admin@demo.aicte`):**
   - Navigate to `/admin`.
   - Note the **Simulated Clock Control**. Currently running on real time.
2. **Fast-Forward +7 Days:**
   - Click **"+7 Days"**.
   - A real-time toast pops up from the engine tick:
     `⚡ Deadline Engine Tick Executed: Reminders Fired: 14 | Overdue Marked: 8 | Escalations Raised: 4`
   - The top navigation bar now proudly displays the orange badge:
     `🕒 Simulated: 30 Oct 2026`
3. **Fast-Forward +30 Days:**
   - Click **"+30 Days"**.
   - T-minus reminders fire, SLA chips flip to **🔴 Overdue**, and deadline items climb the escalation ladder.
4. **Observe the Ripple Effect:**
   - Navigate to **Escalations** (`/escalations`): Show L1, L2, and L3 escalations with the responsible officer names.
   - Navigate to **Notifications** (`/notifications`): Show the **"Delivery Log"** tab displaying simulated SMS and Email alerts with exact dispatch timestamps.

---

### Act 5: Conditional Undertakings & Document Expiry Surveillance (3:30 – 4:15)
1. **Undertakings Compliance (`/undertakings`):**
   - Explain how approvals granted with conditional undertakings (e.g., *"Recruit qualified Ph.D. professor in AI before start of academic semester"*) are tracked with statutory deadlines.
   - As `Institution`, click **"Upload Evidence"** on an open undertaking and attach the compliance proof. The status flips to `SUBMITTED`.
   - Notice that upload alone does **NOT** satisfy the deadline!
   - Switch to `Regional Officer` and click **"✓ Verify"**. Now the deadline item is satisfied and closed.
2. **Document & Lease Expiry (`/documents`):**
   - View the institutional lease deeds categorized into 90-day, 60-day, 30-day, and Expired buckets.
   - Show the **"Submit Renewal"** workflow for expiring leases.

---

### Act 6: Reports & Cryptographic Audit Verification (4:15 – 4:45)
1. **Analytical Reports (`/reports`):**
   - Show the 6 core reports: *Application Pendency, EVC Status, Undertaking Compliance, Document Validity, Overdue Cases, Region Performance*.
   - Click **"Export CSV"** to demonstrate instant tabular export.
2. **Tamper-Evident Audit Trail (`/audit`):**
   - Explain that every workflow transition, stage move, deficiency return, and clock tick is cryptographically chained with SHA-256 hashes (`hash = sha256(prevHash + ts + actor + action + entity + payload)`).
   - Click **"🛡️ Verify Chain Integrity"**.
   - The system re-hashes all historical ledger entries sequentially and displays:
     `✅ Hash Chain Verification Passed: All cryptographic hashes in the ledger are verified and intact from sequence #1.`

---

### Act 7: Regulatory Safeguards & Closing (4:45 – 5:00)
1. **Closing Summary:**
   - *"Notice the persistent banner at the bottom of the screen: Automation assists and expedites the workflow, but statutory human oversight is preserved at every step."*
   - *"The system never makes automated decisions on approval or rejection—those remain strictly in the hands of the competent authority."*
   - *"AICTE Flow brings transparency, accountability, and proactive compliance to higher education governance."*

---

## Planned demo beats (after root `README.md` §19 ships)

> Do not present these until the features exist. Then fold them into the acts above and remove this stub.

1. **APH Norms card** (Scrutiny / app detail): show pass/fail for 1:20 ratio, intake multiple, cadre — *"assists the officer; does not decide."*
2. **Dual-Clock bar** after return → reply: officer processing days vs institution deficiency delay.
3. **Clock +7 / +30**: open Simulation Impact Summary (reminders / overdue / escalations with deep links), then Delivery Log.
4. **Audit**: Verify ✅ → Simulate Tamper → Verify ❌ at seq N → Restore → Verify ✅.
