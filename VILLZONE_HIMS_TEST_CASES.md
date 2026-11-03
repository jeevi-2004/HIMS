# VILLZONE HIMS — SOFTWARE TEST CASE SPECIFICATION

## 1. Document Information

* **Project Name:** VillZone Hospital Information Management System (HIMS)
* **System Name:** VillZone HIMS — Multi-Tenant Cloud Enterprise Healthcare Platform
* **Document Name:** VillZone HIMS Comprehensive Software Test Case Specification
* **Document Type:** Quality Assurance & Testing Specification (`.md`)
* **Purpose:** Serves as a standard, reusable master test specification for QA testing, development verification, regression suites, deployment validation, security audits, and multi-tenant operational verification.
* **Testing Scope:** Covers all architectural tiers, database isolation models, authentication flows, RBAC permissions, Plan 1 (`TOKEN_ONLY`), Plan 2 (`FULL_DIGITAL`), workflow state engines, queue orchestration, multilingual voice (TTS), WhatsApp Cloud API, prescription stationery printing, pharmacy batch dispensing, consolidated OPD billing, and REST/SSE API endpoints.
* **Intended Users:** Software Quality Assurance Engineers, Test Automation Engineers, Full-Stack Developers, Release Managers, Security Auditors, and Technical Leads.
* **Document Status:** Master Test Case Specification (Pre-Execution Baseline)

---

## 2. Test Case Definition

A **Test Case** in this specification defines a formal set of conditions, test inputs, step-by-step procedural actions, and explicit expected outcomes designed to verify compliance of a specific software feature with the **VillZone HIMS Corporate Technical & Architectural Documentation**.

Each test case adheres strictly to the following specification standard:

* **Test Case ID:** Standardized, unique identifier according to module prefix and sequence.
* **Module:** The architectural subsystem or domain boundary being tested.
* **Feature:** The functional capability or business mechanism under test.
* **Test Scenario:** Clear summary of the behavioral condition being validated.
* **Preconditions:** Prerequisites that must be satisfied in the environment or database prior to execution.
* **Test Steps:** Exact, numbered sequence of execution steps.
* **Test Data:** Specific inputs, parameters, payloads, or values required for the test.
* **Expected Result:** Definitive, observable outcome confirming functional correctness.
* **Priority:** Priority level (`P1 - High`, `P2 - Medium`, `P3 - Low`).
* **Severity:** Potential impact level (`Critical`, `Major`, `Minor`).
* **Test Type:** Category of test (`Functional`, `Integration`, `Security`, `Boundary`, `Negative`, `Regression`, `End-to-End`).

---

## 3. Test Case ID Convention

| Prefix | Domain / Subsystem |
| :--- | :--- |
| `AUTH-TC-xxx` | Authentication, Session Control & Token Management |
| `TENANT-TC-xxx` | Multi-Tenancy & Database Isolation (`hims_central` vs `hims_hosp_{CODE}`) |
| `PLAN1-TC-xxx` | Plan 1: OPD Token Generation & Queue Management Suite (`TOKEN_ONLY`) |
| `PLAN2-TC-xxx` | Plan 2: Complete Digital OPD Suite (`FULL_DIGITAL`) |
| `COMP-TC-xxx` | Plan 1 vs Plan 2 Feature Comparison & Operational Mode Switching |
| `WORKFLOW-TC-xxx`| State Machine Transitions, Decision Engine & Diagnostics |
| `QUEUE-TC-xxx` | Queue Orchestration, Doctor Isolation, FIFO & Priority Overrides |
| `VOICE-TC-xxx` | Text-to-Speech (TTS) Voice Announcements (Sarvam AI / Google / Azure) |
| `NOTIF-TC-xxx` | WhatsApp Cloud API Notifications & Communication Hub |
| `RBAC-TC-xxx` | Role-Based Access Control & Navigation Protection |
| `RECEPTION-TC-xxx`| Receptionist Workspaces (Intake, Vitals, Printing & Booking) |
| `DOCTOR-TC-xxx` | Doctor Clinical Workspace (Queue, Consultations, Case History) |
| `PHARMACY-TC-xxx`| Pharmacy Inventory, Batch Tracking, Dispensing & Sales |
| `BILLING-TC-xxx` | Consolidated OPD Invoicing, Receipts & Refund Handlers |
| `PRINT-TC-xxx` | Prescription Layout Engine & Pre-printed Stationery Offsets |
| `API-TC-xxx` | RESTful API Endpoints & Server-Sent Events (SSE) Stream |
| `SECURITY-TC-xxx`| Transport Security, Helmet Headers, CORS & Rate Limiting |

---

## 4. Master Test Cases

### 4.1 Authentication & Session Management (`AUTH-TC`)

#### AUTH-TC-001
* **Module:** Authentication
* **Feature:** Hospital Staff Login with Valid Credentials
* **Test Scenario:** Verify that an active hospital staff member can successfully authenticate with valid hospital code, mobile number, and password.
* **Preconditions:** Hospital tenant exists with status `active`; user exists with role `DOCTOR` and status `active`.
* **Test Steps:**
  1. Navigate to `/login`.
  2. Enter valid Hospital Code, Mobile Number, and Password.
  3. Click "Sign In".
