-- =========================================================================
-- PHOTO SELECTION / KMBC — STUDIO THEME PERSISTENCE MIGRATION
-- Purpose: Add Theme column to users table for studio-level client theme synchronization
-- Safety: Idempotent (ADD COLUMN IF NOT EXISTS), non-destructive, default 'noir'
-- =========================================================================

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS "Theme" TEXT DEFAULT 'noir';

-- Optional comment for documentation
COMMENT ON COLUMN public.users."Theme" IS 'Studio-level visual theme chosen by the photographer (noir, ivory, sapphire, olive)';
