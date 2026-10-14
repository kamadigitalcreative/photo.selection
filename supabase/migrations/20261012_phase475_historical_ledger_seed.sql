-- =========================================================================
-- PHOTO SELECTION / KMBC — PHASE 4.7.5 HISTORICAL LEDGER RECONCILIATION
-- Purpose: Non-authoritative, read-only audit candidate enumeration.
-- Safety: READ-ONLY AUDIT FIRST. Zero automatic classification as applied.
-- Execution Policy: This file is a TEMPLATE ONLY. Never run in CI/CD or deployment automation.
-- Operator Sign-Off Required: Must be executed manually by DB operator AFTER audit.
-- =========================================================================

-- -------------------------------------------------------------------------
-- STEP 1: READ-ONLY AUDIT — ENUMERATE NON-AUTHORITATIVE REVIEW CANDIDATES
-- Run this query to inspect legacy mayar_logs before applying any ledger seeds.
--
-- CRITICAL AUDIT RULES:
-- 1. NEVER label any row as 'EVIDENCE_APPLIED' based on narrative free text or email match.
-- 2. Negative/error terms (gagal, ditolak, batal, error, refund, fail) ALWAYS take precedence
--    and are classified as 'FAILED_OR_REJECTED_DO_NOT_SEED'.
-- 3. 'Event = payment.received' is NOT proof of settlement; provider Settled/PAID state must
--    be verified independently in the Mayar Dashboard.
-- 4. Shared-email accounts (e.g. adminps & kamavisual) are explicitly flagged; email matching
--    alone CANNOT identify the target account without verified checkout notes/metadata.
-- 5. Customer emails and payload fragments are masked to prevent secret leakage in audit logs.
-- 6. Historical cutover window covers ALL transactions up to the actual deployment time (NOW()),
--    preventing any silent omission between arbitrary dates and cutover.
-- -------------------------------------------------------------------------
SELECT 
    l.id AS log_id,
    l."Timestamp" AS log_timestamp,
    l."Event" AS log_event,
    -- Mask customer email (e.g. kam***@gmail.com)
    concat(substr(l."Customer Email", 1, 3), '***@', split_part(l."Customer Email", '@', 2)) AS masked_customer_email,
    -- Redact customer name and raw JSON payload completely to prevent PII / secret leakage
    '[REDACTED_CUSTOMER_NAME]' AS customer_name_status,
    l."Status/Product" AS log_product,
    '[REDACTED_RAW_PAYLOAD]' AS payload_status,
    '[REDACTED_NARRATIVE_CLASSIFIED_BELOW]' AS activation_narrative_status,
    -- Check shared-email account count
    (
        SELECT count(*) 
        FROM public.users u 
        WHERE lower(btrim(u."Email")) = lower(btrim(l."Customer Email"))
    ) AS matching_account_count,
    -- Strict, defensive classification hierarchy:
    CASE 
        -- Priority 1: Any negative/error wording is immediately flagged as FAILED/REJECTED
        WHEN l."Hasil Aktivasi" ILIKE '%gagal%' 
          OR l."Hasil Aktivasi" ILIKE '%ditolak%' 
          OR l."Hasil Aktivasi" ILIKE '%batal%' 
          OR l."Hasil Aktivasi" ILIKE '%error%' 
          OR l."Hasil Aktivasi" ILIKE '%refund%' 
          OR l."Hasil Aktivasi" ILIKE '%tolak%'
          OR l."Event" ILIKE '%fail%'
          OR l."Event" ILIKE '%cancel%' THEN 'FAILED_OR_REJECTED_DO_NOT_SEED'
        -- Priority 2: Shared-email accounts cannot be automatically resolved
        WHEN (
            SELECT count(*) 
            FROM public.users u 
            WHERE lower(btrim(u."Email")) = lower(btrim(l."Customer Email"))
        ) > 1 THEN 'AMBIGUOUS_SHARED_EMAIL_MANUAL_REVIEW_REQUIRED'
        -- Priority 3: Non-negative text with positive keywords is only a REVIEW CANDIDATE (never authoritative)
        WHEN l."Hasil Aktivasi" ILIKE '%sukses%' 
          OR l."Hasil Aktivasi" ILIKE '%berhasil%' 
          OR l."Hasil Aktivasi" ILIKE '%perpanjangan%' THEN 'REVIEW_CANDIDATE_REQUIRES_OPERATOR_VERIFICATION'
        ELSE 'UNRESOLVED_NEEDS_OPERATOR_REVIEW'
    END AS audit_review_status
