-- =========================================================================
-- PHOTO SELECTION / KMBC — PHASE 4.7.5 MIGRATION VERIFICATION (READ-ONLY)
-- Purpose: Verify that the ledger table, indexes, RLS, and RPC function exist and match expected definitions
-- =========================================================================

-- 1. Verify processed_payments table existence and primary key
SELECT 
    t.table_name,
    kcu.column_name AS primary_key_column
FROM information_schema.tables t
LEFT JOIN information_schema.table_constraints tc 
    ON t.table_name = tc.table_name AND tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
LEFT JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = 'public'
WHERE t.table_schema = 'public' AND t.table_name = 'processed_payments';

-- 2. Verify all columns of processed_payments
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'processed_payments'
ORDER BY ordinal_position;

-- 3. Verify RPC function existence, return type, and security definition
SELECT 
    p.proname AS function_name,
    pg_get_function_result(p.oid) AS return_type,
    pg_get_function_arguments(p.oid) AS argument_signature,
    p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'process_mayar_payment';

-- 4. Verify Row Level Security (RLS) is enabled
SELECT 
    relname AS table_name,
    relrowsecurity AS rls_enabled,
    relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname IN ('processed_payments', 'pro_entitlements');

-- 5. Verify pro_entitlements table existence and primary key
SELECT 
    t.table_name,
    kcu.column_name AS primary_key_column
FROM information_schema.tables t
LEFT JOIN information_schema.table_constraints tc 
    ON t.table_name = tc.table_name AND tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
LEFT JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = 'public'
WHERE t.table_schema = 'public' AND t.table_name = 'pro_entitlements';

-- 6. Verify all columns of pro_entitlements
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pro_entitlements'
ORDER BY ordinal_position;
