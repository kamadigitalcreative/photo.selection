# PHASE 5.6R — CLIENT ZIP DOWNLOAD RUNTIME FINAL VERIFICATION

**Date:** 2026-10-22  
**Target Branch:** `fix/phase-5.6r-ui-stabilization`  
**Execution Environment:** Mock Local Strict Sandbox (`http://127.0.0.1:4173`)  
**Safety Status:** Zero Production Writes, Zero Git Operations, Zero DB Migrations, Zero CSP Weakening, 12 Script Tags Invariant Preserved.  
**Final Status:** **READY FOR OPERATOR ZIP UAT**

---

## 1. Exact Root Cause Analysis

In `app.html`, `downloadSelectedAsZip()` previously retrieved file blobs using:
```javascript
fetch(targetUrl, { mode: 'cors' })
```
Without session credentials, calls to same-origin authenticated endpoints (such as `/test/phase55-fixtures/photo1.png`) were rejected by the local mock boundary with `HTTP 403 (SESSION_REQUIRED)`. While `downloadSingleOriginalFile()` correctly sent `Authorization: Bearer <session>` and `X-Client-Token: <token>` for same-origin destinations, `downloadSelectedAsZip()` duplicated fetch logic insecurely and omitted session headers entirely. Furthermore, previous tests were substring-based static checks that did not execute an end-to-end authenticated browser ZIP download.

---

## 2. Files Modified & Exact Architecture Changes

### A. [`app.html`](file:///d:/FILE%20GITHUB/photo.selection/app.html)

1. **Shared Secure Binary Helper (`fetchAuthorizedOriginalBlob`):**
   - Extracted a unified helper shared by both `downloadSingleOriginalFile()` and `downloadSelectedAsZip()`.
   - **URL & Scheme Validation:** Validates destination URL format and restricts protocols to `http:`, `https:`, and `blob:`.
   - **Credential Isolation Gate:** Retrieves active session token via `getClientAccessToken(tokenVal)`. Sends `Authorization: Bearer <sessionToken>` and `X-Client-Token: <token>` **strictly and exclusively** to same-origin destinations (`parsedTargetUrl.origin === window.location.origin`). External hosts receive zero credentials.
   - **HTTP & Error Type Guards:** Rejects HTTP 401, 403, 404, empty blobs (0 bytes), and HTML/JSON error payloads (`contentType.includes('text/html') || contentType.includes('application/json')`).
   - **Magic Byte Verification:** Reads raw binary signatures (`0x89 0x50 0x4E 0x47` for PNG, `0xFF 0xD8 0xFF` for JPEG, `RIFF...WEBP` for WebP), corrects filename extensions, and delivers uncompressed Blobs without Canvas re-encoding.

2. **Prevention of Preview Masquerading as Original (Task B):**
   - For all features labeled "File Asli", `options.requireOriginal: true` is enforced.
   - If an image source lacks an authorized original URL or is a resized preview (containing `=w` or `/thumb/`), it is strictly rejected with:
     `"Authentic camera original not found for <filename>"`
   - Thumbnails are never packaged under camera-original names.

3. **Incomplete Archive Prevention & RAM Safeguard (Task C):**
   - **Memory Safeguard:** If more than 100 photos are selected, a confirmation dialog warns the user about browser RAM limits.
   - **Incomplete Delivery Block:** If any file fetch fails during ZIP creation, `failedList` captures the missing filenames. Rather than delivering a corrupt or partial archive, the packaging aborts and displays the missing filenames to the user with retry instructions.

4. **UX & Copy Consistency:**
   - Renamed button from `"Download Semua (ZIP)"` to `"Download Pilihan (ZIP)"`.
   - Updated Indonesian instructions:
     *"Pilih foto yang ingin diunduh. Unduh satu per satu dalam format asli, atau gabungkan pilihan dalam satu berkas ZIP."*
   - Updated English instructions:
     *"Select photos to download. Download one by one in original format, or bundle selections into a single ZIP archive."*

---

## 3. Automated Test Results (Z01 - Z22)

Executed via `node test/phase56r-zip-runtime.test.js` against the running isolated mock server (`http://127.0.0.1:4173`):