FROM public.mayar_logs l
WHERE l."Timestamp" <= NOW() -- Dynamic cutover covers all legacy logs up to current deployment time
ORDER BY l."Timestamp" ASC;

-- -------------------------------------------------------------------------
-- STEP 2: AUDIT OF SETTLED BUT POTENTIALLY UNAPPLIED TRANSACTIONS
-- Identifies transactions where payment was received but activation was NOT confirmed.
-- CRITICAL: DO NOT mark these as HISTORICAL_SETTLED. Hold for manual customer support!
-- -------------------------------------------------------------------------
SELECT 
    l.id AS log_id,
    l."Timestamp" AS log_timestamp,
    concat(substr(l."Customer Email", 1, 3), '***@', split_part(l."Customer Email", '@', 2)) AS masked_customer_email,
    l."Status/Product" AS log_product,
    '[REDACTED_NARRATIVE_CLASSIFIED_BELOW]' AS activation_narrative_status,
    'UNAPPLIED_OR_SUSPECT_HOLD_FOR_SUPPORT' AS recommended_action
FROM public.mayar_logs l
WHERE l."Event" = 'payment.received'
  AND (
      l."Hasil Aktivasi" ILIKE '%gagal%' 
      OR l."Hasil Aktivasi" ILIKE '%ditolak%' 
      OR l."Hasil Aktivasi" ILIKE '%error%'
      OR NOT (
          l."Hasil Aktivasi" ILIKE '%sukses%' 
          OR l."Hasil Aktivasi" ILIKE '%berhasil%' 
          OR l."Hasil Aktivasi" ILIKE '%perpanjangan%'
      )
  )
ORDER BY l."Timestamp" ASC;

-- -------------------------------------------------------------------------
-- STEP 3: IDEMPOTENT LEDGER SEEDING TEMPLATE (OPERATOR MANUAL EXECUTION ONLY)
-- Instructions for Operator:
-- 1. Operator independently executes Step 1 and Step 2 queries.
-- 2. Operator checks Mayar Dashboard for the exact immutable transaction ID,
--    verifies provider Settled/PAID status, confirmed product, and settlement amount.
-- 3. Operator inspects user's actual past expiration date to prove entitlement was applied.
-- 4. Replace placeholder strings below ONLY for verified, settled AND applied transactions.
-- 5. Execute inside a manual transaction with operator review.
-- -------------------------------------------------------------------------
/*
BEGIN;

INSERT INTO public.processed_payments (
    payment_id,
    customer_email,
    product_name,
    plan_name,
    amount,
    currency,
    status,
    activation_result,
    created_at,
    processed_at
) VALUES 
    (
        'REPLACE_WITH_OPERATOR_VERIFIED_HISTORICAL_TX_ID_1',
        'operator_verified_customer_1@example.com',
        'Paket 1 Bulan - Photo Selection',
        '1 Bulan',
        25000,
        'IDR',
        'HISTORICAL_SETTLED',
        'OPERATOR_AUDITED_HISTORICAL_SETTLED_PAYMENT_1',
        NOW(),
        NOW()
    )
    -- Add additional independently verified historical transactions here
ON CONFLICT (payment_id) DO NOTHING;

-- Verification assertion: ensure seeded rows have terminal status
SELECT payment_id, status, customer_email, activation_result 
FROM public.processed_payments 
WHERE status = 'HISTORICAL_SETTLED';

COMMIT;
*/
