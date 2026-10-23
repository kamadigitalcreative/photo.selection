# Phase 5.6R — Security & Download Operator UAT Guide

**Project:** Photo Selection / KMBC  
**Evaluation Phase:** Phase 5.6R — Download Authorization Correctness Gate  
**Final Status:** READY FOR OPERATOR VISUAL RECHECK  
**Working URL:** `http://127.0.0.1:4173/app.html?token=dummy-client-token`  

---

## 1. Important Note on Verification Status

> [!IMPORTANT]
> **Status Clarification: Automated PASS vs. Operator Manual Recheck**
>
> - **Automated Suite Status:** **PASS** (All 187 automated tests across 7 test suites pass in the isolated local sandbox).
> - **Operator Browser Verification:** **PENDING / NOT RUN** (Awaiting manual execution by the operator in their local desktop browser).
> - **Download Initiation vs. Disk Save:** In web applications, clicking download initiates the browser download prompt or browser download pipeline. Whether files are written to disk depends on local browser permissions (e.g. allowing multi-file downloads).

---

## 2. Environment Setup

1. Open a terminal in the repository root:
   ```bash
   node test/phase55-browser-uat.js
   ```
2. Confirm the console output:
   ```text
   PHOTO SELECTION PHASE 5.5 — ISOLATED MOCK SERVER RUNNING
   URL Local Host   : http://127.0.0.1:4173
   Galeri Klien UAT : http://127.0.0.1:4173/app.html?token=dummy-client-token
   Isolasi Jaringan : 100% Mock Terisolasi (Zero Supabase/Mayar/GAS)
   ```

---

## 3. Click-by-Click Operator Verification Guide

### Scenario 1: Pilih Foto (Selection Mode)
- **Status:** Automated: ✅ PASS | Operator Browser: ⏸️ **PENDING OPERATOR RECHECK**
- **Action Steps:**
  1. Open `http://127.0.0.1:4173/app.html?token=dummy-client-token` in Chrome or Edge.
  2. Enter PIN: `1234` and click **Buka Galeri**.
  3. In the Mode Chooser, click the left card: **Pilih Foto Favorit**.
- **Visual Checks:**
  - [ ] Header displays: *"Pilih Foto Favorit Anda"*.
  - [ ] Subtitle reads: *"Seleksi Foto Eksklusif."*.
  - [ ] Exactly 5 photo cards render without any JavaScript console errors.
  - [ ] Click on `photo1.png` card → Card receives active border, top-right counter increments to `1 / 3 Foto`.
  - [ ] Click on `photo1.png` card again → Card deselects cleanly, counter decrements to `0 / 3 Foto`.
  - [ ] Select 3 photos (`photo1.png`, `photo2.png`, `photo3.png`) → Try selecting a 4th photo → Warning modal appears: *"Batas Maksimal Tercapai (3 foto)"*.
  - [ ] Click **Preview Pilihan** in bottom bar → Lightbox opens showing only selected photos.

---

### Scenario 2: Download Satu Foto (Single Direct Download)
- **Status:** Automated: ✅ PASS | Operator Browser: ⏸️ **PENDING OPERATOR RECHECK**
- **Action Steps:**
  1. Click **Ganti Mode** (or top-left back button) to return to the Mode Chooser.
  2. Click the right card: **Download Foto**.
- **Visual & Functional Checks:**
  - [ ] Hero heading dynamically updates to: *"Download Foto"*.
  - [ ] Subtitle reads: *"File Asli Langsung."*.
  - [ ] Supporting text reads: *"Pilih foto yang ingin diunduh dalam format asli (tanpa kompresi dan tanpa ZIP)."*.
  - [ ] Top-right counter reads: *"0 / 5 Siap Unduh"* (no ambiguous "Diunduh" label).
  - [ ] Hover over `photo1.png` card → Direct download button appears with theme-consistent color (Gold for Noir, Caramel for Ivory; **no rogue bright blue buttons**).
  - [ ] Click the direct download button on `photo1.png`.
  - [ ] **NO "Failed to fetch" modal appears.**
  - [ ] Success toast appears: *"Unduhan Dimulai: photo1.png"*.
  - [ ] Browser download manager initiates download of `photo1.png`.

---

### Scenario 3: Periksa Format Asli (Authentic Bytes & Magic Bytes)
- **Status:** Automated: ✅ PASS | Operator Browser: ⏸️ **PENDING OPERATOR RECHECK**
- **Action Steps:**
  1. Locate downloaded `photo1.png` in the browser download folder.
  2. Verify properties:
     - Exact filename: `photo1.png`.
     - File size: exactly `20,768 bytes`.
     - Double-click file: opens cleanly in Windows Photos / Image Viewer without corruption warnings.
  3. In the Client Gallery, click on `photo2.png` thumbnail to open the Lightbox viewer.
  4. In the viewer top toolbar, click the **Download** button.
  5. Verify that `photo2.png` (49,183 bytes) downloads directly without Canvas conversion or compression.

---

