# Phase 5.6R — Download Authorization Audit & Root Cause Analysis

**Project:** Photo Selection / KMBC  
**Evaluation Phase:** Phase 5.6R — Download Authorization Correctness Gate  
**Investigation Date:** October 2026  
**Final Status:** READY FOR OPERATOR VISUAL RECHECK (Production Gated)  
**Security Boundary:** 100% Isolated Local Mock Sandbox  

---

## 1. Executive Summary

An independent security runtime audit of the mock test server (`http://127.0.0.1:4173`) identified critical authorization bypass vulnerabilities in the local test harness:
1. **Unauthenticated Mock Fixture Exposure:** `GET /test/phase55-fixtures/photo1.png` returned HTTP 200 without requiring any token or session credentials.
2. **Global Shared Token Vulnerability:** A single static token (`mock-access-token-uat-55`) could be used across different projects without project binding or verification.
3. **Cross-Project Access Exposure:** A valid token from one project could download fixtures belonging to another project.
4. **Unauthenticated `getDriveContent` Preview Leak:** `POST /api/bridge` with `action: getDriveContent` returned 5 image objects containing full base64 image preview data without verifying client PIN or session authentication.
5. **Frontend Credential Leakage Vector:** In `app.html`, `downloadSingleOriginalFile()` attached `X-Client-Token` and `Authorization` headers to the target URL without validating whether the target URL was same-origin or external.

All five vulnerabilities have been diagnosed to their root causes and repaired with zero weakening of CSP/CORS.

---

## 2. Root Cause Breakdown

### A. Vulnerability 1: Missing Token Bypassed Authorization in Fixture Route
- **File:** `test/phase55-browser-uat.js`
- **Previous Implementation:**
  ```javascript
  if (reqToken) {
      const owner = mockProjectOwners[reqToken];
      if (!owner && reqToken !== 'mock-access-token-uat-55') {
          res.writeHead(403, ...);
          return res.end(...);
      }
      if (reqToken === 'token-no-download') {
          res.writeHead(403, ...);
          return res.end(...);
      }
  }
  ```
- **Root Cause:** Authorization checks were nested entirely inside `if (reqToken) { ... }`. When a request was sent with **no token** (e.g. direct browser navigation or raw cURL), `reqToken` was `undefined`. The server skipped the authorization block entirely and served the file via `fs.stat(filePath)` with HTTP 200 OK!
- **Correction:** Inverted logic. Any request lacking credentials (`!clientToken && !sessionToken`) is rejected immediately with HTTP 403 Forbidden.

### B. Vulnerability 2: Shared Global Token & Arbitrary Referer Acceptance
- **File:** `test/phase55-browser-uat.js`
- **Root Cause:**
  1. `reqToken !== 'mock-access-token-uat-55'` allowed any caller holding this static string to access files across any project.
  2. The server parsed `req.headers['referer']` to extract `token`. Because Referer headers can be spoofed or set by external sites, treating Referer as authentication violated boundary isolation.
- **Correction:**
  - Removed `mock-access-token-uat-55` entirely.
  - Eliminated arbitrary Referer header authentication.
  - Implemented project-scoped dynamic sessions: `mockVerifiedSessions` maps dynamically generated session tokens (`mock-session-<token>-<timestamp>`) strictly to their verified project.

### C. Vulnerability 3: Cross-Project Photo Access
- **File:** `test/phase55-browser-uat.js`
- **Root Cause:** The server checked whether `reqToken` was a recognized project token, but did not check whether the specific requested file (`photo1.png`, `photo4.png`, etc.) belonged to that project's authorized photo set.
- **Correction:** Implemented `mockProjectFixtures` mapping project tokens to allowed file lists. Requests for files outside the authenticated project's photo set are rejected with HTTP 403 (`CROSS_PROJECT_FORBIDDEN`).

