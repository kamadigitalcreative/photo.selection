# UPSELL FOTO EKSTRA — API SECURITY HARDENING & EDGE-CASE RESOLUTION REPORT

**Project:** KMBC Photo Selection  
**Target File:** `api/supabase.js` (`handleUpdateClientStatus`, `resolveUserProEntitlement`, `parseProjectMaxFoto`)  
**Test Suites:**  
- `test/phase56r-upsell-hardening.test.js` (Baseline TEST01–TEST16: 16/16 PASSED)  
- `test/phase56r-upsell-edge-cases.test.js` (Edge Cases & Micro Hardening E01–E18: 18/18 PASSED)  
**Date:** 2026-10-23  
**Final Status:** ✅ **READY FOR OPERATOR RECHECK** (All 34 security tests PASSED, 0 blockers)

---

## 1. Executive Summary & Audit Resolution

Following the baseline security hardening of the Upsell Foto Ekstra (Add-On PRO) feature, secondary testing and micro-hardening identified subtle edge cases in selection finalization, quota arithmetic, entitlement evaluation, and date parsing:

1. **CASE A (Inconsistent Finalization via Count-Only Payload):** A client could submit `status: 'Selesai'` and `selectedCount: 3` without `selectedFiles`, while the project persisted 5 files. The backend previously reduced `Foto Terpilih` to 3 while leaving 5 files in the database, allowing extra paid photos to bypass payment confirmation.
2. **CASE B (Silent Numeric Zero Quota Fallback):** JavaScript truthiness evaluation `Number(project['Max Foto']) || ... || 50` treated valid quota `0` as falsy, silently converting quota `0` to default `50` and allowing clients to submit photos without quota limits on 0-quota projects.
3. **CASE C (Paid Finalization Based on Unverifiable Count):** A client could submit `status: 'Menunggu Konfirmasi Pembayaran'` with `selectedCount: 5` and `selectedFiles: omitted` on an empty project. The backend recorded count 5 without verifying any actual photo selections.
4. **CASE D & MICRO-HARDENING (Inactive PRO Entitlement Bypass & Invalid Date RangeError):**
   - `resolveUserProEntitlement()` previously granted PRO status for any record with a future `expires_at`, even when `is_pro === false` (explicitly inactive/revoked).
   - Calling `.toISOString()` on a revoked/inactive record with an invalid date string (e.g. `expires_at: "not-a-valid-date"`) caused a fatal `RangeError: Invalid time value` (HTTP 500).
   - String boolean values with surrounding whitespace (e.g. `" false "` or status `" REVOKED "`) risked bypass if not properly trimmed.

All edge cases and micro-hardening requirements have been resolved directly in `api/supabase.js` with fail-closed authoritative validation, robust numeric parsing, explicit revocation checks, safe Date validation, and strict synchronization between selection counts and stored photo records.

---

## 2. Confirmed Root Causes

### 2.1 Edge Case A: Inconsistent Finalization via Count-Only Payload
* **Root Cause:** When `selectedFiles` was omitted in a request, the backend relied on `selectedCount` without checking whether it matched the persisted `Daftar Pilihan` records stored in the database.
* **Resolution:** On finalization (`status === 'Selesai'` or `status === 'Menunggu Konfirmasi Pembayaran'`), if `selectedFiles` is omitted, the backend authoritatively validates `selectedCount` against `persistedFiles.length`. Any discrepancy is rejected with **HTTP 400 Bad Request**.

### 2.2 Edge Case B: Silent Numeric Zero Quota Fallback
* **Root Cause:** The expression `const currentMax = Number(project['Max Foto']) || Number(project.MaxFoto) || 50;` treated `0` as falsy, converting a project with `Max Foto = 0` to quota 50.
* **Resolution:** Replaced all 4 occurrences of `|| 50` with `parseProjectMaxFoto(rawPrimary, rawSecondary)`, which explicitly checks `Number.isFinite(n) && n >= 0`. Quota `0` is strictly recognized as `0`, rejecting any photo submission when `extraPrice = 0`.

### 2.3 Edge Case C: Paid Finalization on Unverifiable Count
* **Root Cause:** In count-only requests, `countNum` was stored into `Foto Terpilih` even if `persistedFiles` was empty or `selectedFiles` was not provided.
* **Resolution:** When `cleanFiles === null`, finalization as `Menunggu Konfirmasi Pembayaran` requires `persistedFiles.length > 0` and `countNum === persistedFiles.length`. Submitting an unverifiable count with 0 files is rejected with **HTTP 400 Bad Request**.

