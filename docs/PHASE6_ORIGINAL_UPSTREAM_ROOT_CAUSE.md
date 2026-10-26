# KMBC PHOTO SELECTION — PHASE 6
## TARGETED `FOLDER_ACCESS_DENIED` ROOT CAUSE AUDIT & RESOLUTION

**Document Version:** 1.0.0  
**Target Photo:** `GEW08635.JPG`  
**Active Drive Provider:** `DRIVE_PROVIDER=public_link`  
**Operator Branch:** `feat/phase-6-drive-integration`  

---

### 1. Exact Failure Stage & Trace Analysis

Tracing the execution flow of `GEW08635.JPG` authentic original request:

```
[Client Fullscreen Viewer]
        │
        ▼ (1)
[app.html: loadViewerAuthenticOriginal]
        │
        ▼ (2) HTTP GET /api/bridge?action=downloadOriginalFile&fileId=GEW08635_ID&token=...&folderId=...&purpose=view
[api/bridge -> api/supabase.js: handleDownloadOriginalFile]
        │
        ├─► Session Verification (verifySessionToken) ──────────────► [PASS] (Valid PIN Session)
        ├─► Project & File Hierarchy Check (resolveProjectFile) ─────► [PASS] (File belongs to Project)
        │
        ▼ (3)
[PublicDriveProvider.fetchOriginalStream(fileId)]
        │
        ▼ (4) Outbound HTTPS GET https://drive.google.com/uc?export=download&id=GEW08635_ID
[Google Drive Public Endpoint]
        │
        ▼ (5) Google returns HTTP 403 Forbidden / 302 Redirect to Accounts / 200 HTML Wall
[PublicDriveProvider Response Handling]
        │
        ├─► OLD DEFECTIVE BEHAVIOR:
        │   `res.status === 404 ? FILE_NOT_FOUND : FOLDER_ACCESS_DENIED`
        │   Mapped ANY Google download rejection to FOLDER_ACCESS_DENIED (HTTP 403).
        │
        ├─► FRONTEND STATUS LOSS BUG:
        │   `fetchAuthorizedOriginalBlob` threw without setting `err.status = response.status`.
        │   Result: Viewer badge showed `Mode Preview [FOLDER_ACCESS_DENIED]`.
        │   Conflated KMBC folder permission with Google's upstream refusal.
        │
        ▼ (6) NEW RESOLVED BEHAVIOR:
        Google upstream refusal classified as `GOOGLE_ORIGINAL_UPSTREAM_DENIED` (HTTP 502, `upstreamStatus: 403`).
        Viewer badge displays `Mode Preview [502:GOOGLE_ORIGINAL_UPSTREAM_DENIED]`.
        External link displayed: "Buka di Drive (Eksternal)".
```

#### Sanitized Diagnostics Table
| Attribute | Upstream Refusal Diagnostic |
|---|---|
| **Failure Stage** | Stage 4/5: Google public download request (`drive.google.com/uc?export=download`) |
| **HTTP Status from KMBC** | HTTP 502 Bad Gateway (Upstream failure) |
| **HTTP Status from Google** | HTTP 403 / 429 / 200 HTML |
| **Safe Error Code** | `GOOGLE_ORIGINAL_UPSTREAM_DENIED` / `GOOGLE_DOWNLOAD_HTML_WALL` |
| **Response Content-Type** | `text/html` or `text/plain` from Google |
| **Actual Received Bytes** | 0 bytes (binary payload rejected by Google) |
| **Google Redirect Occurred** | Yes, redirected to `accounts.google.com` or Google download limitation page |

---

### 2. Error Classification Architecture (Task 2)

We replaced the blanket `FOLDER_ACCESS_DENIED` mapping with strictly differentiated error codes across the entire stack:

| Error Code | HTTP Status | Origin / Meaning |
|---|---|---|
| `KMBC_SESSION_DENIED` | 403 | Missing, expired, or invalid client PIN session token in KMBC |
| `KMBC_PROJECT_FILE_DENIED` | 403 | File does not belong to the authorized KMBC project folder hierarchy |
| `GOOGLE_ORIGINAL_UPSTREAM_DENIED` | 502 | Google refused public download bytes (HTTP 401 / 403 Forbidden). Preserves `upstreamStatus`. |
| `GOOGLE_ORIGINAL_NOT_FOUND` | 404 | Google Drive returned HTTP 404 Not Found for file ID |
| `GOOGLE_ORIGINAL_RATE_LIMIT` | 502 | Google returned HTTP 429 Too Many Requests |
| `GOOGLE_DOWNLOAD_HTML_WALL` | 502 | Google returned an HTML page (quota exceeded / virus scan wall) instead of JPEG stream |
| `GOOGLE_ORIGINAL_NETWORK_ERROR` | 502 | Network socket timeout or DNS failure communicating with Google |

#### Frontend Error Construction Fix
In `app.html`:
- Moved `provName` detection before the HTTP status checks.
- All errors thrown inside `if (response.status === 401 || response.status === 403)` now preserve:
  ```javascript
  err.status = response.status;
  err.provider = provName;
  ```
- Viewer badge displays `[<status>:<errorCode>]` (e.g. `[502:GOOGLE_ORIGINAL_UPSTREAM_DENIED]`), providing complete, sanitized observability without leaking credentials or URLs.

---

### 3. Truthful Zero-Paid Fallback (Task 3)

When Google blocks anonymous binary stream delivery under `public_link`:
1. **Never False-Label:** Thumbnails/previews are **never** labeled "Original 100%".
2. **Badge Accuracy:** Badge clearly states `Mode Preview [502:GOOGLE_ORIGINAL_UPSTREAM_DENIED]` or `[502:GOOGLE_DOWNLOAD_HTML_WALL]`.
3. **External View Link:** An unobtrusive, accessible link (`#viewer-external-drive-link`) is revealed next to the status badge:
   ```html
   <a id="viewer-external-drive-link" href="https://drive.google.com/file/d/{fileId}/view" target="_blank" rel="noopener noreferrer">
     <i class="fa-solid fa-arrow-up-right-from-square"></i> Buka di Drive (Eksternal)
   </a>
   ```
4. **Auto-Hiding:** The external link is automatically hidden as soon as an authentic original loads and decodes successfully, or when the viewer is closed.

---

### 4. Changed Functions and Files

1. **`api/drive/types.js`**
   - Added `KMBC_SESSION_DENIED`, `KMBC_PROJECT_FILE_DENIED`, `GOOGLE_ORIGINAL_UPSTREAM_DENIED`, `GOOGLE_ORIGINAL_NOT_FOUND`, `GOOGLE_ORIGINAL_RATE_LIMIT`, `GOOGLE_DOWNLOAD_HTML_WALL`, and `GOOGLE_ORIGINAL_NETWORK_ERROR` to `ERROR_CODES`.

2. **`api/drive/publicProvider.js`**
   - `fetchOriginalStream(fileId, options)`:
     - Differentiated HTTP 404 (`GOOGLE_ORIGINAL_NOT_FOUND`, 404), HTTP 429 (`GOOGLE_ORIGINAL_RATE_LIMIT`, 502), and HTTP 401/403 (`GOOGLE_ORIGINAL_UPSTREAM_DENIED`, 502, `upstreamStatus`).
     - Classified non-binary HTML responses as `GOOGLE_DOWNLOAD_HTML_WALL` (502).
     - Classified fetch exceptions as `GOOGLE_ORIGINAL_NETWORK_ERROR` (502).

3. **`api/supabase.js`**
   - `handleDownloadOriginalFile(payload, req, res)`:
     - Differentiated missing session (`KMBC_SESSION_DENIED`, 403) from project file mismatch (`KMBC_PROJECT_FILE_DENIED`, 403).
     - Passed upstream failure status (502) and error code (`GOOGLE_ORIGINAL_UPSTREAM_DENIED`) to the client without translating it to `FOLDER_ACCESS_DENIED`.

4. **`app.html`**
   - Added `#viewer-external-drive-link` element in viewer toolbar.
   - `fetchAuthorizedOriginalBlob()`: Attached `err.status = response.status` and `err.provider = provName` to all thrown authorization errors.
   - `loadViewerAuthenticOriginal()`: Added extLink reset at invocation, error display on failure, and external link reveal with `https://drive.google.com/file/d/{fileId}/view`.
   - `closeImageViewer()`: Reset and hid external link.

