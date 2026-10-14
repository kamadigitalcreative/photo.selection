# PHOTO SELECTION / KMBC — PHASE 4.7.5
## HISTORICAL PAYMENT CUTOVER PLAN & GO/NO-GO AUDIT REVIEW

**Document Version:** 1.1.0 (Phase 4.7.5 Pre-Release Corrections)  
**Target Branch:** `feat/phase-4.7.5-mayar-webhook-hardening`  
**Classification:** Operational Security & Database Cutover Strategy (Read-Only Planning)  
**Release Blocker Status:** **STRICT NO-GO** (Blocked until exact provider transaction IDs are verified for historical settled accounts)

---

## 1. Executive Summary & Operational Context

Photo Selection is an active multi-tenant SaaS application operating on Supabase (PostgreSQL) and Vercel. Supabase Production and Vercel Preview environments share the production database instance.

In Phase 4.7.5, backend payment processing transitions to an atomic, idempotent ledger architecture via `public.processed_payments` and the stored function `public.process_mayar_payment`. Because this architecture relies on immutable transaction IDs for replay defense, historical transactions settled under legacy handlers must be reconciled defensively to prevent double extension or accidental privilege escalation.

> [!WARNING]
> **CURRENT STATUS: NO-GO FOR DEPLOYMENT**  
> Exact Mayar provider transaction IDs have not yet been extracted or verified for historical paying customers. Replaying historical webhooks without exact IDs in `processed_payments` will **erroneously grant additional subscription time** to active customers. Production deployment remains strictly on hold until this blocker is resolved.

---

## 2. Historical Customer Status Matrix (Non-PII)

Two verified paying customers transacted Rp25,000 for the **1 Bulan** package on Mayar prior to the Phase 4.7.5 release. The owner has explicitly confirmed that both accounts have already received manual extensions.

| Parameter | Customer Case A ("Amar") | Customer Case B ("Shotbygusade") | Case C ("Ayu Nely") |
| :--- | :--- | :--- | :--- |
| **Product Purchased** | Paket 1 Bulan (Rp25.000) | Paket 1 Bulan (Rp25.000) | Unverified ("SUKSES" narrative) |
| **Provider Status** | Settled on Mayar | Settled on Mayar | UNVERIFIED |
| **Checkout vs Account Email** | **Different Email** (email mismatch) | **Same Email** (exact match) | Unknown / Unaudited |
| **Legacy Automated Activation** | Failed (unmatched email) | Recorded "Perpanjangan berhasil" but **failed silently** | Recorded "SUKSES" in log narrative |
| **Owner Manual Extension** | **CONFIRMED COMPLETED** | **CONFIRMED COMPLETED** | **NOT CONFIRMED** |
| **Current Entitlement State** | Active (credited manually) | Active (credited manually) | Pending Operator Investigation |
| **Replay Defense Imperative** | **MUST NOT receive another +30 days** | **MUST NOT receive another +30 days** | **DO NOT auto-seed; hold for review** |
| **Cutover Status** | `UNRESOLVED_ID_NO_GO` | `UNRESOLVED_ID_NO_GO` | `UNVERIFIED_REVIEW` |

---

## 3. Four Distinct Levels of Transaction Evidence

A critical lesson of the Phase 4.7.5 audit is that narrative log messages cannot be trusted as proof of database state. The operator must distinguish four separate evidence tiers:

```
[Level 1: Provider Settled] ──> [Level 2: Legacy Automation Log] ──> [Level 3: Manual State] ──> [Level 4: Ledger Idempotency]
   (Money received by Mayar)       (Unreliable prose in log)          (Owner credited DB)         (Exact ID in processed_payments)
```