### 2.4 Edge Case D & Micro Hardening: Inactive PRO & Invalid Date RangeError
* **Root Causes:**
  - `resolveUserProEntitlement()` only inspected `is_lifetime` and `expires_at > Date.now()`, completely ignoring `is_pro === false` or `status: 'inactive'`.
  - In revoked/inactive entitlement records with invalid date strings, calling `new Date(proRow.expires_at).toISOString()` triggered an uncaught `RangeError`.
  - Unsanitized whitespace in string booleans/statuses (`" false "`) could cause comparison mismatches.
* **Resolution:**
  - Added an authoritative `isExplicitlyRevoked` check at the very top of `proRow` evaluation with `.trim().toLowerCase()`.
  - Added `!isNaN(d.getTime())` verification before calling `.toISOString()`, ensuring invalid dates resolve safely to `null` without throwing exceptions.
  - Trimmed and normalized `rawLifetime` (`proRow.is_lifetime === true || rawLifetime === 'true' || rawLifetime === '1'`).

---

## 3. Exact Files Changed

### 3.1 Production Source
* **[api/supabase.js](file:///d:/FILE%20GITHUB/photo.selection/api/supabase.js):**
  - Added `parseProjectMaxFoto` helper (lines 71–80).
  - Updated `resolveUserProEntitlement` with safe string trimming and safe Date validation (lines 1383–1430).
  - Updated `findProjectForClient` (line 2139), `handleGetProjectForClient` (line 2507), and `handleSyncBackground` (line 3968) to use `parseProjectMaxFoto`.
  - Hardened `handleUpdateClientStatus` (lines 2724–2875) with `persistedFiles` parsing, finalization integrity checks, quota 0 enforcement, and non-corrupting background ping handling.

### 3.2 Test Suites
* **[test/phase56r-upsell-edge-cases.test.js](file:///d:/FILE%20GITHUB/photo.selection/test/phase56r-upsell-edge-cases.test.js):** 18 automated handler tests covering E01–E18, including child-process baseline suite execution (E15) and targeted micro-hardening tests (E16–E18).
* **[test/phase56r-upsell-hardening.test.js](file:///d:/FILE%20GITHUB/photo.selection/test/phase56r-upsell-hardening.test.js):** 16 baseline hardening tests covering TEST01–TEST16.

---

## 4. Edge-Case & Micro-Hardening Test Results (E01 – E18)

Executed via:
```powershell
node test/phase56r-upsell-edge-cases.test.js
```

| Test ID | Description | Classification | Status | Persisted DB State Assertion / Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **E01** | Repeat Case A: Inconsistent count (3) with 5 stored files and status Selesai | REAL HANDLER TEST | ✅ **PASS** | HTTP 400 rejected; project remains `Sedang Memilih`, count remains 5, files remain 5. |
| **E02** | Repeat Case B: Project with `Max Foto = 0` and `ExtraPrice = 0` | REAL HANDLER TEST | ✅ **PASS** | HTTP 400 rejected (`melebihi kuota project (0)`); 0 files saved in DB. |
| **E03** | Repeat Case C: Upsell project with 0 files, client sends count 5 and pending payment | REAL HANDLER TEST | ✅ **PASS** | HTTP 400 rejected; count remains 0, file list remains empty. |
| **E04** | Inactive PRO with future expiry (`is_pro: false`) creates paid project | REAL HANDLER TEST | ✅ **PASS** | HTTP 403 strictly denied despite future expiry. |
| **E05** | Active PRO with future expiry (`is_pro: true`) creates paid project | REAL HANDLER TEST | ✅ **PASS** | HTTP 200 project created successfully with extra price. |
| **E06** | Valid lifetime PRO creates paid project | REAL HANDLER TEST | ✅ **PASS** | HTTP 200 lifetime PRO project created. |
| **E07** | Expired PRO creates paid project | REAL HANDLER TEST | ✅ **PASS** | HTTP 403 strictly denied. |
| **E08** | Valid 3-photo free submission within quota | REAL HANDLER TEST | ✅ **PASS** | HTTP 200; DB status becomes `Selesai`, count is 3, files are 3. |
| **E09** | Valid 5-photo paid submission with `Menunggu Konfirmasi Pembayaran` | REAL HANDLER TEST | ✅ **PASS** | HTTP 200; DB status becomes `Menunggu Konfirmasi Pembayaran`, count is 5, files are 5. |
| **E10** | Client attempts to force `Selesai` when pending payment | REAL HANDLER TEST | ✅ **PASS** | HTTP 403 denied; DB status remains `Menunggu Konfirmasi Pembayaran`. |
| **E11** | Photographer confirms payment through existing `processPayment` | REAL HANDLER TEST | ✅ **PASS** | HTTP 200; DB status promoted to `Selesai`. |
| **E12** | Legitimate removal of extra photos (5 down to 3) before `Selesai` | REAL HANDLER TEST | ✅ **PASS** | HTTP 200; DB count & files cleanly updated to 3, status is `Selesai`. |
| **E13** | Count-only background ping compatibility | REAL HANDLER TEST | ✅ **PASS** | HTTP 200; DB count preserved at 5, file list preserved at 5 (not corrupted). |
| **E14** | Zero live DB or external payment network mutations | STATIC CHECK | ✅ **PASS** | 0 live network calls, all 44 queries intercepted by local mock harness. |
| **E15** | Baseline 16 hardening tests regression run | REAL TEST EXECUTION | ✅ **PASS** | Executed `phase56r-upsell-hardening.test.js` via `child_process` (16/16 PASSED). |
| **E16** | RangeError prevention on revoked PRO with invalid `expires_at: "not-a-valid-date"` | REAL HANDLER TEST | ✅ **PASS** | HTTP 403 safely returned with zero RangeError or 500. |
| **E17** | Whitespace string boolean/status safely recognized as revoked (`"  false  "`, `"  REVOKED  "`) | REAL HANDLER TEST | ✅ **PASS** | HTTP 403 strictly denied for padded string values. |
| **E18** | Whitespace string boolean `"  true  "` safely recognized as active | REAL HANDLER TEST | ✅ **PASS** | HTTP 200 project created with padded `"  true  "`. |

---

## 5. Baseline Security Test Results (TEST01 – TEST16)

Executed via:
```powershell
node test/phase56r-upsell-hardening.test.js
```

| Test ID | Description | Classification | Status |
| :--- | :--- | :--- | :--- |
| **TEST01** | No Upsell, quota 3, submit 3 photos -> accepted | REAL HANDLER TEST | ✅ **PASS** |
| **TEST02** | No Upsell, quota 3, submit 4 photos -> rejected | REAL HANDLER TEST | ✅ **PASS** |
| **TEST03** | Upsell enabled, quota 3, submit 5 with `Menunggu Konfirmasi Pembayaran` | REAL HANDLER TEST | ✅ **PASS** |
| **TEST04** | Force status Selesai with 5 photos -> denied | REAL HANDLER TEST | ✅ **PASS** |
| **TEST05** | Client set payment-confirmed status -> denied | REAL HANDLER TEST | ✅ **PASS** |
| **TEST06** | Authorized photographer confirms payment -> succeeds | REAL HANDLER TEST | ✅ **PASS** |
| **TEST07** | Unauthorized account attempts payment confirmation -> denied | REAL HANDLER TEST | ✅ **PASS** |
| **TEST08** | Invalid client session -> denied | REAL HANDLER TEST | ✅ **PASS** |
| **TEST09** | Client session from Project A used against Project B -> denied | REAL HANDLER TEST | ✅ **PASS** |
| **TEST10** | Selected count mismatch -> rejected | REAL HANDLER TEST | ✅ **PASS** |
| **TEST11** | Duplicate entries in selection payload -> rejected | REAL HANDLER TEST | ✅ **PASS** |
| **TEST12** | Unlimited quota project (`maxFoto: 99999`) -> accepted | REAL HANDLER TEST | ✅ **PASS** |
| **TEST13** | Active Add-On PRO creates paid project -> accepted | REAL HANDLER TEST | ✅ **PASS** |
| **TEST14** | Non-PRO and expired PRO create paid project -> denied | REAL HANDLER TEST | ✅ **PASS** |
| **TEST15** | Client selection & download contract verification -> verified | REAL HANDLER TEST | ✅ **PASS** |
| **TEST16** | Zero live database or payment mutations -> verified | STATIC CHECK | ✅ **PASS** |

---

## 6. Regression Testing Across Existing Suites

1. `test/phase56r-upsell-edge-cases.test.js`: **18 Passed | 0 Failed**
2. `test/phase56r-upsell-hardening.test.js`: **16 Passed | 0 Failed**
3. `test/phase56r-micro-text.test.js`: **10 Passed | 0 Failed**
4. `test/phase56r-mobile-header.test.js`: **20 Passed | 0 Failed | 4 Not Run (Browser DevTools)**
5. `test/phase56r-zip-filename.test.js`: **15 Passed | 0 Failed**
6. `test/phase56r-zip-session-failure.test.js`: **25 Passed | 0 Failed**
7. `test/phase56r-auth-final.test.js`: **20 Passed | 0 Failed**
8. `app.html` Script Tag Invariant: **Strictly 12** (`(Select-String -Path 'app.html' -Pattern '<script').Count = 12`)

---

## 7. Remaining Production Blockers

- **None.** All baseline requirements, edge cases, and micro-hardening scenarios are resolved and verified.

---

## 8. Final Status

**READY FOR OPERATOR RECHECK**

*Safety protocols strictly enforced: No Git CLI commands executed, no deployment triggered, zero Supabase production mutations.*
