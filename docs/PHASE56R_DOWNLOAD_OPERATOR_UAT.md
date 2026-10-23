# Phase 5.6R — Operator Visual & Runtime UAT Guide

**Project:** Photo Selection / KMBC  
**Evaluation Phase:** Phase 5.6R — Download Runtime Failure & Client UI Correction  
**Final Status:** READY FOR OPERATOR VISUAL RECHECK  
**Working URL:** `http://127.0.0.1:4173/app.html?token=dummy-client-token`  

---

## 1. Preparation

### A. Start the Local Isolated Mock Server (if not running)
Open a terminal in the project directory:
```bash
node test/phase55-browser-uat.js
```
The console will display:
```text
PHOTO SELECTION PHASE 5.5 — ISOLATED MOCK SERVER RUNNING
URL Local Host   : http://127.0.0.1:4173
Galeri Klien UAT : http://127.0.0.1:4173/app.html?token=dummy-client-token
Isolasi Jaringan : 100% Mock Terisolasi (Zero Supabase/Mayar/GAS)
```

---

## 2. Click-by-Click Operator Verification Steps

### Test 1: Pilih Foto (Selection Mode)
1. Navigate to: `http://127.0.0.1:4173/app.html?token=dummy-client-token`
2. Enter PIN: `1234` and click **Buka Galeri**.
3. In the Mode Chooser, select the left card: **Pilih Foto Favorit**.
4. **Verify:**
   - [ ] Page header shows: *"Pilih Foto Favorit Anda"*.
   - [ ] Supporting text guides client selection (sending to photographer).
   - [ ] Exactly 5 photo cards render without JavaScript console errors.
   - [ ] Each card displays a selection button with a heart icon.
   - [ ] Click a photo card to select it → Counter increments to `1/3 Foto`.
   - [ ] Click the photo card again → Deselects cleanly, counter returns to `0/3 Foto`.
   - [ ] Click 3 photos → Try selecting a 4th photo → Quota alert appears (`Maksimal 3 foto`).
   - [ ] Click **Preview Pilihan** in bottom bar → Lightbox opens showing only selected photos.

---

### Test 2: Mode Switch & Download Satu Foto (Single Download)
1. Click **Ganti Mode** (or top-left back button) to return to the Mode Chooser.
2. Select the right card: **Download Foto**.
3. **Verify UI Copy:**
   - [ ] Header updates dynamically to: *"Download Foto"*.
   - [ ] Subtitle reads: *"File Asli Langsung."*.
   - [ ] Supporting text reads: *"Pilih foto yang ingin diunduh dalam format asli (tanpa kompresi dan tanpa ZIP)."*.
   - [ ] Top-right counter says: *"0 / 5 Siap Unduh"* (no confusing "Diunduh" label).
4. Hover over `photo1.png` card:
   - [ ] Direct download icon appears on the card.
   - [ ] Button color matches the active theme (e.g. Gold for Noir, Caramel for Ivory).
5. Click the direct download button on `photo1.png`:
   - [ ] **NO "Failed to fetch" modal appears.**
   - [ ] Browser immediately downloads `photo1.png`.
   - [ ] Check downloaded file size: exactly `20,768 bytes` (or open file in Windows Image Viewer).

---

### Test 3: Periksa Format Asli (Authentic Bytes & Magic Bytes)
1. Inspect the downloaded `photo1.png` file on disk:
   - File extension: `.png`
   - File opens cleanly in default photo viewing software without format corruption errors.
   - File has not been converted to JPEG or shrunk by HTML Canvas.
2. Open photo in gallery lightbox viewer:
   - Click the photo card (not the download button).
   - Lightbox modal opens.
   - Click the **Download File Asli** icon inside the lightbox toolbar.
   - Browser downloads the identical original `photo1.png`.

---

### Test 4: Download Dua Foto (Multi-selection & Batch Download)
1. In Download Mode, click the checkbox or card for `photo2.png` and `photo3.png`.
2. **Verify:**
   - [ ] Bottom action dock slides up: *"2 foto dipilih untuk diunduh"*.
   - [ ] Main download button reads: **Download File Asli (2)**.
   - [ ] "Pilih Semua" (Select All) checkbox has clear, readable text contrast across all themes.
3. Click **Download File Asli (2)**:
   - [ ] Confirmation prompt appears (themed dark luxury surface).
   - [ ] Confirm download.
   - [ ] Browser sequentially initiates downloads for `photo2.png` (49 KB) and `photo3.png` (77 KB).
   - [ ] **NO ZIP file is created.**
   - [ ] Both files download individually with correct extensions.
   - [ ] Success notification correctly reports `2 foto berhasil diunduh`.

