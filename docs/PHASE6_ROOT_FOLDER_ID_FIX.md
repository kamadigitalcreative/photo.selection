# PHASE 6 — ROOT FOLDER ID MISMATCH FIX REPORT
**Repository:** `photo.selection`  
**Branch:** `feat/phase-6-drive-integration`  
**Component:** KMBC Photo Selection — Google Drive Integration & Gallery Authorization Boundary  
**Date:** 2026-10-26  
**Final Status:** **READY FOR VERCEL PREVIEW UAT**

---

## 1. Executive Summary

During Vercel Preview deployment of Phase 6 with `DRIVE_PROVIDER=public_link`, photographer login, project creation, and saving Google Drive links succeeded. However, when clicking **"Pilih Foto"** to open the client gallery, the application failed with the error:
> *"Akses ditolak: Folder ini bukan bagian dari proyek galeri ini (Cross-project / invalid subfolder)."*

An audit of the actual runtime source code confirmed that this failure was caused by an unnormalized string equality comparison in `api/supabase.js:handleGetDriveContent()`. The client frontend (`app.html`) transmitted the full Google Drive folder URL (e.g., `https://drive.google.com/drive/folders/ABC123`), whereas the backend had extracted the canonical folder ID (`ABC123`). The unnormalized string check evaluated `requestedFolderId !== rootFolderId` as `true`, erroneously treating initial root gallery loads as subfolder navigation and rejecting them via `verifyFolderHierarchy()`.

This issue has been resolved at the backend trust boundary with defensive provider hardening and client state alignment. All 13 targeted regression assertions (T01–T12 + T_REPRO) and all 137 existing security and compatibility suite assertions pass with zero failures.

---

## 2. Confirmed Root Cause Analysis

### The Failure Chain
1. **Frontend Initialization (`app.html:showClientModeSelection()`):**
   ```javascript
   function showClientModeSelection() {
       clientState.currentFolderId = clientState.driveLink;
       clientState.currentFolderName = clientState.namaClient;
       showView('client-mode-view');
   }
   ```
   When the client unlocked the gallery, `clientState.driveLink` stored the full URL pasted by the photographer (e.g. `https://drive.google.com/drive/folders/1w7cQ_m...`).
   `fetchClientContent()` sent `payload.folder_id = 'https://drive.google.com/drive/folders/1w7cQ_m...'`.

2. **Backend Root Extraction (`api/supabase.js:handleGetDriveContent()`):**
   The server-side project record was authoritatively parsed using `urlParser.extractFolderId()`:
   ```javascript
   const rootFolderId = urlParser.extractFolderId(project['Drive Link'] || project.driveLink || project.DriveLink);
   // Yields: "1w7cQ_m..."
   ```

3. **Unnormalized String Comparison (`api/supabase.js:handleGetDriveContent()`):**
   ```javascript
   // Unfixed code:
   let targetFolderId = rootFolderId;
   const requestedFolderId = (payload.folder_id || payload.folderId || '').trim();
   if (requestedFolderId && requestedFolderId !== rootFolderId) {
     const prov = getDriveProvider();
     if (typeof prov.verifyFolderHierarchy === 'function') {
       const hierCheck = await prov.verifyFolderHierarchy({ folderId: requestedFolderId, rootFolderId });
       if (!hierCheck.allowed) {
         return error(res, 'Akses ditolak: Folder ini bukan bagian dari proyek galeri ini (Cross-project / invalid subfolder).', 403);
       }
     }
     targetFolderId = requestedFolderId;
   }
   ```
   Because `'https://drive.google.com/drive/folders/1w7cQ_m...' !== '1w7cQ_m...'` evaluated to `true`:
   - The initial gallery load was incorrectly routed into the subfolder ancestry verification pipeline.
   - `verifyFolderHierarchy({ folderId: 'https://...', rootFolderId: '1w7cQ_m...' })` attempted to find the full URL as a child of `rootFolderId`.
   - The subfolder check discovered no matching descendant (`NOT_A_SUBFOLDER`).
   - The request was rejected with HTTP 403: *"Akses ditolak: Folder ini bukan bagian dari proyek galeri ini (Cross-project / invalid subfolder)."*

The exact same unnormalized string comparison existed in **both** photographer gallery (`Case A`) and client visitor gallery (`Case B`).

---

## 3. Exact Code Files Changed

