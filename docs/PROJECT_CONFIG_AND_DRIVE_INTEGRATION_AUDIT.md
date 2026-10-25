# PROJECT CONFIGURATION FIDELITY & REAL GOOGLE DRIVE INTEGRATION AUDIT

**Project:** Photo Selection / KMBC  
**Date:** 2026-10-23  
**Status Summary:**  
- **PART A — LOCAL MOCK PROJECT BEHAVIOR:** `READY FOR OPERATOR MOCK RECHECK`
- **PART B — REAL GOOGLE DRIVE INTEGRATION:** `STRICT NO-GO` (Requires Google Drive API v3 + Service Account / OAuth2 before Production release)

---

## EXECUTIVE SUMMARY

This audit addresses two primary objectives:
1. **Fidelity Restoration in Mock Testing Environment (`test/phase55-browser-uat.js` on port 4173):**
   Fixed in-memory project creation, metadata persistence, passwordless project bypass, project-specific PIN enforcement, and local fixture mapping. Validated across 20/20 test assertions (P01–P20) and 115/115 regression tests with 0 failures.
2. **Read-Only Architectural Audit of Real Google Drive Backend (`api/supabase.js`):**
   Conducted an exhaustive inspection of real backend handlers (`handleCreateProject`, `handleGetProjectForClient`, `handleVerifyClientPassword`, `handleGetDriveContent`). Confirmed that the current production Drive implementation relies on unauthenticated HTML scraping of Google Drive's legacy `embeddedfolderview`, requiring public folder permissions, providing only 1000px preview thumbnails, and lacking official Google Drive API v3 credentials.

---

# SECTION A: LOCAL MOCK PROJECT BEHAVIOR

### 1. Root Causes in Previous Mock Implementation

Prior to this fix, `test/phase55-browser-uat.js` exhibited the following issues:

1. **Incomplete Project Creation (`createProject`):**
   - The handler only saved 5 fields (`id`, `token`, `Nama Client`, `maxFoto`, `extraPrice`) and ignored `driveLink`, `passwordClient`, `nomorWA`, `clientLayout`, `useWatermark`, `categories`, `musicUrl`, and `deadline`.
   - `mockProjectFixtures[newToken]` was hardcoded to only 2 files (`['photo1.png', 'photo2.png']`).
2. **Hardcoded Mock Responses (`getProjectForClient` & `verifyClientPassword`):**
   - `getProjectForClient` hardcoded `maxFoto: 3`, `extraPrice: 0`, and `driveLink: 'mock-folder-root'`, disregarding the actual project's configuration.
   - Pre-seeded projects had ambiguous password definitions, falling back to hardcoded `1234` or `123456`.
3. **Inability to Test Passwordless Projects:**
   - `hasPassword` and `needsPassword` were unconditionally set to `true`, forcing clients to enter a PIN even if the photographer created the project with no password.
4. **Mock Drive Content Ambiguity:**
   - `getDriveContent` returned sample images without explicit metadata identifying them as local fixtures, creating confusion as to whether the images were fetched from Google Drive.

---

### 2. Exact Files Modified

1. **`test/phase55-browser-uat.js`**:
   - **Pre-seeded Projects (`MOCK_ALL_PROJECTS`):** Added explicit `'Password Client': '1234'`, `passwordClient: '1234'`, `password: '1234'`, and canonical `driveLink` to existing test fixtures (`dummy-client-token`, `token-no-download`, `token-ivory`, `token-olive`, `token-proj-2`) ensuring backward compatibility with existing test suites.
   - **`buildMockAuthorizedProjectData(proj, ownerConfig, clientSessionToken, token)`:** Centralized project payload generator that dynamically reads stored metadata from the actual in-memory project record.
   - **`getProjectForClient` Handler:**
     - Added **Passwordless Project Flow**: If `passwordClient` is empty, immediately issues a project-scoped session token (`ps_sess_...`), returns `needsPassword: false`, `hasPassword: false`, `accessGranted: true`, and the complete project data.
     - Added **Session Restoration**: Allows clients with active sessions to refresh without PIN re-entry.
     - Added **Project Mismatch Protection**: Rejects sessions issued for other project tokens with `PROJECT_MISMATCH`.
   - **`verifyClientPassword` Handler:**
     - Enforces exact password matching against `proj['Password Client']`.
     - Rejects incorrect passwords (e.g., rejecting `1234` when the project is configured with `5678`).
     - Issues a cryptographically random, 2-hour TTL project-scoped session upon successful verification.
   - **`createProject` Handler:**
     - Persists all submitted fields: `namaClient`, `passwordClient`, `driveLink`, `maxFoto`, `extraPrice`, `nomorWA`, `clientLayout`, `useWatermark`, `useWatermarkTiled`, `categories`, `musicUrl`, `durasiPilih`, `durasiDownload`, and `deadline`.
     - Maps all 5 sample local fixtures (`photo1.png` to `photo5.png`) to the newly created project in `mockProjectFixtures[newToken]`.
   - **`getDriveContent` Handler:**
     - Returns `isMockDrive: true`, `driveReference: project.driveLink`, and `mockNotice`.
     - Maps photos with `isMockFixture: true`, `source: 'local-mock-fixture'`, and explicit mock notice tags.
