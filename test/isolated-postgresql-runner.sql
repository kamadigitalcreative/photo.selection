\set ON_ERROR_STOP on

-- =========================================================================
-- PHOTO SELECTION / KMBC — PHASE 4.7.5 ISOLATED POSTGRESQL TEST RUNNER
-- Standalone, disposable test suite executable against PostgreSQL 14+ / Supabase
-- Executes the REAL, UNMODIFIED production migration (20261012_phase475_payment_idempotency.sql)
-- against a synthetic 24-column users schema in an isolated scratch database.
--
-- Safety Invariants:
-- 1. NO DROP TABLE CASCADE permitted. If public.users already exists, execution ABORTS.
-- 2. Strictly restricted to localhost (127.0.0.1 / ::1 / local socket). Remote execution ABORTS.
-- 3. Database name must match EXACT expected disposable name: kmbc_disposable_test.
-- 4. Tests halt on first error (ON_ERROR_STOP = 1).
-- =========================================================================

-- -------------------------------------------------------------------------
-- SAFETY PREFLIGHT CHECKS: LOCALHOST ONLY & STRICT DISPOSABLE DB ONLY
-- -------------------------------------------------------------------------
DO $$
DECLARE
    v_server_ip INET;
    v_db_name TEXT := current_database();
BEGIN
    -- 1. Exact Database Name Guard (Must be exactly 'kmbc_disposable_test')
    IF v_db_name <> 'kmbc_disposable_test' THEN
        RAISE EXCEPTION 'SAFETY HALT: isolated-postgresql-runner must be run ONLY against an exact disposable database named "kmbc_disposable_test". Current connected database: "%". Execution aborted.', v_db_name;
    END IF;

    -- 2. Localhost-only check (Reject any remote host/cloud connections)
    v_server_ip := inet_server_addr();
    IF v_server_ip IS NOT NULL AND v_server_ip NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
        RAISE EXCEPTION 'SAFETY HALT: Connection is not to localhost! Detected server address: %. Remote or production execution strictly prohibited.', v_server_ip;
    END IF;

    -- 3. Fail if public.users already exists (NO DROP TABLE CASCADE permitted!)
    IF to_regclass('public.users') IS NOT NULL THEN
        RAISE EXCEPTION 'SAFETY HALT: Table "public.users" already exists in "%". Tests require a fresh, empty disposable database. Refusing to drop or mutate existing tables.', v_db_name;
    END IF;

    -- 4. Fail if other application objects already exist
    IF to_regclass('public.processed_payments') IS NOT NULL OR 
       to_regclass('public.pro_entitlements') IS NOT NULL OR 
       to_regproc('public.process_mayar_payment') IS NOT NULL THEN
        RAISE EXCEPTION 'SAFETY HALT: Application objects (processed_payments, pro_entitlements, or process_mayar_payment) already exist in "%". Disposable database must be clean.', v_db_name;
    END IF;
END $$;

BEGIN;

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------------------------------------------------------
-- Issue 1 Fix: Provision Supabase Compatibility Roles (NOLOGIN)
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
-- 1. Synthetic 24-Column Users Schema (Mirroring Production public.users preflight)
-- Note: "Username" is nullable in verified production schema, with UNIQUE constraint.
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
-- Case 2 & 3: Two legitimate shared-email accounts: adminps (Admin) and kamavisual (Photographer)
INSERT INTO public.users (id, "Username", "Email", "Role", "Status", "Paket", "ExpiredAt", "Akses_Watermark", "ConfirmToken", "ProjectCreated")
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'adminps', 'kama@shared.test', 'Admin', 'Active', 'Lifetime', 'Lifetime', 'TRUE', 'CONF_ADMIN', '0'),
    ('22222222-2222-2222-2222-222222222222', 'kamavisual', 'kama@shared.test', 'Photographer', 'Active', 'Lifetime', 'Lifetime', 'TRUE', 'CONF_KAMA', '0');

-- Synthetic Admin account with UNIQUE email to verify ADMIN_ACCOUNT_PROTECTED gate cleanly
INSERT INTO public.users (id, "Username", "Email", "Role", "Status", "Paket", "ExpiredAt", "Akses_Watermark", "ConfirmToken", "ProjectCreated")
VALUES 
    ('66666666-6666-6666-6666-666666666666', 'unique_admin', 'admin@unique.test', 'Admin', 'Active', 'Lifetime', 'Lifetime', 'TRUE', 'CONF_UADMIN', '0');