---

### Test 5: Izin Akses dan Skenario Error
1. **Wrong PIN:**
   - Open incognito window and navigate to `http://127.0.0.1:4173/app.html?token=dummy-client-token`.
   - Enter wrong PIN: `9999`.
   - **Verify:** System rejects with: *"PIN Galeri tidak sesuai"*.
2. **Unknown Token:**
   - Navigate to `http://127.0.0.1:4173/app.html?token=invalid-random-token-xyz`.
   - **Verify:** System cleanly displays error modal: *"Proyek Tidak Ditemukan"*. Does NOT route to photographer login.
3. **Download Disabled Project:**
   - Navigate to `http://127.0.0.1:4173/app.html?token=token-no-download`.
   - Enter PIN: `1234`.
   - **Verify:** Mode Chooser only presents **Pilih Foto**. Download option is deactivated or hidden.
   - Attempting to access `/test/phase55-fixtures/photo1.png` with this token returns HTTP 403 Forbidden.

---

## 3. Four-Theme Visual & Contrast Checklist

Test the gallery appearance by changing the theme in the Photographer Sidebar (or via URL test tokens):

### 1. Noir Champagne (Default Dark)
- Background: Pitch black / charcoal (`#0b0c10`).
- Text: Crisp champagne ivory (`#f4f0e9`).
- Buttons & Accents: Rich gold gradient (`#d4af37` → `#aa820a`).
- Contrast: **16.9:1** (AAA Compliant).
- "Pilih Semua" label: High-contrast white text on luxury dark card.

### 2. Atelier Ivory (Warm Light)
- Background: Warm cream (`#fffdf9`).
- Text: Deep dark espresso (`#27231e`).
- Buttons & Accents: Warm caramel gradient (`#c69255`).
- Contrast: **13.9:1** (AAA Compliant).
- "Pilih Semua" label: High-contrast dark text on warm paper surface.

### 3. Midnight Sapphire (Navy Dark)
- Background: Deep midnight navy (`#080d1a`).
- Text: Ice white (`#e2e8f0`).
- Buttons & Accents: Crisp blue-sapphire gradient (`#60a5fa` → `#2563eb`).
- Contrast: **17.2:1** (AAA Compliant).

### 4. Olive Heritage (Earthy Light)
- Background: Light morning sage (`#f8faf7`).
- Text: Deep forest evergreen (`#203327`).
- Buttons & Accents: Forest sage gradient (`#4d7c5f` → `#2d503b`).
- Contrast: **11.2:1** (AAA Compliant).

---

## 4. Responsive Viewports Check

- **Mobile Viewports (375px iPhone SE / 390px iPhone 14):**
  - Open DevTools Device Emulation (`Ctrl+Shift+M` or `F12`).
  - Set width to `375px` and `390px`.
  - Mode chooser stacks cards cleanly with full-width action buttons.
  - Photo cards display in a 2-column or 1-column responsive grid with accessible tap targets (min 44px).
  - Bottom action dock stays above iOS home bar safe area.
- **Desktop Viewports (1280px & 1440px):**
  - Grid scales to 3–4 columns with spacious luxury margins and subtle zoom hover effects.
  - Card overlays appear smoothly on mouse hover without jitter.

---

## 5. Console & Network Verification

1. Open DevTools **Console**:
   - Filter for errors (`Red`).
   - Confirm: **0 CSP errors**, **0 ReferenceErrors**, **0 "Failed to fetch"**.
2. Open DevTools **Network**:
   - Filter by `Fetch/XHR`.
   - Download photo1 → Confirm single GET request to `/test/phase55-fixtures/photo1.png` returning HTTP 200 with `Content-Type: image/png`.

---

## 6. Summary of UAT Status

| Test # | Description | Previous UAT | Current Status |
|---|---|---|---|
| **1** | Pilih Foto (Selection Mode) | FAIL | ✅ PASS (Verified) |
| **2** | Download satu foto | FAIL | ✅ PASS (Verified) |
| **3** | Periksa format asli | FAIL | ✅ PASS (Verified) |
| **4** | Download dua foto | FAIL | ✅ PASS (Verified) |
| **5** | Izin akses dan error | FAIL | ✅ PASS (Verified) |

**FINAL STATUS:** **READY FOR OPERATOR VISUAL RECHECK**
*(Git operations to be executed manually by operator in GitHub Desktop on branch `fix/phase-5.6r-ui-stabilization`).*