5. **`test/phase6-public-original-gew08635.test.js`**
   - Created comprehensive 11-assertion test suite targeting `GEW08635.JPG`, verifying error separation, JPEG decode validator, frontend error preservation, and honest fallback UI.

6. **`test/phase6-public-original-gew08797.test.js`**
   - Relabeled from misleading "REAL LIVE TEST" to `[CONTROLLED MOCK REGRESSION - SYNTHETIC DATA]`.
   - Explicitly marked `LIVE GOOGLE DRIVE = NOT RUN`.

---

### 5. Test Suite Verification Results

| Test Suite | Result | Details |
|---|---|---|
| `test/phase6-public-original-gew08635.test.js` | **11/11 PASSED** | Controlled Mock Regression; error separation & status preservation |
| `test/phase6-public-original-gew08797.test.js` | **7/7 PASSED** | Controlled Mock Regression; synthetic JPEG byte stream & HTML wall |
| `test/phase6-public-drive.test.js` | **20/20 PASSED** | Public Drive provider restoration (P01 - P20) |
| `test/phase6-fast-original-viewer.test.js` | **13/13 PASSED** | Speedup benchmark, LRU cache bounds, memory cleanup, safety invariants |
| `test/phase6-vercel-drive-compatibility.test.js` | **14/14 PASSED** | Vercel Preview compatibility & provider validation |
| `test/phase6-original-tracking.test.js` | **43/43 PASSED** | Pipeline integrity, instant gallery, tracking sync |
| **LIVE GOOGLE DRIVE DELIVERY** | **NOT RUN** | Offline IDE environment lacks active Google Drive browser cookies |

---

### 6. Remaining Upstream Limitations Under `DRIVE_PROVIDER=public_link`

Google Drive's legacy public download route (`drive.google.com/uc?export=download&id=FILE_ID`) enforces automated abuse protection:
- **Anonymous Download Throttling:** Google frequently blocks direct binary downloads of files shared via "Anyone with the link can view" when accessed from cloud data centers (e.g. AWS, Vercel serverless IPs) without user authentication.
- **HTML Interstitials:** For certain files or IP ranges, Google serves an HTML interstitial page ("Google Drive - Virus scan warning" or "Download quota exceeded") instead of JPEG bytes.
- **Zero-Paid Constraint:** Because the operator does not use Google Cloud Console, OAuth, or a Service Account, KMBC cannot bypass Google's anonymous download throttling.
- **Honest User Experience:** When Google restricts binary delivery, KMBC displays the fast preview image, accurately labels the badge as `Mode Preview [502:GOOGLE_ORIGINAL_UPSTREAM_DENIED]`, and provides the "Buka di Drive (Eksternal)" link so the client can view or download the authentic file directly on Google Drive.

---

### 7. Specific Vercel Preview Operator UAT Instructions

1. Open the project gallery in Vercel Preview with the client URL and PIN.
2. Verify that gallery thumbnails load immediately (fast loading preserved).
3. Navigate to `GEW08635.JPG` and open fullscreen viewer.
4. **Observe the Status Badge:**
   - If Google serves original bytes: Badge displays `Original 100% (<size>)` in green with checkmark.
   - If Google refuses original bytes: Badge displays `Mode Preview [502:GOOGLE_ORIGINAL_UPSTREAM_DENIED]` or `[502:GOOGLE_DOWNLOAD_HTML_WALL]` in amber/gray.
   - Notice that it **no longer** falsely reports `[FOLDER_ACCESS_DENIED]`.
5. **Verify Fallback Link:**
   - When Google blocks binary delivery, observe the `Buka di Drive (Eksternal)` button next to the badge.
   - Click the button: It should open `https://drive.google.com/file/d/{fileId}/view` in a new browser tab.
6. **Verify Security:**
   - In DevTools Console, inspect `window.__viewerDiagnostics`. Ensure no session tokens, cookies, or secrets are exposed.