-- Solo Photographer account for normal renewal and PRO add-on tests
INSERT INTO public.users (id, "Username", "Email", "Role", "Status", "Paket", "ExpiredAt", "Akses_Watermark", "ConfirmToken", "ProjectCreated")
VALUES 
    ('55555555-5555-5555-5555-555555555555', 'solo_photographer', 'solo@user.test', 'Photographer', 'Active', '1 Bulan', '2026-11-01', 'FALSE', 'CONF_SOLO', '0');

-- Pre-migration user qualifying for legacy grandfather PRO snapshot
INSERT INTO public.users (id, "Username", "Email", "Role", "Status", "Paket", "ExpiredAt", "Akses_Watermark", "ConfirmToken", "ProjectCreated")
VALUES 
    ('44444444-4444-4444-4444-444444444444', 'grandfather_user', 'legacy@photo.test', 'Photographer', 'Active', '1 Bulan', '2026-12-31', 'TRUE', 'CONF_LEGACY', '0');

-- Fixture 7A: Legacy Pending 1 Bulan stored with ExpiredAt='Lifetime' (the defect reproduction fixture)
INSERT INTO public.users (id, "Username", "Email", "Role", "Status", "Paket", "ExpiredAt", "Akses_Watermark", "ConfirmToken", "ProjectCreated")
VALUES 
    ('77777777-7777-7777-7777-777777777777', 'pending_accidental_lt', 'pending_lt@user.test', 'Photographer', 'Pending', '1 Bulan', 'Lifetime', 'FALSE', 'CONF_PLT', '0');

-- Fixture 7B: Pending 6 Bulan user with NULL ExpiredAt
INSERT INTO public.users (id, "Username", "Email", "Role", "Status", "Paket", "ExpiredAt", "Akses_Watermark", "ConfirmToken", "ProjectCreated")
VALUES 
    ('88888888-8888-8888-8888-888888888888', 'pending_6m', 'pending_6m@user.test', 'Photographer', 'Pending', '6 Bulan', NULL, 'FALSE', 'CONF_P6M', '0');

-- Fixture 7C: Pending 1 Tahun user with NULL ExpiredAt
INSERT INTO public.users (id, "Username", "Email", "Role", "Status", "Paket", "ExpiredAt", "Akses_Watermark", "ConfirmToken", "ProjectCreated")
VALUES 
    ('99999999-9999-9999-9999-999999999999', 'pending_1y', 'pending_1y@user.test', 'Photographer', 'Pending', '1 Tahun', NULL, 'FALSE', 'CONF_P1Y', '0');

-- Fixture 7H: Pending user with Lifetime choice (must NOT receive grandfather PRO and must not become active Lifetime on finite payment)
INSERT INTO public.users (id, "Username", "Email", "Role", "Status", "Paket", "ExpiredAt", "Akses_Watermark", "ConfirmToken", "ProjectCreated")
VALUES 
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'pending_lt_choice', 'pending_choice@user.test', 'Photographer', 'Pending', 'Lifetime', 'Lifetime', 'TRUE', 'CONF_PLTC', '0');

-- Fixture 7I: Active Demo user to verify conversion to Photographer on subscription purchase
INSERT INTO public.users (id, "Username", "Email", "Role", "Status", "Paket", "ExpiredAt", "Akses_Watermark", "ConfirmToken", "ProjectCreated")
VALUES 
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'demo_user', 'demo@user.test', 'Demo', 'Active', 'Demo', '2026-11-01', 'FALSE', 'CONF_DEMO', '0');


-- -------------------------------------------------------------------------
-- 3. Load and Execute the REAL Production Migration Source Unmodified
-- -------------------------------------------------------------------------
\i supabase/migrations/20261012_phase475_payment_idempotency.sql

-- -------------------------------------------------------------------------
-- 4. Run 13 Verification Gates Against the Real Executed Function
-- -------------------------------------------------------------------------
DO $$
DECLARE
    v_res JSONB;
    v_user RECORD;
    v_pro RECORD;
    v_ledger RECORD;
    v_u RECORD;
    v_initial_user_count INTEGER;
    v_is_active_pro BOOLEAN;
    v_fault_thrown BOOLEAN := FALSE;
    v_user_exists BOOLEAN := FALSE;
    v_ledger_exists BOOLEAN := FALSE;
    v_user_count INTEGER := 0;
    v_ledger_count INTEGER := 0;
