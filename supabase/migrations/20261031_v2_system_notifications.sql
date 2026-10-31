-- =========================================================================
-- PHOTO SELECTION / KMBC — V2.0 SYSTEM NOTIFICATIONS OVERHAUL
-- Purpose: Remove legacy V1 notifications (v1-v7) and insert official V2.0 updates (v8-v12)
-- Safety: Idempotent DELETE & INSERT with ON CONFLICT / EXISTS guards
-- =========================================================================

-- 1. Remove legacy notifications (v1 through v7)
DELETE FROM public.system_updates 
WHERE "ID" IN ('v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12');

-- 2. Insert new V2.0 system updates (v8 through v12) in descending chronological order
INSERT INTO public.system_updates ("ID", "Judul", "Versi", "Tanggal", "Pesan", "Status", "created_at")
VALUES 
  (
    'v8',
    'Pembaruan Besar Photo Selection V2.0',
    'V2.0',
    '2026-10-31',
    'Rilis akbar Photo Selection V2.0! Hadir dengan 4 tema mewah The Atelier, download instan ZIP & foto resolusi asli, proteksi watermark otomatis, kuota multi-kategori, dan sistem upsell cuan ekstra.',
    'Active',
    '2026-10-31 00:05:00+00'
  ),
  (
    'v9',
    'Koleksi 4 Tema Mewah (The Atelier)',
    'TEMA',
    '2026-10-31',
    'Nikmati 4 tema visual berkelas: Noir Champagne, Midnight Sapphire, Atelier Ivory, dan Olive Heritage dengan kontras tinggi dan tampilan memanjakan mata klien di HP & Desktop.',
    'Active',
    '2026-10-31 00:04:00+00'
  ),
  (
    'v10',
    'Download Foto Resolusi Penuh & Ekspor ZIP',
    'FITUR',
    '2026-10-31',
    'Klien kini dapat mengunduh foto pilihan mereka secara mandiri per foto resolusi asli langsung dari Google Drive, atau mengekspor seluruh foto terpilih ke dalam satu file ZIP ringkas tanpa ribet.',
    'Active',
    '2026-10-31 00:03:00+00'
  ),
  (
    'v11',
    'Fitur PRO: Watermark, Kategori & Upsell Extra',
    'PRO',
    '2026-10-31',
    'Maksimalkan cuan studio Anda! Atur kuota foto per kategori (Akad, Resepsi, dll), proteksi watermark otomatis, musik galeri (BGM), serta tagihan biaya ekstra foto otomatis ke WhatsApp klien.',
    'Active',
    '2026-10-31 00:02:00+00'
  ),
  (
    'v12',
    'Dukungan Bahasa Inggris & Optimasi Mobile',
    'UPDATE',
    '2026-10-31',
    'Galeri klien kini dapat beralih ke Bahasa Inggris (EN) dengan sekali klik. Navigasi mobile dioptimalkan di semua ukuran layar smartphone agar klien semakin nyaman memilih foto.',
    'Active',
    '2026-10-31 00:01:00+00'
  );

COMMENT ON TABLE public.system_updates IS 'Photo Selection V2.0 release announcements and feature notifications.';

