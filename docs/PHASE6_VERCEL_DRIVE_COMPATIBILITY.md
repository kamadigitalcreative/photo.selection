# KMBC PHOTO SELECTION — PHASE 6 VERCEL PREVIEW GOOGLE DRIVE COMPATIBILITY REPORT
## ROOT CAUSE AUDIT, ARCHITECTURAL COMPATIBILITY & CONFIGURATION GUIDE

**Project:** Photo Selection / KMBC  
**Date:** 2026-10-26  
**Branch:** `feat/phase-6-drive-integration`  
**Verified Checkpoint:** `d5b96e3`  
**Current Status:** **`BLOCKED — AUTHENTICATION METHOD REQUIRED`**  
*(Requires configuring `DRIVE_PROVIDER=google` and `GOOGLE_SERVICE_ACCOUNT_KEY` in Vercel Preview Settings)*

---

## EXECUTIVE SUMMARY

During Vercel Preview user acceptance testing (UAT) of the test project **"KMBC PHASE 6 TEST"**, photographer login, project creation, and Google Drive folder link submission succeeded. However, opening the client gallery ("Pilih Foto" or "Download Foto") failed with the exact server error:

> **"Gagal Memuat Galeri"**  
> *"Konfigurasi DRIVE_PROVIDER tidak valid atau belum diatur di server (MISSING_PRODUCTION_CONFIG)."*

This audit conducted an exhaustive root-cause investigation across the codebase (`api/drive/index.js`, `api/drive/googleProvider.js`, `api/drive/mockProvider.js`, `api/drive/downloadService.js`, `api/drive/urlParser.js`, `api/supabase.js`, `api/bridge.js`, `app.html`, `vercel.json`, and all automated test suites).

### Key Findings:
1. **Root Cause Confirmed:** Vercel automatically sets `NODE_ENV=production` for all serverless functions (including Preview deployments). In `api/drive/index.js`, when `NODE_ENV === 'production'` and the environment variable `DRIVE_PROVIDER` is missing or empty, the provider factory strictly **fails closed** by returning an unconfigured provider with reason `MISSING_PRODUCTION_CONFIG`.
2. **Legacy Shared-Folder Compatibility Audit:** Prior to Phase 6, KMBC utilized an unauthenticated HTML scrape of `drive.google.com/embeddedfolderview?id=${folderId}#list`. That legacy approach required making customer folders 100% public to the internet, delivered only 1000px lossy preview thumbnails (`=w1000`), lost all camera EXIF metadata, completely broke original camera and RAW binary downloads, and violated security policies. It cannot and must not be revived.
3. **Google Drive Architecture Reality:** Google Drive provides **zero unauthenticated REST APIs**. Google Drive API v3 strictly rejects unauthenticated folder listings and binary streaming with HTTP 401/403. Accessing Google Drive folders without credentials is technically impossible.
4. **Resolution Path:** No application source code refactoring is required. The Phase 6 codebase already contains the genuine Google Drive API v3 provider (`GoogleDriveProvider`) with built-in RS256 JWT authorization. The issue is resolved purely through **environment variable configuration** in the Vercel Preview settings dashboard.

---

## 1. CONFIRMED ROOT CAUSE

In Vercel, Node.js serverless runtimes automatically have `NODE_ENV` set to `'production'`.

In `api/drive/index.js` (lines 35–85):
```javascript
function getDriveProvider(overrideType) {
  const isProd = process.env.NODE_ENV === 'production';

  // 1. Explicit override provided
  if (overrideType !== undefined && overrideType !== null && overrideType !== '') {
    const cleanOverride = String(overrideType).toLowerCase().trim();
    if (cleanOverride === 'google') {
      if (!defaultGoogleProvider) defaultGoogleProvider = new GoogleDriveProvider();
      return defaultGoogleProvider;
    }
    if (cleanOverride === 'mock') {
      if (isProd) {
        return createUnconfiguredProvider('MOCK_FORBIDDEN_IN_PRODUCTION');
      }
      if (!defaultMockProvider) defaultMockProvider = new MockDriveProvider();
      return defaultMockProvider;
    }
    return createUnconfiguredProvider(`INVALID_OVERRIDE:${overrideType}`);
  }

  // 2. Read from environment
  const envType = (process.env.DRIVE_PROVIDER || '').toLowerCase().trim();

  if (envType === 'google') {
    if (!defaultGoogleProvider) defaultGoogleProvider = new GoogleDriveProvider();
    return defaultGoogleProvider;
  }

  if (envType === 'mock' || process.env.USE_MOCK_DRIVE === 'true') {
    if (isProd) {
      return createUnconfiguredProvider('MOCK_FORBIDDEN_IN_PRODUCTION');
    }
    if (!defaultMockProvider) defaultMockProvider = new MockDriveProvider();
    return defaultMockProvider;
  }

  // 3. Preserve local test and mock server execution strictly when NOT in production
  const isLocalMockEnv = !isProd && Boolean(
    process.env.NODE_ENV === 'test' ||
    process.env.UAT_PORT === '4173' ||
    (typeof process !== 'undefined' && Array.isArray(process.argv) && process.argv.some(a => a.includes('phase55') || a.includes('test')))
  );

  if (isLocalMockEnv) {
    if (!defaultMockProvider) defaultMockProvider = new MockDriveProvider();
    return defaultMockProvider;
  }

  // 4. Missing configuration in production fails closed
  return createUnconfiguredProvider('MISSING_PRODUCTION_CONFIG');
}
```

