# PHASE 5.6R — MANUAL UAT VERIFICATION MATRIX
## Photographer-Client Theme Synchronization & Responsive Hero Polish

**Project:** Photo Selection / KMBC (`photo.selection`)  
**Phase:** 5.6R — UI/UX Stabilization  
**Target Branch:** `fix/phase-5.6r-ui-stabilization`  
**Execution Environment:** Isolated Local Mock Sandbox (`http://127.0.0.1:4173`)  
**Production Status:** STRICT NO-GO FOR PRODUCTION — READY FOR OPERATOR VISUAL RECHECK

---

## 1. Safety & Test Environment Setup

1. Start the isolated local mock server in terminal:
   ```powershell
   node test/phase55-browser-uat.js
   ```
2. Verify terminal output displays:
   - `URL Local Host: http://127.0.0.1:4173`
   - `Isolasi Jaringan: 100% Mock Terisolasi`
3. Credentials:
   - Photographer 1 (Noir): `fotografer` / `password123`
   - Photographer 2 (Sapphire): `pro_studio` / `password123`
   - Photographer 3 (Ivory): `reguler_studio` / `password123`
   - Photographer 4 (Olive / Demo): `demo` / `password123`
   - Client PIN: `1234`

---

## 2. Interactive Step-by-Step Test Matrix