* **Test Data:** `Hospital Code: HOSP01`, `Mobile: 9876543210`, `Password: ValidPass@123`.
* **Expected Result:** HTTP 200 returned; JWT token and user profile returned in response; user session record created in DB; user redirected to `/doctor/dashboard`.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional

#### AUTH-TC-002
* **Module:** Authentication
* **Feature:** Super Admin Authentication
* **Test Scenario:** Verify that a global Super Admin can authenticate via the dedicated Super Admin login interface without a hospital code.
* **Preconditions:** Super Admin user exists in `hims_central`.
* **Test Steps:**
  1. Navigate to `/login/superadmin`.
  2. Enter Super Admin Email and Password.
  3. Click "Authenticate as Super Admin".
* **Test Data:** `Email: superadmin@villzone.com`, `Password: AdminSecure#2026`.
* **Expected Result:** HTTP 200 returned; JWT payload contains `role: "SUPER_ADMIN"` and no tenant restriction; user redirected to `/super-admin/dashboard`.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional / Security

#### AUTH-TC-003
* **Module:** Authentication
* **Feature:** Login Rejection with Invalid Password
* **Test Scenario:** Verify that authentication fails when an incorrect password is provided.
* **Preconditions:** Valid user exists in the tenant database.
* **Test Steps:**
  1. Navigate to `/login`.
  2. Enter valid Hospital Code and Mobile Number with an incorrect Password.
  3. Click "Sign In".
* **Test Data:** `Hospital Code: HOSP01`, `Mobile: 9876543210`, `Password: WrongPassword!`.
* **Expected Result:** HTTP 401 Unauthorized; error message displayed: "Invalid credentials"; no session created; user remains on login page.
* **Priority:** P1 - High
* **Severity:** Major
* **Test Type:** Negative / Security

#### AUTH-TC-004
* **Module:** Authentication
* **Feature:** Empty Field Validation on Login
* **Test Scenario:** Verify client-side and server-side validation when submitting blank credentials.
* **Preconditions:** Application is accessible.
* **Test Steps:**
  1. Navigate to `/login`.
  2. Leave Hospital Code, Mobile, and Password fields empty.
  3. Submit the form.
* **Test Data:** All input fields = `""`.
* **Expected Result:** Client-side validation prevents submission; validation warnings highlight mandatory inputs.
* **Priority:** P2 - Medium
* **Severity:** Minor
* **Test Type:** Boundary / Validation

#### AUTH-TC-005
* **Module:** Authentication
* **Feature:** Inactive / Pending Hospital Login Block
* **Test Scenario:** Verify that staff cannot log in if their hospital subscription is in `pending` or `inactive` state.
* **Preconditions:** Hospital record has `status: "pending"` in `hims_central`.
* **Test Steps:**
  1. Navigate to `/login`.
  2. Enter credentials for a staff user belonging to the pending hospital.
  3. Submit login request.
* **Test Data:** `Hospital Code: PEND01`, `Mobile: 9876500000`, `Password: StaffPass#1`.
* **Expected Result:** HTTP 403 Forbidden; response message: "Hospital account is awaiting subscription plan activation. Please contact Super Admin."
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Security / Negative

#### AUTH-TC-006
* **Module:** Authentication
* **Feature:** User Session Invalidation on Logout
* **Test Scenario:** Verify that logging out terminates the active session and removes the session document from the database.
* **Preconditions:** User is logged in with an active JWT and active session in `UserSession`.
* **Test Steps:**
  1. Click the user profile dropdown in the top navigation bar.
  2. Click "Sign Out".
  3. Attempt to access `/doctor/queue` using the previously valid JWT token via API client.
* **Test Data:** Previously issued Bearer token.
* **Expected Result:** Client clears local auth storage; API returns HTTP 401 "Session expired or invalidated. Please login again."
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Security

---

### 4.2 Multi-Tenancy & Database Isolation (`TENANT-TC`)

#### TENANT-TC-001
* **Module:** Multi-Tenancy
* **Feature:** Tenant Database Connection Context via `AsyncLocalStorage`
* **Test Scenario:** Verify that requests with different hospital codes execute exclusively against their isolated tenant databases (`hims_hosp_{CODE}`).
* **Preconditions:** Two distinct hospitals provisioned: `HOSP_A` and `HOSP_B`.
* **Test Steps:**
  1. Issue a POST request to create a patient under `HOSP_A`.
  2. Issue a GET request to query patient list under `HOSP_B`.
* **Test Data:** Patient created in `HOSP_A`: `UHID: PAT-A-001`, `Name: Tenant A Patient`.
* **Expected Result:** Patient `PAT-A-001` exists exclusively in `hims_hosp_hosp_a.patients`; GET request from `HOSP_B` returns an empty array or only `HOSP_B` records; zero data cross-leakage.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Security / Multi-Tenancy

#### TENANT-TC-002
* **Module:** Multi-Tenancy
* **Feature:** Clinical Masters & Medication Isolation
* **Test Scenario:** Verify that custom clinical templates and medicine masters configured in Hospital A do not appear in Hospital B.
* **Preconditions:** Doctor in `HOSP_A` creates a custom diagnostic template.
* **Test Steps:**
  1. Log in as Doctor in `HOSP_A` and add custom diagnostic shortcut "Cardio-Protocol-A".
  2. Log in as Doctor in `HOSP_B` and navigate to Clinical Masters.
