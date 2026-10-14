-- =========================================================================
-- PHOTO SELECTION / KMBC — PHASE 4.7.5 RELEASE PREFLIGHT (100% READ-ONLY)
-- File: test/phase475_release_preflight_READ_ONLY.sql
--
-- PURPOSE:
--   Diagnostic, non-mutating preflight queries for the database operator to
--   inspect Production database state, verify schema prerequisites, audit RLS,
--   identify shared-email accounts, and review historical log candidates.
--
-- SAFETY CONTRACT (NON-NEGOTIABLE):
--   1. 100% READ-ONLY: Contains ONLY SELECT statements.
--   2. ZERO DDL/DML: No INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, TRUNCATE,
--      GRANT, REVOKE, DO, CALL, or EXECUTE statements.
--   3. SAFE ON UNMIGRATED SCHEMA: Uses information_schema / pg_catalog for
--      conditional table existence checks so queries never error if Phase 4.7.5
--      tables do not exist yet.
--   4. RESILIENT TO MALFORMED DATA: Candidate ID extraction uses regex string
--      matching on TEXT without type-casting to ::jsonb, preventing fatal syntax
--      errors on malformed JSON payload records.
--   5. PRIVACY & SENSITIVITY: Passwords, raw payloads, and customer PII are
--      masked or omitted. Output containing internal row UUIDs or provider IDs
--      is marked for internal operator inspection only.
-- =========================================================================

-- -------------------------------------------------------------------------
-- SECTION 1: DATABASE ENGINE & CONNECTION IDENTITY
-- Operator check: Confirm connected to expected database and host.
-- -------------------------------------------------------------------------
SELECT 
    current_database() AS database_name,
    current_user AS connected_role,
    inet_server_addr() AS server_address,
    version() AS postgres_version;

-- -------------------------------------------------------------------------
-- SECTION 2: PHASE 4.7.5 OBJECT EXISTENCE & RLS STATUS AUDIT
-- Expected Pre-Release:
--   users: exists = true, rls_enabled = true
--   mayar_logs: exists = true, rls_enabled = false (CRITICAL RISK to check in Section 5)
--   processed_payments: exists = false (will be created by migration)
--   pro_entitlements: exists = false (will be created by migration)
-- -------------------------------------------------------------------------
SELECT 
    t.table_name,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t.table_name) AS table_exists,
    COALESCE(c.column_count, 0) AS column_count,
    COALESCE(p.has_rls, false) AS rls_enabled
FROM (
    VALUES 
        ('users'),
        ('mayar_logs'),
        ('processed_payments'),
        ('pro_entitlements')
) AS t(table_name)
LEFT JOIN (
    SELECT table_name, count(*) AS column_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
    GROUP BY table_name
) c ON c.table_name = t.table_name
LEFT JOIN (
    SELECT tablename AS table_name, rowsecurity AS has_rls
    FROM pg_tables
    WHERE schemaname = 'public'
) p ON p.table_name = t.table_name
ORDER BY t.table_name;

-- -------------------------------------------------------------------------
-- SECTION 3: CORE COLUMN SCHEMA VERIFICATION (public.users)
-- Operator check: Verify all 24 production columns exist and types match.
-- Key columns: Username (nullable, unique), Role, Status, Paket, ExpiredAt,
-- Akses_Watermark, ConfirmToken, ProjectCreated.
-- -------------------------------------------------------------------------
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- -------------------------------------------------------------------------
-- SECTION 4: DUAL-COLUMN STRUCTURE AUDIT (public.mayar_logs)
-- Operator check: Detect whether production table uses columns with spaces
-- ("Customer Email", "Raw JSON Payload") or without spaces ("CustomerEmail").
-- ATTENTION: Check the result of this query before running Sections 9-11!
-- -------------------------------------------------------------------------
SELECT 
    column_name,
    data_type,
    is_nullable,
    CASE 
        WHEN column_name IN ('Customer Email', 'Customer Name', 'Status/Product', 'Hasil Aktivasi', 'Raw JSON Payload', 'ID') THEN 'SPACED_LEGACY_STYLE'
        WHEN column_name IN ('CustomerEmail', 'CustomerName', 'StatusProduct', 'HasilAktivasi', 'RawPayload') THEN 'UNSPACED_STYLE'
        WHEN column_name = 'id' THEN 'ROW_UUID_NOT_TRANSACTION_ID'
        ELSE 'METADATA_COLUMN'
    END AS column_family
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'mayar_logs'
ORDER BY ordinal_position;