2. **`test/project-config-drive-audit.test.js`**:
   - Created automated integration test suite validating P01 through P20.

---

### 3. Automated Test Results (P01 – P20)

Test suite `test/project-config-drive-audit.test.js` was executed against `http://127.0.0.1:4173`:

| Test ID | Description | Result | Details |
| :--- | :--- | :--- | :--- |
| **P01** | Create mock project with no password | **PASS** | Project created with token `token-243727b68a25` |
| **P02** | Open client link without PIN | **PASS** | Auto-granted session: `needsPassword: false`, `accessGranted: true` |
| **P03** | Client accesses the correct project identity | **PASS** | Token matches `token-243727b68a25` |
| **P04** | Project title matches photographer input | **PASS** | Title: `"Maya & Rizky Wedding"` |
| **P05** | Photo limit matches photographer input | **PASS** | `maxFoto: 7` |
| **P06** | Drive reference stored in mock metadata | **PASS** | `driveLink: "https://drive.google.com/drive/folders/1ABC_passwordless_folder_id"` |
| **P07** | Photos explicitly marked as local mock fixtures | **PASS** | 5 photos, `isMockFixture: true`, `isMockDrive: true` |
| **P08** | Create project with custom PIN 5678 | **PASS** | Project created with token `token-f18b20c0b9b2` |
| **P09** | Incorrect PIN 1234 rejected | **PASS** | Rejected: `"PIN Keamanan tidak sesuai."` |
| **P10** | Correct PIN 5678 accepted | **PASS** | Valid session token issued |
| **P11** | PRO Upsell price matches project setting | **PASS** | `extraPrice: 20000` |
| **P12** | Non-PRO Upsell remains prohibited | **PASS** | Rejected with `PRO_REQUIRED` code |
| **P13** | Wrong project session denied | **PASS** | Blocked with `PROJECT_MISMATCH` code |
| **P14** | Logout/session release remains secure | **PASS** | Session revoked; subsequent photo access denied (`INVALID_SESSION`) |
| **P15** | Individual fixture download still works | **PASS** | HTTP 200 `image/png` (20,768 bytes) |
| **P16** | ZIP fixture download preflight works | **PASS** | Batch download of raw PNG binaries succeeded |
| **P17** | Original bytes preserved in mock | **PASS** | Magic bytes `89 50 4E 47 0D 0A 1A 0A` match exactly |
| **P18** | No Production or external requests | **PASS** | CSP strictly restricts `connect-src` to localhost; sandbox header active |
| **P19** | Project creation and listing work | **PASS** | Newly created projects appear in photographer workspace list |
| **P20** | Existing regression suites remain PASS | **PASS** | Zero regressions across all legacy test suites |

**Summary: 20/20 PASSED | 0 FAILED**

---

### 4. Regression Suite Verification

All relevant test suites were re-executed to ensure total backward compatibility:

1. `test/create-project-landing-regression.test.js`: **17/17 PASSED**
2. `test/phase56r-zip-runtime.test.js`: **20/20 PASSED** (2 browser tests marked NOT RUN / MANUAL)
3. `test/phase56r-auth-final.test.js`: **20/20 PASSED**
4. `test/phase56r-session-auth.test.js`: **24/24 PASSED**
5. `test/phase56r-upsell-hardening.test.js`: **16/16 PASSED**
6. `test/phase56r-upsell-edge-cases.test.js`: **18/18 PASSED**
7. Mock Server Isolation Self-Tests (`ISO-01` to `ISO-THM-06`): **62/62 PASSED**

**Total Verified Assertions: 177 PASSED | 0 FAILED**

---

### 5. Browser Automation Test Status

- **Playwright / Puppeteer:** NOT RUN. The upstream environment encountered a 404 driver download issue (`playwright.azureedge.net/builds/driver/playwright-1.57.0-win32_x64.zip`).
- **Interactive Local Host:** The isolated mock server is running on `http://127.0.0.1:4173`.
- **Manual Verification Status:** Available for Operator verification using a standard local desktop browser.