### D. Vulnerability 4: Unauthenticated `getDriveContent` Preview Leak
- **File:** `test/phase55-browser-uat.js` & `app.html`
- **Root Cause:** In `test/phase55-browser-uat.js`, `handleApiBridge` handled `action === 'getDriveContent'` by unconditionally returning `DUMMY_PHOTOS` with complete base64 image data. In `app.html`, `fetchClientContent()` called `getDriveContent` without passing the project token or session headers.
- **Correction:**
  - In `app.html`, `fetchClientContent()` now passes `token: clientState.token` and headers `X-Client-Token` / `Authorization`.
  - In `test/phase55-browser-uat.js`, `getDriveContent` now validates that the caller has an active, PIN-verified session (or photographer/admin credentials). Unauthenticated requests are rejected with `status: 'error', code: 'UNAUTHORIZED'`.

### E. Vulnerability 5: Credential Leakage Vector in Client Downloads
- **File:** `app.html`
- **Root Cause:** `downloadSingleOriginalFile()` unconditionally attached sensitive client tokens (`X-Client-Token`, `Authorization: Bearer ...`) to any URL passed as `originalUrl` or `originalDownloadUrl`. If a project configured an external URL (e.g. cloud storage or third-party host), client tokens would be transmitted in plaintext HTTP headers to third-party servers.
- **Correction:**
  - Target URL is parsed via `new URL(url, window.location.origin)`.
  - Destination origin is verified against `window.location.origin`.
  - Sensitive authentication headers are **ONLY** attached if `isSameOrigin === true`.
  - Dangerous protocols (`javascript:`, `ftp:`, etc.) are rejected with HTTP 400.

---

## 3. Negative & Positive Security Verification Matrix

| Test ID | Scenario | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| **SEC01** | `GET /test/phase55-fixtures/photo1.png` without token | HTTP 403 Forbidden | HTTP 403 Forbidden | ✅ PASS |
| **SEC02** | `GET /test/phase55-fixtures/photo1.png` with unknown token | HTTP 403 Forbidden | HTTP 403 Forbidden | ✅ PASS |
| **SEC03** | `GET ...?token=token-ivory` before PIN verification | HTTP 403 Forbidden | HTTP 403 Forbidden | ✅ PASS |
| **SEC04** | Attempt download after entering incorrect PIN | HTTP 403 Forbidden | HTTP 403 Forbidden | ✅ PASS |
| **SEC05** | Authorized download with valid token & correct PIN | HTTP 200 image/png | HTTP 200 image/png | ✅ PASS |
| **SEC06** | Download on project with `isDownloadActive: false` | HTTP 403 Forbidden | HTTP 403 Forbidden | ✅ PASS |
| **SEC07** | Cross-project access (`token-proj-2` requesting `photo1.png`) | HTTP 403 Forbidden | HTTP 403 Forbidden | ✅ PASS |
| **SEC08** | Bypass attempt using legacy `mock-access-token-uat-55` | HTTP 403 Forbidden | HTTP 403 Forbidden | ✅ PASS |
| **SEC09** | `POST getDriveContent` without authentication | Status: error (403) | Status: error | ✅ PASS |
| **SEC10** | `POST getDriveContent` with verified session | Status: success (5 photos) | Status: success (5 photos) | ✅ PASS |
| **SEC11** | External URL fetch receives zero auth headers | Headers: `{}` | Headers: `{}` | ✅ PASS |
| **SEC12** | Untrusted protocol (`javascript:...`) rejected | Throws HTTP 400 Error | Throws HTTP 400 Error | ✅ PASS |

---

## 4. Production Gating Decision

> [!CAUTION]
> **Production Originals Endpoint Remains GATED / BLOCKED**
>
> 1. In Production, `api/supabase.js:handleGetDriveContent` scrapes Google Drive folder views and yields thumbnail links: `https://lh3.googleusercontent.com/d/{id}=w1000`.
> 2. These URLs are scaled web thumbnails, NOT raw camera originals.
> 3. Production currently lacks a dedicated, authorized backend proxy/streaming endpoint for Google Drive binary retrieval without exposing photographer service account credentials.
> 4. Per strict safety directives, no backend endpoints or cloud proxies were deployed.
> 5. Production original file downloads remain **GATED** until a dedicated authorized streaming service is implemented in a future phase.
