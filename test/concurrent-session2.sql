\set ON_ERROR_STOP on

-- =========================================================================
-- PHOTO SELECTION / KMBC — CONCURRENT TEST SESSION 2 (TERMINAL 2)
-- Safety: Localhost and kmbc_disposable_test ONLY.
-- Verifies Session 1 in-flight locks in pg_locks before racing,
-- confirms real blocking duration, and runs machine-checked assertions.
-- Aborts immediately with nonzero exit code on any assertion violation.
-- =========================================================================

-- Safety Guard
DO $$
DECLARE
    v_server_ip INET;
BEGIN
    IF current_database() <> 'kmbc_disposable_test' THEN
        RAISE EXCEPTION 'SAFETY HALT: concurrent-session2 must run ONLY on database "kmbc_disposable_test". Current DB: "%"', current_database();
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
\echo 'SESSION 2: Verifying Session 1 active lock in pg_locks for Scenario A...'
\echo '============================================================'

DO $$
DECLARE
    v_locked BOOLEAN := FALSE;
    v_retries INT := 0;
BEGIN
    LOOP
        SELECT count(*) > 0 INTO v_locked
        FROM pg_locks l
        JOIN pg_class c ON l.relation = c.oid
        WHERE c.relname = 'processed_payments' 
          AND l.pid <> pg_backend_pid();

        IF v_locked THEN
            EXIT;
        END IF;

        PERFORM pg_sleep(0.2);
        v_retries := v_retries + 1;
        IF v_retries > 50 THEN
            RAISE EXCEPTION 'LOCK DETECTION TIMEOUT: Session 1 lock on processed_payments not detected within 10s. Start Session 1 first!';
        END IF;
    END LOOP;
    RAISE NOTICE 'SESSION 2: Detected Session 1 in-flight lock on processed_payments. Launching competing request...';
END $$;

\echo 'SESSION 2: Racing to claim identical tx_race_same_id_001...'

DO $$
DECLARE
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_elapsed INTERVAL;
    v_res JSONB;
    v_user_count INT;
    v_ledger_count INT;
    v_ledger_status TEXT;
BEGIN
    -- Concurrent attempt for exact same payment ID (blocks until Session 1 commits)
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
        p_currency => 'IDR'
    );
    v_elapsed := clock_timestamp() - v_start_time;

    -- Machine check: Session 2 must have blocked while Session 1 held the lock
    IF v_elapsed < interval '1 second' THEN
        RAISE EXCEPTION 'CONCURRENCY FAILED: Session 2 was not blocked by Session 1 lock (elapsed: %)', v_elapsed;
    END IF;

    -- Machine check: status MUST be 'already_processed'
    IF (v_res->>'status') <> 'already_processed' THEN
        RAISE EXCEPTION 'MACHINE CHECK FAILED: Expected status already_processed, got: %', v_res;
    END IF;

    -- Machine check: Exactly 1 user account provisioned
    SELECT count(*) INTO v_user_count FROM public.users WHERE "Username" = 'racer_alpha';
    IF v_user_count <> 1 THEN
        RAISE EXCEPTION 'MACHINE CHECK FAILED: Expected exactly 1 user account for racer_alpha, found: %', v_user_count;
    END IF;

    -- Machine check: Exactly 1 SUCCESS ledger row
    SELECT count(*), max(status) INTO v_ledger_count, v_ledger_status 
    FROM public.processed_payments WHERE payment_id = 'tx_race_same_id_001';
    IF v_ledger_count <> 1 OR v_ledger_status <> 'SUCCESS' THEN
        RAISE EXCEPTION 'MACHINE CHECK FAILED: Expected 1 SUCCESS ledger row, found count=% status=%', v_ledger_count, v_ledger_status;
    END IF;

    RAISE NOTICE 'SESSION 2 SCENARIO A [PASS]: Idempotent duplicate safely rejected with already_processed after blocking for % (1 user, 1 ledger row)', v_elapsed;

    -- Signal completion of Scenario A to Session 1
    UPDATE public._concurrency_barrier 
    SET status = 'SCENARIO_A_DONE', updated_at = NOW() 
    WHERE step = 'scenario_a';
END $$;


-- -------------------------------------------------------------------------
-- SCENARIO B: DISTINCT PAYMENT IDS COMPETING ON SAME UNREGISTERED EMAIL
-- -------------------------------------------------------------------------
\echo '============================================================'
\echo 'SESSION 2: Verifying Session 1 advisory lock in pg_locks for Scenario B...'
\echo '============================================================'

