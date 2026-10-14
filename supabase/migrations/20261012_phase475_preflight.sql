-- =========================================================================
-- PHOTO SELECTION / KMBC — PHASE 4.7.5 PREFLIGHT INSPECTION (READ-ONLY)
-- Purpose: Inspect database schema, check table existence and user data
-- Safety: 100% READ-ONLY. Contains zero mutation or schema alteration statements.
-- =========================================================================

-- 1. Database version and connection info
SELECT version() AS postgres_version, current_database() AS database_name, current_user AS connected_role;

-- 2. Check if target ledger table already exists
SELECT 
    table_schema, 
    table_name, 
    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'processed_payments') AS column_count
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'processed_payments';

-- 3. Check existing users table schema and key columns
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- 4. Check for duplicate emails or usernames in existing users table
-- (Crucial preflight: verify data integrity before relying on email lookups)
SELECT 
    lower("Email") AS normalized_email, 
    count(*) AS occurrence_count
FROM public.users
WHERE "Email" IS NOT NULL AND btrim("Email") <> ''
GROUP BY lower("Email")
HAVING count(*) > 1;

SELECT 
    lower("Username") AS normalized_username, 
    count(*) AS occurrence_count
FROM public.users
WHERE "Username" IS NOT NULL AND btrim("Username") <> ''
GROUP BY lower("Username")
HAVING count(*) > 1;

-- 5. Inspect existing mayar_logs table structure and row count
SELECT count(*) AS total_legacy_mayar_logs FROM public.mayar_logs;

-- 6. Current database storage breakdown (Free Plan quota tracking)
SELECT 
    relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_size_pretty(pg_relation_size(relid)) AS data_size,
    pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- 7. Check if pro_entitlements table already exists
SELECT 
    table_schema, 
    table_name, 
    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pro_entitlements') AS column_count
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'pro_entitlements';

-- 8. READ-ONLY PREVIEW: Candidate legacy users eligible for PRO grandfather snapshot
-- Expected row count: UNKNOWN (pending actual execution in Production)
SELECT 
    u.id,
    u."Username",
    u."Email",
    u."Role",
    u."Paket",
    u."ExpiredAt",
    u."Akses_Watermark",
    CASE 
        WHEN upper(COALESCE(u."Paket", '')) LIKE '%LIFETIME%' OR COALESCE(u."ExpiredAt", '') = 'Lifetime' THEN 'LIFETIME'
        ELSE 'FINITE'
    END AS prospective_grant_type
FROM public.users u
WHERE u."Role" <> 'Admin'
  AND (
      upper(COALESCE(u."Akses_Watermark", '')) = 'TRUE'
      OR upper(COALESCE(u."Paket", '')) LIKE '%PRO%'
      OR upper(COALESCE(u."Paket", '')) LIKE '%LIFETIME%'
  );
