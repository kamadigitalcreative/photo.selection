# PHASE 5.6R — HERO CUSTOMIZER CORRECTNESS & DEMO FLOW AUDIT REPORT

**Date:** 2026-10-21  
**Project:** Photo Selection / KMBC (`photo.selection`)  
**Working Branch:** `fix/phase-5.6r-ui-stabilization`  
**Execution Environment:** Local Isolated Mock Sandbox (`http://127.0.0.1:4173`)  
**Final Status:** **READY FOR OPERATOR VISUAL RECHECK**  
**Production Gate:** **STRICT NO-GO FOR PRODUCTION** (Git CLI, Supabase live database, and Mayar live payment webhooks strictly untouched).

---

## 1. Executive Summary

Following a source-level corrective review of Phase 5.6R, four critical architectural correctness fixes and one consolidation patch were implemented without altering any backend services or violating security invariants:
1. **Hero Image Presentation & Stacking:** Activated `#photographerHeroImg` directly with `object-fit: cover` and proper `object-position`/`transform: scale()`, hid `#photographerHeroFallback` when a custom image is set, and replaced the mobile `opacity: 0.25` washed-out treatment with crisp `opacity: 1` accompanied by a theme-adaptive readability overlay.
2. **Independent Desktop & Mobile Cropping:** Structured `heroCustomizerState` into separate `desktop` and `mobile` sub-states (`focalX`, `focalY`, `zoom`). Bound these to CSS custom properties (`--hero-fx`, `--hero-fy`, `--hero-zoom`) via media queries (`min-width: 769px` vs `max-width: 768px`), ensuring automatic responsive switching at 1440px, 1280px, 768px, 390px, and 375px.
3. **Safe Local Storage & Quota Protection:** Added non-destructive client-side canvas downsampling (max dimension 1600×900 at JPEG quality 0.85) to reduce Base64 payload size from ~4MB to ~180KB, well within browser `localStorage` limits. Added strict `try/catch` quota protection to prevent corrupting previously saved banners upon failure.
4. **Demo Login Harmonization & Function Consolidation:** Aligned `?demo=true` to populate standardized `password123`. Updated mock server in `test/phase55-browser-uat.js` to accept both canonical `password123` and legacy `demo` passwords while rejecting wrong passwords and unknown accounts. Consolidated duplicate declarations of `isDemoAccount()` and `showDemoSubscribeAlert()` into single canonical functions preserving Mayar user tracking and bilingual UI.
5. **Storage Honesty & Documentation Accuracy:** Clarified all storage tiers across UI and documentation: in-memory preview vs browser-local storage (`localStorage` per account) vs permanent cloud cross-device storage (**BLOCKED awaiting Operator architecture approval**).

---

## 2. Source-Level Root Cause & Remediation Log

| Item | Root Cause | Remediation Applied | Files Changed |
| :--- | :--- | :--- | :--- |
| **Hero Image Stacking & Hidden Elements** | Image was applied via `backgroundImage` on `#photographerHeroMedia`, but `#photographerHeroFallback` remained a 100% full-size child with an opaque gradient, covering the image. `#photographerHeroImg` remained `display: none`. | `renderPhotographerHeroBanner()` now assigns `heroImg.src = saved.imageUrl`, sets `heroImg.style.display = 'block'`, hides `heroFallback` (`display: none` / `.hidden`), and tags `#photographerHeroMedia` with `.has-custom-hero`. | `app.html`, `assets/css/role-shell.css` |
| **Mobile Hero Opacity** | In `assets/css/role-shell.css` line 1267, `#admin-view .photographer-hero-media` had hardcoded `opacity: 0.25;` on screens $\le 768\text{px}$, turning photos into faint gray sludge. | Added rule `#admin-view .photographer-hero-media.has-custom-hero { opacity: 1 !important; }` with a subtle dark readability overlay `linear-gradient(180deg, ...)` to preserve both photo vibrancy and text legibility. | `assets/css/role-shell.css` |
| **Unified Crop on All Devices** | State only stored a single `focalX, focalY, zoom` tuple, forcing desktop widescreen crops to look awkward on mobile vertical screens. | Split state into `desktop: { focalX, focalY, zoom }` and `mobile: { focalX, focalY, zoom }`. Linked editor sliders to active preview tab. Applied desktop and mobile crops through CSS media queries and custom properties. | `app.html`, `assets/css/role-shell.css` |
| **localStorage Quota Blowout** | Raw 3MB image uploads generated ~4MB Base64 strings, risking browser `QuotaExceededError`. | Added in-memory canvas optimization downsampling images $> 1600\times 900$ to high-quality JPEG 0.85 (~150-250KB). Wrapped save in quota-safe `try/catch`. | `app.html` |
| **Demo Password Mismatch** | `?demo=true` handler filled `password = 'demo'`, but mock server only checked `password123`. | `?demo=true` updated to fill `password123`. Mock server updated to accept both `password123` and legacy `demo`. | `app.html`, `test/phase55-browser-uat.js` |
| **Duplicate Function Declarations** | `isDemoAccount()` and `showDemoSubscribeAlert()` were declared twice in `app.html` (lines 5807/5815 and 5980/5989), causing shadowing and missing Mayar URL user parameters in the first version. | Consolidated into single canonical declarations with `getMayarUrlWithUser()` and `isEn` bilingual support. Second redundant declarations removed. | `app.html` |