### Execution Trace in Vercel Preview:
1. When the operator corrected Supabase variables in Vercel Preview, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` were populated, enabling photographer login.
2. However, `DRIVE_PROVIDER` was **not set** in the Vercel Preview environment variables.
3. When the client loaded the gallery, `app.html` dispatched:
   ```http
   POST /api/bridge HTTP/1.1
   Content-Type: application/json
   { "action": "getDriveContent", "token": "...", "clientAccessToken": "..." }
   ```
4. `api/supabase.js:handleGetDriveContent` invoked `getDriveProvider()` without an override.
5. In Vercel, `isProd === true` (`NODE_ENV === 'production'`) and `envType === ''`.
6. Condition 3 (`isLocalMockEnv`) evaluated to `false` because `!isProd` is `false`.
7. Execution fell through to Line 84:
   ```javascript
   return createUnconfiguredProvider('MISSING_PRODUCTION_CONFIG');
   ```
8. The unconfigured provider returned:
   ```json
   {
     "success": false,
     "code": "DRIVE_CONFIG_ERROR",
     "reason": "MISSING_PRODUCTION_CONFIG",
     "message": "Konfigurasi DRIVE_PROVIDER tidak valid atau belum diatur di server (MISSING_PRODUCTION_CONFIG)."
   }
   ```
9. `app.html` caught this 500 error and rendered the error banner to the user.

---

## 2. EXISTING PROVIDER ARCHITECTURE

Phase 6 established a modular, provider-based architecture under `api/drive/`:

```
api/drive/
├── types.js            <-- Supported MIME types, RAW extensions, error constants, Vercel limit
├── urlParser.js        <-- SSRF-safe URL parser & folder ID validator (supports /folders/, /open?id=, etc.)
├── mockProvider.js     <-- Offline sandbox provider (local test suites, port 4173)
├── googleProvider.js   <-- Genuine Google Drive API v3 provider (RS256 JWT authorization, zero npm deps)
├── downloadService.js  <-- PIN-gated media delivery controller & Vercel 4.5MB chunking validator
└── index.js            <-- Provider factory (getDriveProvider) with fail-closed security
```

### Provider Matrix

| Mode / Provider | Activated By | Security Model | Target Environment |
| :--- | :--- | :--- | :--- |
| **`GoogleDriveProvider`** | `DRIVE_PROVIDER=google` | Server-side RS256 JWT with Service Account credentials; private folder sharing. | Vercel Preview & Production |
| **`MockDriveProvider`** | `DRIVE_PROVIDER=mock` or local port 4173 | In-memory fixtures (`test/phase55-fixtures/`). | Local development & offline test suites only (`NODE_ENV !== 'production'`) |
| **`UnconfiguredProvider`** | Missing or invalid configuration | Fails closed (HTTP 500 `DRIVE_CONFIG_ERROR`). | Safeguard against unconfigured deployments |

---

## 3. EVIDENCE OF LEGACY COMPATIBILITY & ITS FATAL LIMITATIONS

The operator inquired whether the legacy workflow of pasting an ordinary shared Google Drive link without Google Cloud configuration could be maintained.

### Historical Evidence:
In versions prior to Phase 6, `handleGetDriveContent` in `api/supabase.js` scraped Google's legacy web endpoint:
```javascript
const url = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
const fetchRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ...' } });
const html = await fetchRes.text();
const entryRegex = /<div class="flip-entry"[^>]*id="entry-([^"]+)"[^>]*>(.*?)<div class="flip-entry-title">([^<]+)<\/div>/g;
```

### Why Legacy Compatibility CANNOT Be Maintained:

1. **Zero Photo Privacy (Critical Security Failure):**
   - The legacy scraper only functioned if the Google Drive folder permission was set to **"Anyone with the link can view"**.
   - This exposed clients' private wedding, engagement, and family photos to anyone on the internet without a password or PIN.
2. **Original Binaries & RAW Files Completely Broken:**
   - The legacy scraper mapped image URLs to `https://lh3.googleusercontent.com/d/{id}=w1000`.
   - In `app.html`, `fetchAuthorizedOriginalBlob` explicitly enforces:
     ```javascript
     if (typeof url === 'string' && (url.includes('=w') || url.includes('/thumb/'))) {
       throw new Error("Sumber berkas merupakan preview/thumbnail, bukan berkas asli");
     }
     ```
   - Consequently, clicking **"Download Foto"** or **"Download Pilihan (ZIP)"** failed immediately on real Google Drive links.
   - Using Google's direct export endpoint (`drive.google.com/uc?export=download`) encounters Google's **"Virus scan warning"** confirmation screen for files >25MB, completely breaking automated ZIP compilation.