---

### 6. Operator UAT Instructions (Local Mock)

To verify the fixes in the local mock environment:

1. **Verify Passwordless Flow:**
   - Open browser to `http://127.0.0.1:4173/app.html`
   - Log in as photographer (`fotografer` / `password123`).
   - Create a project with **Client Password left blank**.
   - Copy the generated client gallery link and open it in an Incognito window.
   - **Expected:** The gallery loads immediately without prompting for a PIN. The project title, photo quota, and mock notice match the input.
2. **Verify Custom PIN Flow:**
   - Create another project with **Client Password = 5678**.
   - Open the client link in Incognito.
   - **Expected:** PIN prompt appears.
   - Enter `1234` -> **Expected:** Error "PIN Keamanan tidak sesuai."
   - Enter `5678` -> **Expected:** Gallery unlocks and displays project metadata.
3. **Verify Drive Link Persistence & Local Mock Fixture Notice:**
   - Check the client gallery inspect panel: photos carry `isMockFixture: true` and `mockNotice: "Local sample fixture — not genuine Google Drive content"`.
   - The mock server does NOT attempt external Google Drive network connections.

---

# SECTION B: REAL GOOGLE DRIVE INTEGRATION READINESS AUDIT

> [!CAUTION]
> **READ-ONLY AUDIT RESULT: REAL GOOGLE DRIVE INTEGRATION IS A STRICT NO-GO FOR PRODUCTION RELEASE.**  
> The current production backend code does not use the official Google Drive API. It relies on an unsupported, fragile web scraping technique that cannot reliably serve commercial clients or camera-original photo files.

---

### 1. Code Analysis of Existing Backend (`api/supabase.js`)

We audited `handleCreateProject()`, `handleGetProjectForClient()`, `handleVerifyClientPassword()`, and `handleGetDriveContent()` in `api/supabase.js`:

#### A. Is the Drive folder link really saved?
- **Finding:** **YES.**
- In `handleCreateProject` (lines 2296–2299, 2372):
  ```javascript
  const driveLink = (d.driveLink || d.link || d['Drive Link'] || '').trim();
  if (driveLink && !validateDriveReference(driveLink)) {
    return error(res, 'Format link atau ID Google Drive tidak valid.');
  }
  ...
  'Drive Link': driveLink,
  ```
  The link or folder ID is stored in the Supabase PostgreSQL `projects` table in the `'Drive Link'` column.

#### B. Does the client gallery use that saved link?
- **Finding:** **YES.**
- In `handleGetProjectForClient` (line 2541), `'Drive Link'` is returned as `driveLink`.
- In `app.html` (lines 11475–11479), the client app sends this link to `POST /api` with `{ action: 'getDriveContent', folder_id: clientState.folderId }`.

#### C. Does the backend retrieve actual folder contents?
- **Finding:** **NO, NOT VIA A SUPPORTED API.**
- In `handleGetDriveContent` (lines 3838–3844):
  ```javascript
  const url = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
  const fetchRes = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...'
    }
  });
  const html = await fetchRes.text();
  ```
  The backend performs an unauthenticated web scrape of Google's legacy `embeddedfolderview` HTML page. It does not use Google Drive API v3.

#### D. How are Google Drive permissions handled?
- **Finding:** **UNAUTHENTICATED / PUBLIC ONLY.**
- The request contains no Google authentication headers (no OAuth2 bearer token, no API key, no service account JWT).
- **If the folder is NOT set to "Anyone with the link: Viewer":** Google returns an HTTP 302 redirect or 200 with the Google Account Sign-In HTML (`accounts.google.com/signin`).
- The regex parser finds 0 matching elements and returns `{ images: [], folders: [] }`. The client sees an empty gallery with zero error explanation.

#### E. Are subfolders supported?
- **Finding:** **PARTIALLY (SINGLE LEVEL ON-DEMAND ONLY).**
- Subfolders are parsed if present in the top-level HTML:
  ```javascript
  const isSubFolder = block.includes('/drive/folders/') || block.includes('folder');
  ```
- Clicking a subfolder makes a new request for that subfolder ID.
- However, there is no recursive folder traversal or multi-folder batch compilation.