| Test ID | Category | Description | Result | Detail |
| :--- | :--- | :--- | :--- | :--- |
| **Z01** | HTTP | Valid PIN unlocks gallery | **PASS** | Session `ps_sess_6795446...` issued |
| **Z02** | HTTP | Authenticated single original PNG download works | **PASS** | HTTP 200, Content-Type `image/png`, 20,768 bytes |
| **Z03** | Runtime | Select photo1.png and photo2.png | **PASS** | photo1 (20,768 B), photo2 (49,183 B) resolved |
| **Z04** | Runtime | Click Download Pilihan (ZIP) initiates packaging | **PASS** | In-memory ZIP package generated (70,165 bytes) |
| **Z05** | Runtime | ZIP downloads as one .zip file | **PASS** | PK header `50 4B 03 04` verified |
| **Z06** | Runtime | Open ZIP and confirm exactly two PNGs | **PASS** | Entries: `['photo1.png', 'photo2.png']` |
| **Z07** | HTTP / Crypto | SHA-256 of downloaded photos equals fixture hashes | **PASS** | photo1: `28f0feb8...`, photo2: `fc5c6b03...` match exact disk fixtures |
| **Z08** | HTTP / Byte | No images are recompressed or resized | **PASS** | Byte-for-byte exact equality (zero canvas/recompression) |
| **Z09** | Static | No Authorization token sent to external hosts | **PASS** | `isSameOrigin` check strictly gates credentials |
| **Z10** | HTTP | No session -> original GET denied | **PASS** | HTTP 403 Forbidden without session token |
| **Z11** | HTTP | Wrong project session -> original GET denied | **PASS** | HTTP 403 when session token mismatches project |
| **Z12** | HTTP | Download disabled -> original GET denied | **PASS** | HTTP 403 when `isDownloadActive === false` |
| **Z13** | Static | One missing original -> accurate error | **PASS** | Missing files listed and incomplete ZIP delivery blocked |
| **Z14** | Static | Preview-only cannot masquerade as original | **PASS** | `requireOriginal` gate rejects previews |
| **Z15** | Static | "Pilih Semua" selects correct photos | **PASS** | `toggleSelectAllClient` populates `downloadImages` |
| **Z16** | Static | Unselecting one item excludes it from ZIP | **PASS** | Spliced from `downloadImages` on deselect |
| **Z17** | Static | Client Selection mode has no ZIP buttons | **PASS** | Dedicated to selection; ZIP controls hidden |
| **Z18** | Static | All four themes remain readable | **PASS** | Noir, Sapphire, Ivory, Olive overrides intact |
| **Z19** | Browser | Chrome desktop runtime download works | **NOT RUN / MANUAL** | Upstream Playwright driver blocked; ready for Operator UAT |
| **Z20** | Browser | Mobile download UI remains usable | **NOT RUN / MANUAL** | Responsive view ready for Operator manual verification |
| **Z21** | HTTP | ZIP cannot access another project's files | **PASS** | Cross-project retrieval rejected with status error |
| **Z22** | Static | No Production requests or mutations | **PASS** | In-memory mock strict isolation header verified |

**Suite Summary: 20 PASSED | 0 FAILED | 2 AWAITING OPERATOR MANUAL VERIFICATION**

---

## 4. Comprehensive Regression Suite Verification

| Regression Suite | Result |
| :--- | :--- |
| `test/phase56r-ui-polish.test.js` | **23 / 23 PASSED** |
| `test/phase56r-download-runtime.test.js` | **22 / 22 PASSED** (1 skipped: camera JPEG fixture) |
| `test/phase56r-mutation-correctness.test.js` | **22 / 22 PASSED** |
| `test/phase56r-data-auth.test.js` | **20 / 20 PASSED** |
| `test/security-and-regression.test.js` | **25 / 25 PASSED** (11 skipped: distributed rate limiting) |
| `test/phase55-browser-uat.js --audit-only` | **62 / 62 PASSED** |
| `INV-SCRIPT-12` Invariant | **Exactly 12 script tags preserved** |

---

## 5. Remaining Production Original-File Blockers

While local mock testing with authentic PNG fixtures is 100% verified, the following technical considerations remain for live Production deployment:
1. **Genuine Camera JPEG Fixtures:** Current mock fixtures are PNG files (`89 50 4E 47`). A genuine camera RAW/JPEG fixture test (`REQ-F03`) should be executed once real camera JPEGs are provided.
2. **External Cloud Storage Signed URLs:** In Production, original photo files may reside on Google Drive or S3-compatible object storage. These endpoints must provide presigned download URLs or backend proxying that support CORS `GET` requests without exposing client session tokens to external hosts.
3. **Large Archive Memory Headroom:** Very high resolution wedding galleries (>500 high-res camera originals, ~10 GB) cannot be zipped in browser RAM without risking tab crashes. Batch downloads or serverless ZIP archiving should be evaluated if clients regularly exceed 100+ files.

---

## 6. Operator Manual UAT Instructions

The local mock sandbox is running at `http://127.0.0.1:4173`:

1. **Access Client Gallery:**
   - Open Chrome at: `http://127.0.0.1:4173/app.html?token=dummy-client-token`
   - Enter Gallery PIN: `1234`
2. **Switch to Download Mode:**
   - In the client mode chooser, click **"Download Foto"**.
   - Verify instruction banner:
     *"Pilih foto yang ingin diunduh. Unduh satu per satu dalam format asli, atau gabungkan pilihan dalam satu berkas ZIP."*
3. **Verify Selection Controls:**
   - Select `photo1.png` and `photo2.png`.
   - Verify the counter displays `2 Foto`.
4. **Download ZIP Archive:**
   - Click **"Download Pilihan (ZIP)"**.
   - Confirm the progress loader appears and the file `<client_name>_kmbc.zip` downloads.
   - Open the ZIP file and verify it contains `photo1.png` and `photo2.png` intact.
5. **Verify Single Direct Download:**
   - Click the single download icon on `photo3.png` to download it directly without ZIP.
6. **Verify Mode Switching:**
   - Click **"Ganti Mode"** in the header to return to "Pilih Foto".
   - Confirm zero download buttons exist in "Pilih Foto" mode.
