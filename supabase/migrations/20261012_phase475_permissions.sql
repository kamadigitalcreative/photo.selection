-- =========================================================================
-- PHOTO SELECTION / KMBC — PHASE 4.7.5 PERMISSIONS VERIFICATION (READ-ONLY)
-- Purpose: Audit database privileges to guarantee least-privilege compliance
-- Invariants:
--  - anon and authenticated CANNOT invoke process_mayar_payment
--  - anon and authenticated CANNOT query processed_payments table
--  - service_role HAS EXECUTE privilege on process_mayar_payment
-- =========================================================================

-- 1. Check Function Execute Permissions
SELECT 
    p.proname AS function_name,
    r.rolname AS grantee,
    has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
CROSS JOIN pg_roles r
WHERE p.proname = 'process_mayar_payment'
  AND r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
ORDER BY r.rolname;

-- 2. Check Table Access Permissions on processed_payments
SELECT 
    table_name,
    grantee,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'processed_payments'
  AND grantee IN ('anon', 'authenticated', 'public')
ORDER BY grantee, privilege_type;

-- 3. Check RLS Policies on processed_payments
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'processed_payments';
