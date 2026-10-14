-- =========================================================================
-- PHOTO SELECTION / KMBC — PHASE 4.7.5 TWO-SESSION CONCURRENCY TEST SCRIPT
-- Guides true multi-process concurrent execution testing against PostgreSQL 14+
-- Simulates:
--   Scenario A: Identical Transaction ID Concurrent Delivery Race
--   Scenario B: Competing User Provisioning on Same Unregistered Email
-- =========================================================================

/*
EXECUTION INSTRUCTIONS:
Open two separate terminal windows with psql connected to your isolated scratch database:
  Terminal 1: psql -d test_photo_selection -f test/concurrent-session1.sql
  Terminal 2: psql -d test_photo_selection -f test/concurrent-session2.sql
*/

-- -------------------------------------------------------------------------
-- SESSION 1 (Run in Terminal 1):
-- -------------------------------------------------------------------------
-- BEGIN;
-- -- Claim payment ID atomically
-- SELECT process_mayar_payment(
--     p_payment_id => 'tx_concurrent_race_99',
--     p_email => 'concurrent_racer@example.com',
--     p_phone => '08123456789',
--     p_username_hint => NULL,
--     p_product_name => 'Paket 1 Bulan - Photo Selection',
--     p_is_pro_addon => false,
--     p_add_days => 30,
--     p_plan_name => '1 Bulan',
--     p_amount => 25000,
--     p_currency => 'IDR',
--     p_create_new_user => true,
--     p_new_username => 'racer_alpha',
--     p_new_password_hash => 'hash_test_123',
--     p_customer_name => 'Racer Alpha'
-- );
-- -- DO NOT COMMIT YET. Keep transaction open to hold row lock and advisory lock.
-- -- SELECT pg_sleep(5); -- Or pause here manually before COMMIT;

-- -------------------------------------------------------------------------
-- SESSION 2 (Run in Terminal 2 at the exact same time):
-- -------------------------------------------------------------------------
-- -- Attempt to process identical payment concurrently:
-- SELECT process_mayar_payment(
--     p_payment_id => 'tx_concurrent_race_99',
--     p_email => 'concurrent_racer@example.com',
--     p_phone => '08123456789',
--     p_username_hint => NULL,
--     p_product_name => 'Paket 1 Bulan - Photo Selection',
--     p_is_pro_addon => false,
--     p_add_days => 30,
--     p_plan_name => '1 Bulan',
--     p_amount => 25000,
--     p_currency => 'IDR'
-- );
-- -- Session 2 waits on the advisory lock or unique constraint on processed_payments.
-- -- As soon as Session 1 COMMITs:
-- -- Session 2 immediately returns:
-- -- { "success": true, "status": "already_processed", "message": "Payment already processed previously (idempotent duplicate skipped)" }
-- -- Zero duplicate account created, exactly ONE user created in users table, exactly ONE row in processed_payments!
