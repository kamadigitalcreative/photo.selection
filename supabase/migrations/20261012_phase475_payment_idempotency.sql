-- =========================================================================
-- PHOTO SELECTION / KMBC — PHASE 4.7.5 PAYMENT IDEMPOTENCY MIGRATION
-- Infrastructure: Supabase Free PostgreSQL (Zero Additional Cost)
-- Purpose: Compact payment ledger + atomic transactional RPC function
-- Safety: Idempotent (IF NOT EXISTS), Least Privilege, SECURITY DEFINER
-- =========================================================================

-- 1. Create Compact Payment Ledger Table
-- Designed for minimal storage (~120 bytes per row; 10,000 transactions = ~1.2 MB)
CREATE TABLE IF NOT EXISTS public.processed_payments (
    payment_id TEXT PRIMARY KEY,
    account_username TEXT,
    customer_email TEXT,
    product_name TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    amount NUMERIC DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'IDR',
    status TEXT NOT NULL, -- 'SUCCESS', 'ALREADY_PROCESSED', 'HISTORICAL_SETTLED', 'ALREADY_PROCESSED_LEGACY', 'NEW_USER_PENDING', 'MANUAL_RECONCILIATION_REQUIRED', 'STORE_SALE'
    activation_result TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supporting lookup indexes for customer audits
CREATE INDEX IF NOT EXISTS idx_processed_payments_email 
    ON public.processed_payments (customer_email);
CREATE INDEX IF NOT EXISTS idx_processed_payments_username 
    ON public.processed_payments (account_username);

-- Enable Row Level Security (RLS) on the ledger to prevent direct client access
ALTER TABLE public.processed_payments ENABLE ROW LEVEL SECURITY;

-- Deny all client (anon/authenticated) direct SELECT/INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS processed_payments_deny_client ON public.processed_payments;
CREATE POLICY processed_payments_deny_client ON public.processed_payments
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

-- 2. Create Durable PRO Entitlements Table (Phase 4.7.5 Pro Add-On Decoupling)
-- Keyed to users.id UUID; separates PRO capabilities from subscription users.Paket / users.ExpiredAt
CREATE TABLE IF NOT EXISTS public.pro_entitlements (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    is_lifetime BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ, -- NULL when is_lifetime is TRUE; explicit UTC timestamp otherwise
    source TEXT NOT NULL DEFAULT 'payment', -- 'legacy_grant', 'payment', 'manual'
    last_payment_id TEXT, -- audit reference to processed_payments.payment_id
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pro_entitlements_expires_at 
    ON public.pro_entitlements (expires_at);

ALTER TABLE public.pro_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pro_entitlements_deny_client ON public.pro_entitlements;
CREATE POLICY pro_entitlements_deny_client ON public.pro_entitlements
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

-- 3. Idempotent Legacy Grandfather Snapshot for Existing Qualifying Users
-- Preserves existing effective PRO capabilities without granting perpetual status to future finite buyers
INSERT INTO public.pro_entitlements (user_id, is_lifetime, expires_at, source, created_at, updated_at)
SELECT 
    u.id,
    CASE 
        WHEN upper(COALESCE(u."Paket", '')) LIKE '%LIFETIME%' OR COALESCE(u."ExpiredAt", '') = 'Lifetime' THEN TRUE
        ELSE FALSE
    END AS is_lifetime,
    CASE 
        WHEN upper(COALESCE(u."Paket", '')) LIKE '%LIFETIME%' OR COALESCE(u."ExpiredAt", '') = 'Lifetime' THEN NULL
        WHEN u."ExpiredAt" ~ '^\d{4}-\d{2}-\d{2}' THEN (u."ExpiredAt"::date + time '23:59:59Z')::timestamptz
        ELSE (NOW() + INTERVAL '365 days')
    END AS expires_at,
    'legacy_grant',
    NOW(),
    NOW()
FROM public.users u
WHERE u."Role" <> 'Admin'
  AND u."Status" = 'Active' -- CRITICAL: Pending unverified registrations MUST NOT receive free grandfathered PRO
  AND (
      upper(COALESCE(u."Akses_Watermark", '')) = 'TRUE'
      OR upper(COALESCE(u."Paket", '')) LIKE '%PRO%'
      OR upper(COALESCE(u."Paket", '')) LIKE '%LIFETIME%'
  )
ON CONFLICT (user_id) DO NOTHING;

-- 4. Create Atomic Payment Processing RPC Function
-- Transaction Behavior:
--  - Validates stable payment ID
--  - Claims payment_id atomically in processed_payments (mutex)
--  - Validates existing NEW_USER_PENDING / PROCESSING states without premature already_processed
--  - Strict unambiguous account lookup (No partial phone substrings, No fuzzy name matching)
--  - Locks target user row (LIMIT 1 FOR UPDATE) to serialize concurrent operations
--  - Preserves Lifetime accounts (never downgraded)
--  - Accumulates duration for active subscriptions (date stacking)
--  - Separates PRO Add-on from full subscription packages
--  - Atomically provisions new accounts inside the database transaction (Failure B resolved)
--  - Commits ledger and user mutation together, or rolls back entirely on failure
CREATE OR REPLACE FUNCTION public.process_mayar_payment(
    p_payment_id TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_username_hint TEXT,
    p_product_name TEXT,
    p_is_pro_addon BOOLEAN,
    p_add_days INTEGER,
    p_plan_name TEXT,
    p_amount NUMERIC,
    p_currency TEXT DEFAULT 'IDR',
    p_create_new_user BOOLEAN DEFAULT FALSE,
    p_new_username TEXT DEFAULT NULL,
    p_new_password_hash TEXT DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_payment RECORD;
    v_target_user RECORD;
    v_match_count INTEGER := 0;
    v_disambiguated_count INTEGER := 0;
    v_conflict_count INTEGER := 0;
    v_is_ambiguous BOOLEAN := FALSE;
    v_is_conflict BOOLEAN := FALSE;
    v_conflict_reason TEXT := '';
    v_clean_phone TEXT := '';
    v_base_date DATE;
    v_new_exp DATE;
    v_final_exp TEXT;
    v_result_msg TEXT;
    v_chosen_username TEXT;
    v_days INTEGER;
    v_final_paket TEXT;
    v_target_found BOOLEAN := FALSE;
    v_existing_pro RECORD;
    v_new_pro_exp TIMESTAMPTZ;
    v_pro_is_lifetime BOOLEAN := FALSE;
    v_pro_exp_text TEXT := NULL;
BEGIN
    -- [A] Validate mandatory stable transaction identity
    IF p_payment_id IS NULL OR btrim(p_payment_id) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'error',
            'code', 'MISSING_PAYMENT_ID',
            'message', 'Payment transaction ID is required for atomic processing'
        );
    END IF;

    -- [B] Fast check: if payment already successfully processed, return idempotent outcome immediately
    SELECT * INTO v_existing_payment 
    FROM public.processed_payments 
    WHERE payment_id = p_payment_id;

    IF FOUND AND v_existing_payment.status IN ('SUCCESS', 'STORE_SALE', 'HISTORICAL_SETTLED', 'ALREADY_PROCESSED_LEGACY') THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_processed',
            'payment_id', p_payment_id,
            'message', 'Payment already processed previously (idempotent duplicate skipped)',
            'account_username', v_existing_payment.account_username,
            'plan_name', v_existing_payment.plan_name,
            'activation_result', v_existing_payment.activation_result
        );
    END IF;

    -- If previously held in manual reconciliation, do not blindly mutate
    IF FOUND AND v_existing_payment.status = 'MANUAL_RECONCILIATION_REQUIRED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'manual_reconciliation_needed',
            'payment_id', p_payment_id,
            'message', 'Payment requires manual reconciliation and was not auto-processed: ' || COALESCE(v_existing_payment.activation_result, ''),
            'plan_name', v_existing_payment.plan_name
        );
    END IF;

    -- [C] Atomically claim payment_id in ledger table
    IF NOT FOUND THEN
        BEGIN
            INSERT INTO public.processed_payments (
                payment_id,
                customer_email,
                product_name,
                plan_name,
                amount,
                currency,
                status,
                activation_result
            ) VALUES (
                p_payment_id,
                lower(btrim(p_email)),
                p_product_name,
                p_plan_name,
                p_amount,
                p_currency,
                'PROCESSING',
                'Payment processing claimed'
            );
        EXCEPTION WHEN unique_violation THEN
            -- Another concurrent instance won the claim in the same millisecond!
            SELECT * INTO v_existing_payment FROM public.processed_payments WHERE payment_id = p_payment_id;
            IF v_existing_payment.status IN ('SUCCESS', 'STORE_SALE') THEN
                RETURN jsonb_build_object(
                    'success', true,
                    'status', 'already_processed',
                    'payment_id', p_payment_id,
                    'message', 'Payment claimed concurrently by parallel instance (duplicate skipped)',
                    'account_username', v_existing_payment.account_username,
                    'plan_name', v_existing_payment.plan_name
                );
            ELSE
                RETURN jsonb_build_object(
                    'success', false,
                    'status', 'processing_in_progress',
                    'payment_id', p_payment_id,
                    'message', 'Payment claim is currently being processed by another instance'
                );
            END IF;
        END;
    ELSE
        -- Row existed in PROCESSING; lock it for recovery update
        SELECT * INTO v_existing_payment 
        FROM public.processed_payments 
        WHERE payment_id = p_payment_id 
        FOR UPDATE;
    END IF;

    -- [D] Fix A: Acquire transaction-level advisory lock on normalized email
    -- Prevents concurrent race conditions where two distinct payment transactions arrive
    -- simultaneously for the same previously unknown email.
    IF p_email IS NOT NULL AND btrim(p_email) <> '' THEN
        PERFORM pg_advisory_xact_lock(hashtext('mayar_user_provision:' || lower(btrim(p_email))));
    END IF;

    -- [E] Strict, Unambiguous Target Account Resolution (Fix B)
    -- Layer 1: Exact Email Match
    IF p_email IS NOT NULL AND btrim(p_email) <> '' THEN
        SELECT count(*) INTO v_match_count
        FROM public.users
        WHERE lower(btrim("Email")) = lower(btrim(p_email));

        IF v_match_count = 1 THEN
            -- Verify if explicit username hint was provided
            IF p_username_hint IS NOT NULL AND btrim(p_username_hint) <> '' THEN
                SELECT count(*) INTO v_disambiguated_count
                FROM public.users
                WHERE lower(btrim("Email")) = lower(btrim(p_email))
                  AND lower(btrim("Username")) = lower(btrim(p_username_hint));

                IF v_disambiguated_count = 1 THEN
                    SELECT * INTO v_target_user 
                    FROM public.users 
                    WHERE lower(btrim("Email")) = lower(btrim(p_email))
                    LIMIT 1 FOR UPDATE;
                    v_target_found := TRUE;
                ELSE
                    -- Mismatch: Email points to one account, but explicit username hint points to a different account!
                    v_is_conflict := TRUE;
                    v_conflict_reason := 'Konflik identitas akun: Email cocok dengan user terdaftar tetapi Username hint merujuk ke akun berbeda.';
                END IF;
            ELSE
                SELECT * INTO v_target_user 
                FROM public.users 
                WHERE lower(btrim("Email")) = lower(btrim(p_email))
                LIMIT 1 FOR UPDATE;
                v_target_found := TRUE;
            END IF;
        ELSIF v_match_count > 1 THEN
            -- Production legacy condition: multiple accounts share one email (e.g. adminps & kamavisual)
            -- Blocker 2: User-controlled notes / @username strings are NOT cryptographically verified provenance.
            -- Shared-email accounts must NOT be activated automatically based on free-text notes.
            v_is_ambiguous := TRUE;
        END IF;
    END IF;

    -- Layer 2: Explicit Username Hint (when email is not matched or not provided)
    IF NOT v_target_found AND NOT v_is_ambiguous AND NOT v_is_conflict AND p_username_hint IS NOT NULL AND btrim(p_username_hint) <> '' THEN
        SELECT count(*) INTO v_match_count
        FROM public.users
        WHERE lower(btrim("Username")) = lower(btrim(p_username_hint));

        IF v_match_count = 1 THEN
            IF p_email IS NOT NULL AND btrim(p_email) <> '' THEN
                -- Username exists, but the payment email did not match this account's email!
                v_is_conflict := TRUE;
                v_conflict_reason := 'Konflik identitas akun: Username hint terdaftar tetapi email pembayaran tidak cocok.';
            ELSE
                SELECT * INTO v_target_user
                FROM public.users
                WHERE lower(btrim("Username")) = lower(btrim(p_username_hint))
                LIMIT 1 FOR UPDATE;
                v_target_found := TRUE;
            END IF;
        ELSIF v_match_count > 1 THEN
            v_is_ambiguous := TRUE;
        END IF;
    END IF;

    -- Layer 3: Exact Normalized Phone Match (NO substring LIKE '%...%')
    IF NOT v_target_found AND NOT v_is_ambiguous AND NOT v_is_conflict AND p_phone IS NOT NULL AND btrim(p_phone) <> '' THEN
        v_clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
        IF v_clean_phone LIKE '62%' THEN
            v_clean_phone := substr(v_clean_phone, 3);
        ELSIF v_clean_phone LIKE '0%' THEN
            v_clean_phone := substr(v_clean_phone, 2);
        END IF;

        IF length(v_clean_phone) >= 8 THEN
            SELECT count(*) INTO v_match_count
            FROM public.users
            WHERE (
                CASE 
                    WHEN regexp_replace("No HP", '[^0-9]', '', 'g') LIKE '62%' THEN substr(regexp_replace("No HP", '[^0-9]', '', 'g'), 3)
                    WHEN regexp_replace("No HP", '[^0-9]', '', 'g') LIKE '0%' THEN substr(regexp_replace("No HP", '[^0-9]', '', 'g'), 2)
                    ELSE regexp_replace("No HP", '[^0-9]', '', 'g')
                END
            ) = v_clean_phone;

            IF v_match_count = 1 THEN
                SELECT * INTO v_target_user
                FROM public.users
                WHERE (
                    CASE 
                        WHEN regexp_replace("No HP", '[^0-9]', '', 'g') LIKE '62%' THEN substr(regexp_replace("No HP", '[^0-9]', '', 'g'), 3)
                        WHEN regexp_replace("No HP", '[^0-9]', '', 'g') LIKE '0%' THEN substr(regexp_replace("No HP", '[^0-9]', '', 'g'), 2)
                        ELSE regexp_replace("No HP", '[^0-9]', '', 'g')
                    END
                ) = v_clean_phone
                LIMIT 1 FOR UPDATE;

                -- Blocker 2: Do not authorize financial account activation based solely on phone matching when payment email differs
                IF p_email IS NOT NULL AND btrim(p_email) <> '' AND lower(btrim(v_target_user."Email")) <> lower(btrim(p_email)) THEN
                    v_target_user := NULL;
                    v_target_found := FALSE;
                    v_is_conflict := TRUE;
                    v_conflict_reason := 'Konflik identitas: Nomor HP cocok dengan akun terdaftar tetapi email pembayaran berbeda.';
                ELSE
                    v_target_found := TRUE;
                END IF;
            ELSIF v_match_count > 1 THEN
                v_is_ambiguous := TRUE;
            END IF;
        END IF;
    END IF;

    -- [F] Handle Identity Conflict Safely (Fix B)
    IF v_is_conflict THEN
        UPDATE public.processed_payments
        SET status = 'MANUAL_RECONCILIATION_REQUIRED',
            activation_result = v_conflict_reason,
            processed_at = NOW()
        WHERE payment_id = p_payment_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'manual_reconciliation_needed',
            'code', 'ACCOUNT_CONFLICT',
            'payment_id', p_payment_id,
            'message', v_conflict_reason
        );
    END IF;

    -- [G] Handle Ambiguous Identity Safely (Fix B)
    IF v_is_ambiguous THEN
        UPDATE public.processed_payments
        SET status = 'MANUAL_RECONCILIATION_REQUIRED',
            activation_result = 'Identitas akun ambigu (lebih dari satu user cocok atau shared email). Dialihkan ke rekonsiliasi manual tanpa mutasi saldo/durasi.',
            processed_at = NOW()
        WHERE payment_id = p_payment_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'manual_reconciliation_needed',
            'code', 'AMBIGUOUS_IDENTITY',
            'payment_id', p_payment_id,
            'message', 'Identitas pembayaran cocok dengan lebih dari satu akun pengguna. Ditahan untuk verifikasi manual.'
        );
    END IF;

    -- [H] Existing User Atomic Mutation
    IF v_target_found THEN
        -- Blocker 1: Protect Admin accounts from any automatic webhook mutation
        IF v_target_user."Role" = 'Admin' THEN
            UPDATE public.processed_payments
            SET status = 'MANUAL_RECONCILIATION_REQUIRED',
                activation_result = 'Target akun memiliki Role Admin. Pembayaran dialihkan ke rekonsiliasi manual tanpa mutasi akun.',
                processed_at = NOW()
            WHERE payment_id = p_payment_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'manual_reconciliation_needed',
                'code', 'ADMIN_ACCOUNT_PROTECTED',
                'payment_id', p_payment_id,
                'account_username', v_target_user."Username",
                'message', 'Akun Admin tidak dapat dimutasi melalui webhook pembayaran otomatis. Ditahan untuk verifikasi manual.'
            );
        END IF;

        IF p_is_pro_addon THEN
            -- PRO Add-on: Decoupled entitlement in public.pro_entitlements
            -- Lock target user's pro_entitlements record
            SELECT * INTO v_existing_pro
            FROM public.pro_entitlements
            WHERE user_id = v_target_user.id
            FOR UPDATE;

            IF p_plan_name = 'PRO Add-On Lifetime' OR p_add_days = 0 THEN
                -- PRO Add-On Lifetime: Perpetual entitlement
                v_pro_is_lifetime := TRUE;
                v_pro_exp_text := 'Lifetime';

                IF FOUND THEN
                    UPDATE public.pro_entitlements
                    SET is_lifetime = TRUE,
                        expires_at = NULL,
                        source = 'payment',
                        last_payment_id = p_payment_id,
                        updated_at = NOW()
                    WHERE user_id = v_target_user.id;
                ELSE
                    INSERT INTO public.pro_entitlements (
                        user_id, is_lifetime, expires_at, source, last_payment_id, created_at, updated_at
                    ) VALUES (
                        v_target_user.id, TRUE, NULL, 'payment', p_payment_id, NOW(), NOW()
                    );
                END IF;

                v_result_msg := 'Aktivasi PRO Add-on Lifetime (Permanen) untuk @' || v_target_user."Username";
            ELSE
                -- PRO Add-On 1 Tahun (365 days)
                -- Business rule: Lifetime PRO cannot be downgraded by 1-year purchase
                IF FOUND AND v_existing_pro.is_lifetime = TRUE THEN
                    v_pro_is_lifetime := TRUE;
                    v_pro_exp_text := 'Lifetime';
                    v_result_msg := 'Perpanjangan PRO Add-on diterima: akun @' || v_target_user."Username" || ' sudah memiliki status PRO Lifetime permanen (tidak di-downgrade).';
                ELSE
                    -- Stack duration from max(current expiry, NOW())
                    IF FOUND AND v_existing_pro.expires_at IS NOT NULL AND v_existing_pro.expires_at > NOW() THEN
                        v_new_pro_exp := v_existing_pro.expires_at + INTERVAL '365 days';
                    ELSE
                        v_new_pro_exp := NOW() + INTERVAL '365 days';
                    END IF;

                    v_pro_is_lifetime := FALSE;
                    v_pro_exp_text := to_char(v_new_pro_exp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

                    IF FOUND THEN
                        UPDATE public.pro_entitlements
                        SET is_lifetime = FALSE,
                            expires_at = v_new_pro_exp,
                            source = 'payment',
                            last_payment_id = p_payment_id,
                            updated_at = NOW()
                        WHERE user_id = v_target_user.id;
                    ELSE
                        INSERT INTO public.pro_entitlements (
                            user_id, is_lifetime, expires_at, source, last_payment_id, created_at, updated_at
                        ) VALUES (
                            v_target_user.id, FALSE, v_new_pro_exp, 'payment', p_payment_id, NOW(), NOW()
                        );
                    END IF;

                    v_result_msg := 'Aktivasi PRO Add-on 1 Tahun untuk @' || v_target_user."Username" || ' (Masa aktif s/d ' || to_char(v_new_pro_exp, 'YYYY-MM-DD') || ')';
                END IF;
            END IF;

            -- Backward-compatible update to legacy flag
            UPDATE public.users
            SET "Akses_Watermark" = 'TRUE'
            WHERE "Username" = v_target_user."Username";

            v_final_exp := v_target_user."ExpiredAt";
        ELSE
            -- Subscription Renewal / Activation
            -- [1] Check for genuine Lifetime accounts:
            -- A genuine Lifetime account must be Active AND have either Paket='Lifetime' or genuinely active ExpiredAt='Lifetime'.
            -- Accidental legacy Pending accounts (Status='Pending', Paket IN ('1 Bulan','6 Bulan','1 Tahun')) that were
            -- initialized with ExpiredAt='Lifetime' due to registration bug are NOT genuine Lifetime accounts.
            IF v_target_user."Status" = 'Active' AND (v_target_user."Paket" = 'Lifetime' OR v_target_user."ExpiredAt" = 'Lifetime') THEN
                -- Preserve perpetual entitlement for genuine active Lifetime users
                v_final_exp := 'Lifetime';
                v_final_paket := v_target_user."Paket";

            ELSIF v_target_user."Status" <> 'Active' AND v_target_user."Paket" = 'Lifetime' AND p_plan_name <> 'Lifetime' THEN
                -- Ambiguous entitlement: Unverified user registered as Lifetime but paid for finite package (e.g. 1 Bulan).
                -- Hold for operator review to prevent automatic downgrade or accidental free lifetime.
                UPDATE public.processed_payments
                SET status = 'MANUAL_RECONCILIATION_REQUIRED',
                    activation_result = 'Konflik registrasi: Akun non-aktif berpaket Lifetime menerima pembayaran berdurasi (' || p_plan_name || '). Ditahan untuk rekonsiliasi manual.',
                    processed_at = NOW()
                WHERE payment_id = p_payment_id;

                RETURN jsonb_build_object(
                    'success', false,
                    'status', 'manual_reconciliation_needed',
                    'code', 'AMBIGUOUS_LIFETIME_REGISTRATION',
                    'payment_id', p_payment_id,
                    'message', 'Akun terdaftar sebagai Lifetime menerima pembayaran berdurasi. Ditahan untuk verifikasi manual.'
                );

            ELSIF p_plan_name = 'Lifetime' THEN
                v_final_exp := 'Lifetime';
                v_final_paket := 'Lifetime';

            ELSE
                -- Finite Subscription Activation (1 Bulan, 6 Bulan, 1 Tahun):
                -- Base date calculation:
                -- If existing account is already Active with a valid future date, stack from that date.
                -- If existing account is Pending/Inactive or has legacy 'Lifetime' artifact, start fresh from CURRENT_DATE.
                v_base_date := CURRENT_DATE;
                IF v_target_user."Status" = 'Active' 
                   AND v_target_user."ExpiredAt" IS NOT NULL 
                   AND v_target_user."ExpiredAt" <> '' 
                   AND v_target_user."ExpiredAt" <> 'Lifetime' THEN
                    BEGIN
                        IF (v_target_user."ExpiredAt"::DATE) > CURRENT_DATE THEN
                            v_base_date := v_target_user."ExpiredAt"::DATE;
                        END IF;
                    EXCEPTION WHEN OTHERS THEN
                        v_base_date := CURRENT_DATE;
                    END;
                END IF;

                v_days := COALESCE(NULLIF(p_add_days, 0), 30);
                v_new_exp := v_base_date + v_days;
                v_final_exp := to_char(v_new_exp, 'YYYY-MM-DD');
                v_final_paket := p_plan_name;
            END IF;

            -- Atomically activate user, update package and expiration.
            -- If user had Role='Demo', automatically promote to 'Photographer' upon paid subscription.
            UPDATE public.users
            SET "Status" = 'Active',
                "Paket" = v_final_paket,
                "ExpiredAt" = v_final_exp,
                "Role" = CASE WHEN "Role" = 'Demo' THEN 'Photographer' ELSE "Role" END
            WHERE "Username" = v_target_user."Username";

            v_result_msg := 'Aktivasi/Perpanjangan ' || p_plan_name || ' berhasil untuk @' || v_target_user."Username" || ' (s/d ' || v_final_exp || ')';
        END IF;

        -- Record success state in ledger atomically
        UPDATE public.processed_payments
        SET account_username = v_target_user."Username",
            status = 'SUCCESS',
            activation_result = v_result_msg,
            processed_at = NOW()
        WHERE payment_id = p_payment_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'processed',
            'action_type', 'USER_UPDATED',
            'payment_id', p_payment_id,
            'account_username', v_target_user."Username",
            'account_name', v_target_user."Nama",
            'account_email', v_target_user."Email",
            'account_phone', v_target_user."No HP",
            'plan_name', p_plan_name,
            'expired_at', v_final_exp,
            'is_pro_addon', p_is_pro_addon,
            'pro_is_lifetime', v_pro_is_lifetime,
            'pro_expires_at', v_pro_exp_text,
            'result_message', v_result_msg
        );

    -- [I] Fix D: PRO Add-on Purchased for Unknown / Unregistered Account
    -- An add-on MUST NOT create a new active subscription account!
    ELSIF p_is_pro_addon THEN
        UPDATE public.processed_payments
        SET status = 'MANUAL_RECONCILIATION_REQUIRED',
            activation_result = 'Pembelian PRO Add-on untuk user yang belum terdaftar. Ditahan untuk rekonsiliasi manual (tidak membuat akun langganan baru).',
            processed_at = NOW()
        WHERE payment_id = p_payment_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'manual_reconciliation_needed',
            'code', 'ADDON_WITHOUT_ACCOUNT',
            'payment_id', p_payment_id,
            'customer_email', lower(btrim(p_email)),
            'message', 'PRO Add-on dibeli untuk akun yang belum terdaftar. Pembayaran disimpan aman untuk verifikasi manual.'
        );

    -- [J] New User Provisioning Atomically Inside Database Transaction (Fix A, E)
    ELSIF p_create_new_user AND p_new_username IS NOT NULL AND p_new_password_hash IS NOT NULL AND p_email IS NOT NULL AND btrim(p_email) <> '' THEN
        v_chosen_username := btrim(p_new_username);

        -- Preflight duplicate check inside transaction under advisory lock
        SELECT count(*) INTO v_conflict_count
        FROM public.users
        WHERE lower(btrim("Email")) = lower(btrim(p_email))
           OR lower(btrim("Username")) = lower(v_chosen_username);

        IF v_conflict_count > 0 THEN
            UPDATE public.processed_payments
            SET status = 'MANUAL_RECONCILIATION_REQUIRED',
                activation_result = 'Konflik registrasi: Email atau Username sudah ada saat pembuatan akun baru.',
                processed_at = NOW()
            WHERE payment_id = p_payment_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'manual_reconciliation_needed',
                'code', 'ACCOUNT_CONFLICT',
                'payment_id', p_payment_id,
                'message', 'Email atau Username sudah terdaftar saat pembuatan akun baru. Ditahan untuk verifikasi manual.'
            );
        END IF;

        -- Fix E: Calculate explicit expiration (NEVER rely on table default 'Lifetime')
        IF p_plan_name = 'Lifetime' THEN
            v_final_exp := 'Lifetime';
        ELSE
            v_days := COALESCE(NULLIF(p_add_days, 0), 30);
            v_new_exp := CURRENT_DATE + v_days;
            v_final_exp := to_char(v_new_exp, 'YYYY-MM-DD');
        END IF;

        -- Insert new active user atomically
        INSERT INTO public.users (
            "Username", "Password", "Nama", "Role", "Status", 
            "Email", "No HP", "Paket", "ExpiredAt", "ConfirmToken", 
            "ProjectCreated", "Akses_Watermark"
        ) VALUES (
            v_chosen_username,
            p_new_password_hash,
            COALESCE(p_customer_name, v_chosen_username),
            'Photographer',
            'Active',
            lower(btrim(p_email)),
            COALESCE(p_phone, ''),
            p_plan_name,
            v_final_exp, -- Explicit expiration!
            '',
            '0',
            'FALSE'
        );

        v_result_msg := 'Akun baru otomatis dibuat & diaktifkan secara atomik: @' || v_chosen_username || ' (' || p_plan_name || ')';

        UPDATE public.processed_payments
        SET account_username = v_chosen_username,
            status = 'SUCCESS',
            activation_result = v_result_msg,
            processed_at = NOW()
        WHERE payment_id = p_payment_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'processed',
            'action_type', 'NEW_USER_CREATED',
            'payment_id', p_payment_id,
            'account_username', v_chosen_username,
            'account_name', COALESCE(p_customer_name, v_chosen_username),
            'account_email', lower(btrim(p_email)),
            'account_phone', COALESCE(p_phone, ''),
            'plan_name', p_plan_name,
            'expired_at', v_final_exp,
            'is_pro_addon', false,
            'result_message', v_result_msg
        );

    ELSE
        -- [K] User not found and incomplete data to provision: Hold for manual reconciliation
        UPDATE public.processed_payments
        SET status = 'MANUAL_RECONCILIATION_REQUIRED',
            activation_result = 'User belum terdaftar dan data tidak mencukupi untuk membuat akun otomatis.',
            processed_at = NOW()
        WHERE payment_id = p_payment_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'manual_reconciliation_needed',
            'action_type', 'INCOMPLETE_DATA',
            'payment_id', p_payment_id,
            'customer_email', lower(btrim(p_email)),
            'plan_name', p_plan_name,
            'message', 'User belum terdaftar dan data tidak lengkap untuk pembuatan akun otomatis.'
        );
    END IF;

EXCEPTION WHEN OTHERS THEN
    -- Any unexpected failure rolls back the entire transaction!
    RAISE EXCEPTION 'Atomic payment processing failed: %', SQLERRM;
END;
$$;

-- 3. Least Privilege Role Access Control
REVOKE ALL ON FUNCTION public.process_mayar_payment FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_mayar_payment TO service_role;