| ID | Role | URL | Click Actions | Expected Result | Status | Notes |
|---|---|---|---|---|---|---|
| **U01** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Login as `fotografer`<br>2. Select theme **Noir Champagne** in header | Header, sidebar, and workspace render in Noir Champagne (dark charcoal + gold). | **READY FOR OPERATOR VERIFICATION** | Preserved theme picker |
| **U02** | Client | `http://127.0.0.1:4173/app.html?token=dummy-client-token` | 1. Open gallery link for Photographer 1 in an incognito window | Client PIN view opens in **Noir Champagne** theme. | **READY FOR OPERATOR VERIFICATION** | Pre-auth metadata sync |
| **U03** | Client | `http://127.0.0.1:4173/app.html?token=dummy-client-token` | 1. Enter PIN `1234`<br>2. Click **Unlock Gallery** | Unlocked gallery renders in **Noir Champagne** (dark surface, champagne buttons, gold selection border). | **READY FOR OPERATOR VERIFICATION** | Task A & B verified |
| **U04** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Login as `reguler_studio`<br>2. Theme is set to **Atelier Ivory** | Workspace renders in warm ivory with dark high-contrast typography. | **READY FOR OPERATOR VERIFICATION** | Contrast > 13:1 |
| **U05** | Client | `http://127.0.0.1:4173/app.html?token=token-ivory` | 1. Open client link for Photographer 3<br>2. Enter PIN `1234` | Client Gallery renders in **Atelier Ivory** (warm light silk surfaces, bronze gold accents, dark readable text). Photos stand out crisply. | **READY FOR OPERATOR VERIFICATION** | Task D verified |
| **U06** | Client | `http://127.0.0.1:4173/app.html?token=token-proj-2` | 1. Open client link for `pro_studio`<br>2. Enter PIN `1234` | Client Gallery renders in **Midnight Sapphire** (deep royal navy surfaces, bright sapphire selection badges). | **READY FOR OPERATOR VERIFICATION** | Task D verified |
| **U07** | Client | `http://127.0.0.1:4173/app.html?token=token-olive` | 1. Open client link for `demo`<br>2. Enter PIN `1234` | Client Gallery renders in **Olive Heritage** (earthy natural background, forest olive badges). | **READY FOR OPERATOR VERIFICATION** | Task D verified |
| **U08** | Multi-Client | Multiple Tabs | 1. Open `token-ivory` in Tab 1<br>2. Open `token-proj-2` in Tab 2 | Tab 1 is Ivory; Tab 2 is Sapphire. Neither client interferes with the other. | **READY FOR OPERATOR VERIFICATION** | Per-project isolation verified |
| **U09** | Client | `http://127.0.0.1:4173/app.html?token=token-ivory` | 1. Inspect PIN entry screen before unlocking | Lock box and background adhere to **Atelier Ivory** palette. | **READY FOR OPERATOR VERIFICATION** | PIN screen theme match |
| **U10** | Client | `http://127.0.0.1:4173/app.html?token=token-ivory` | 1. Select 2 photos<br>2. Click **Preview Pilihan** | Selection summary modal renders with Ivory styling and clear photos. | **READY FOR OPERATOR VERIFICATION** | Modal theme match |
| **U11** | Client | `http://127.0.0.1:4173/app.html?token=token-proj-2` | 1. Click a photo to open lightbox | Lightbox counter badge and selection button follow Sapphire accents. | **READY FOR OPERATOR VERIFICATION** | Lightbox theme match |
| **U12** | Client | All Client URLs | 1. Inspect bottom floating action dock | Dock surface matches current theme with proper backdrop blur and safe area padding. | **READY FOR OPERATOR VERIFICATION** | Action dock theme match |
| **U13** | Client | All Client URLs | 1. Check filename text on light/dark photos in all 4 themes | Filenames have shadow protection and 600 weight; 100% legible on all backgrounds. | **READY FOR OPERATOR VERIFICATION** | Zero unreadable text |
| **U14** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Login as `fotografer`<br>2. Switch to **Atelier Ivory**<br>3. Go to Projects | Hero banner blends cleanly from ivory text area into portrait photo. **No charcoal/black band** in the middle. | **READY FOR OPERATOR VERIFICATION** | Task E fixed |
| **U15** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Switch to **Olive Heritage**<br>2. Go to Projects | Hero banner blends cleanly with olive palette. No black center blocks. | **READY FOR OPERATOR VERIFICATION** | Task E fixed |
| **U16** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Open DevTools, set viewport to **375px** (iPhone SE)<br>2. Inspect Projects Hero | Hero image has natural proportions (`min-height: 270px`). Faces/subjects are not squashed or stretched. Primary CTA button is 100% width. Secondary buttons fit row 2. | **READY FOR OPERATOR VERIFICATION** | Task F fixed |
| **U17** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Set viewport to **390px** (iPhone 14/15 Pro)<br>2. Inspect Projects Hero | Headline, artwork, and CTA buttons fit comfortably with no horizontal scrollbar. | **READY FOR OPERATOR VERIFICATION** | Task F fixed |
| **U18** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Set viewport to **464px**<br>2. Inspect Projects Hero | Fluid responsive adaptation. Zero awkward layout breaks. | **READY FOR OPERATOR VERIFICATION** | Breakpoint stability |
| **U19** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Set viewport to **768px** (iPad) | Hero transitions smoothly to side-by-side layout. | **READY FOR OPERATOR VERIFICATION** | Tablet verified |
| **U20** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Set viewport to **1280px** | Landscape desktop presentation is balanced and professional. | **READY FOR OPERATOR VERIFICATION** | Desktop verified |
| **U21** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Set viewport to **1440px** | Full HD presentation retains high-fidelity layout. | **READY FOR OPERATOR VERIFICATION** | Large desktop verified |
| **U22** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Click "Atur Banner"<br>2. Test Desktop/Mobile crop sliders<br>3. Save | Independent crop coordinates persist and render accurately on respective viewports. | **READY FOR OPERATOR VERIFICATION** | Crop engine preserved |
| **U23** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Select a theme<br>2. Press browser Refresh (F5) | Selected theme persists seamlessly. | **READY FOR OPERATOR VERIFICATION** | Persistence verified |
| **U24** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Logout `fotografer`<br>2. Login as `demo` | Custom personal hero from previous account does not leak into demo account. | **READY FOR OPERATOR VERIFICATION** | Account isolation verified |
| **U25** | Client | `http://127.0.0.1:4173/app.html?token=dummy-client-token` | 1. Select 3 photos (quota limit)<br>2. Try selecting a 4th photo | Quota alert fires correctly; selection is blocked at 3 photos. | **READY FOR OPERATOR VERIFICATION** | Quota logic intact |
| **U26** | Photographer | `http://127.0.0.1:4173/app.html` | 1. Click sidebar **Kolase**<br>2. Inspect Putih swatch | Swatch circle is visibly pure white (`#FFFFFF`) with border. Canvas updates correctly. | **READY FOR OPERATOR VERIFICATION** | Regression gate passed |
| **U27** | Photographer | `http://127.0.0.1:4173/app.html` | 1. In Projects section, toggle List / Grid view | View toggles cleanly without styling glitches or card deformation. | **READY FOR OPERATOR VERIFICATION** | Regression gate passed |
| **U28** | All | Browser DevTools Console | 1. Check Console tab on all pages | No CSP violations for favicon. No HTTP 400 errors for `logVisit`. Zero runtime exceptions. | **READY FOR OPERATOR VERIFICATION** | Console cleanliness |
| **U29** | System | Test Suites | 1. Run all regression suites | Zero Supabase migrations executed; zero mutations to live billing/ledger. | **READY FOR OPERATOR VERIFICATION** | Production safety intact |

---

## 3. Operator Manual Sign-Off Instructions

To test on your machine:
```powershell
node test/phase55-browser-uat.js
```
Open:
- `http://127.0.0.1:4173/app.html` (Photographer Workspace)
- `http://127.0.0.1:4173/app.html?token=dummy-client-token` (Client Gallery)

**Final Verdict:** READY FOR OPERATOR VISUAL RECHECK.
