# PHASE 5.6R — OPERATOR VISUAL UAT CHECKLIST

**Date:** 2026-10-19  
**Status:** READY FOR OPERATOR VISUAL RECHECK  
**Branch:** `fix/phase-5.6r-ui-stabilization`  
**Server URL:** `http://127.0.0.1:4173/`

---

## 1. Setup & Environment

Ensure the isolated mock server is running locally on port 4173:
```powershell
node test/phase55-browser-uat.js
```
Open `http://127.0.0.1:4173/app` in your browser (Google Chrome / Edge recommended).

---

## 2. Priority Area Recheck Procedures

### Area 1: Theme Picker Functionality & Persistence
1. Login as Photographer (`fotografer` / `password123`).
2. Navigate to **Pengaturan Studio** -> locate the card **Tampilan & Tema Studio**.
3. Verify that 4 visual cards are displayed:
   - **Noir Champagne** (Obsidian & Gold)
   - **Atelier Ivory** (Cream & Bronze)
   - **Midnight Sapphire** (Royal Navy)
   - **Olive Heritage** (Forest Green)
4. Click each theme card one by one:
   - Confirm colors update instantly across the entire screen without reloading.
   - Confirm active checkmark moves to the clicked theme.
5. In the top Header, test the quick dropdown (`#headerThemeSelect`):
   - Switch to **Atelier Ivory**.
   - Refresh the page (F5).
   - Confirm **Atelier Ivory** persists after refresh.
6. Switch to **Midnight Sapphire**, then log out and log back in:
   - Confirm theme preference remains intact.

---

### Area 2: Photographer Projects (List & Grid Views)
1. Go to **Projects** tab.
2. In **Noir Champagne** and **Atelier Ivory**:
   - Check the progress section: confirm percentage (e.g. `67%`) and `Terpilih X / Y` are crisp, bright, and legible.
   - Confirm the progress bar is 8px tall and matches the active theme accent.
   - Switch between **List View** and **Grid View**:
     - Confirm Grid cards adapt to the theme (no dark box in light theme).
     - Confirm all action toolbar icons (Copy Link, Lihat Galeri, Settings, Delete) are evenly spaced.
3. Look at the right column (**Mulai Cepat** & **Butuh bantuan?**):
   - Confirm no saturated neon blue clashes.
   - Confirm heading size is compact and elegant.

---

### Area 3: Header Profile & PRO Upsell Card Suppression
1. Look at the top right header:
   - Confirm `User` (`#adminName`) and role/expiry text (`#adminRole`) are clearly readable in both **Noir Champagne** and **Atelier Ivory**.
2. Check the bottom left sidebar:
   - For an active PRO or Lifetime photographer account, confirm the **Upgrade ke PRO** card is hidden.
   - For a Demo account, confirm the card displays gracefully with theme-aware borders.

---

### Area 4: Admin Dashboard & Kelola Fotografer
1. Log in as Admin (`admin` / `password123`).
2. Verify **Dashboard Admin**:
   - Confirm statistic cards and chart canvas backgrounds harmonize with the active theme.
   - Confirm axis titles and labels are legible.
3. Verify **Kelola Fotografer**:
   - Confirm table rows, hover states, and status badges (Active, Expired, Demo) maintain strong contrast without dark-on-dark or white-on-white text.

---

### Area 5: Photographer Collage Editor & Sortir Lokal
1. Switch to **Kolase**:
   - Confirm sidebar icon, label, and PRO badge are properly aligned.
   - Confirm template thumbnails and control inputs adapt cleanly to the active theme.
2. Switch to **Sortir Lokal**:
   - Confirm dropzone and text areas use theme-aware panel backgrounds and borders.

---

### Area 6: Client Gallery Interaction
1. Open a mock client gallery URL: `http://127.0.0.1:4173/app?token=dummy-client-token`.
2. Enter PIN: `1234`.
3. Verify:
   - Photo grid cards display crisp borders and subtle luxury shadows.
   - Selecting a photo highlights the card with champagne gold border and checkmark.
   - Quota limit indicator updates legibly.
   - Lightbox modal opens and closes smoothly.

---

## 3. Visual Sign-off Checklist

- [ ] Theme Picker works live across all 4 themes.
- [ ] Theme selection persists after page reload and re-login.
- [ ] No unreadable text combinations (white-on-white or dark-on-dark).
- [ ] No clashing saturated blue or green cards in luxury themes.
- [ ] Project progress percentage is bold and clearly legible.
- [ ] PRO upsell is suppressed for qualifying active PRO accounts.
- [ ] All automated tests continue to pass (25/25 regression, 59/59 static, 42/42 isolation, 75/75 webhook).