### 1. `api/supabase.js` (Backend Trust Boundary)
- **Lines 3896–3917 (Case A: Photographer / Admin Session):**
  Canonicalized `rawRequested` using `urlParser.extractFolderId(rawRequested)`.
  - If `rawRequested` is empty: Resolves directly to `rootFolderId` (zero hierarchy check).
  - If `canonicalRequested === rootFolderId`: Authoritatively resolves to `rootFolderId` without triggering subfolder ancestry traversal.
  - If `!canonicalRequested`: Fails closed with HTTP 400 (`Format link atau ID Google Drive subfolder tidak valid.`).
  - If `canonicalRequested !== rootFolderId`: Invokes `provider.verifyFolderHierarchy({ folderId: canonicalRequested, rootFolderId })`.
- **Lines 3975–3996 (Case B: Client Gallery Visitor):**
  Applied identical canonicalization logic and fail-closed protections after client PIN/session verification.

### 2. `api/drive/publicProvider.js` (Defensive Provider Hardening)
- **Lines 849–858 (`verifyFolderHierarchy`):**
  Defensively normalized incoming `folderId` and `rootFolderId` parameters using `extractFolderId(id) || String(id).trim()`. Ensures that even direct provider calls passing URLs or raw IDs match immediately on equal root folders and correctly match descendant folder IDs during BFS traversal.

### 3. `api/drive/mockProvider.js` & `api/drive/googleProvider.js` (Ecosystem Consistency)
- Updated `verifyFolderHierarchy()` in both providers to canonicalize incoming folder parameters via `urlParser.extractFolderId()`, maintaining behavioral consistency across all active environments.

### 4. `app.html` (Frontend State Alignment)
- Added `extractDriveFolderId(input)` helper to parse Google Drive URLs (`/folders/{id}`, `?id={id}`, or raw ID).
- Updated `showClientModeSelection()` to initialize `clientState.currentFolderId` using `extractDriveFolderId(clientState.driveLink) || clientState.driveLink`, ensuring client state cleanliness and deterministic cache keys while remaining completely supported if a full URL is sent.

### 5. `test/phase6-root-folder-id-mismatch.test.js` (New Targeted Regression Test Suite)
- Added 13 automated test cases covering T01 through T12 and the explicit Preview bug reproduction scenario.

---

## 4. Test Results and Verification Evidence

### A. Dedicated Root Folder Mismatch Regression Suite (`test/phase6-root-folder-id-mismatch.test.js`)
Command: `node test/phase6-root-folder-id-mismatch.test.js`

| Test ID | Description | Result | Details |
| :--- | :--- | :---: | :--- |
| **T_REPRO** | Exact Preview mismatch reproduction & resolution | **PASS** | Full Drive URL accepted as project root without false cross-project rejection (HTTP 200) |
| **T01** | Root folder full URL (Client & Photographer paths) | **PASS** | Client HTTP 200, Photographer HTTP 200 |
| **T02** | Same root folder as raw ID (Client & Photographer paths) | **PASS** | Client HTTP 200, Photographer HTTP 200 |
| **T03** | Root URL with harmless query parameters (`?usp=sharing`, `?id=...`) | **PASS** | Canonicalized to raw ID; HTTP 200 |
| **T04** | Legitimate direct subfolder (as URL and as raw ID) | **PASS** | Passes `verifyFolderHierarchy()`; HTTP 200 |
| **T05** | Legitimate nested grandchild subfolder | **PASS** | Traverses hierarchy graph; HTTP 200 |
| **T06** | Foreign project folder | **PASS** | Rejected with HTTP 403 Cross-project error |
| **T07** | Unrelated Google Drive URL | **PASS** | Rejected with HTTP 403 Cross-project error |
| **T08** | Malformed URL, plain HTTP, external hosts, and SSRF inputs | **PASS** | Fail closed with HTTP 400 / 403 |
| **T09** | Client request without active session token | **PASS** | Strictly rejected with HTTP 403 |
| **T10** | Forged or expired client session token | **PASS** | Strictly rejected with HTTP 403 |
| **T11** | Cross-photographer project isolation | **PASS** | Strictly rejected with HTTP 403 |
| **T12** | Photo selection, download mode, authentic ZIP, and provider hierarchy preserved | **PASS** | All frontend helpers and backend pipelines intact |

**Total:** 13 Passed | 0 Failed

---

### B. Existing Phase 6 Verification Suites
1. **Public Google Drive Restoration Suite (`test/phase6-public-drive.test.js`):**
   - Result: **20 PASSED | 0 FAILED**
   - Validated: Scraping, HTML decoding, thumbnail ceiling (<=4MB), safe redirects, Range requests (HTTP 206), virus wall handling, and authentic CRC-32 ZIP creation.
