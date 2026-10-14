\set ON_ERROR_STOP on

-- =========================================================================
-- PHOTO SELECTION / KMBC — PHASE 4.7.5 CONCURRENCY HARNESS TEARDOWN
-- Purpose: Clean up disposable test environment after two-terminal concurrency testing.
--
-- Clean Teardown Strategy:
-- 1. If executed inside kmbc_disposable_test: Drops synthetic test tables safely.
-- 2. Complete DB Teardown (Recommended): Disconnect sessions and drop the entire
--    disposable database from the default postgres maintenance database:
--    DROP DATABASE kmbc_disposable_test WITH (FORCE);
-- =========================================================================

-- Safety Guard: Ensure this is executed ONLY against the exact disposable local test database!
DO $$
DECLARE
    v_server_ip INET;
    v_db_name TEXT := current_database();
BEGIN
    IF v_db_name <> 'kmbc_disposable_test' THEN
        RAISE EXCEPTION 'SAFETY HALT: concurrency-teardown must run ONLY on database "kmbc_disposable_test". Current DB: "%"', v_db_name;
    END IF;

    v_server_ip := inet_server_addr();
    IF v_server_ip IS NOT NULL AND v_server_ip NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
        RAISE EXCEPTION 'SAFETY HALT: Connection is not to localhost! Detected server address: %', v_server_ip;
    END IF;
END $$;

BEGIN;

-- Drop test-specific objects in the disposable database
DROP TRIGGER IF EXISTS trg_test_gate10_fault ON public.processed_payments;
DROP TABLE IF EXISTS public._concurrency_barrier;
DROP TABLE IF EXISTS public.pro_entitlements;
DROP TABLE IF EXISTS public.processed_payments;
DROP TABLE IF EXISTS public.users;
DROP FUNCTION IF EXISTS public.process_mayar_payment;

COMMIT;

-- Drop compatibility roles if created for test
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        DROP ROLE anon;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        DROP ROLE authenticated;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        DROP ROLE service_role;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

\echo '-------------------------------------------------------------------'
\echo 'Disposable test tables, functions, and roles successfully cleaned up.'
\echo 'To drop the entire disposable database completely, run from maintenance DB:'
\echo '  DROP DATABASE kmbc_disposable_test WITH (FORCE);'
\echo '-------------------------------------------------------------------'