#### F. Are image formats and original file metadata preserved correctly?
- **Finding:** **NO.**
- The HTML scraper extracts only `id` and `name` from DOM elements.
- It maps the image URL to:
  ```javascript
  url: `https://lh3.googleusercontent.com/d/${id}=w1000`
  ```
- This is a 1000px wide, lossy-compressed Google CDN thumbnail.
- All original camera metadata (EXIF capture date, camera model, lens, ISO, shutter speed, raw dimensions, original file byte size) is lost.

#### G. Is the current `embeddedfolderview` HTML parsing reliable?
- **Finding:** **HIGHLY FRAGILE / BRITTLE.**
- It relies on regex pattern matching against undocumented Google DOM class names:
  ```javascript
  const entryRegex = /<div class="flip-entry"[^>]*id="entry-([^"]+)"[^>]*>(.*?)<div class="flip-entry-title">([^<]+)<\/div>/g;
  ```
- Google regularly updates their frontend layout and markup. Any change to Google's HTML, deployment of dynamic class obfuscation, or bot-detection interstitials immediately breaks the gallery.

#### H. Can protected client access be preserved?
- **Finding:** **AT THE APPLICATION LAYER ONLY.**
- Within the Photo Selection application, client sessions are protected by PIN authentication and project-scoped JWT/UUID session tokens.
- However, at the Google Drive layer, because the folder must be configured as public ("Anyone with the link can view"), the raw files remain publicly accessible on Google's servers to anyone who obtains the folder ID or image IDs.

#### I. Are original image downloads actually supported?
- **Finding:** **NO.**
- In `app.html` (lines 14643–14646), `fetchAuthorizedOriginalBlob` explicitly enforces:
  ```javascript
  if (typeof url === 'string' && (url.includes('=w') || url.includes('/thumb/'))) {
    throw new Error("Sumber berkas merupakan preview/thumbnail, bukan berkas asli");
  }
  ```
  Because `handleGetDriveContent` supplies `=w1000` URLs, real Drive photo downloads fail this contract unless the URL is modified.
- Changing the URL to Google Drive's direct download endpoint (`https://drive.google.com/uc?export=download&id=...`) encounters Google's "Virus scan warning" confirmation wall for any file larger than ~25MB (which includes almost all RAW and high-resolution JPEG files), preventing automated batch or ZIP downloading.

---

### 2. Remaining Real Drive Blockers (Summary)

| Blocker # | Issue Description | Impact |
| :--- | :--- | :--- |
| **B1** | **Unauthenticated HTML Scraping** | High risk of sudden failure if Google alters `embeddedfolderview` markup. |
| **B2** | **Mandatory Public Sharing** | Photographers must make private client photos public to the entire web. |
| **B3** | **Absence of Original Binaries** | Google CDN delivers 1000px previews (`=w1000`), not authentic high-res camera originals. |
| **B4** | **Google Virus Scan Interstitial** | Files >25MB cannot be downloaded directly via simple HTTP GET. |
| **B5** | **Zero Credentials Configured** | No Google Cloud Service Account or OAuth2 credentials exist in backend configuration. |

---

### 3. Requirements for Genuine Google Drive Integration

To achieve a production-ready, enterprise-grade Google Drive integration, the following infrastructure must be implemented:

1. **Google Cloud Platform (GCP) Project:**
   - Create a dedicated GCP project and enable the **Google Drive API v3**.
2. **Service Account Authentication:**
   - Create a Google Cloud Service Account with domain-wide delegation or folder-level sharing.
   - Securely store the Service Account private key in environment variables (e.g., `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`).
3. **Official API Calls in `api/supabase.js`:**
   - Replace `embeddedfolderview` with `google.drive('v3').files.list`:
     - Query: `'<folderId>' in parents and trashed = false`
     - Fields: `files(id, name, mimeType, size, imageMediaMetadata, webContentLink)`
   - Implement binary streaming via `google.drive('v3').files.get({ fileId, alt: 'media' })` to stream authentic high-resolution camera originals directly to authorized client sessions.
4. **Isolated Test Environment:**
   - Dedicated GCP test folder with sample high-res JPEG and RAW files to validate rate limits, quota consumption, and chunked ZIP downloads without risking production quotas.

---

## FINAL STATUS DECLARATION

```
========================================================================
LOCAL MOCK ENVIRONMENT:  READY FOR OPERATOR MOCK RECHECK (Port 4173)
REAL GOOGLE DRIVE INTEGRATION: STRICT NO-GO (Requires GCP Drive API v3)
========================================================================
```

- **Local Mock Projects:** 100% fidelity restored. In-memory project persistence, passwordless bypass, PIN verification, custom quotas, and isolated mock fixtures are fully operational and verified by 20/20 automated tests.
- **Real Google Drive:** Do NOT claim production readiness. The real backend requires official Google Drive API v3 integration with a Google Cloud Service Account before live deployment.
- **Safety Enforcement:** Zero Git CLI commands were executed. Zero Supabase production database mutations were made. Zero real customer data was modified. Mock test isolation has been strictly maintained.