1. **Mayar Settled (Level 1):** The financial provider confirmed receipt of funds. This proves the customer paid, but does *not* prove their account was updated in Supabase.
2. **Aktivasi Otomatis (Level 2):** Historical `mayar_logs` entries contain narrative text such as `"Perpanjangan 1 Bulan berhasil"`. As proven in the Shotbygusade case, legacy handlers often wrote success narratives even when the database mutation failed silently or encountered an uncaught error. Narrative text is **not proof of mutation**.
3. **Manual Extension (Level 3):** The application owner manually updated the user's `ExpiredAt` date in Supabase. The customer has already received their full paid entitlement.
4. **Ledger Exact Verified Provider ID (Level 4):** A row exists in `public.processed_payments` with `status = 'HISTORICAL_SETTLED'` tied to the exact provider transaction ID. This guarantees that if Mayar resends or replays the webhook, the RPC exits immediately with `already_processed` and zero account extension.

---

## 4. Extraction of Real Stable Provider Transaction IDs

In [`api/supabase.js`](file:///d:/FILE%20GITHUB/photo.selection/api/supabase.js#L1046-L1051), transaction identity is extracted strictly through `extractMayarTransactionId()`:

```javascript
function extractMayarTransactionId(data, payload) {
  const d = data || {};
  const p = payload || {};
  const rawId = d.id || d.paymentId || d.transactionId || d.invoiceId || p.id || '';
  return String(rawId || '').trim();
}
```

### Critical Verification Rules:
1. **Never use the Log Table UUID:** The `id` column in `public.mayar_logs` is a synthetic Postgres row UUID generated by Supabase (e.g., `a1b2c3d4-...`), *not* the Mayar payment ID. Seeding this UUID into `processed_payments` provides zero replay protection because incoming webhooks carry Mayar-issued IDs.
2. **Never use 6-character UI snippets:** The Mayar dashboard UI often displays short reference codes (e.g., `inv-xyz123` or 6-character truncated codes). The webhook payload sent to the API contains the full GUID/string identifier.
3. **Operator Extraction Procedure:**
   - Execute Section 10 of [`test/phase475_release_preflight_READ_ONLY.sql`](file:///d:/FILE%20GITHUB/photo.selection/test/phase475_release_preflight_READ_ONLY.sql).
   - This query parses `"Raw JSON Payload"` / `"RawPayload"` using safe text regex matching (never crashing on malformed JSON) and checks `data.id`, `data.paymentId`, `data.transactionId`, `data.invoiceId`, and `id`.
   - Cross-reference the extracted ID against the Mayar Dashboard export.
   - If the JSON payload in `mayar_logs` is null or malformed, obtain the exact ID directly from the Mayar merchant dashboard under **Transactions > Details > Webhook / Payment ID**.

---

## 5. Replay Vulnerability Analysis When Exact ID is Unavailable (`UNRESOLVED_ID`)

> [!CAUTION]
> **NO AUTOMATIC FAIL-CLOSED PROTECTION FOR ACTIVE ACCOUNTS:**  
> It is technically incorrect to claim that replaying historical transactions without exact IDs is "guaranteed fail-closed". Here is the exact behavior of `process_mayar_payment` if a replay arrives with an unseeded transaction ID:

### Case B: Customer Shotbygusade (Severe Double Extension Risk)
- **Account State:** `Status = 'Active'`, `Paket = '1 Bulan'`, `ExpiredAt = 2026-11-...`
- **Webhook State:** Checkout email matches account email exactly.
- **RPC Execution:** Layer 1 matches `p_email = u."Email"` directly. The target user is found and is `Active`. Because `p_payment_id` is NOT in `processed_payments`, the RPC treats this as a legitimate renewal:
  ```sql
  v_base_date := v_curr_exp; -- Uses existing active expiration
  v_final_expired_at := (v_base_date + 30 days);
  ```
- **Consequence:** Shotbygusade's account is **immediately extended for an additional +30 days** without paying again!

### Case A: Customer Amar (Identity Ambiguity / Mutation Risk)
- **Account State:** Active, but registered with a different email than checkout.
- **Webhook State:** Checkout email does not match account email.
- **RPC Execution:** If the checkout phone matches Amar's registered phone, Layer 3 detects `p_email <> phoneMatches[0].Email` and returns `ACCOUNT_CONFLICT`. However, if the checkout phone was empty or differs, and `p_create_new_user = true` was passed, it could create an unintended duplicate user. If Amar later changed their email to match checkout, it would suffer the same double-extension defect as Case B.

### Strict Cutover Policy:
- **Do NOT rely on imaginary fail-closed behavior.**
- **Do NOT create arbitrary cutoff dates based on date/timestamp** (incoming webhooks do not carry a verifiable DB timestamp).
- **Status remains STRICT NO-GO** until exact provider transaction IDs for Amar and Shotbygusade are verified and seeded into `processed_payments`.

---

## 6. Corrected Template Seed Script for Operator Sign-Off

> [!IMPORTANT]
> **CORRECTED SCHEMA CONTRACT:**  
> The table `public.processed_payments` defined in [`supabase/migrations/20261012_phase475_payment_idempotency.sql`](file:///d:/FILE%20GITHUB/photo.selection/supabase/migrations/20261012_phase475_payment_idempotency.sql#L10-L22) contains exactly:
> `payment_id`, `account_username`, `customer_email`, `product_name`, `plan_name`, `amount`, `currency`, `status`, `activation_result`, `created_at`, `processed_at`.  
> There is **NO `customer_name` column** and **NO `notes` column**. Operator notes and audit reasoning MUST be stored in `activation_result`.

### Step 1: Pre-Seed Inspection (Mandatory)
Before running any seed, inspect if a ledger row already exists for these IDs:

```sql
-- Step 1: Check existing ledger rows to avoid swallowing conflicts
SELECT payment_id, status, account_username, customer_email, activation_result, created_at 
FROM public.processed_payments 
WHERE payment_id IN (
    '<EXACT_MAYAR_ID_AMAR_FROM_DASHBOARD>',
    '<EXACT_MAYAR_ID_SHOTBYGUSADE_FROM_DASHBOARD>'
);
```

* If a row already exists with status `SUCCESS` or `HISTORICAL_SETTLED`, do not re-insert.
* If a row exists with `MANUAL_RECONCILIATION_REQUIRED`, investigate the error before altering it.
* **Do NOT blindly rely on `ON CONFLICT DO NOTHING`** to hide conflicts silently.

### Step 2: Seed Template (Operator Execution Only After Step 1)

```sql
-- =========================================================================
-- TEMPLATE: HISTORICAL PAYMENT REPLAY GUARD SEED (EXECUTE MANUALLY AFTER AUDIT)
-- Target: public.processed_payments (11 exact columns)
-- Condition: Operator MUST replace placeholder strings with verified real values.
-- =========================================================================

-- Case A: Customer Amar (Settled, Manual Extension Confirmed, Email Mismatch Resolved)
INSERT INTO public.processed_payments (
    payment_id,
    account_username,
    customer_email,
    product_name,
    plan_name,
    amount,
    currency,
    status,
    activation_result,
    created_at,
    processed_at
)
VALUES (
    '<EXACT_MAYAR_ID_AMAR_FROM_DASHBOARD>', -- Must match extractMayarTransactionId()
    '<VERIFIED_AMAR_USERNAME>', -- Verified Username in public.users
    '<VERIFIED_AMAR_CHECKOUT_EMAIL>', -- Verified Checkout Email from Mayar
    'Paket 1 Bulan - Photo Selection',
    '1 Bulan',
    25000,
    'IDR',
    'HISTORICAL_SETTLED',
    'HISTORICAL_RECONCILIATION: Mayar settlement pre-Phase 4.7.5. Manual extension confirmed by owner. Seeded to prevent duplicate extension on webhook replay.',
    NOW(),
    NOW()
);

-- Case B: Customer Shotbygusade (Settled, Manual Extension Confirmed)
INSERT INTO public.processed_payments (
    payment_id,
    account_username,
    customer_email,
    product_name,
    plan_name,
    amount,
    currency,
    status,
    activation_result,
    created_at,
    processed_at
)
VALUES (
    '<EXACT_MAYAR_ID_SHOTBYGUSADE_FROM_DASHBOARD>', -- Must match extractMayarTransactionId()
    '<VERIFIED_SHOTBYGUSADE_USERNAME>', -- Verified Username in public.users
    '<VERIFIED_SHOTBYGUSADE_CHECKOUT_EMAIL>', -- Verified Checkout Email from Mayar
    'Paket 1 Bulan - Photo Selection',
    '1 Bulan',
    25000,
    'IDR',
    'HISTORICAL_SETTLED',
    'HISTORICAL_RECONCILIATION: Mayar settlement pre-Phase 4.7.5. Manual extension confirmed by owner. Seeded to prevent duplicate extension on webhook replay.',
    NOW(),
    NOW()
);
```

---

## 7. Protection of New Legitimate Transactions

Seeding historical transaction IDs into `processed_payments` does **NOT** block future renewals:
- When Amar or Shotbygusade purchase a renewal in the future, Mayar generates a **new, distinct payment ID** (e.g. `pay_new_98765`).
- The idempotency check queries `WHERE payment_id = 'pay_new_98765'`.
- Because the new ID does not match the historical ID, `process_mayar_payment` processes the renewal normally, adding +30 days from their existing active expiration.
- Idempotency is strictly per-transaction ID, never by customer name, email, or package name.

---

## 8. Audit of Other Historical Entries (Ayu Nely & Store Sales)

- Rows containing keywords like `"Ayu Nely"`, `"Canva"`, `"Kursus"`, or `"Membership"` must **NOT** be seeded into `processed_payments` as `HISTORICAL_SETTLED`.
- If an entry represents an unrelated store sale (Canva, course, etc.), incoming webhooks are classified under `STORE_SALE` with zero photographer account mutation.
- Any unresolved historical payment that is claimed by a customer must be handled through manual customer support and operator-verified SQL inspection.

---

## 9. Comprehensive Pre-Release Go/No-Go Checklist

Every single checkpoint below must be satisfied before any production deployment:

### Schema & Migration Integrity
- [x] **Migration Checksum Match:** SHA-256 of [`supabase/migrations/20261012_phase475_payment_idempotency.sql`](file:///d:/FILE%20GITHUB/photo.selection/supabase/migrations/20261012_phase475_payment_idempotency.sql) is exactly `1d77b2043df25fc8b290202d8c8f99272a2a3f9789a68702295011dfd4303df4`.
- [x] **Full Engine Parity:** All 19 PostgreSQL verification gates pass cleanly on disposable PostgreSQL 17.11 (`exit code 0`).
- [x] **Two-Process Concurrency Verified:** Scenario A (same ID mutex, 5.45s block) and Scenario B (same email advisory lock serialization, stacked 60d) verified with exit code 0.
- [x] **Rollback Script Contract Verified:** [`supabase/migrations/20261012_phase475_rollback.sql`](file:///d:/FILE%20GITHUB/photo.selection/supabase/migrations/20261012_phase475_rollback.sql) verified to drop ONLY the RPC function while strictly PRESERVING `processed_payments` and `pro_entitlements`.
- [ ] **Production Users Preflight Check:** Operator has executed Section 1–3 of [`test/phase475_release_preflight_READ_ONLY.sql`](file:///d:/FILE%20GITHUB/photo.selection/test/phase475_release_preflight_READ_ONLY.sql) in Supabase SQL Editor and confirmed all 24 columns exist.

### Security & Privacy Protections
- [x] **Admin Webhook Immunity:** Admin accounts (`Role = 'Admin'`) cannot be modified by any webhook (`ADMIN_ACCOUNT_PROTECTED`).
- [x] **Shared-Email Integrity:** Legitimate shared-email accounts (`adminps` and `kamavisual`) held in `AMBIGUOUS_IDENTITY` without mutation.
- [x] **Active-Only Grandfathering:** Legacy PRO snapshot strictly filtered with `WHERE u."Status" = 'Active'`, preventing pending accounts from obtaining perpetual PRO.
- [x] **Pending Paid Registration Hardening:** Public registration rejects `paket = 'Lifetime'` (400), paid pending signups initialize `ExpiredAt = null`, and first payments calculate finite duration from `CURRENT_DATE`.
- [x] **Demo Role Conversion:** Subscription payments convert `Role = 'Demo'` to `Role = 'Photographer'`.
- [ ] **mayar_logs RLS Audit:** Operator has executed Section 5 of preflight and confirmed effective privileges (`has_table_privilege`). If `anon` has SELECT and RLS is disabled, operator applies RLS policy to block unauthorized public access.

### Historical Cutover & Replay Guard (BLOCKER)
- [ ] **BLOCKER — Exact Provider ID Verification:** Operator has extracted the exact Mayar payment IDs for Amar and Shotbygusade via Section 10 of preflight or Mayar Dashboard.
- [ ] **BLOCKER — Historical Seed Staged:** Template seed query populated with verified IDs and reviewed by operator.
- [ ] **Zero Unverified Global Seeding:** Confirmed that no blanket `INSERT INTO processed_payments SELECT ... FROM mayar_logs` will be run.

---

## 10. Recommended Deployment Sequence

When the Go/No-Go Checklist is 100% satisfied:

1. **Step 1 (Pre-Flight):** Operator executes [`test/phase475_release_preflight_READ_ONLY.sql`](file:///d:/FILE%20GITHUB/photo.selection/test/phase475_release_preflight_READ_ONLY.sql) in Supabase SQL Editor and reviews results.
2. **Step 2 (Database Migration):** Operator applies [`supabase/migrations/20261012_phase475_payment_idempotency.sql`](file:///d:/FILE%20GITHUB/photo.selection/supabase/migrations/20261012_phase475_payment_idempotency.sql) via Supabase Dashboard SQL Editor.
3. **Step 3 (Historical Replay Guard Seeding):** Operator applies the reviewed seed query for Amar and Shotbygusade.
4. **Step 4 (Application Deployment):** User commits and merges the branch `feat/phase-4.7.5-mayar-webhook-hardening` via **GitHub Desktop** to trigger Vercel deployment.
5. **Step 5 (Post-Release Verification):** Monitor `processed_payments` table for new incoming transactions.

---

## 11. Rollback Procedure & Architectural Invariants

The authoritative rollback script is [`supabase/migrations/20261012_phase475_rollback.sql`](file:///d:/FILE%20GITHUB/photo.selection/supabase/migrations/20261012_phase475_rollback.sql).

### Critical Architectural Invariants:
1. **The Ledger Table MUST NOT Be Dropped:**  
   `public.processed_payments` records processed payment IDs. Dropping this table during a rollback deletes all idempotency history. If webhooks are retried while the ledger is dropped, accounts will suffer duplicate extensions.
2. **The Entitlement Table MUST NOT Be Dropped:**  
   `public.pro_entitlements` stores granted PRO add-ons. Dropping this table revokes PRO access from legitimate paying customers.
3. **Execution Scope of Rollback:**
   The rollback script performs only:
   ```sql
   DROP FUNCTION IF EXISTS public.process_mayar_payment(
       TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, TEXT, NUMERIC, TEXT, BOOLEAN, TEXT, TEXT, TEXT
   );
   ```
4. **Backend Fail-Closed Dependency:**  
   When `process_mayar_payment` is dropped, the backend [`api/supabase.js`](file:///d:/FILE%20GITHUB/photo.selection/api/supabase.js#L4165-L4170) fails closed with HTTP 500 when attempting to call the missing RPC. Therefore:
   - **Step 1 of Rollback:** Revert Vercel deployment to the pre-Phase 4.7.5 commit via Vercel Dashboard.
   - **Step 2 of Rollback:** Apply [`supabase/migrations/20261012_phase475_rollback.sql`](file:///d:/FILE%20GITHUB/photo.selection/supabase/migrations/20261012_phase475_rollback.sql) in Supabase SQL Editor.