-- -------------------------------------------------------------------------
-- SECTION 5: SECURITY AUDIT — EFFECTIVE PERMISSIONS & RLS ON public.mayar_logs
-- CRITICAL SECURITY AUDIT:
-- Checks both pg_class.relrowsecurity AND effective privileges via has_table_privilege().
-- RISK: If rls_enabled = FALSE and anon_has_select = TRUE, any unauthenticated visitor
-- can read raw webhook logs via Supabase PostgREST API (https://<project>.supabase.co/rest/v1/mayar_logs).
-- -------------------------------------------------------------------------
SELECT 
    'public.mayar_logs' AS inspected_table,
    COALESCE(c.relrowsecurity, false) AS rls_enabled,
    COALESCE(c.relforcerowsecurity, false) AS rls_forced,
    has_table_privilege('anon', 'public.mayar_logs', 'SELECT') AS anon_has_select_privilege,
    has_table_privilege('authenticated', 'public.mayar_logs', 'SELECT') AS authenticated_has_select_privilege,
    has_table_privilege('anon', 'public.mayar_logs', 'INSERT') AS anon_has_insert_privilege,
    has_table_privilege('authenticated', 'public.mayar_logs', 'INSERT') AS authenticated_has_insert_privilege
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'mayar_logs';

-- Detailed explicit role grants on mayar_logs
SELECT 
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
  AND table_name = 'mayar_logs'
  AND grantee IN ('anon', 'authenticated', 'public')
ORDER BY grantee, privilege_type;

-- -------------------------------------------------------------------------
-- SECTION 6: NORMALIZED EMAIL DUPLICATION AUDIT (ANONYMIZED)
-- Operator check: Identifies legitimate shared-email accounts like
-- adminps (Admin Lifetime) and kamavisual (Photographer Lifetime).
-- Expected result:
--   Shared email accounts are legitimate and MUST NOT be merged, deleted,
--   or forced into a global UNIQUE constraint.
-- -------------------------------------------------------------------------
SELECT 
    concat(substr(lower("Email"), 1, 2), '***@', split_part(lower("Email"), '@', 2)) AS masked_email_domain,
    count(*) AS shared_account_count,
    string_agg(concat("Role", ':', "Status"), ', ') AS account_roles_and_statuses
FROM public.users
WHERE "Email" IS NOT NULL AND btrim("Email") <> ''
GROUP BY lower(btrim("Email"))
HAVING count(*) > 1;

-- -------------------------------------------------------------------------
-- SECTION 7: USERNAME DUPLICATION AUDIT (MUST BE ZERO)
-- Operator check: Verifies Username uniqueness invariant.
-- Expected result: 0 rows returned.
-- -------------------------------------------------------------------------
SELECT 
    lower(btrim("Username")) AS normalized_username,
    count(*) AS occurrence_count
FROM public.users
WHERE "Username" IS NOT NULL AND btrim("Username") <> ''
GROUP BY lower(btrim("Username"))
HAVING count(*) > 1;

-- -------------------------------------------------------------------------
-- SECTION 8: PRO GRANDFATHER CANDIDATE AUDIT (ACTIVE ONLY, NON-ADMIN)
-- Operator check: Preview which users qualify for legacy pro_entitlements grant.
-- CRITICAL PHASE 4.7.5 FILTER:
--   Must require: u."Role" <> 'Admin' AND u."Status" = 'Active'.
--   Pending, expired, or non-active users MUST NOT be granted perpetual PRO.
-- Output: Masked usernames and prospective grant types (LIFETIME vs FINITE).
-- -------------------------------------------------------------------------
SELECT 
    u.id AS user_uuid,
    concat(substr(u."Username", 1, 3), '***') AS masked_username,
    concat(substr(COALESCE(u."Email", ''), 1, 2), '***@', split_part(COALESCE(u."Email", ''), '@', 2)) AS masked_email,
    u."Role",
    u."Status",
    u."Paket",
    CASE 
        WHEN upper(COALESCE(u."Paket", '')) LIKE '%LIFETIME%' OR COALESCE(u."ExpiredAt", '') = 'Lifetime' THEN 'LIFETIME'
        ELSE 'FINITE'
    END AS prospective_pro_grant_type,
    COALESCE(u."Akses_Watermark", 'FALSE') AS has_watermark_flag
FROM public.users u
WHERE u."Role" <> 'Admin'
  AND u."Status" = 'Active'
  AND (
      upper(COALESCE(u."Akses_Watermark", '')) = 'TRUE'
      OR upper(COALESCE(u."Paket", '')) LIKE '%PRO%'
      OR upper(COALESCE(u."Paket", '')) LIKE '%LIFETIME%'
  )
ORDER BY u."Status", u."Role";

-- -------------------------------------------------------------------------
-- SECTION 9: AGGREGATE EVENT & PRODUCT BREAKDOWN IN mayar_logs
-- Operator check: Understand volume and types of historical webhooks.
-- Anonymized: Aggregates counts by Event and Product string.
-- -------------------------------------------------------------------------
-- Variant A: Spaced Column Names (default legacy production schema)
SELECT 
    COALESCE(l."Event", '[NULL_EVENT]') AS event_name,
    COALESCE(l."Status/Product", '[NULL_PRODUCT]') AS product_name,
    count(*) AS total_log_records,
    min(l."Timestamp") AS earliest_log_timestamp,
    max(l."Timestamp") AS latest_log_timestamp
FROM public.mayar_logs l
GROUP BY 
    COALESCE(l."Event", '[NULL_EVENT]'),
    COALESCE(l."Status/Product", '[NULL_PRODUCT]')
ORDER BY count(*) DESC;

-- Variant B: Unspaced Column Names (run ONLY if Section 4 showed unspaced names)
-- SELECT 
--     COALESCE(l."Event", '[NULL_EVENT]') AS event_name,
--     COALESCE(l."StatusProduct", '[NULL_PRODUCT]') AS product_name,
--     count(*) AS total_log_records,
--     min(l."Timestamp") AS earliest_log_timestamp,
--     max(l."Timestamp") AS latest_log_timestamp
-- FROM public.mayar_logs l
-- GROUP BY 
--     COALESCE(l."Event", '[NULL_EVENT]'),
--     COALESCE(l."StatusProduct", '[NULL_PRODUCT]')
-- ORDER BY count(*) DESC;

-- -------------------------------------------------------------------------
-- SECTION 10: CANDIDATE PROVIDER TRANSACTION ID EXTRACTION (SELECT-ONLY)
-- SENSITIVITY NOTICE:
--   OPERATOR INTERNAL USE ONLY. OUTPUT CONTAINS LOG UUIDs AND CANDIDATE PROVIDER IDs.
--   NOT SAFE TO SHARE UNCENSORED WITH THIRD PARTIES.
--
-- ROBUSTNESS & MALFORMED DATA CONTRACT:
--   1. NEVER casts payload to ::jsonb! Uses POSIX regex string matching on TEXT.
--      This guarantees zero fatal syntax aborts if records contain malformed JSON ('{broken').
--   2. Checks payload keys in priority order:
--      data.id -> data.paymentId -> data.transactionId -> data.invoiceId -> root id.
--   3. NEVER treats log row UUID ('id') as a payment ID.
-- -------------------------------------------------------------------------
-- Variant A: Spaced Column Names (default legacy production schema)
SELECT 
    l.id AS log_row_uuid, -- Log internal row UUID (NOT Mayar transaction ID)
    l."Timestamp" AS log_timestamp,
    l."Event" AS log_event,
    concat(substr(COALESCE(l."Customer Email", ''), 1, 2), '***@', split_part(COALESCE(l."Customer Email", ''), '@', 2)) AS masked_email,
    COALESCE(l."Status/Product", 'Unknown') AS product_name,
    -- Robust pure-text regex extraction (NEVER fails on malformed JSON):
    COALESCE(
        -- 1. Check nested data.id
        substring(l."Raw JSON Payload" FROM '"data"[^{}]*"id"\s*:\s*"([^"]+)"'),
        -- 2. Check nested data.paymentId
        substring(l."Raw JSON Payload" FROM '"data"[^{}]*"paymentId"\s*:\s*"([^"]+)"'),
        -- 3. Check nested data.transactionId
        substring(l."Raw JSON Payload" FROM '"data"[^{}]*"transactionId"\s*:\s*"([^"]+)"'),
        -- 4. Check nested data.invoiceId
        substring(l."Raw JSON Payload" FROM '"data"[^{}]*"invoiceId"\s*:\s*"([^"]+)"'),
        -- 5. Check root id (e.g. {"id":"..."})
        substring(l."Raw JSON Payload" FROM '"id"\s*:\s*"([^"]+)"'),
        '[NO_TRANSACTION_ID_FOUND_IN_TEXT]'
    ) AS candidate_provider_transaction_id,
    CASE 
        WHEN COALESCE(
            substring(l."Raw JSON Payload" FROM '"data"[^{}]*"id"\s*:\s*"([^"]+)"'),
            substring(l."Raw JSON Payload" FROM '"data"[^{}]*"paymentId"\s*:\s*"([^"]+)"'),
            substring(l."Raw JSON Payload" FROM '"data"[^{}]*"transactionId"\s*:\s*"([^"]+)"'),
            substring(l."Raw JSON Payload" FROM '"data"[^{}]*"invoiceId"\s*:\s*"([^"]+)"'),
            substring(l."Raw JSON Payload" FROM '"id"\s*:\s*"([^"]+)"')
        ) IS NOT NULL THEN 'EXTRACTED_VIA_REGEX_NEEDS_PROVIDER_DASHBOARD_MATCH'
        ELSE 'UNVERIFIED_MISSING_OR_MALFORMED_PAYLOAD'
    END AS extraction_confidence_status
FROM public.mayar_logs l
WHERE l."Event" = 'payment.received'
ORDER BY l."Timestamp" ASC;

-- Variant B: Unspaced Column Names (run ONLY if Section 4 showed unspaced names)
-- SELECT 
--     l.id AS log_row_uuid,
--     l."Timestamp" AS log_timestamp,
--     l."Event" AS log_event,
--     concat(substr(COALESCE(l."CustomerEmail", ''), 1, 2), '***@', split_part(COALESCE(l."CustomerEmail", ''), '@', 2)) AS masked_email,
--     COALESCE(l."StatusProduct", 'Unknown') AS product_name,
--     COALESCE(
--         substring(l."RawPayload" FROM '"data"[^{}]*"id"\s*:\s*"([^"]+)"'),
--         substring(l."RawPayload" FROM '"data"[^{}]*"paymentId"\s*:\s*"([^"]+)"'),
--         substring(l."RawPayload" FROM '"data"[^{}]*"transactionId"\s*:\s*"([^"]+)"'),
--         substring(l."RawPayload" FROM '"data"[^{}]*"invoiceId"\s*:\s*"([^"]+)"'),
--         substring(l."RawPayload" FROM '"id"\s*:\s*"([^"]+)"'),
--         '[NO_TRANSACTION_ID_FOUND_IN_TEXT]'
--     ) AS candidate_provider_transaction_id,
--     CASE 
--         WHEN COALESCE(
--             substring(l."RawPayload" FROM '"data"[^{}]*"id"\s*:\s*"([^"]+)"'),
--             substring(l."RawPayload" FROM '"data"[^{}]*"paymentId"\s*:\s*"([^"]+)"'),
--             substring(l."RawPayload" FROM '"data"[^{}]*"transactionId"\s*:\s*"([^"]+)"'),
--             substring(l."RawPayload" FROM '"data"[^{}]*"invoiceId"\s*:\s*"([^"]+)"'),
--             substring(l."RawPayload" FROM '"id"\s*:\s*"([^"]+)"')
--         ) IS NOT NULL THEN 'EXTRACTED_VIA_REGEX_NEEDS_PROVIDER_DASHBOARD_MATCH'
--         ELSE 'UNVERIFIED_MISSING_OR_MALFORMED_PAYLOAD'
--     END AS extraction_confidence_status
-- FROM public.mayar_logs l
-- WHERE l."Event" = 'payment.received'
-- ORDER BY l."Timestamp" ASC;

-- -------------------------------------------------------------------------
-- SECTION 11: SPECIFIC HISTORICAL CASES AUDIT (OPERATOR INTERNAL USE ONLY)
-- Context: Two known paying customers (Amar, Shotbygusade) had manual extensions
-- confirmed by owner and MUST NOT receive an additional 30 days.
-- Other historical entries (e.g. Ayu Nely) require operator verification.
-- Operator check:
--   Lists entries matching operational search terms without revealing secrets.
--   Shows narrative detection status. Proves narrative text ('sukses', 'berhasil')
--   does NOT automatically confer settled status.
-- -------------------------------------------------------------------------
-- Variant A: Spaced Column Names (default legacy production schema)
SELECT 
    l.id AS log_row_uuid,
    l."Timestamp" AS log_timestamp,
    l."Event" AS event_name,
    concat(substr(COALESCE(l."Customer Email", ''), 1, 2), '***@', split_part(COALESCE(l."Customer Email", ''), '@', 2)) AS masked_email,
    COALESCE(l."Status/Product", '') AS product_name,
    CASE 
        WHEN COALESCE(l."Customer Name", '') ILIKE '%amar%' THEN 'KNOWN_CUSTOMER_AMAR_MANUAL_EXT_CONFIRMED'
        WHEN COALESCE(l."Customer Name", '') ILIKE '%shotbygusade%' OR COALESCE(l."Customer Name", '') ILIKE '%gusade%' THEN 'KNOWN_CUSTOMER_SHOTBYGUSADE_MANUAL_EXT_CONFIRMED'
        WHEN COALESCE(l."Customer Name", '') ILIKE '%ayu%' OR COALESCE(l."Customer Name", '') ILIKE '%nely%' THEN 'POTENTIAL_HISTORICAL_AYU_NELY_UNVERIFIED'
        ELSE 'OTHER_TRANSACTION'
    END AS anonymized_customer_tag,
    CASE 
        WHEN COALESCE(l."Hasil Aktivasi", '') ILIKE '%gagal%' THEN 'CONTAINS_GAGAL_KEYWORD'
        WHEN COALESCE(l."Hasil Aktivasi", '') ILIKE '%sukses%' THEN 'CONTAINS_SUKSES_KEYWORD'
        WHEN COALESCE(l."Hasil Aktivasi", '') ILIKE '%berhasil%' THEN 'CONTAINS_BERHASIL_KEYWORD'
        WHEN COALESCE(l."Hasil Aktivasi", '') ILIKE '%perpanjangan%' THEN 'CONTAINS_PERPANJANGAN_KEYWORD'
        ELSE 'NO_STATUS_KEYWORDS_DETECTED'
    END AS narrative_keyword_detection,
    'DO_NOT_AUTO_GRANT_DO_NOT_AUTO_SEED_HOLD_FOR_OPERATOR_SIGN_OFF' AS policy_instruction
FROM public.mayar_logs l
WHERE (
    COALESCE(l."Customer Name", '') ILIKE '%amar%'
    OR COALESCE(l."Customer Name", '') ILIKE '%gusade%'
    OR COALESCE(l."Customer Name", '') ILIKE '%ayu%'
    OR COALESCE(l."Customer Name", '') ILIKE '%nely%'
)
ORDER BY l."Timestamp" ASC;

-- Variant B: Unspaced Column Names (run ONLY if Section 4 showed unspaced names)
-- SELECT 
--     l.id AS log_row_uuid,
--     l."Timestamp" AS log_timestamp,
--     l."Event" AS event_name,
--     concat(substr(COALESCE(l."CustomerEmail", ''), 1, 2), '***@', split_part(COALESCE(l."CustomerEmail", ''), '@', 2)) AS masked_email,
--     COALESCE(l."StatusProduct", '') AS product_name,
--     CASE 
--         WHEN COALESCE(l."CustomerName", '') ILIKE '%amar%' THEN 'KNOWN_CUSTOMER_AMAR_MANUAL_EXT_CONFIRMED'
--         WHEN COALESCE(l."CustomerName", '') ILIKE '%shotbygusade%' OR COALESCE(l."CustomerName", '') ILIKE '%gusade%' THEN 'KNOWN_CUSTOMER_SHOTBYGUSADE_MANUAL_EXT_CONFIRMED'
--         WHEN COALESCE(l."CustomerName", '') ILIKE '%ayu%' OR COALESCE(l."CustomerName", '') ILIKE '%nely%' THEN 'POTENTIAL_HISTORICAL_AYU_NELY_UNVERIFIED'
--         ELSE 'OTHER_TRANSACTION'
--     END AS anonymized_customer_tag,
--     CASE 
--         WHEN COALESCE(l."HasilAktivasi", '') ILIKE '%gagal%' THEN 'CONTAINS_GAGAL_KEYWORD'
--         WHEN COALESCE(l."HasilAktivasi", '') ILIKE '%sukses%' THEN 'CONTAINS_SUKSES_KEYWORD'
--         WHEN COALESCE(l."HasilAktivasi", '') ILIKE '%berhasil%' THEN 'CONTAINS_BERHASIL_KEYWORD'
--         WHEN COALESCE(l."HasilAktivasi", '') ILIKE '%perpanjangan%' THEN 'CONTAINS_PERPANJANGAN_KEYWORD'
--         ELSE 'NO_STATUS_KEYWORDS_DETECTED'
--     END AS narrative_keyword_detection,
--     'DO_NOT_AUTO_GRANT_DO_NOT_AUTO_SEED_HOLD_FOR_OPERATOR_SIGN_OFF' AS policy_instruction
-- FROM public.mayar_logs l
-- WHERE (
--     COALESCE(l."CustomerName", '') ILIKE '%amar%'
--     OR COALESCE(l."CustomerName", '') ILIKE '%gusade%'
--     OR COALESCE(l."CustomerName", '') ILIKE '%ayu%'
--     OR COALESCE(l."CustomerName", '') ILIKE '%nely%'
-- )
-- ORDER BY l."Timestamp" ASC;

-- =========================================================================
-- END OF READ-ONLY PREFLIGHT SCRIPT
-- =========================================================================