* **Test Data:** Template name: "Cardio-Protocol-A".
* **Expected Result:** Template "Cardio-Protocol-A" is visible only in `HOSP_A`; Doctor in `HOSP_B` cannot view or access it.
* **Priority:** P1 - High
* **Severity:** Major
* **Test Type:** Multi-Tenancy / Functional

#### TENANT-TC-003
* **Module:** Multi-Tenancy
* **Feature:** Cross-Tenant Direct ID Manipulation Block (IDOR Prevention)
* **Test Scenario:** Verify that an authenticated user in Hospital A cannot fetch an Appointment ID belonging to Hospital B by direct URL tampering.
* **Preconditions:** Appointment ID `APP_B_999` exists in `HOSP_B`.
* **Test Steps:**
  1. Authenticate as Receptionist in `HOSP_A`.
  2. Send GET request to `/api/operations/appointments/APP_B_999`.
* **Test Data:** Token: `HOSP_A`, Target ID: `APP_B_999`.
* **Expected Result:** HTTP 404 Not Found (since query is scoped strictly to `hims_hosp_hosp_a` database context).
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Security

---

### 4.3 Plan 1: OPD Token Generation & Queue Management Suite (`PLAN1-TC`)

#### PLAN1-TC-001
* **Module:** Plan 1 (TOKEN_ONLY)
* **Feature:** Walk-in Patient Registration & Instant Token Issuance
* **Test Scenario:** Verify fast token generation for a walk-in patient in a Plan 1 enabled hospital.
* **Preconditions:** Hospital configured with `opdOperationMode: "TOKEN_ONLY"`; Doctor assigned to Room 102.
* **Test Steps:**
  1. Log in as Receptionist.
  2. Open Patient Registration modal / Quick Token.
  3. Enter Patient Name, Mobile Number, Gender, Age, and select Doctor.
  4. Click "Generate Token & Print".
* **Test Data:** `Name: Suresh Kumar`, `Mobile: 9840112233`, `Age: 42`, `Gender: Male`, `Doctor: Dr. Ramesh`.
* **Expected Result:** Token `OP-101` created; `workflow.queueState` initialized to `WAITING`; thermal token slip format generated with Token Number, Doctor Name, Room Number, and Date.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional / End-to-End

#### PLAN1-TC-002
* **Module:** Plan 1 (TOKEN_ONLY)
* **Feature:** Doctor Single-Click "Accept Patient" Workflow
* **Test Scenario:** Verify that clicking "Accept Patient" in Plan 1 updates queue state and triggers an automated audio voice announcement at Reception and Display board.
* **Preconditions:** Patient in `WAITING` state; consultation fee paid (or exempt); Plan 1 active.
* **Test Steps:**
  1. Log in as Doctor.
  2. Open `/doctor/queue`.
  3. Locate Token #101 in the list.
  4. Click "Accept Patient".
* **Test Data:** Token: `OP-101`, Patient: `Suresh Kumar`, Room: `102`.
* **Expected Result:** Appointment state updates to `IN_CONSULTATION`; POST request sent to `/api/workflow/events/trigger-call`; SSE broadcasts voice event to Reception; audio announcement generated: *"Token number 101, patient Suresh Kumar, please proceed to Room 102"*.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional / Integration

#### PLAN1-TC-003
* **Module:** Plan 1 (TOKEN_ONLY)
* **Feature:** Doctor Single-Click "Complete Token" Workflow
* **Test Scenario:** Verify that the doctor can complete the paper-prescription visit directly from the queue without navigating to an EMR form.
* **Preconditions:** Patient is in `IN_CONSULTATION` state in Plan 1.
* **Test Steps:**
  1. From `/doctor/queue`, view active consultation row.
  2. Click "Complete Token" button.
* **Test Data:** Token: `OP-101`.
* **Expected Result:** `workflow.queueState` transitions to `COMPLETED`; appointment moves to Completed Visits list; next waiting patient becomes top callable.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional

#### PLAN1-TC-004
* **Module:** Plan 1 (TOKEN_ONLY)
* **Feature:** Repeat Audio Calling ("Re-Call Voice")
* **Test Scenario:** Verify that the doctor or receptionist can re-trigger voice announcement if the patient did not respond to the first call.
* **Preconditions:** Appointment is in `CALLED` or `IN_CONSULTATION` state in Plan 1.
* **Test Steps:**
  1. On `/doctor/queue` or `/reception/queue`, locate patient row.
  2. Click "Re-Call Voice".
* **Test Data:** Target Token: `OP-101`.
* **Expected Result:** Toast notification "📢 Re-calling Token #101 at Reception"; SSE event broadcast with `isRepeat: true`; voice engine synthesizes and replays the announcement.
* **Priority:** P2 - Medium
* **Severity:** Major
* **Test Type:** Functional