### Scenario 4: Download Dua Foto (Multi-selection & Batch Download)
- **Status:** Automated: ✅ PASS | Operator Browser: ⏸️ **PENDING OPERATOR RECHECK**
- **Action Steps:**
  1. In Download Mode, click the selection checkbox on `photo2.png` and `photo3.png`.
  2. Inspect bottom action dock:
     - [ ] Text reads: *"2 foto dipilih untuk diunduh"*.
     - [ ] Main action button reads: **Download File Asli (2)**.
     - [ ] "Pilih Semua" (Select All) checkbox label is crisp and easily readable (AAA contrast target).
  3. Click **Download File Asli (2)**:
     - [ ] Confirmation dialog appears on a luxury dark surface.
     - [ ] Click **Ya, Unduh File Asli**.
     - [ ] Loader modal displays sequential progress: *"Mengunduh berkas 1 / 2: photo2.png"* then *"Mengunduh berkas 2 / 2: photo3.png"*.
     - [ ] **NO ZIP file is generated.**
     - [ ] Browser initiates download of `photo2.png` (49 KB) and `photo3.png` (77 KB) individually.
     - [ ] Note: If browser displays "This site is attempting to download multiple files", click **Allow**.
     - [ ] Success notification correctly confirms both files started.

---

### Scenario 5: Izin Akses dan Skenario Keamanan (Security Gates)
- **Status:** Automated: ✅ PASS | Operator Browser: ⏸️ **PENDING OPERATOR RECHECK**
- **Action Steps:**
  1. **Direct Fixture Access Without Token:**
     - Open a new browser tab and navigate directly to:
       `http://127.0.0.1:4173/test/phase55-fixtures/photo1.png`
     - **Result:** **HTTP 403 Forbidden** with JSON response:
       `{"status":"error","code":"AUTH_REQUIRED","message":"HTTP 403: Kredensial otorisasi tidak ditemukan..."}`.
     - File is NOT exposed.
  2. **Direct Fixture Access With Random Token:**
     - Navigate to:
       `http://127.0.0.1:4173/test/phase55-fixtures/photo1.png?token=fake-random-token`
     - **Result:** **HTTP 403 Forbidden** (`INVALID_TOKEN`).
  3. **Direct Fixture Access Before PIN Verification:**
     - Navigate to:
       `http://127.0.0.1:4173/test/phase55-fixtures/photo1.png?token=token-ivory`
     - **Result:** **HTTP 403 Forbidden** (`NOT_AUTHENTICATED`).
  4. **Wrong PIN Attempt:**
     - Navigate to: `http://127.0.0.1:4173/app.html?token=dummy-client-token`.
     - Enter incorrect PIN: `9999` and submit.
     - **Result:** Rejection modal: *"PIN Keamanan tidak sesuai"*. Gallery remains locked.
  5. **Download Disabled Project:**
     - Navigate to: `http://127.0.0.1:4173/app.html?token=token-no-download`.
     - Enter PIN: `1234`.
     - Mode Chooser presents only **Pilih Foto**. The Download option is disabled/hidden.
     - Direct URL `http://127.0.0.1:4173/test/phase55-fixtures/photo1.png?token=token-no-download` returns **HTTP 403** (`DOWNLOAD_DISABLED`).
  6. **Cross-Project Access Gate:**
     - In an incognito window, unlock `token-proj-2` with PIN `1234`.
     - Attempt to download `photo1.png` (which belongs to `dummy-client-token`):
       `http://127.0.0.1:4173/test/phase55-fixtures/photo1.png?token=token-proj-2`
     - **Result:** **HTTP 403 Forbidden** (`CROSS_PROJECT_FORBIDDEN`).

---

## 4. Four-Theme Visual & Contrast Checklist

Verify in the sidebar or via URL parameters:
1. **Noir Champagne (Dark):** `#0b0c10` surface, `#f4f0e9` text, gold gradient buttons (`#d4af37`). Contrast: **16.9:1** (AAA).
2. **Atelier Ivory (Light):** `#fffdf9` warm cream, `#27231e` espresso text, caramel buttons (`#c69255`). Contrast: **13.9:1** (AAA).
3. **Midnight Sapphire (Navy):** `#080d1a` navy, `#e2e8f0` ice text, sapphire buttons (`#60a5fa`). Contrast: **17.2:1** (AAA).
4. **Olive Heritage (Light):** `#f8faf7` sage, `#203327` forest text, olive buttons (`#4d7c5f`). Contrast: **11.2:1** (AAA).

---

## 5. Console & Network Verification

1. **Console:** Zero red errors, zero CSP violations, zero `TypeError: Failed to fetch`.
2. **Network Tab:**
   - Same-origin download requests to `/test/phase55-fixtures/photo1.png` contain `X-Client-Token` and `Authorization`.
   - External URLs receive **zero** authentication headers (no credential leakage).

---

## 6. Summary for Operator

| Scenario | Automated Test Suite | Operator Browser Recheck |
|---|---|---|
| 1. Pilih Foto (Selection Mode) | ✅ PASS (SEC15) | ⏸️ Awaiting Operator Recheck |
| 2. Download Satu Foto | ✅ PASS (SEC05, SEC14) | ⏸️ Awaiting Operator Recheck |
| 3. Periksa Format Asli (SHA-256) | ✅ PASS (SEC13) | ⏸️ Awaiting Operator Recheck |
| 4. Download Dua Foto (No ZIP) | ✅ PASS (SEC14) | ⏸️ Awaiting Operator Recheck |
| 5. Izin Akses & Keamanan | ✅ PASS (SEC01–SEC10) | ⏸️ Awaiting Operator Recheck |

**FINAL STATUS:** **READY FOR OPERATOR VISUAL RECHECK**
*(Git operations remain strictly under manual operator control via GitHub Desktop).*