3. **Extreme Fragility:**
   - Google Drive's `embeddedfolderview` markup is undocumented, unsupported, and regularly modified by Google. Any change breaks the regex parser.
4. **Explicit Safety Restriction:**
   - The task specification strictly states:
     > *"DO NOT use arbitrary Google Drive page scraping as a substitute for verified secure access."*  
     > *"DO NOT claim private folders can be accessed anonymously."*  
     > *"If secure legacy compatibility cannot be demonstrated, STOP without weakening security."*

Therefore, reviving unauthenticated scraping is rejected as **`BLOCKED — UNSAFE LEGACY COMPATIBILITY`**.

---

## 4. SAFE IMPLEMENTATION DECISION

### Architectural Reality:
Google Drive has **no unauthenticated API**. Google Drive API v3 strictly requires an authorization credential (a Service Account JWT or OAuth 2.0 token).

### The Familiar Workflow IS Preserved:
The operator does **NOT** need to create multiple Google Cloud projects or repeatedly configure Google Cloud Console:
1. **One-Time Setup:** A single Google Cloud Service Account is created once for the KMBC system.
2. **One-Time Vercel Config:** The Service Account JSON key is added to Vercel Environment Variables.
3. **Daily Photographer Workflow (Zero Google Cloud Console Access):**
   - In Google Drive, the photographer simply clicks **Share** and invites the KMBC bot email (e.g. `kmbc-drive@...iam.gserviceaccount.com`) as **Viewer**.
   - The folder remains completely **private** from the public internet.
   - The photographer pastes their normal Google Drive shared-folder URL into KMBC Photo Selection.
   - The client enters their PIN, views photos, selects favorites, and downloads authentic camera originals or ZIP archives.

---

## 5. EXACT FILES MODIFIED

No production or application logic files were modified. The architecture in `feat/phase-6-drive-integration` (`d5b96e3`) is completely correct and secure.