#### PLAN1-TC-005
* **Module:** Plan 1 (TOKEN_ONLY)
* **Feature:** Consultation Screen Behavior under Plan 1
* **Test Scenario:** Verify that accessing `/doctor/consultation/:id` under Plan 1 displays the designated Paper Prescription mode banner instead of the full EMR form.
* **Preconditions:** Hospital `opdOperationMode: "TOKEN_ONLY"`.
* **Test Steps:**
  1. Log in as Doctor.
  2. Navigate directly to `/doctor/consultation/APP_101`.
* **Test Data:** Appointment ID: `APP_101`.
* **Expected Result:** UI displays "Physical Paper Prescription Mode Active" with description "Your hospital operates under Plan 1. Prescriptions are written by hand on physical paper letterheads" and a button "Open Today's Queue & Voice Caller".
* **Priority:** P2 - Medium
* **Severity:** Minor
* **Test Type:** Functional / UI

---

### 4.4 Plan 2: Complete Digital OPD Suite (`PLAN2-TC`)

#### PLAN2-TC-001
* **Module:** Plan 2 (FULL_DIGITAL)
* **Feature:** Receptionist Vitals Recording & BMI Calculation
* **Test Scenario:** Verify intake vitals entry and automatic calculation of Body Mass Index (BMI).
* **Preconditions:** Hospital `opdOperationMode: "FULL_DIGITAL"`.
* **Test Steps:**
  1. Navigate to `/reception/vitals` or intake form for Patient.
  2. Enter Height = `175 cm` and Weight = `70 kg`.
  3. Enter BP = `120/80 mmHg`, Pulse = `72 bpm`, SpO2 = `98%`, Temp = `98.6 °F`.
  4. Save vitals.
* **Test Data:** `Height: 175`, `Weight: 70`, `BP: 120/80`, `Pulse: 72`, `SpO2: 98`, `Temp: 98.6`.
* **Expected Result:** BMI is auto-calculated as `22.86 kg/m²` (Normal weight); vitals object persisted in Consultation document.
* **Priority:** P1 - High
* **Severity:** Major
* **Test Type:** Functional / Calculation

#### PLAN2-TC-002
* **Module:** Plan 2 (FULL_DIGITAL)
* **Feature:** Vitals Input Validation & Boundary Values
* **Test Scenario:** Verify system behavior with boundary, extreme, and invalid vitals input values.
* **Preconditions:** Vitals entry form is open.
* **Test Steps:**
  1. Enter negative values for Pulse (`-5`) and Height (`-100`).
  2. Enter non-numeric characters for Blood Pressure (`ABC/XYZ`).
  3. Attempt to save.
* **Test Data:** `Pulse: -5`, `Height: -100`, `BP: ABC/XYZ`.
* **Expected Result:** Form validation errors prevent submission; numeric bounds enforced.
* **Priority:** P2 - Medium
* **Severity:** Minor
* **Test Type:** Boundary / Negative

#### PLAN2-TC-003
* **Module:** Plan 2 (FULL_DIGITAL)
* **Feature:** Doctor Full Clinical Consultation & ICD-10 Diagnosis
* **Test Scenario:** Verify complete digital consultation documentation in Plan 2.
* **Preconditions:** Patient in `READY` or `CALLED` state; Plan 2 active.
* **Test Steps:**
  1. Open `/doctor/consultation/:visitId`.
  2. Enter Chief Complaints: "Fever and sore throat for 3 days".
  3. Search and select ICD-10 Diagnosis: "J02.9 - Acute pharyngitis, unspecified".
  4. Add Doctor Examination Notes.
* **Test Data:** `Complaints: Fever, sore throat (3 days)`, `ICD-10: J02.9`.
* **Expected Result:** Diagnosis attaches to active consultation; clinical case sheet state updates in real-time.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional

#### PLAN2-TC-004
* **Module:** Plan 2 (FULL_DIGITAL)
* **Feature:** Multi-Medicine Rx Prescription Engine
* **Test Scenario:** Verify adding multiple medicines with form, dosage strength, frequency, duration, food instructions, and notes.
* **Preconditions:** Consultation case sheet is active.
* **Test Steps:**
  1. In Rx section, search for "Paracetamol".
  2. Select Form: "Tablet", Strength: "650 mg", Frequency: "1-0-1", Duration: "5 Days", Food Instruction: "After Food".
  3. Add second medicine: "Amoxicillin", Form: "Capsule", Strength: "500 mg", Frequency: "1-1-1", Duration: "5 Days", Food Instruction: "After Food".
  4. Click "Finalize & Save Prescription".
* **Test Data:** 2 medication items with detailed dosing matrix.
* **Expected Result:** Prescription record created with items array; totals and duration calculated; linked to Consultation and Appointment.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional / Data Integrity

#### PLAN2-TC-005
* **Module:** Plan 2 (FULL_DIGITAL)
* **Feature:** Laboratory Investigations & Follow-Up Advice
* **Test Scenario:** Verify adding lab test orders (Pathology/Radiology) and setting follow-up appointment date.
* **Preconditions:** Consultation case sheet is active.
* **Test Steps:**
  1. In Investigations tab, add "Complete Blood Count (CBC)" and "Chest X-Ray (PA View)".
  2. In Follow-Up tab, select "After 5 Days".
  3. Submit consultation.