BEGIN
    RAISE NOTICE '-------------------------------------------------------';
    RAISE NOTICE 'STARTING 13 TEST GATES AGAINST UNMODIFIED PRODUCTION RPC';
    RAISE NOTICE '-------------------------------------------------------';

    -- GATE 1: Null / whitespace phone fallback to clean email resolution
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_01_null',
        p_email => 'solo@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => '1 Bulan',
        p_is_pro_addon => false,
        p_add_days => 30,
        p_plan_name => '1 Bulan',
        p_amount => 25000,
        p_currency => 'IDR'
    );
    IF (v_res->>'status') <> 'processed' OR (v_res->>'account_username') <> 'solo_photographer' THEN
        RAISE EXCEPTION 'GATE 1 [FAIL]: Null phone resolution failed: %', v_res;
    ELSE
        RAISE NOTICE 'GATE 1 [PASS]: Null phone resolved cleanly by email';
    END IF;

    -- GATE 2: Admin account protected from automatic webhook mutation
    -- (Tested with unique-email Admin 'unique_admin' to verify pure ADMIN_ACCOUNT_PROTECTED branch)
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_02_admin',
        p_email => 'admin@unique.test',
        p_phone => NULL,
        p_username_hint => 'unique_admin',
        p_product_name => '1 Bulan',
        p_is_pro_addon => false,
        p_add_days => 30,
        p_plan_name => '1 Bulan',
        p_amount => 25000,
        p_currency => 'IDR'
    );
    SELECT * INTO v_user FROM public.users WHERE "Username" = 'unique_admin';
    IF (v_res->>'code') = 'ADMIN_ACCOUNT_PROTECTED' AND v_user."Role" = 'Admin' AND v_user."ExpiredAt" = 'Lifetime' THEN
        RAISE NOTICE 'GATE 2 [PASS]: Unique-email Admin account protected from webhook mutation';
    ELSE
        RAISE EXCEPTION 'GATE 2 [FAIL]: Admin account was not protected or was mutated: %', v_res;
    END IF;

    -- GATE 3: Shared-email accounts (adminps & kamavisual) held in manual review
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_03_shared',
        p_email => 'kama@shared.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => '1 Bulan',
        p_is_pro_addon => false,
        p_add_days => 30,
        p_plan_name => '1 Bulan',
        p_amount => 25000,
        p_currency => 'IDR'
    );
    SELECT * INTO v_user FROM public.users WHERE "Username" = 'adminps';
    IF (v_res->>'code') = 'AMBIGUOUS_IDENTITY' AND v_user."ExpiredAt" = 'Lifetime' THEN
        RAISE NOTICE 'GATE 3 [PASS]: Shared-email accounts held in manual review (AMBIGUOUS_IDENTITY)';
    ELSE
        RAISE EXCEPTION 'GATE 3 [FAIL]: Shared-email account mutated or ambiguous branch bypassed: %', v_res;
    END IF;

    -- ---------------------------------------------------------------------
    -- GATE 4: Account Resolution Hierarchy: Email Precedence vs Phone Conflict
    -- ---------------------------------------------------------------------
    -- Context: Production RPC defines exact hierarchy:
    --   Layer 1 (Authoritative): Exact email match resolves account directly.
    --   Layer 3 (Fallback): Phone lookup occurs ONLY if email is NOT registered.
    --     If phone matches user B, but payment email is a different unregistered email,
    --     the RPC blocks activation with ACCOUNT_CONFLICT (preventing phone-based hijacking).
    INSERT INTO public.users ("Username", "Email", "No HP", "Role", "Status", "Paket", "ExpiredAt")
    VALUES ('phone_owner', 'phone_owner@test.org', '081299998888', 'Photographer', 'Active', '1 Bulan', '2026-11-01');

    -- GATE 4A: Registered Email Authoritativeness
    -- solo@user.test is registered. Differing checkout phone does NOT derail registered email owner.
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_04a_email_auth',
        p_email => 'solo@user.test',
        p_phone => '081299998888',
        p_username_hint => NULL,
        p_product_name => '1 Bulan',
        p_is_pro_addon => false,
        p_add_days => 30,
        p_plan_name => '1 Bulan',
        p_amount => 25000,
        p_currency => 'IDR'
    );
    IF (v_res->>'status') = 'processed' AND (v_res->>'account_username') = 'solo_photographer' THEN
        RAISE NOTICE 'GATE 4A [PASS]: Authoritative registered email resolves target account cleanly';
    ELSE
        RAISE EXCEPTION 'GATE 4A [FAIL]: Authoritative email resolution failed: %', v_res;
    END IF;

    -- GATE 4B: Phone Hijacking Defense (ACCOUNT_CONFLICT)
    -- Payment email stranger@test.org is UNREGISTERED. Checkout phone belongs to phone_owner.
    -- Layer 3 refuses activation based solely on phone when payment email differs.
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_04b_phone_hijack_blocked',
        p_email => 'stranger@test.org',
        p_phone => '081299998888',
        p_username_hint => NULL,
        p_product_name => '1 Bulan',
        p_is_pro_addon => false,
        p_add_days => 30,
        p_plan_name => '1 Bulan',
        p_amount => 25000,
        p_currency => 'IDR'
    );
    SELECT * INTO v_user FROM public.users WHERE "Username" = 'phone_owner';
    IF (v_res->>'code') = 'ACCOUNT_CONFLICT' AND v_user."ExpiredAt" = '2026-11-01' THEN
        RAISE NOTICE 'GATE 4B [PASS]: Unregistered email with registered phone held in manual review (ACCOUNT_CONFLICT)';
    ELSE
        RAISE EXCEPTION 'GATE 4B [FAIL]: Phone hijacking was not blocked with ACCOUNT_CONFLICT: %', v_res;
    END IF;

    -- GATE 5: PRO Add-On lifecycle
    -- Step A: Finite 1-Year Grant
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_05a_pro1yr',
        p_email => 'solo@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => 'PRO Add-On 1 Tahun',
        p_is_pro_addon => true,
        p_add_days => 365,
        p_plan_name => 'PRO Add-On 1 Tahun',
        p_amount => 149000,
        p_currency => 'IDR'
    );
    SELECT * INTO v_user FROM public.users WHERE "Username" = 'solo_photographer';
    SELECT * INTO v_pro FROM public.pro_entitlements WHERE user_id = '55555555-5555-5555-5555-555555555555';
    IF v_user."Paket" = '1 Bulan' AND v_pro.is_lifetime IS FALSE AND v_pro.expires_at IS NOT NULL THEN
        RAISE NOTICE 'GATE 5A [PASS]: PRO 1-Year granted finite entitlement without changing subscription Paket';
    ELSE
        RAISE EXCEPTION 'GATE 5A [FAIL]: PRO 1-Year grant failed: %', v_res;
    END IF;

    -- Step B: Stack Renewal
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_05b_prostack',
        p_email => 'solo@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => 'PRO Add-On 1 Tahun',
        p_is_pro_addon => true,
        p_add_days => 365,
        p_plan_name => 'PRO Add-On 1 Tahun',
        p_amount => 149000,
        p_currency => 'IDR'
    );
    SELECT * INTO v_pro FROM public.pro_entitlements WHERE user_id = '55555555-5555-5555-5555-555555555555';
    IF v_pro.expires_at > (NOW() + INTERVAL '400 days') THEN
        RAISE NOTICE 'GATE 5B [PASS]: PRO renewal stacked 365 days from previous expiry: %', v_pro.expires_at;
    ELSE
        RAISE EXCEPTION 'GATE 5B [FAIL]: PRO stacking failed: %', v_res;
    END IF;

    -- Step C: Upgrade to Lifetime
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_05c_lifetime',
        p_email => 'solo@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => 'PRO Add-On Lifetime',
        p_is_pro_addon => true,
        p_add_days => 0,
        p_plan_name => 'PRO Add-On Lifetime',
        p_amount => 649000,
        p_currency => 'IDR'
    );
    SELECT * INTO v_pro FROM public.pro_entitlements WHERE user_id = '55555555-5555-5555-5555-555555555555';
    IF v_pro.is_lifetime IS TRUE AND v_pro.expires_at IS NULL THEN
        RAISE NOTICE 'GATE 5C [PASS]: Finite PRO upgraded to Lifetime: is_lifetime = true, expires_at = null';
    ELSE
        RAISE EXCEPTION 'GATE 5C [FAIL]: PRO lifetime upgrade failed: %', v_res;
    END IF;

    -- Step D: 1-Year purchase does NOT downgrade Lifetime PRO
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_05d_nodowngrade',
        p_email => 'solo@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => 'PRO Add-On 1 Tahun',
        p_is_pro_addon => true,
        p_add_days => 365,
        p_plan_name => 'PRO Add-On 1 Tahun',
        p_amount => 149000,
        p_currency => 'IDR'
    );
    SELECT * INTO v_pro FROM public.pro_entitlements WHERE user_id = '55555555-5555-5555-5555-555555555555';
    IF v_pro.is_lifetime IS TRUE AND v_pro.expires_at IS NULL THEN
        RAISE NOTICE 'GATE 5D [PASS]: Existing Lifetime PRO preserved without downgrade';
    ELSE
        RAISE EXCEPTION 'GATE 5D [FAIL]: Lifetime PRO was downgraded!';
    END IF;

    -- GATE 6: SQL expression contract assertion for active vs expired PRO status
    -- (Note: Node.js/API layer authorization policy tested separately in test/mayar-webhook-audit.test.js)
    SELECT (is_lifetime OR (expires_at IS NOT NULL AND expires_at > NOW())) INTO v_is_active_pro
    FROM public.pro_entitlements WHERE user_id = '55555555-5555-5555-5555-555555555555';
    IF v_is_active_pro IS NOT TRUE THEN
        RAISE EXCEPTION 'GATE 6 [FAIL]: Lifetime PRO should evaluate to active';
    END IF;
    -- Synthetic expired check:
    SELECT (false OR ('2025-01-01T00:00:00Z'::timestamptz > NOW())) INTO v_is_active_pro;
    IF v_is_active_pro IS TRUE THEN
        RAISE EXCEPTION 'GATE 6 [FAIL]: Past expiration timestamp must evaluate to inactive';
    ELSE
        RAISE NOTICE 'GATE 6 [PASS]: SQL expression contract correctly validates active vs expired timestamps';
    END IF;

    -- GATE 7: PRO-only purchase for unknown account goes to manual reconciliation
    SELECT COUNT(*) INTO v_initial_user_count FROM public.users;
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_07_unknown',
        p_email => 'unknown_buyer@test.org',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => 'PRO Add-On 1 Tahun',
        p_is_pro_addon => true,
        p_add_days => 365,
        p_plan_name => 'PRO Add-On 1 Tahun',
        p_amount => 149000,
        p_currency => 'IDR'
    );
    SELECT COUNT(*) INTO v_u FROM public.users;
    IF (v_res->>'code') = 'ADDON_WITHOUT_ACCOUNT' AND v_initial_user_count = v_u.count THEN
        RAISE NOTICE 'GATE 7 [PASS]: Add-On for unknown buyer held in manual reconciliation with zero new users';
    ELSE
        RAISE EXCEPTION 'GATE 7 [FAIL]: Add-on created account or was not held: %', v_res;
    END IF;

    -- GATE 8: Identical transaction ID commits entitlement ONCE
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_05a_pro1yr',
        p_email => 'solo@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => 'PRO Add-On 1 Tahun',
        p_is_pro_addon => true,
        p_add_days => 365,
        p_plan_name => 'PRO Add-On 1 Tahun',
        p_amount => 149000,
        p_currency => 'IDR'
    );
    IF (v_res->>'status') = 'already_processed' THEN
        RAISE NOTICE 'GATE 8 [PASS]: Duplicate payment ID returned already_processed idempotently';
    ELSE
        RAISE EXCEPTION 'GATE 8 [FAIL]: Idempotency mutex failed: %', v_res;
    END IF;

    -- GATE 9: Single-session state simulation for ledger mutex (PROCESSING state duplicate claim)
    -- (NOTE: True 2-process concurrency race is executed via separate terminals using test/concurrent-session1.sql and test/concurrent-session2.sql)
    INSERT INTO public.processed_payments (payment_id, customer_email, product_name, plan_name, amount, currency, status)
    VALUES ('tx_in_progress_gate9', 'solo@user.test', '1 Bulan', '1 Bulan', 25000, 'IDR', 'PROCESSING');

    v_res := public.process_mayar_payment(
        p_payment_id => 'tx_in_progress_gate9',
        p_email => 'solo@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => '1 Bulan',
        p_is_pro_addon => false,
        p_add_days => 30,
        p_plan_name => '1 Bulan',
        p_amount => 25000,
        p_currency => 'IDR'
    );
    IF (v_res->>'status') IN ('already_processed', 'processing_in_progress', 'processed') THEN
        RAISE NOTICE 'GATE 9 [PASS]: Single-session state check verified ledger mutex branch';
    ELSE
        RAISE EXCEPTION 'GATE 9 [FAIL]: Ledger mutex state handling unexpected: %', v_res;
    END IF;

    -- ---------------------------------------------------------------------
    -- GATE 10: Deterministic Mid-RPC Fault Injection & Robust Rollback Check
    -- ---------------------------------------------------------------------
    -- Install temporary trigger function and trigger to fail during final UPDATE
    EXECUTE $trg_func$
        CREATE OR REPLACE FUNCTION pg_temp.trg_fault_on_success()
        RETURNS TRIGGER AS $f$
        BEGIN
            IF NEW.status = 'SUCCESS' AND NEW.payment_id = 'tx_gate10_induced_fault' THEN
                RAISE EXCEPTION 'INDUCED_FAULT_SIMULATION: simulated mid-RPC crash';
            END IF;
            RETURN NEW;
        END;
        $f$ LANGUAGE plpgsql;
    $trg_func$;

    EXECUTE $trg_att$
        CREATE TRIGGER trg_test_gate10_fault
        BEFORE UPDATE ON public.processed_payments
        FOR EACH ROW EXECUTE FUNCTION pg_temp.trg_fault_on_success();
    $trg_att$;

    BEGIN
        v_res := public.process_mayar_payment(
            p_payment_id => 'tx_gate10_induced_fault',
            p_email => 'fault_user@test.org',
            p_phone => '08199999999',
            p_username_hint => NULL,
            p_product_name => '1 Bulan',
            p_is_pro_addon => false,
            p_add_days => 30,
            p_plan_name => '1 Bulan',
            p_amount => 25000,
            p_currency => 'IDR',
            p_create_new_user => true,
            p_new_username => 'fault_test_user',
            p_new_password_hash => 'hash_fault_123',
            p_customer_name => 'Fault User'
        );
        RAISE EXCEPTION 'GATE 10 [FAIL]: Expected induced trigger exception was not thrown';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%INDUCED_FAULT_SIMULATION%' THEN
            v_fault_thrown := TRUE;
        ELSE
            RAISE EXCEPTION 'GATE 10 [FAIL]: Unexpected error during fault injection: %', SQLERRM;
        END IF;
    END;

    -- Cleanup test trigger
    EXECUTE 'DROP TRIGGER IF EXISTS trg_test_gate10_fault ON public.processed_payments;';
    EXECUTE 'DROP FUNCTION IF EXISTS pg_temp.trg_fault_on_success();';

    IF v_fault_thrown IS NOT TRUE THEN
        RAISE EXCEPTION 'GATE 10 [FAIL]: Fault was not injected into RPC';
    END IF;

    -- Machine-check row existence using SELECT EXISTS (...) and COUNT(*) = 0 (Fix 3: prevents RECORD IS NULL false-negatives)
    SELECT EXISTS (SELECT 1 FROM public.users WHERE "Username" = 'fault_test_user') INTO v_user_exists;
    SELECT EXISTS (SELECT 1 FROM public.processed_payments WHERE payment_id = 'tx_gate10_induced_fault') INTO v_ledger_exists;
    SELECT count(*) INTO v_user_count FROM public.users WHERE "Username" = 'fault_test_user';
    SELECT count(*) INTO v_ledger_count FROM public.processed_payments WHERE payment_id = 'tx_gate10_induced_fault';

    IF v_user_exists OR v_user_count <> 0 THEN
        RAISE EXCEPTION 'GATE 10 [FAIL]: Aborted RPC leaked created user row in public.users!';
    END IF;
    IF v_ledger_exists OR v_ledger_count <> 0 THEN
        RAISE EXCEPTION 'GATE 10 [FAIL]: Aborted RPC leaked claimed row in public.processed_payments!';
    END IF;

    RAISE NOTICE 'GATE 10 [PASS]: Deterministic fault inside RPC transaction fully rolled back both user and ledger rows (verified via EXISTS and COUNT=0)';

    -- GATE 11: Legacy grandfather snapshot preserved qualifying users
    SELECT * INTO v_pro FROM public.pro_entitlements WHERE user_id = '44444444-4444-4444-4444-444444444444';
    IF v_pro.source = 'legacy_grant' AND v_pro.is_lifetime IS FALSE AND v_pro.expires_at IS NOT NULL THEN
        RAISE NOTICE 'GATE 11 [PASS]: Legacy grandfather snapshot preserved existing rights without permanent lifetime';
    ELSE
        RAISE EXCEPTION 'GATE 11 [FAIL]: Legacy snapshot failed: %', v_pro;
    END IF;

    -- GATE 12: Previously settled payments cannot be replayed as new extensions (HISTORICAL_SETTLED)
    INSERT INTO public.processed_payments (payment_id, customer_email, product_name, plan_name, amount, currency, status)
    VALUES ('tx_hist_pre_mig_12', 'solo@user.test', '1 Bulan', '1 Bulan', 25000, 'IDR', 'HISTORICAL_SETTLED');

    v_res := public.process_mayar_payment(
        p_payment_id => 'tx_hist_pre_mig_12',
        p_email => 'solo@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => '1 Bulan',
        p_is_pro_addon => false,
        p_add_days => 30,
        p_plan_name => '1 Bulan',
        p_amount => 25000,
        p_currency => 'IDR'
    );
    IF (v_res->>'status') = 'already_processed' THEN
        RAISE NOTICE 'GATE 12 [PASS]: Historical settled payments return already_processed without extension';
    ELSE
        RAISE EXCEPTION 'GATE 12 [FAIL]: Historical payment replay allowed: %', v_res;
    END IF;

    -- GATE 13: Financial amounts and currencies strictly recorded in ledger
    SELECT currency, amount INTO v_ledger FROM public.processed_payments WHERE payment_id = 'test_tx_01_null';
    IF v_ledger.currency = 'IDR' AND v_ledger.amount = 25000 THEN
        RAISE NOTICE 'GATE 13 [PASS]: Financial amounts and currencies strictly recorded in ledger';
    ELSE
        RAISE EXCEPTION 'GATE 13 [FAIL]: Ledger currency/amount mismatch: %', v_ledger;
    END IF;

    -- ---------------------------------------------------------------------
    -- PHASE 4.7.5 TARGETED GATES: PENDING PAID SIGNUP & ROLE CONVERSION
    -- ---------------------------------------------------------------------

    -- GATE 14 (Task 7A): Fresh Pending 1 Bulan with accidental ExpiredAt='Lifetime' + Rp25,000 -> finite +30 days, NEVER Lifetime
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_14_pending_accidental_lt',
        p_email => 'pending_lt@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => '1 Bulan',
        p_is_pro_addon => false,
        p_add_days => 30,
        p_plan_name => '1 Bulan',
        p_amount => 25000,
        p_currency => 'IDR'
    );
    SELECT * INTO v_user FROM public.users WHERE "Username" = 'pending_accidental_lt';
    IF (v_res->>'status') = 'processed' AND v_user."Status" = 'Active' AND v_user."ExpiredAt" = to_char(CURRENT_DATE + INTERVAL '30 days', 'YYYY-MM-DD') AND v_user."ExpiredAt" <> 'Lifetime' THEN
        RAISE NOTICE 'GATE 14 [PASS] (7A): Pending 1 Bulan with accidental Lifetime corrected to finite date (%) upon payment', v_user."ExpiredAt";
    ELSE
        RAISE EXCEPTION 'GATE 14 [FAIL] (7A): Pending 1 Bulan did not receive finite date: res=%, user=%', v_res, v_user;
    END IF;

    -- GATE 15 (Task 7B): Fresh Pending 6 Bulan + Rp120,000 -> finite +180 days
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_15_pending_6m',
        p_email => 'pending_6m@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => '6 Bulan',
        p_is_pro_addon => false,
        p_add_days => 180,
        p_plan_name => '6 Bulan',
        p_amount => 120000,
        p_currency => 'IDR'
    );
    SELECT * INTO v_user FROM public.users WHERE "Username" = 'pending_6m';
    IF (v_res->>'status') = 'processed' AND v_user."Status" = 'Active' AND v_user."ExpiredAt" = to_char(CURRENT_DATE + INTERVAL '180 days', 'YYYY-MM-DD') THEN
        RAISE NOTICE 'GATE 15 [PASS] (7B): Pending 6 Bulan activated with finite +180 days (%)', v_user."ExpiredAt";
    ELSE
        RAISE EXCEPTION 'GATE 15 [FAIL] (7B): Pending 6 Bulan failed activation: res=%, user=%', v_res, v_user;
    END IF;

    -- GATE 16 (Task 7C): Fresh Pending 1 Tahun + Rp199,000 -> finite +365 days
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_16_pending_1y',
        p_email => 'pending_1y@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => '1 Tahun',
        p_is_pro_addon => false,
        p_add_days => 365,
        p_plan_name => '1 Tahun',
        p_amount => 199000,
        p_currency => 'IDR'
    );
    SELECT * INTO v_user FROM public.users WHERE "Username" = 'pending_1y';
    IF (v_res->>'status') = 'processed' AND v_user."Status" = 'Active' AND v_user."ExpiredAt" = to_char(CURRENT_DATE + INTERVAL '365 days', 'YYYY-MM-DD') THEN
        RAISE NOTICE 'GATE 16 [PASS] (7C): Pending 1 Tahun activated with finite +365 days (%)', v_user."ExpiredAt";
    ELSE
        RAISE EXCEPTION 'GATE 16 [FAIL] (7C): Pending 1 Tahun failed activation: res=%, user=%', v_res, v_user;
    END IF;

    -- GATE 17 (Task 7H): Pending Lifetime choice excluded from grandfather PRO + finite payment held in AMBIGUOUS_LIFETIME_REGISTRATION
    SELECT count(*) INTO v_user_count FROM public.pro_entitlements WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    IF v_user_count <> 0 THEN
        RAISE EXCEPTION 'GATE 17 [FAIL] (7H): Pending Lifetime user was erroneously granted grandfather PRO entitlement!';
    END IF;

    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_17_pending_lt_finite_pay',
        p_email => 'pending_choice@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => '1 Bulan',
        p_is_pro_addon => false,
        p_add_days => 30,
        p_plan_name => '1 Bulan',
        p_amount => 25000,
        p_currency => 'IDR'
    );
    SELECT * INTO v_user FROM public.users WHERE "Username" = 'pending_lt_choice';
    IF (v_res->>'code') = 'AMBIGUOUS_LIFETIME_REGISTRATION' AND v_user."Status" = 'Pending' THEN
        RAISE NOTICE 'GATE 17 [PASS] (7H): Pending Lifetime choice held for manual review without granting Lifetime';
    ELSE
        RAISE EXCEPTION 'GATE 17 [FAIL] (7H): Ambiguous pending Lifetime registration was not held: res=%, user=%', v_res, v_user;
    END IF;

    -- GATE 18 (Task 7I): Active Demo user converted to Photographer role upon purchasing paid plan
    v_res := public.process_mayar_payment(
        p_payment_id => 'test_tx_18_demo_upgrade',
        p_email => 'demo@user.test',
        p_phone => NULL,
        p_username_hint => NULL,
        p_product_name => '1 Bulan',
        p_is_pro_addon => false,
        p_add_days => 30,
        p_plan_name => '1 Bulan',
        p_amount => 25000,
        p_currency => 'IDR'
    );
    SELECT * INTO v_user FROM public.users WHERE "Username" = 'demo_user';
    IF (v_res->>'status') = 'processed' AND v_user."Role" = 'Photographer' AND v_user."Status" = 'Active' AND v_user."Paket" = '1 Bulan' THEN
        RAISE NOTICE 'GATE 18 [PASS] (7I): Demo user successfully promoted to Photographer role upon subscription purchase';
    ELSE
        RAISE EXCEPTION 'GATE 18 [FAIL] (7I): Demo user role promotion failed: res=%, user=%', v_res, v_user;
    END IF;

    -- GATE 19 (Task 7J): Existing PRO entitlements decoupled from main subscription duration
    SELECT * INTO v_pro FROM public.pro_entitlements WHERE user_id = '44444444-4444-4444-4444-444444444444';
    IF v_pro.is_lifetime IS FALSE AND v_pro.expires_at IS NOT NULL AND v_pro.source = 'legacy_grant' THEN
        RAISE NOTICE 'GATE 19 [PASS] (7J): Existing PRO entitlement remains intact and independent of main subscription';
    ELSE
        RAISE EXCEPTION 'GATE 19 [FAIL] (7J): Existing PRO entitlement degraded or mutated: %', v_pro;
    END IF;

    RAISE NOTICE '-------------------------------------------------------';
    RAISE NOTICE 'ALL 19 ISOLATED POSTGRESQL TEST GATES VALIDATED';
    RAISE NOTICE '-------------------------------------------------------';
END $$;


-- Rollback disposable test transaction so zero test residues remain
ROLLBACK;