DO $$
DECLARE
    v_locked BOOLEAN := FALSE;
    v_retries INT := 0;
    v_lock_key INT := hashtext('mayar_user_provision:racer_competing@customer.test');
BEGIN
    LOOP
        SELECT count(*) > 0 INTO v_locked
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND (objid = v_lock_key OR (classid::bigint << 32 | objid::bigint) = v_lock_key::bigint)
          AND pid <> pg_backend_pid();

        IF v_locked THEN
            EXIT;
        END IF;

        PERFORM pg_sleep(0.2);
        v_retries := v_retries + 1;
        IF v_retries > 50 THEN
            RAISE EXCEPTION 'ADVISORY LOCK TIMEOUT: Session 1 advisory lock not detected within 10s.';
        END IF;
    END LOOP;
    RAISE NOTICE 'SESSION 2: Detected Session 1 in-flight advisory lock. Launching competing payment B2...';
END $$;

\echo 'SESSION 2: Competing for distinct payment B2 on racer_competing@customer.test...'

DO $$
DECLARE
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_elapsed INTERVAL;
    v_res JSONB;
    v_user_count INT;
    v_user RECORD;
    v_ledger_count INT;
    v_expected_exp TEXT;
BEGIN
    -- Concurrent attempt for distinct payment ID on same unregistered email
    -- (Blocks on pg_advisory_xact_lock until Session 1 commits, then resolves existing user)
    v_res := public.process_mayar_payment(
        p_payment_id => 'tx_race_distinct_b2',
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
        p_new_password_hash => 'hash_pw_b2_456',
        p_customer_name => 'Racer Competing'
    );
    v_elapsed := clock_timestamp() - v_start_time;

    -- Machine check: Session 2 must have blocked while Session 1 held advisory lock
    IF v_elapsed < interval '1 second' THEN
        RAISE EXCEPTION 'CONCURRENCY FAILED: Session 2 was not blocked by advisory lock (elapsed: %)', v_elapsed;
    END IF;

    -- Machine check: status MUST be 'processed' and action_type MUST be 'USER_UPDATED'
    IF (v_res->>'status') <> 'processed' OR (v_res->>'action_type') <> 'USER_UPDATED' THEN
        RAISE EXCEPTION 'MACHINE CHECK FAILED: Expected processed / USER_UPDATED for competing payment B2, got: %', v_res;
    END IF;

    -- Machine check: Exactly 1 user account exists for this email
    SELECT count(*) INTO v_user_count FROM public.users WHERE lower(btrim("Email")) = 'racer_competing@customer.test';
    IF v_user_count <> 1 THEN
        RAISE EXCEPTION 'MACHINE CHECK FAILED: Expected exactly 1 user account for competing email, found: %', v_user_count;
    END IF;

    -- Machine check: Duration is stacked (30 days from creation + 30 days = 60 days)
    SELECT * INTO v_user FROM public.users WHERE lower(btrim("Email")) = 'racer_competing@customer.test';
    v_expected_exp := to_char(CURRENT_DATE + 60, 'YYYY-MM-DD');
    IF v_user."ExpiredAt" <> v_expected_exp THEN
        RAISE EXCEPTION 'MACHINE CHECK FAILED: Expected stacked ExpiredAt %, found: %', v_expected_exp, v_user."ExpiredAt";
    END IF;

    -- Machine check: Both distinct payments are recorded as SUCCESS in ledger
    SELECT count(*) INTO v_ledger_count 
    FROM public.processed_payments 
    WHERE payment_id IN ('tx_race_distinct_b1', 'tx_race_distinct_b2') AND status = 'SUCCESS';
    IF v_ledger_count <> 2 THEN
        RAISE EXCEPTION 'MACHINE CHECK FAILED: Expected 2 SUCCESS ledger rows, found: %', v_ledger_count;
    END IF;

    RAISE NOTICE 'SESSION 2 SCENARIO B [PASS]: Distinct payments serialized cleanly under advisory lock after blocking for % (1 user, stacked 60d expiry, 2 SUCCESS ledger rows)', v_elapsed;

    -- Signal completion of Scenario B
    UPDATE public._concurrency_barrier 
    SET status = 'SCENARIO_B_DONE', updated_at = NOW() 
    WHERE step = 'scenario_b';
END $$;

\echo '============================================================'
\echo 'ALL CONCURRENCY SCENARIOS MACHINE-CHECKED AND PASSED.'
\echo '============================================================'