* **Test Data:** `Lab Tests: CBC, Chest X-Ray`, `Follow-up: +5 days`.
* **Expected Result:** Investigation orders stored in Prescription document; follow-up date auto-calculated; appointment appears in Doctor Follow-ups register.
* **Priority:** P2 - Medium
* **Severity:** Major
* **Test Type:** Functional

#### PLAN2-TC-006
* **Module:** Plan 2 (FULL_DIGITAL)
* **Feature:** Digital Handoff to Pharmacy Dispense Queue
* **Test Scenario:** Verify that completing a Plan 2 consultation automatically routes the prescription to the Pharmacy dispensing queue.
* **Preconditions:** Consultation finalized with prescribed medicines.
* **Test Steps:**
  1. Complete digital consultation.
  2. Open `/pharmacy/dispense` as Pharmacist.
* **Test Data:** Target Appointment: `APP_202`.
* **Expected Result:** Appointment `workflow.queueState` transitions to `SENT_TO_PHARMACY`; pharmacy queue card appears in real-time showing patient name, doctor, and list of prescribed medicines.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Integration / Workflow

---

### 4.5 Plan 1 vs. Plan 2 Operational Comparison (`COMP-TC`)

#### COMP-TC-001
* **Module:** Plan Comparison
* **Feature:** Hospital Mode Switch from Plan 1 to Plan 2
* **Test Scenario:** Verify that changing `opdOperationMode` from `TOKEN_ONLY` to `FULL_DIGITAL` in Hospital Settings immediately activates digital EMR consultation for subsequent doctor visits.
* **Preconditions:** Hospital initially configured as `TOKEN_ONLY`.
* **Test Steps:**
  1. Log in as Hospital Admin.
  2. Navigate to `/admin/workflow` (Settings).
  3. Toggle OPD Operation Mode to "Plan 2: Complete Digital OPD Suite".
  4. Save configuration.
  5. Log in as Doctor and open next patient visit.
* **Test Data:** `opdOperationMode: "FULL_DIGITAL"`.
* **Expected Result:** Doctor queue displays "Start Consultation" (instead of fast Accept/Complete buttons); clicking consultation navigates to full digital EMR workspace.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional / Regression

#### COMP-TC-002
* **Module:** Plan Comparison
* **Feature:** Queue Action Button Matrix Verification
* **Test Scenario:** Validate UI action buttons rendered per queue status between Plan 1 and Plan 2.
* **Preconditions:** Appointments exist in `WAITING`, `IN_CONSULTATION`, and `COMPLETED` states.
* **Test Steps:**
  1. Inspect Doctor Queue in Plan 1 (`TOKEN_ONLY`).
  2. Inspect Doctor Queue in Plan 2 (`FULL_DIGITAL`).
* **Test Data:** Appointment rows in identical states across both modes.
* **Expected Result:** 
  * Plan 1 `WAITING` $\rightarrow$ "Accept Patient" (Direct Voice Call); `IN_CONSULTATION` $\rightarrow$ "Complete Token" + "Re-Call Voice".
  * Plan 2 `WAITING` $\rightarrow$ "Start Consultation"; `IN_CONSULTATION` $\rightarrow$ "Resume Consultation"; `COMPLETED` $\rightarrow$ "View Prescription".
* **Priority:** P1 - High
* **Severity:** Major
* **Test Type:** Functional / UI

---

### 4.6 Workflow State Machine & Decision Engine (`WORKFLOW-TC`)

#### WORKFLOW-TC-001
* **Module:** Workflow Engine
* **Feature:** Queue State Progression & Transition Validation
* **Test Scenario:** Verify valid state sequence: `SCHEDULED` $\rightarrow$ `WAITING` $\rightarrow$ `READY` $\rightarrow$ `CALLED` $\rightarrow$ `IN_CONSULTATION` $\rightarrow$ `COMPLETED`.
* **Preconditions:** Valid appointment created.
* **Test Steps:**
  1. Send sequential transition requests via `/api/workflow/transition`.
* **Test Data:** Valid transition payload sequence.
* **Expected Result:** All valid transitions succeed with HTTP 200; `workflow.history` records each transition with actor ID, role, and timestamp.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional / State Machine

#### WORKFLOW-TC-002
* **Module:** Workflow Engine
* **Feature:** Invalid State Transition Rejection
* **Test Scenario:** Verify that the workflow engine rejects illegal backward or bypass transitions (e.g., transitioning directly from `SCHEDULED` to `COMPLETED` without consultation).
* **Preconditions:** Appointment is in `SCHEDULED` state.
* **Test Steps:**
  1. Send transition request directly to `COMPLETED`.
* **Test Data:** `fromState: "SCHEDULED"`, `toState: "COMPLETED"`.
* **Expected Result:** HTTP 400 Bad Request; message: "Invalid state transition from SCHEDULED to COMPLETED"; state remains `SCHEDULED`.
* **Priority:** P1 - High
* **Severity:** Major
* **Test Type:** Negative / State Machine

