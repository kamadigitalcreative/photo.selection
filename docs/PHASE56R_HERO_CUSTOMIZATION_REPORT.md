# PHASE 5.6R — PHOTOGRAPHER HERO BANNER CUSTOMIZATION & STORAGE GATE REPORT

**Date:** 2026-10-21  
**Project:** Photo Selection / KMBC (`photo.selection`)  
**Status:** **IMPLEMENTED WITH STORAGE GATE HONESTY (LOCAL PREVIEW ACTIVE / CLOUD BLOCKED)**

---

## 1. Feature Architecture & User Experience

The Photographer Hero Banner customization enables photographers to customize their primary Projects workspace hero banner.

### 1.1 Trigger Access Points
1. **Projects View Direct Trigger:** A dedicated `"Atur Banner"` button in `section.photographer-hero` right next to the workspace title and subtitle.
2. **Pengaturan Studio Integration:** A dedicated `"Banner Hero Workspace"` settings card under `section-settings` linking directly to the editor modal.

### 1.2 Interactive Capabilities
- **Desktop vs Mobile Preview Toggle:** Live responsive preview frame allowing the photographer to test how their composition crops at standard desktop $(144\text{px}\text{ height})$ vs mobile $(180\text{px}\text{ height}, 280\text{px}\text{ max-width})$.
- **Focal Point Controls:** Granular sliders for Focal X $(0\% - 100\%)$ and Focal Y $(0\% - 100\%)$ ensuring key subjects are never cropped out.
- **Zoom / Scale Control:** Range slider from $100\%$ to $160\%$ for non-destructive composition adjustments.
- **Editorial Presets:** Quick one-click curated SVG presets:
  - 💍 Luxury Wedding (warm champagne tones)
  - 📸 Studio Portrait (sapphire royal contrast)
  - 🏛️ Architectural (minimalist sage olive)
- **Image File Upload:** Client-side drag/drop or file selection supporting JPG, PNG, and WebP (up to 3MB) with non-destructive Base64 reading.
- **Reset to Default:** Instant restore of the default luxury geometric vector artwork.

---

## 2. Storage Capability & Database Audit (Section 8.5 Compliance)

### 2.1 Supabase Schema & API Inspection
An inspection of `api/supabase.js` and `test/isolated-postgresql-runner.sql` was conducted:
- The production `public.users` table contains exactly 24 columns:
  `id, username, password, email, nama, no_wa, paket, expiredAt, role, status, created_at, updated_at, brandName, brandLogo, Akses_Watermark, isPremiumAddon, sessionId, last_active, payment_channel, payment_status, is_lifetime, pro_expired_at, max_quota, notes`.
- **Zero columns exist for Hero Banner URL, Focal X, Focal Y, or Zoom.**
- `handleUploadBrandLogo` in `api/supabase.js` does not persist images to Supabase Storage buckets, as storage bucket policies are not yet provisioned.

### 2.2 Truthful Transparency & Storage Gate
In strict adherence to instructions:
- **Permanent Cloud Storage Status:** **BLOCKED awaiting Operator approval**.
- **No False Claims:** The UI explicitly displays an alert box informing the photographer:
  > *"Kustomisasi banner tersimpan aman pada profil lokal per-fotografer di browser Anda. Penyimpanan cloud lintas-perangkat permanen berstatus BLOCKED (menunggu migrasi bucket storage & persetujuan Operator)."*
- **Local Persistence & Isolation:** Configuration is saved in `localStorage` under `ps_hero_banner_<username>`. Switching accounts or logging out prevents cross-user state leakage.
