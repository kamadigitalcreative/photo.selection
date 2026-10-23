# Phase 5.6R — Download Authorization Hardening Report

**Project:** Photo Selection / KMBC  
**Evaluation Phase:** Phase 5.6R — Download Authorization Correctness Gate  
**Investigation Date:** October 2026  
**Final Status:** READY FOR OPERATOR VISUAL RECHECK  
**Expected Branch:** `fix/phase-5.6r-ui-stabilization` *(GitHub Desktop Operator Managed)*  

---

## 1. Executive Summary

This report documents the security fixes and hardening measures implemented to resolve authorization bypass vulnerabilities identified in the Phase 5.6R download runtime and mock server architecture.

All vulnerabilities have been resolved in the local mock environment, and full automated regression validation has succeeded:
- **Missing token access eliminated:** Direct GET requests without credentials are now rejected with HTTP 403.
- **Project-scoped session binding:** Tokens are dynamically bound to specific verified gallery sessions; cross-project file access is blocked with HTTP 403.
- **PIN verification enforcement:** Valid tokens cannot access fixtures or photo lists before correct PIN verification.
- **`getDriveContent` protected:** Photo metadata and preview byte retrieval are now gated behind session verification.
- **Zero credential leakage:** `downloadSingleOriginalFile()` validates URL origin and never sends sensitive headers to external endpoints.
- **Invariants preserved:** Script tag invariant preserved at exactly 12 tags (7 external, 5 inline).

---

## 2. Source Code Changes

### A. [app.html](file:///d:/FILE%20GITHUB/photo.selection/app.html)
1. **Origin Verification in `downloadSingleOriginalFile` (Lines 14347–14370):**
   - Parses target URL with `new URL(url, window.location.origin)`.
   - Validates URL protocol against allowlist `['http:', 'https:', 'blob:']`; rejects untrusted schemes (`javascript:`, `ftp:`) with HTTP 400.
   - Evaluates `isSameOrigin = parsedTargetUrl.origin === window.location.origin`.
   - Sensitive headers (`X-Client-Token`, `Authorization`) are **strictly restricted to same-origin requests**. External destinations receive zero client credentials.
2. **Session Authentication in `fetchClientContent` (Lines 11374–11390):**
   - Transmits `X-Client-Token` and `Authorization: Bearer <sessionToken>` alongside `{ action: 'getDriveContent', folder_id, token }`.
   - Enables mock server to authenticate client requests and serve project-scoped photo lists.
3. **Script Invariant:** Exactly 12 `<script>` tags preserved.

### B. [test/phase55-browser-uat.js](file:///d:/FILE%20GITHUB/photo.selection/test/phase55-browser-uat.js)
1. **Project Fixtures Mapping (`mockProjectFixtures`):**
   - Explicitly defines permitted photo sets per project token (`dummy-client-token`, `token-no-download`, `token-ivory`, `token-olive`, `token-proj-2`).
2. **Dynamic In-Memory Session Store:**
   - Implemented `mockVerifiedSessions` (Map) and `mockVerifiedProjectTokens` (Map).
   - In `verifyClientPassword`: On correct PIN (`1234`), generates dynamic token `mock-session-<token>-<timestamp>` and records verified session.
   - In `releaseClientSession`: Explicitly deletes verified session on client exit.
   - Removed legacy shared static token `mock-access-token-uat-55`.
3. **Gated `getDriveContent` (Lines 312–355):**
   - Validates that caller possesses an active, PIN-verified session or photographer/admin credentials.
   - Rejects unauthenticated requests with `status: 'error', code: 'UNAUTHORIZED'`.
   - Filters `DUMMY_PHOTOS` strictly to the project's permitted photo set.
4. **Fixture Route Authorization Gate (Lines 740–810):**
   - Extracts credentials from `X-Client-Token`, `Authorization: Bearer ...`, and query parameters.
   - Rejects arbitrary Referer header authentication.
   - Enforces 6 strict validation gates:
     1. Missing credentials → HTTP 403 (`AUTH_REQUIRED`).
     2. Unknown token → HTTP 403 (`INVALID_TOKEN`).
     3. Known token before PIN verification → HTTP 403 (`NOT_AUTHENTICATED`).
     4. Download disabled project → HTTP 403 (`DOWNLOAD_DISABLED`).
     5. Cross-project file request → HTTP 403 (`CROSS_PROJECT_FORBIDDEN`).
     6. Valid session & permitted file → HTTP 200 with authentic binary stream.
5. **Isolation Audit Suite Updated (Lines 900–975):**
   - Added `ISO-07a`: Rejection of unauthenticated `getDriveContent`.
   - Added `ISO-14a`: Rejection of unauthenticated fixture requests (HTTP 403).
   - Updated `ISO-14b`: Verification that authenticated fixture requests return HTTP 200 with PNG Content-Type.