#### WORKFLOW-TC-003
* **Module:** Workflow Decision Engine
* **Feature:** Pre-Consultation Payment Gating Enforcement
* **Test Scenario:** Verify that doctor consultation is blocked when billing workflow requires payment "Before Consultation" and fee is unpaid.
* **Preconditions:** `billingWorkflowSettings.paymentTiming = "Before Consultation"`; fee collection role = `Reception`; appointment `paymentState = "PENDING"`.
* **Test Steps:**
  1. Doctor attempts to call or start consultation on unpaid token.
* **Test Data:** `Appointment ID: APP_UNPAID_01`.
* **Expected Result:** Action is blocked; `WorkflowDecisionEngine.evaluateActions` returns `canStartConsultation: false` with diagnostic message: "🔒 Payment Pending — Waiting for Reception to collect consultation fee".
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Security / Workflow

---

### 4.7 Queue Orchestration & Priority Triage (`QUEUE-TC`)

#### QUEUE-TC-001
* **Module:** Queue Orchestration
* **Feature:** Doctor Queue Isolation
* **Test Scenario:** Verify that appointments assigned to Doctor A are not listed in Doctor B's queue.
* **Preconditions:** Patient 1 assigned to Dr. Smith; Patient 2 assigned to Dr. Jones.
* **Test Steps:**
  1. Log in as Dr. Smith and view queue.
  2. Log in as Dr. Jones and view queue.
* **Test Data:** Dr. Smith ID vs Dr. Jones ID.
* **Expected Result:** Dr. Smith sees only Patient 1; Dr. Jones sees only Patient 2; zero cross-doctor queue pollution.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional

#### QUEUE-TC-002
* **Module:** Queue Orchestration
* **Feature:** Emergency & VIP Priority Override Triage
* **Test Scenario:** Verify that an emergency walk-in patient bypasses the standard FIFO waiting order and becomes the top callable token.
* **Preconditions:** 5 standard tokens in `WAITING` queue (`Tokens #1 to #5`).
* **Test Steps:**
  1. Register Token #6 with `consultationType: "Emergency"`.
  2. Apply priority override via `QueueOrchestrationEngine.applyPriorityOverride`.
  3. Fetch active queue evaluation.
* **Test Data:** Token #6 flagged as `Emergency`.
* **Expected Result:** Token #6 is placed at Position #1 (`canCall: true`); Tokens #1–#5 shifted down; priority reason logged as "Emergency".
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional

#### QUEUE-TC-003
* **Module:** Queue Orchestration
* **Feature:** Auto-Promotion of Scheduled Appointments for Today
* **Test Scenario:** Verify that appointments scheduled for today are automatically promoted to active `WAITING` queue upon day start.
* **Preconditions:** Appointment created yesterday with `date = Today` and status `SCHEDULED`.
* **Test Steps:**
  1. Execute `QueueOrchestrationEngine.promoteFutureAppointmentsForToday`.
* **Test Data:** Hospital Branch context.
* **Expected Result:** Appointment `workflow.queueState` updated to `WAITING`; legacy status updated to `Waiting`; callable in today's queue.
* **Priority:** P2 - Medium
* **Severity:** Major
* **Test Type:** Functional

---

### 4.8 Voice Announcements & TTS Engine (`VOICE-TC`)

#### VOICE-TC-001
* **Module:** Voice Announcement (TTS)
* **Feature:** Multilingual Announcement Synthesis
* **Test Scenario:** Verify text-to-speech audio synthesis across configured regional languages (English, Tamil, Hindi, Telugu).
* **Preconditions:** Voice engine configured with active TTS provider (Sarvam AI / Google TTS / Azure).
* **Test Steps:**
  1. Send POST request to `/api/tts/synthesize` with language code `ta-IN` (Tamil) and template parameters.
  2. Send POST request with language code `hi-IN` (Hindi).
  3. Send POST request with language code `en-IN` (English).
* **Test Data:** `Token: 105`, `Doctor: Dr. Anitha`, `Room: 3`.
* **Expected Result:** Audio stream (MP3/WAV buffer) returned with HTTP 200; pronunciation matches regional language template.
* **Priority:** P2 - Medium
* **Severity:** Major
* **Test Type:** Integration

#### VOICE-TC-002
* **Module:** Voice Announcement
* **Feature:** Real-Time Broadcast to Digital Display Board (TV)
* **Test Scenario:** Verify that calling a token from Doctor desk immediately updates the TV display board and triggers audio playback.
* **Preconditions:** Standalone `/display-board` open on a secondary TV monitor.
* **Test Steps:**
  1. Doctor calls Token #108.
  2. Observe `/display-board` screen.
* **Test Data:** Token #108, Patient "Priya", Room 2.
* **Expected Result:** Display board flashes active token card with Token #108, Doctor Name, Room 2; audio chime and voice announcement play synchronously.
* **Priority:** P1 - High
* **Severity:** Major
* **Test Type:** End-to-End

---

### 4.9 WhatsApp Cloud API Integration (`NOTIF-TC`)

#### NOTIF-TC-001
* **Module:** WhatsApp Notification
* **Feature:** Appointment Booking Confirmation Dispatch
* **Test Scenario:** Verify dispatch of interactive WhatsApp confirmation message upon booking an appointment.
* **Preconditions:** WhatsApp Cloud API credentials configured.
* **Test Steps:**
  1. Book appointment for patient with valid mobile number.