2. **Vercel Preview Drive Compatibility Suite (`test/phase6-vercel-drive-compatibility.test.js`):**
   - Result: **14 PASSED | 0 FAILED**
   - Validated: Production config checks, session gating, project isolation, thumbnail bounds, and Range streaming.
3. **Phase 6 Hardening & Media Delivery Gate (`test/phase6-hardening.test.js`):**
   - Result: **103 PASSED | 0 FAILED**
   - Validated: Fullscreen authenticated viewer, subfolder file membership, stream integrity, and disconnection cleanup.

**Grand Total:** 150 Automated Assertions Reported **PASS** (Zero Failures).

---

## 5. Security & Safety Checklist

- [x] **No Git CLI Commands:** No branch changes, commits, pushes, merges, or deployments executed by Antigravity IDE.
- [x] **Zero Cloud Console / Service Account:** Photographers configure ordinary Google Drive folders with *"Anyone with the link" -> "Viewer"*.
- [x] **Zero Paid Services / Zero New Dependencies:** Pure Node.js runtime and existing dependencies only.
- [x] **Fail Closed:** Malformed URLs, unencrypted HTTP, and external non-Google domains are rejected with HTTP 400 before provider invocation.
- [x] **Strict Project Isolation:** Foreign folder IDs and cross-project subfolders continue to be blocked with HTTP 403.
- [x] **Session & PIN Integrity:** Client PIN verification, 24h session TTL, and photographer ownership checks remain strictly enforced.
- [x] **Photo Selection & Download Preservation:** Selection counters, masonry/collage layouts, individual photo downloads, and ZIP archiving are unaffected.

---

## 6. Remaining Limitations

1. **Google Drive "Anyone with the link: Viewer" Prerequisite:**
   Because this workflow utilizes `DRIVE_PROVIDER=public_link`, Google Drive folders must be configured by the photographer with sharing set to *"Anyone with the link" -> "Viewer"*. Restricted folders will return `FOLDER_ACCESS_DENIED`.
2. **Google Upstream Rate Limiting on Large Files:**
   Unauthenticated public downloads of files exceeding Google's virus-scan limits (typically > 100MB) may encounter Google's download quota wall (`PUBLIC_DOWNLOAD_LIMITATION`), which is honestly reported to the user.
3. **Browser Memory for Massive ZIP Batches:**
   Packaging more than 100 high-resolution camera originals in client browser memory requires sufficient client device RAM; warning dialogs remain active.

---

## 7. Manual Vercel Preview UAT Instructions

Follow these steps in GitHub Desktop and your browser to verify on Vercel Preview:

### Step 1: Push via GitHub Desktop (No Terminal Git CLI)
1. Open **GitHub Desktop**.
2. Select repository `photo.selection` and branch `feat/phase-6-drive-integration`.
3. Review modified files:
   - `api/supabase.js`
   - `api/drive/publicProvider.js`
   - `api/drive/mockProvider.js`
   - `api/drive/googleProvider.js`
   - `app.html`
   - `test/phase6-root-folder-id-mismatch.test.js`
   - `docs/PHASE6_ROOT_FOLDER_ID_FIX.md`
4. Commit with message:
   `fix(drive): canonicalize root folder id to resolve preview gallery mismatch`
5. Click **Push origin**. Vercel will automatically build the Preview deployment.

### Step 2: Verify Vercel Preview Environment Variable
1. In Vercel Project Settings > Environment Variables for Preview:
   - Ensure `DRIVE_PROVIDER=public_link` is set.

### Step 3: Test Client Gallery Opening
1. Log in as a Photographer on the Vercel Preview URL.
2. Create a test project or open an existing project:
   - Ensure the Google Drive folder link is a public shared folder (*"Anyone with the link" -> "Viewer"*), e.g.:
     `https://drive.google.com/drive/folders/1ABCxyz...`
   - Set client PIN (e.g. `1234`).
3. Copy the Client Gallery Link and open it in an Incognito window (or log out).
4. Enter the client PIN (`1234`) and click **"Unlock Gallery"**.
5. Click **"Pilih Foto"** (Select Photos).
6. **Expected Behavior:**
   - The gallery opens immediately without displaying *"Akses ditolak: Folder ini bukan bagian dari proyek galeri ini"*.
   - Photo thumbnails and any subfolders are displayed correctly.
7. Test subfolder navigation: Click a subfolder (if present) -> verify photos load -> click Back -> verify root photos reload.
8. Test photo selection and ZIP download mode -> verify functionality is preserved.

---

## 8. Final Verdict

# READY FOR VERCEL PREVIEW UAT