### C. [test/phase56r-download-auth.test.js](file:///d:/FILE%20GITHUB/photo.selection/test/phase56r-download-auth.test.js)
- Created dedicated 18-step security regression suite validating SEC01 through SEC18.

---

## 3. Security Test Results (SEC01 – SEC18)

| Test ID | Requirement | Verification Method | Result |
|---|---|---|---|
| **SEC01** | File GET with no token -> DENY | HTTP GET `/test/phase55-fixtures/photo1.png` with empty headers | ✅ **PASS** (403) |
| **SEC02** | File GET with random token -> DENY | HTTP GET with `token=unregistered-token-999` | ✅ **PASS** (403) |
| **SEC03** | Valid token before PIN -> DENY | HTTP GET with `token=token-ivory` before PIN verification | ✅ **PASS** (403) |
| **SEC04** | Incorrect PIN -> DENY | Verify wrong PIN → HTTP GET fixture | ✅ **PASS** (403) |
| **SEC05** | Authorized project session -> ALLOW | Verify correct PIN → HTTP GET fixture with session headers | ✅ **PASS** (200) |
| **SEC06** | Download disabled -> DENY | Verify PIN on `token-no-download` → HTTP GET fixture | ✅ **PASS** (403) |
| **SEC07** | Cross-project photo access -> DENY | `token-proj-2` session requesting `photo1.png` | ✅ **PASS** (403) |
| **SEC08** | Shared token cannot bypass ownership | Request using legacy `mock-access-token-uat-55` | ✅ **PASS** (403) |
| **SEC09** | `getDriveContent` without auth -> DENY | POST `/api/bridge` with `action: getDriveContent` without token | ✅ **PASS** (error) |
| **SEC10** | Authorized photo listing -> ALLOW | POST `/api/bridge` with verified project token | ✅ **PASS** (5 photos) |
| **SEC11** | External URLs receive zero auth headers | Code audit: `isSameOrigin` check before attaching credentials | ✅ **PASS** (verified) |
| **SEC12** | Untrusted original URL -> DENY | Code audit: `allowedProtocols` validation rejects `javascript:` etc. | ✅ **PASS** (verified) |
| **SEC13** | Original PNG SHA-256 matches fixture | Cryptographic SHA-256 comparison of downloaded bytes vs disk file | ✅ **PASS** (matched) |
| **SEC14** | Individual download works without ZIP | Code audit: zero `JSZip` invocations in client download flow | ✅ **PASS** (verified) |
| **SEC15** | Selection mode still works | Code audit: independent `selectedImages`, quota, and counter logic | ✅ **PASS** (verified) |
| **SEC16** | Four gallery themes remain intact | Tokens audit: Noir, Ivory, Sapphire, Olive defined with AAA contrast | ✅ **PASS** (verified) |
| **SEC17** | Mock isolation headers verified | Response header inspection: `X-Photo-Selection-Isolation` / `X-Isolation-Status` | ✅ **PASS** (verified) |
| **SEC18** | Zero Production mutations | Strict audit: zero calls to Supabase or Mayar mutation endpoints | ✅ **PASS** (verified) |

---

## 4. Overall Regression Test Summary

| Test Suite | File | Passed | Failed | Skipped | Status |
|---|---|---|---|---|---|
| **Download Authorization Correctness** | `test/phase56r-download-auth.test.js` | 18 | 0 | 0 | ✅ **PASS** |
| **Download Runtime & Original Correctness** | `test/phase56r-download-runtime.test.js` | 22 | 0 | 1 | ✅ **PASS** |
| **Follow-up Final Regression** | `test/phase56r-followup-final.test.js` | 18 | 0 | 0 | ✅ **PASS** |
| **Grid CSS & PRO Presentation** | `test/phase56r-grid-and-pro-regression.test.js` | 28 | 0 | 0 | ✅ **PASS** |
| **Hero Correctness & Demo Flow** | `test/phase56r-hero-correctness.test.js` | 23 | 0 | 0 | ✅ **PASS** |
| **Security & System Regression** | `test/security-and-regression.test.js` | 25 | 0 | 11 | ✅ **PASS** |
| **Mock Isolation & Theme Cascade** | `test/phase55-browser-uat.js` | 53 | 0 | 0 | ✅ **PASS** |
| **TOTAL** | | **187** | **0** | **12** | ✅ **ALL PASS** |

---

## 5. Production Gating & Blockers Notice

> [!WARNING]
> **Production Originals Capability is GATED**
>
> In the Production environment:
> - `getDriveContent` scrapes Google Drive folder HTML and provides embedded thumbnail URLs (`https://lh3.googleusercontent.com/d/{id}=w1000`).
> - No secure backend endpoint currently exists to proxy original Google Drive raw binaries without leaking service account private keys to the client browser.
> - In compliance with safety rules, no new backend routes or cloud proxies were deployed.
> - Production original file downloads remain **GATED** until a dedicated, authenticated streaming microservice is implemented in a future phase.
