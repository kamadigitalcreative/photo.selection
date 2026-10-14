-- =========================================================================
-- PHOTO SELECTION / KMBC — PHASE 4.7.5 NON-DESTRUCTIVE ROLLBACK MIGRATION
-- Purpose: Safely disable Phase 4.7.5 RPC without destroying payment ledger
-- Safety: PRESERVES public.processed_payments to prevent duplicate payment replays
-- =========================================================================

-- IMPORTANT OPERATIONAL NOTICE:
-- The payment ledger (public.processed_payments) MUST NOT be dropped during a
-- routine rollback. Dropping the table destroys recorded transaction IDs and
-- would expose the system to double-activation replays from Mayar.

-- 1. Safely Revoke and Drop the RPC Function
-- Dropping the RPC function causes backend callers to fail-closed safely (HTTP 500)
-- without executing unverified or non-atomic mutations.
DROP FUNCTION IF EXISTS public.process_mayar_payment(
    TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, TEXT, NUMERIC, TEXT, BOOLEAN, TEXT, TEXT, TEXT
);

-- 2. Ledger and Entitlement Table Preservation
-- The tables public.processed_payments and public.pro_entitlements are intentionally PRESERVED.
-- Verify that existing payment settlement records and PRO entitlements remain intact:
-- SELECT payment_id, customer_email, status, created_at FROM public.processed_payments;
-- SELECT user_id, is_lifetime, expires_at, source FROM public.pro_entitlements;

-- 3. Operational Dependency Sequence Notice:
-- IMPORTANT: Backend api/supabase.js strictly fails closed (HTTP 500) if process_mayar_payment is missing.
-- Before dropping the RPC function in production, ensure the backend deployment has been reverted
-- or paused to prevent webhook retries from failing with 500 errors.

-- 4. In the event of emergency manual reconciliation:
-- Unprocessed transactions can be queried with:
-- SELECT * FROM public.processed_payments WHERE status IN ('PROCESSING', 'MANUAL_RECONCILIATION_REQUIRED');