* **Test Data:** `Mobile: +919876543210`, `Patient: Ravi Kumar`, `Date: 2026-10-01 10:00 AM`.
* **Expected Result:** Backend issues POST to WhatsApp Graph API; template message sent containing Date, Time, Doctor Name, and Queue Tracking Link; HTTP 200 logged.
* **Priority:** P2 - Medium
* **Severity:** Major
* **Test Type:** Integration

#### NOTIF-TC-002
* **Module:** WhatsApp Notification
* **Feature:** Digital Prescription PDF Delivery
* **Test Scenario:** Verify that finishing a Plan 2 consultation sends the digital prescription download link via WhatsApp.
* **Preconditions:** Consultation completed in Plan 2; patient opted in for digital notifications.
* **Test Steps:**
  1. Finalize and save prescription.
* **Test Data:** Prescription ID `RX-7788`.
* **Expected Result:** WhatsApp template message dispatched with secure PDF download URL.
* **Priority:** P2 - Medium
* **Severity:** Minor
* **Test Type:** Integration

---

### 4.10 Role-Based Access Control & Navigation Protection (`RBAC-TC`)

#### RBAC-TC-001
* **Module:** RBAC
* **Feature:** Receptionist Access Restriction to Clinical Consultation
* **Test Scenario:** Verify that a Receptionist cannot access Doctor Consultation workspaces or prescribe medicines.
* **Preconditions:** User authenticated with role `RECEPTIONIST`.
* **Test Steps:**
  1. Attempt to navigate directly to `/doctor/consultation/APP_123`.
  2. Attempt to issue POST request to `/api/operations/prescriptions`.
* **Test Data:** Receptionist JWT token.
* **Expected Result:** Frontend redirects to `/reception/dashboard` or `/login`; Backend returns HTTP 403 Forbidden ("Access denied for your role").
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Security

#### RBAC-TC-002
* **Module:** RBAC
* **Feature:** Dual-Role Doctor Admin Workspace Toggle
* **Test Scenario:** Verify that a user with role `DOCTOR_ADMIN` can toggle between Clinical Consultation mode and Hospital Administration mode.
* **Preconditions:** User has role `DOCTOR_ADMIN`.
* **Test Steps:**
  1. Log in as Doctor Admin.
  2. Toggle Workspace switch from "Clinical" to "Admin".
* **Test Data:** Dual role user profile.
* **Expected Result:** When in Clinical mode, navigation loads Doctor queue and consultations; when in Admin mode, navigation loads Hospital workforce, departments, and financial settings.
* **Priority:** P2 - Medium
* **Severity:** Major
* **Test Type:** Functional

---

### 4.11 Pharmacy & Dispensing Management (`PHARMACY-TC`)

#### PHARMACY-TC-001
* **Module:** Pharmacy
* **Feature:** Prescription Dispensing & Batch Stock Deduction
* **Test Scenario:** Verify that dispensing prescribed medicines deducts the exact quantity from the selected inventory batch (`MedicineBatch`).
* **Preconditions:** Medicine "Paracetamol 650" has Batch #B101 with available quantity = `100 Tablets`.
* **Test Steps:**
  1. Open `/pharmacy/dispense/:prescriptionId`.
  2. Select Batch #B101 for Paracetamol 650 (Quantity prescribed = `10 Tablets`).
  3. Click "Complete Dispensing & Generate Bill".
* **Test Data:** `Batch: B101`, `Dispense Qty: 10`.
* **Expected Result:** Pharmacy bill generated; Batch #B101 available quantity reduced to `90 Tablets`; prescription status updated to `DISPENSED`.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional / Inventory

#### PHARMACY-TC-002
* **Module:** Pharmacy
* **Feature:** Expired Batch Dispensing Block
* **Test Scenario:** Verify that the system prevents dispensing from an inventory batch whose expiry date has passed.
* **Preconditions:** Batch #B099 has `expiryDate < Current Date`.
* **Test Steps:**
  1. Attempt to allocate Batch #B099 during dispensing.
* **Test Data:** Expired batch record.
* **Expected Result:** UI highlights batch in red as "EXPIRED"; selection disabled; backend validation rejects dispensing request with HTTP 400 "Cannot dispense expired batch".
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Security / Regulatory

---

### 4.12 Prescription Layout & Pre-Printed Stationery Printing (`PRINT-TC`)

#### PRINT-TC-001
* **Module:** Prescription Printing
* **Feature:** Standard A4 Full Digital Prescription Generation
* **Test Scenario:** Verify rendering of full A4 digital prescription with hospital logo, header, patient details, diagnosis, Rx table, doctor signature, and footer watermark.
* **Preconditions:** Plan 2 prescription completed.
* **Test Steps:**
  1. Click "Print Prescription" on completed visit.
  2. Select "Standard A4 Digital Template".
* **Test Data:** Completed prescription record.
* **Expected Result:** PDF/Print preview renders all clinical sections with high resolution; hospital branding and watermark formatted correctly.
* **Priority:** P2 - Medium
* **Severity:** Major
* **Test Type:** Functional / UI