### Files Added:
- [`test/phase6-vercel-drive-compatibility.test.js`](file:///d:/FILE%20GITHUB/photo.selection/test/phase6-vercel-drive-compatibility.test.js): Automated test suite verifying Scenarios TEST 01 through TEST 14.
- [`docs/PHASE6_VERCEL_DRIVE_COMPATIBILITY.md`](file:///d:/FILE%20GITHUB/photo.selection/docs/PHASE6_VERCEL_DRIVE_COMPATIBILITY.md): This comprehensive audit and configuration document.

---

## 6. CONFIGURATION VARIABLES NEEDED

To enable Google Drive integration in Vercel Preview (and Production), configure the following Environment Variables in the **Vercel Project Dashboard**:

### Required Variables:

| Variable Name | Environment | Value Description | Example / Format |
| :--- | :--- | :--- | :--- |
| **`DRIVE_PROVIDER`** | Preview, Production | Identifies the active Drive subsystem. | `google` |
| **`GOOGLE_SERVICE_ACCOUNT_KEY`** | Preview, Production | The entire single-line JSON string downloaded from Google Cloud Console. | `{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN RSA PRIVATE KEY-----\n...","client_email":"...iam.gserviceaccount.com",...}` |

*(Alternatively, `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` can be configured as separate variables if preferred).*

---

## 7. SECURITY AND PRIVACY IMPLICATIONS

1. **Client Privacy Guarantee:**
   - Unlike public links, sharing with the Service Account email keeps the photographer's Google Drive folder private. No unauthorized web user can access the folder directly on Google.
2. **Server-Authoritative Project Isolation:**
   - The server verifies client PIN sessions before issuing media delivery tokens.
   - Cross-project access is strictly prevented (`PROJECT_MISMATCH` and `CROSS_PROJECT_FORBIDDEN`).
3. **Bounded Image Previews:**
   - Preview thumbnails streamed to the gallery are size-bounded (max 1200px / 4MB ceiling) to protect serverless memory and client mobile bandwidth.
4. **Authentic Binary Delivery:**
   - Camera originals (JPEG/PNG/RAW) are delivered with byte-for-byte fidelity and verified SHA-256 integrity, utilizing HTTP 206 chunking when exceeding serverless limits.
5. **Zero Credential Exposure:**
   - The Service Account private key never touches the client browser. All Google Drive API interactions take place strictly server-side.

---

## 8. AUTOMATED TEST RESULTS

All 14 required verification scenarios were executed and passed:

```
================================================================
PHASE 6 — VERCEL PREVIEW DRIVE COMPATIBILITY SUITE (TEST 01 - 14)
================================================================

✅ [PASS] TEST 01: Missing DRIVE_PROVIDER fails closed with MISSING_PRODUCTION_CONFIG [REAL HANDLER PASS]
✅ [PASS] TEST 02: Invalid provider value fails closed [REAL HANDLER PASS]
✅ [PASS] TEST 03: Production strictly forbids mock fallback (MOCK_FORBIDDEN_IN_PRODUCTION) [REAL HANDLER PASS]
✅ [PASS] TEST 04: Unauthorized gallery request denied without session [REAL HANDLER PASS]
✅ [PASS] TEST 05: Client session authentication strictly enforced [PROVIDER UNIT PASS]
✅ [PASS] TEST 06: Photographer/Client A cannot access Project B (PROJECT_MISMATCH) [PROVIDER UNIT PASS]
✅ [PASS] TEST 07: Project root and nested folder hierarchy validated; foreign folder denied [PROVIDER UNIT PASS]
✅ [PASS] TEST 08: Unsupported files filtered out, RAW segregated as downloadOnly [PROVIDER UNIT PASS]
✅ [PASS] TEST 09: Preview byte size strictly bounded (5MB rejected as THUMBNAIL_OVERSIZED) [PROVIDER UNIT PASS]
✅ [PASS] TEST 10: Original download preserves exact bytes, SHA-256 and PNG magic numbers [PROVIDER UNIT PASS]
✅ [PASS] TEST 11: Large download chunked Range reassembly achieves byte-for-byte SHA-256 match [PROVIDER UNIT PASS]
✅ [PASS] TEST 12: ZIP container verified with PK (0x04034b50) header and authentic binary payload [PROVIDER UNIT PASS]
✅ [PASS] TEST 13: Google private provider authenticates and maps files under simulated network [PROVIDER UNIT PASS]
✅ [PASS] TEST 14: Zero regressions in login, themes (Noir, Ivory, Sapphire, Olive), and mobile viewport [STATIC PASS]

================================================================
TOTAL PHASE 6 COMPATIBILITY ASSERTIONS: 14 PASSED | 0 FAILED
================================================================
```

### Full Regression Suite Verification:
- `test/phase6-hardening.test.js`: **103/103 PASSED**
- `test/phase6-drive-integration.test.js`: **24/24 PASSED**
- `test/phase56r-zip-runtime.test.js`: **20/20 PASSED**
- `test/phase56r-auth-final.test.js`: **20/20 PASSED**
- `test/phase56r-upsell-hardening.test.js`: **16/16 PASSED**
- `test/phase55-browser-uat.js` Isolation Audit: **62/62 PASSED**
- **Total Assertions Across Repository:** **259 PASSED | 0 FAILED**

---

## 9. REMAINING BLOCKERS

1. **Vercel Preview Environment Variables:**
   - `DRIVE_PROVIDER=google` and `GOOGLE_SERVICE_ACCOUNT_KEY` must be configured in Vercel settings for the Preview environment.
2. **Google Drive Folder Sharing:**
   - The dummy project folder on Google Drive (`KMBC PHASE 6 TEST`) must be shared with the Service Account email address as "Viewer".

---

## 10. DETAILED OPERATOR VERCEL PREVIEW UAT GUIDE

Follow these steps to complete UAT on the Vercel Preview deployment:

### Step 1: Create a Google Cloud Service Account (One-Time Setup)
1. Navigate to [Google Cloud Console](https://console.cloud.google.com/).
2. Select your Google Cloud project (or create one named `kmbc-photo-selection`).
3. Enable the **Google Drive API** under **APIs & Services > Library**.
4. Go to **IAM & Admin > Service Accounts > Create Service Account**:
   - Name: `kmbc-drive-provider`
   - Role: Not required (Drive folder permissions are managed via folder sharing).
5. Click the created Service Account > **Keys > Add Key > Create new key > JSON**.
6. Save the downloaded `.json` file securely on your computer. Note the `client_email` (e.g., `kmbc-drive-provider@...iam.gserviceaccount.com`).

### Step 2: Configure Vercel Preview Environment Variables
1. Open your project on [vercel.com](https://vercel.com).
2. Go to **Settings > Environment Variables**.
3. Add Variable 1:
   - **Key:** `DRIVE_PROVIDER`
   - **Value:** `google`
   - **Environment:** Check `Preview` (and `Production` if ready).
4. Add Variable 2:
   - **Key:** `GOOGLE_SERVICE_ACCOUNT_KEY`
   - **Value:** Open the downloaded `.json` key file in Notepad, copy the entire contents as a single string, and paste it here.
   - **Environment:** Check `Preview` (and `Production` if ready).
5. Click **Save**.
6. **Redeploy Preview:** Go to **Deployments**, click the three dots on the latest Preview deployment for `feat/phase-6-drive-integration`, and click **Redeploy** (ensure "Redeploy with existing build cache" is unchecked or environment variables are reloaded).

### Step 3: Verify Dummy Project "KMBC PHASE 6 TEST"
1. In Google Drive, open the folder used for "KMBC PHASE 6 TEST".
2. Click **Share** and enter your Service Account `client_email`. Set permission to **Viewer** and click **Send / Share**.
3. Open the Vercel Preview deployment URL in your browser.
4. Log in with your existing photographer account.
5. In the project list, verify the project "KMBC PHASE 6 TEST".
6. Copy the client gallery link and open it in an Incognito / Private window.
7. Enter the client PIN (or open passwordless if configured).
8. Click **Pilih Foto**: Verify that real photos from the Google Drive folder load smoothly in the grid.
9. Click **Download Foto**:
   - Test single original file download (verifies byte-for-byte camera original).
   - Select multiple photos and click **Download Pilihan (ZIP)** (verifies ZIP compilation).
10. Test theme switching (Noir, Ivory, Sapphire, Olive) and responsive mobile layout.

---

## 11. MANUAL GITHUB DESKTOP INSTRUCTIONS

In accordance with strict safety restrictions, Antigravity has executed zero Git commands.

To commit the new compatibility test suite and report:

1. Open **GitHub Desktop**.
2. Confirm the active repository is **`photo.selection`** and the active branch is **`feat/phase-6-drive-integration`**.
3. In the left panel, you will see two changed files:
   - `test/phase6-vercel-drive-compatibility.test.js`
   - `docs/PHASE6_VERCEL_DRIVE_COMPATIBILITY.md`
4. Enter commit details:
   - **Summary:** `test: add phase 6 vercel preview compatibility suite and audit guide`
   - **Description:** `Documents root cause of MISSING_PRODUCTION_CONFIG in Vercel Preview, confirms Google Drive API v3 Service Account requirements, and adds 14-scenario compatibility test suite.`
5. Click **Commit to feat/phase-6-drive-integration**.
6. Click **Push origin** to update the branch on GitHub.
7. Vercel will automatically trigger a Preview deployment.

---

## 12. FINAL STATUS DETERMINATION

```
================================================================================
FINAL VERDICT: BLOCKED — AUTHENTICATION METHOD REQUIRED
================================================================================
Reason:
Google Drive API v3 requires authenticated Service Account credentials to
access folder contents and stream camera-original media. Unauthenticated shared
links cannot be accessed securely or reliably. Once DRIVE_PROVIDER=google and
GOOGLE_SERVICE_ACCOUNT_KEY are configured in Vercel Preview Environment
Variables, the deployment will immediately be READY FOR PREVIEW UAT.
================================================================================
```