---

## 3. Storage Capabilities & Truthful Transparency Gate

In strict compliance with instructions:
- **Level 1 — Live Preview (In-Memory):** Rendered live within `#modalHeroCustomizer` inside `#heroPreviewFrame`. Reverting or canceling discards all changes.
- **Level 2 — Local Browser Persistence:** Saved to `localStorage.getItem('ps_hero_banner_' + username)`. Scoped per photographer. Persists across page refreshes on this specific browser. **Note:** Logging out does *not* erase this data; it switches active view context to `guest` (which renders default fallback). When the photographer logs back in, their custom banner reappears. Clearing browser storage will erase it.
- **Level 3 — Permanent Cloud Storage:** **STATUS: STRICTLY BLOCKED**. No database columns exist in Supabase `public.users` (which has exactly 24 verified columns). Storage bucket policies have not been provisioned. Cross-device syncing is disabled with zero false claims.

---

## 4. Automated Regression Verification

Six independent test suites were executed sequentially with 100% pass rates:

1. `test/phase56r-hero-correctness.test.js`: **23 PASSED, 0 FAILED** (Hero image stacking, mobile opacity, separate crop states, storage quota catch, duplicate function consolidation).
2. `test/security-and-regression.test.js`: **25 PASSED, 0 FAILED** (12 script tags invariant preserved, 29 templates intact).
3. `test/phase56r-grid-and-pro-regression.test.js`: **28 PASSED, 0 FAILED** (Project grid isolation, PRO entitlement logic).
4. `test/phase54-mock-uat.js`: **59 STATIC VERIFIED, 0 FAILED** (Admin, photographer, client gallery DOM invariants).
5. `test/phase55-browser-uat.js --audit-only`: **45 PASSED, 0 FAILED** (Mock login, assets, contrast).
6. `test/mayar-webhook-audit.test.js`: **75 PASSED, 0 FAILED** (Financial activation, PRO limits).

---

## 5. Exact Files Modified

1. `assets/css/role-shell.css`:
   - Updated `#admin-view .photographer-hero-img` with `object-position: var(--hero-fx)` and `transform: scale(var(--hero-zoom))`.
   - Added desktop custom property bindings (`--hero-focal-x-dt`, `--hero-focal-y-dt`, `--hero-zoom-dt`).
   - Added `.has-custom-hero` overlay styles for Noir, Ivory, Sapphire, and Olive themes.
   - Updated mobile media query (`max-width: 768px`) with `opacity: 1 !important;` for `.has-custom-hero` and mobile custom properties (`--hero-focal-x-mb`, `--hero-focal-y-mb`, `--hero-zoom-mb`).
2. `app.html`:
   - Updated `#modalHeroCustomizer` with responsive heading indicator and clarified 3-tier storage explanation.
   - Consolidated `isDemoAccount()` and `showDemoSubscribeAlert()` into single canonical functions.
   - Updated `?demo=true` handler to populate `password123`.
   - Updated `renderPhotographerHeroBanner()` to set `heroImg.src`, display `heroImg`, hide `heroFallback`, and bind desktop/mobile CSS custom properties.
   - Updated `openHeroCustomizerModal()`, `setHeroPreviewMode()`, `updateHeroBannerFocalPoint()`, `handleHeroBannerUpload()`, `resetHeroBannerToDefault()`, and `applyHeroBannerSettings()` to support independent desktop/mobile crops and canvas downsampling.
3. `test/phase55-browser-uat.js`:
   - Allowed `password === 'password123' || password === 'demo'` for demo login.
4. `test/phase56r-hero-correctness.test.js`:
   - Added automated test suite covering all Phase 5.6R correctness criteria.
