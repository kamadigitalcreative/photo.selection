\set ON_ERROR_STOP on

-- =========================================================================
-- PHOTO SELECTION / KMBC — PHASE 4.7.5 CONCURRENCY HARNESS SETUP
-- Purpose: Prepares persistent synthetic tables in the dedicated disposable database
--          (kmbc_disposable_test) for independent two-terminal concurrent process verification.
--
-- Safety Invariants:
-- 1. NO DROP TABLE CASCADE permitted. If public.users already exists, execution ABORTS.
-- 2. Strictly restricted to localhost (127.0.0.1 / ::1 / local socket).
-- 3. Database name must match EXACT expected disposable name: kmbc_disposable_test.
-- 4. Provisions required Supabase compatibility roles (anon, authenticated, service_role).
-- 5. Uses real production migration verbatim (\i .../20261012_phase475_payment_idempotency.sql).
-- =========================================================================

-- Safety Guard: Ensure this is executed ONLY against the exact disposable local test database!
DO $$
DECLARE
    v_server_ip INET;
    v_db_name TEXT := current_database();
BEGIN
    -- 1. Exact Database Name Guard
    IF v_db_name <> 'kmbc_disposable_test' THEN
        RAISE EXCEPTION 'SAFETY HALT: concurrency-setup must run ONLY on database "kmbc_disposable_test". Current DB: "%"', v_db_name;
    END IF;

    -- 2. Localhost-only check
    v_server_ip := inet_server_addr();
    IF v_server_ip IS NOT NULL AND v_server_ip NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
        RAISE EXCEPTION 'SAFETY HALT: Connection is not to localhost! Detected server address: %', v_server_ip;
    END IF;

    -- 3. Fail if public.users already exists (no DROP TABLE allowed)
    IF to_regclass('public.users') IS NOT NULL THEN
        RAISE EXCEPTION 'SAFETY HALT: Table "public.users" already exists in "%". Concurrency harness requires a fresh, empty disposable database.', v_db_name;
    END IF;

    -- 4. Fail if application objects already exist
    IF to_regclass('public.processed_payments') IS NOT NULL OR 
       to_regclass('public.pro_entitlements') IS NOT NULL OR 
       to_regproc('public.process_mayar_payment') IS NOT NULL THEN
        RAISE EXCEPTION 'SAFETY HALT: Application objects already exist in "%". Disposable database must be clean.', v_db_name;
    END IF;
END $$;

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------------------------------------------------------
-- Provision Supabase Compatibility Roles (NOLOGIN)
-- Required by production migration RLS policies (anon, authenticated) and GRANT (service_role)
-- -------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
    END IF;
END $$;

-- -------------------------------------------------------------------------
-- 1. Synthetic 24-Column Users Schema (Mirroring Production public.users)
-- -------------------------------------------------------------------------
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Username" TEXT UNIQUE,
    "Password" TEXT,
    "Nama" TEXT,
    "Role" TEXT DEFAULT 'Photographer',
    "Status" TEXT DEFAULT 'Active',
    "Email" TEXT,
    "No HP" TEXT,
    "Paket" TEXT,
    "ExpiredAt" TEXT,
    "Akses_Watermark" TEXT DEFAULT 'FALSE',
    "Akses_Upsell" TEXT DEFAULT 'TRUE',
    "Akses_Grid" TEXT DEFAULT 'TRUE',
    "Akses_Kategori" TEXT DEFAULT 'TRUE',
    "BrandName" TEXT,
    "BrandLogo" TEXT,
    "WatermarkUrl" TEXT,
    "BankName" TEXT,
    "BankAccount" TEXT,
    "BankAccountName" TEXT,
    "LastActive" TEXT,
    "ConfirmToken" TEXT,
    "ProjectCreated" TEXT DEFAULT '0',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 2. Synthetic Seed Fixtures
-- -------------------------------------------------------------------------
INSERT INTO public.users (id, "Username", "Email", "Role", "Status", "Paket", "ExpiredAt", "Akses_Watermark", "ConfirmToken", "ProjectCreated")
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'adminps', 'kama@shared.test', 'Admin', 'Active', 'Lifetime', 'Lifetime', 'TRUE', 'CONF_ADMIN', '0'),
    ('22222222-2222-2222-2222-222222222222', 'kamavisual', 'kama@shared.test', 'Photographer', 'Active', 'Lifetime', 'Lifetime', 'TRUE', 'CONF_KAMA', '0'),
    ('66666666-6666-6666-6666-666666666666', 'unique_admin', 'admin@unique.test', 'Admin', 'Active', 'Lifetime', 'Lifetime', 'TRUE', 'CONF_UADMIN', '0'),
    ('55555555-5555-5555-5555-555555555555', 'solo_photographer', 'solo@user.test', 'Photographer', 'Active', '1 Bulan', '2026-11-01', 'FALSE', 'CONF_SOLO', '0')
ON CONFLICT ("Username") DO NOTHING;

-- -------------------------------------------------------------------------
-- 3. Load Production Migration Verbatim into Disposable Database
-- -------------------------------------------------------------------------
\i supabase/migrations/20261012_phase475_payment_idempotency.sql

-- -------------------------------------------------------------------------
-- 4. Concurrency Synchronization Barrier Table
-- -------------------------------------------------------------------------
CREATE TABLE public._concurrency_barrier (
    step TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public._concurrency_barrier (step, status) VALUES 
    ('scenario_a', 'INITIAL'),
    ('scenario_b', 'INITIAL');

COMMIT;

-- Verify setup success
SELECT current_database() AS verified_test_db, count(*) AS seed_users_count 
FROM public.users;
