-- =========================================================================
-- PHOTO SELECTION / KMBC — PHASE 4.7.5 STORAGE MONITORING (READ-ONLY)
-- Purpose: Monitor disk space consumed by processed_payments on Supabase Free Plan (500 MB limit)
-- =========================================================================

-- 1. Exact storage breakdown for processed_payments table and indexes
SELECT 
    'processed_payments' AS table_name,
    count(*) AS row_count,
    pg_size_pretty(pg_total_relation_size('public.processed_payments')) AS total_disk_size,
    pg_size_pretty(pg_relation_size('public.processed_payments')) AS table_data_size,
    pg_size_pretty(pg_indexes_size('public.processed_payments')) AS index_size,
    CASE 
        WHEN count(*) > 0 THEN round(pg_relation_size('public.processed_payments')::numeric / count(*), 1) 
        ELSE 0 
    END AS avg_bytes_per_row
FROM public.processed_payments;

-- 2. Comparison with legacy mayar_logs table
SELECT 
    'mayar_logs' AS table_name,
    count(*) AS row_count,
    pg_size_pretty(pg_total_relation_size('public.mayar_logs')) AS total_disk_size,
    pg_size_pretty(pg_relation_size('public.mayar_logs')) AS table_data_size,
    pg_size_pretty(pg_indexes_size('public.mayar_logs')) AS index_size
FROM public.mayar_logs;

-- 3. Overall database size and remaining Free Plan quota (500 MB)
SELECT 
    pg_size_pretty(pg_database_size(current_database())) AS current_db_size,
    '500 MB' AS free_plan_limit,
    round(
        (pg_database_size(current_database())::numeric / (500 * 1024 * 1024)) * 100, 
        2
    ) || ' %' AS quota_used_pct;
