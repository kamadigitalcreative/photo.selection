\set ON_ERROR_STOP on

-- =========================================================================
-- PHOTO SELECTION / KMBC — CONCURRENT TEST SESSION 1 (TERMINAL 1)
-- Safety: Localhost and kmbc_disposable_test ONLY.
-- Orchestrates Scenario A (same-ID race) and Scenario B (distinct ID competing email race)
-- with machine-checked lock holding and explicit inter-process barriers.
-- =========================================================================

-- Safety Guard
DO $$
DECLARE
    v_server_ip INET;
BEGIN
    IF current_database() <> 'kmbc_disposable_test' THEN
        RAISE EXCEPTION 'SAFETY HALT: concurrent-session1 must run ONLY on database "kmbc_disposable_test". Current DB: "%"', current_database();
    END IF;

    v_server_ip := inet_server_addr();
    IF v_server_ip IS NOT NULL AND v_server_ip NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
        RAISE EXCEPTION 'SAFETY HALT: Connection is not to localhost! Detected server address: %', v_server_ip;
    END IF;
END $$;

-- -------------------------------------------------------------------------
-- SCENARIO A: IDENTICAL TRANSACTION ID CONCURRENT ARRIVAL RACE
-- -------------------------------------------------------------------------
\echo '============================================================'
\echo 'SESSION 1: Starting Scenario A (Identical ID race)...'
\echo '============================================================'

BEGIN;

DO $$
DECLARE
    v_res JSONB;
BEGIN
    -- Claim transaction inside open transaction
    v_res := public.process_mayar_payment(
        p_payment_id => 'tx_race_same_id_001',
        p_email => 'racer_alpha@customer.test',
        p_phone => '08123456789',
        p_username_hint => NULL,
        p_product_name => 'Paket 1 Bulan - Photo Selection',
        p_is_pro_addon => false,
        p_add_days => 30,
        p_plan_name => '1 Bulan',
        p_amount => 25000,
        p_currency => 'IDR',
        p_create_new_user => true,
        p_new_username => 'racer_alpha',
        p_new_password_hash => 'hash_pw_alpha_123',
        p_customer_name => 'Racer Alpha'
    );

    IF (v_res->>'status') <> 'processed' OR (v_res->>'action_type') <> 'NEW_USER_CREATED' THEN
        RAISE EXCEPTION 'SESSION 1 SCENARIO A FAILED: Expected processed / NEW_USER_CREATED, got: %', v_res;
    END IF;
    RAISE NOTICE 'SESSION 1: Payment tx_race_same_id_001 claimed. Holding transaction lock for 7s...';
END $$;

\echo 'SESSION 1: >>> PAYMENT CLAIMED & ROW LOCK HELD: RUN SESSION 2 IN TERMINAL 2 NOW <<<'

-- Hold lock so Session 2 detects it in pg_locks and blocks
SELECT pg_sleep(7);

COMMIT;

\echo 'SESSION 1: Scenario A committed successfully.'

-- -------------------------------------------------------------------------
-- INTER-SCENARIO BARRIER: Wait for Session 2 to complete Scenario A assertions
-- -------------------------------------------------------------------------
\echo 'SESSION 1: Waiting for Session 2 to complete Scenario A assertions...'
DO $$
DECLARE
    v_s2_status TEXT;
    v_retries INT := 0;
BEGIN
    LOOP
        SELECT status INTO v_s2_status FROM public._concurrency_barrier WHERE step = 'scenario_a';
        IF v_s2_status = 'SCENARIO_A_DONE' THEN
            EXIT;
        END IF;
        PERFORM pg_sleep(0.3);
        v_retries := v_retries + 1;
        IF v_retries > 50 THEN
            RAISE EXCEPTION 'BARRIER TIMEOUT: Session 2 did not complete Scenario A within 15s.';
        END IF;
    END LOOP;
    RAISE NOTICE 'SESSION 1: Session 2 verified Scenario A. Proceeding to Scenario B...';
END $$;


-- -------------------------------------------------------------------------
-- SCENARIO B: DISTINCT PAYMENT IDS COMPETING ON SAME UNREGISTERED EMAIL
-- -------------------------------------------------------------------------
\echo '============================================================'
\echo 'SESSION 1: Starting Scenario B (Distinct ID, same email race)...'
\echo '============================================================'

BEGIN;

DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.process_mayar_payment(
        p_payment_id => 'tx_race_distinct_b1',
        p_email => 'racer_competing@customer.test',
        p_phone => '08123456780',
        p_username_hint => NULL,
        p_product_name => 'Paket 1 Bulan - Photo Selection',
        p_is_pro_addon => false,
        p_add_days => 30,
        p_plan_name => '1 Bulan',
        p_amount => 25000,
        p_currency => 'IDR',
        p_create_new_user => true,
        p_new_username => 'racer_competing',
        p_new_password_hash => 'hash_pw_b1_123',
        p_customer_name => 'Racer Competing'
    );

    IF (v_res->>'status') <> 'processed' OR (v_res->>'action_type') <> 'NEW_USER_CREATED' THEN
        RAISE EXCEPTION 'SESSION 1 SCENARIO B FAILED: Expected processed / NEW_USER_CREATED, got: %', v_res;
    END IF;
    RAISE NOTICE 'SESSION 1: Payment B1 claimed. Holding advisory lock for 7s...';
END $$;

\echo 'SESSION 1: >>> PAYMENT B1 CLAIMED & ADVISORY LOCK HELD: RUN SESSION 2 SCENARIO B NOW <<<'

-- Hold advisory lock so Session 2 blocks on mayar_user_provision:racer_competing@customer.test
SELECT pg_sleep(7);

COMMIT;

\echo 'SESSION 1: Scenario B committed successfully.'
\echo '============================================================'
\echo 'SESSION 1: COMPLETE. Awaiting Session 2 final verification.'
\echo '============================================================'