#### PRINT-TC-002
* **Module:** Prescription Printing
* **Feature:** Pre-Printed Letterhead Offset Calibration (Millimeter Margins)
* **Test Scenario:** Verify that pre-printed letterhead mode suppresses hospital header/footer graphics and offsets dynamic text by exact configured margins (Top/Bottom/Left/Right mm).
* **Preconditions:** `printConfiguration.printMode = "STATIONERY"`; Top Margin = `45 mm`, Bottom Margin = `30 mm`.
* **Test Steps:**
  1. Click "Print on Pre-Printed Stationery".
* **Test Data:** Offsets: `Top: 45mm`, `Bottom: 30mm`.
* **Expected Result:** Header and footer logos/titles are suppressed; clinical content starts exactly at 45mm from top edge, avoiding pre-printed hospital stationary headers.
* **Priority:** P2 - Medium
* **Severity:** Major
* **Test Type:** Functional / Precision

---

### 4.13 Billing & Financial Invoicing (`BILLING-TC`)

#### BILLING-TC-001
* **Module:** Billing
* **Feature:** Consolidated OPD Invoice Generation
* **Test Scenario:** Verify calculation of total bill with consultation fees, procedure charges, tax/GST, and discount deductions.
* **Preconditions:** Patient bill initiated with Consultation Fee = ₹500, ECG Procedure = ₹300, Discount = 10%, Tax = 5%.
* **Test Steps:**
  1. Add line items.
  2. Apply 10% discount.
  3. Select Payment Mode: "UPI".
  4. Click "Settle Invoice".
* **Test Data:** `Subtotal: 800`, `Discount 10%: -80`, `Taxable: 720`, `Tax 5%: +36`, `Total: 756`.
* **Expected Result:** Invoice generated with Total = ₹756.00; Payment status = `PAID`; Invoice saved in `Invoice` collection; receipt printable.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Functional / Financial

---

### 4.14 Security, HTTP Headers & API Protection (`SECURITY-TC`)

#### SECURITY-TC-001
* **Module:** Security
* **Feature:** Helmet Security Headers Verification
* **Test Scenario:** Verify that backend responses include required HTTP security headers.
* **Preconditions:** Server running.
* **Test Steps:**
  1. Send GET request to `/health` or any public endpoint.
  2. Inspect response headers.
* **Test Data:** Standard HTTP request.
* **Expected Result:** Response contains security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (or DENY), `Strict-Transport-Security`.
* **Priority:** P2 - Medium
* **Severity:** Major
* **Test Type:** Security

#### SECURITY-TC-002
* **Module:** Security
* **Feature:** Unauthenticated API Access Rejection
* **Test Scenario:** Verify that protected endpoints return HTTP 401 Unauthorized when requested without a Bearer token.
* **Preconditions:** None.
* **Test Steps:**
  1. Send GET request to `/api/operations/patients` without `Authorization` header.
* **Test Data:** No auth header.
* **Expected Result:** HTTP 401 Unauthorized; body contains `{ success: false, message: "Not authorized to access this route, no token provided" }`.
* **Priority:** P1 - High
* **Severity:** Critical
* **Test Type:** Security

---

## 5. Traceability Matrix Summary

| Test Domain | Prefix | Primary Documented Modules Covered |
| :--- | :--- | :--- |
| **Authentication & Sessions** | `AUTH-TC` | User, UserSession, JWT, Pin Auth, Login Views |
| **Multi-Tenancy** | `TENANT-TC` | Hospital, AsyncLocalStorage, tenantModel, Dynamic DBs |
| **Plan 1 (TOKEN_ONLY)** | `PLAN1-TC` | Fast Queue, Audio Voice, Paper Rx Workflow, Token Slips |
| **Plan 2 (FULL_DIGITAL)**| `PLAN2-TC` | Vitals, ICD-10, Medicine Rx Engine, Labs, Follow-ups |
| **Plan Mode Switching** | `COMP-TC` | `opdOperationMode`, Workflow Settings, Queue Adaptation |
| **State Machine & Rules** | `WORKFLOW-TC`| WorkflowEngine, WorkflowDecisionEngine, History Logs |
| **Queue Orchestration** | `QUEUE-TC` | QueueOrchestrationEngine, FIFO, Emergency VIP Triage |
| **Voice & Speech** | `VOICE-TC` | Sarvam AI, Google TTS, Azure Speech, TV Display Board |
| **WhatsApp Notifications**| `NOTIF-TC` | WhatsApp Cloud API, Appointment Alerts, Rx Delivery |
| **RBAC & Authorization** | `RBAC-TC` | Role, Permission, ProtectedRoute, WorkspaceRoute |
| **Pharmacy & Inventory** | `PHARMACY-TC`| MedicineBatch, PharmacyBill, Stock Deduction, Expiry |
| **Printing & Stationery** | `PRINT-TC` | PrescriptionPrintTemplate, Offsets, Margins, PDF Engine |
| **Billing & Invoices** | `BILLING-TC` | Invoice, Service, Payment Timing, Consolidated Billing |
| **Security & Headers** | `SECURITY-TC`| Helmet, CORS, JWT Verification, Tenant Injection Check |

---

*End of Document — Master Test Case Specification for VillZone HIMS Enterprise Platform.*
