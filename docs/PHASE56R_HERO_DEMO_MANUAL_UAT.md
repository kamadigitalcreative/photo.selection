# PHASE 5.6R — HERO CUSTOMIZER & DEMO FLOW MANUAL UAT GUIDE

**Date:** 2026-10-21  
**Project:** Photo Selection / KMBC (`photo.selection`)  
**Target URL:** `http://127.0.0.1:4173/app.html`  
**Execution Environment:** Isolated Local Mock Sandbox (Port 4173)  
**Final Status:** **READY FOR OPERATOR VISUAL RECHECK**  
**Production Gate:** **STRICT NO-GO FOR PRODUCTION**

---

## 1. Prerequisites & Test Credentials

Ensure the mock server is running on port 4173:
```bash
node test/phase55-browser-uat.js
```

Use the following authorized mock test accounts:

| Role | Username | Password | Purpose |
| :--- | :--- | :--- | :--- |
| **Demo Photographer** | `demo` or `demo_user` | `password123` | Demo flow & limits testing |
| **Subscribed Photographer** | `fotografer` | `password123` | Active photographer workspace & banner |
| **System Admin** | `admin` | `password123` | Admin role isolation |
| **Invalid Test Account** | `random_user` | `wrongpass` | Negative authentication check |

---

## 2. Click-by-Click Verification Procedures

### Test Case 1: Demo Login & Authentication Security
1. Open your browser and navigate to `http://127.0.0.1:4173/app.html`.
2. **Negative Test A (Unknown Username):**
   - Enter username: `unknown_user`, password: `password123`.
   - Click **Masuk**.
   - **Expectation:** Error modal shows *"Username tidak ditemukan"*. Login rejected.
3. **Negative Test B (Wrong Password):**
   - Enter username: `demo`, password: `wrongpassword`.
   - Click **Masuk**.
   - **Expectation:** Error modal shows *"Password salah"*. Login rejected.
4. **Positive Test (Manual Demo Login):**
   - Enter username: `demo`, password: `password123`.
   - Click **Masuk**.
   - **Expectation:** Success modal appears with dark luxury theme. Lands on Projects workspace. Header badge displays `PAKET DEMO`. Admin menus remain hidden.
5. **Auto-Login Compatibility Test:**
   - In browser address bar, open: `http://127.0.0.1:4173/app.html?demo=true`.
   - **Expectation:** Automatically populates `demo` and `password123`, triggers login, and enters dashboard cleanly without looping.

---

### Test Case 2: Hero Banner Default State vs Custom Image Stacking
1. While logged in as `demo`, observe the top section in **Daftar Proyek Saya**.
2. **Default State Verification:**
   - Fallback vector art (`<div id="photographerHeroFallback">`) with luxury camera icon is visible.
   - `<img id="photographerHeroImg">` is hidden (`display: none`).
3. Click the **"Atur Banner"** button.
4. In the modal, click `💍 Luxury Wedding` preset (or upload a local JPG/PNG).
5. Click **"Terapkan Banner"**.
6. **Custom State Verification:**
   - `<img id="photographerHeroImg">` is prominently visible (`display: block`).
   - `#photographerHeroFallback` is completely hidden.
   - Heading *"Manajemen Proyek Foto"*, description, and action buttons (*Buat Proyek Baru*, *Pantau Klien*, *Atur Banner*) remain sharp and readable over the subtle gradient overlay.
   - Photo is crisp, vibrant, and NOT washed out.

---

### Test Case 3: Independent Desktop and Mobile Crop Configuration
1. Click **"Atur Banner"** to reopen the modal.
2. Notice the preview device toggles at the top: **Desktop** and **Mobile**.
3. **Configure Desktop Crop:**
   - Click **Desktop** button (active gold highlight).
   - Heading displays: *"Pengaturan Posisi & Zoom (Desktop)"*.
   - Set **Focal X**: `80%`, **Focal Y**: `20%`, **Zoom**: `130%`.
   - The widescreen preview frame responds in real time.
4. **Configure Mobile Crop Independently:**
   - Click **Mobile** button.
   - Preview frame smoothly transitions to mobile aspect ratio (`280px` width).
   - Heading displays: *"Pengaturan Posisi & Zoom (Mobile / HP)"*.
   - Notice the sliders reset to Mobile's independent coordinates (`50%`, `50%`, `100%`).
   - Change Mobile **Focal X**: `15%`, **Focal Y**: `85%`, **Zoom**: `110%`.
5. **Verify State Persistence Across Device Toggles:**
   - Click **Desktop** again: Sliders immediately restore `80%`, `20%`, `130%`.
   - Click **Mobile** again: Sliders immediately restore `15%`, `85%`, `110%`.
6. Click **"Terapkan Banner"**.

---

### Test Case 4: Responsive Viewport Validation (1440px to 375px)
Open browser DevTools (F12) and test at the following specific viewport widths:

1. **Desktop 1440px & 1280px:**
   - Banner sits on the right $48\%$ of the hero card.
   - CSS binds desktop properties (`--hero-fx: 80%`, `--hero-fy: 20%`, `--hero-zoom: 1.3`).
   - Left-to-right fade overlay seamlessly blends into the dark card body.
2. **Tablet 768px:**
   - Hero card switches to vertical column layout.
   - Media container expands to full width with `opacity: 1 !important;` (photo is vivid, NOT faded to $25\%$).
   - Top-to-bottom subtle readability gradient overlay protects text readability.
   - CSS binds mobile properties (`--hero-fx: 15%`, `--hero-fy: 85%`, `--hero-zoom: 1.1`).
3. **Mobile 390px (iPhone 14) & 375px (iPhone SE):**
   - Entire hero card fits without horizontal overflow.
   - Text is crisp, buttons stack neatly.
   - Photo remains prominently visible behind the subtle readability overlay.

---

### Test Case 5: Safe Storage, Isolation & Reset Behavior
1. **Refresh Test:**
   - Press F5 to refresh the browser.
   - Custom banner persists for `demo` user.
2. **Account Switching Isolation:**
   - Log out by clicking the avatar $\rightarrow$ **Keluar**.
   - Notice that upon logout, active context resets to `guest`; the workspace hero immediately reverts to default fallback artwork (no image leakage to unauthenticated viewers).
   - Log in as `fotografer` (`password123`).
   - `fotografer` has their own separate banner (or default if unconfigured). `demo`'s banner does NOT leak into `fotografer`'s account.
   - Log out and log back in as `demo` (`password123`).
   - `demo`'s custom banner is faithfully restored.
3. **Reset to Default:**
   - Click **"Atur Banner"**.
   - Click **"Kembalikan Default"**.
   - Click **"Terapkan Banner"**.
   - Hero card immediately restores the default geometric camera vector fallback.

---

## 3. Remaining Blockers & Next Actions

| Capability | Current Status | Blocker / Requirement |
| :--- | :--- | :--- |
| **Local Customizer & Crop** | ✅ COMPLETE & TESTED | None. Local storage is fully functional. |
| **Permanent Cloud Sync** | ⏸️ BLOCKED | Requires Operator approval for Supabase Storage bucket policy & schema migration adding `hero_banner_url`, `hero_focal_x_dt`, `hero_focal_y_dt`, `hero_focal_x_mb`, `hero_focal_y_mb` columns to `public.users`. |
| **Production Deployment** | ⏸️ STRICT NO-GO | Awaiting manual operator review in GitHub Desktop. |

**Final Recommendation:** Proceed with manual visual UAT on `http://127.0.0.1:4173/app.html`.
