# PHASE 6 — FAST AUTHENTIC ORIGINAL VIEWER AUDIT & RECOVERY REPORT
## Targeted Bug Fixes & Execution Verification

**Date:** 2026-10-26  
**Operator Branch:** `feat/phase-6-drive-integration`  
**Target Repository:** `photo.selection`  
**Execution Status:** Complete  
**Final Verdict:** **READY FOR PREVIEW UAT**  

---

## 1. Executive Summary & Four Target Bug Fixes

Independent code review discovered four concrete problems in the original viewer implementation following the initial parallel Range download work. All four bugs have been resolved, verified with executable reproduction tests, and audited against existing platform regression suites:

| Bug ID | Title | Root Cause | Implemented Solution | Verification |
|---|---|---|---|---|
| **BUG 1** | **Unscoped Cache Aliases** | `originalBlobCache` stored both `cacheKey` (`${token}:${fileId}`) AND raw `fileId`. Eviction only cleared one key and revoked the Blob URL, leaving dangling aliases and allowing cross-project cache leaks. | Removed all raw `fileId` aliases from readers, writers, and eviction. Implemented canonical `saveToOriginalBlobCache(cacheKey, blob)` with single-entry invariant and active-viewer-safe LRU eviction. | `TEST 1 PASS`<br>`TEST 2 PASS`<br>`INV-3 PASS` |
| **BUG 2** | **Broken Prefetch Deduplication** | `prefetchNeighborOriginal()` registered a `.then()` promise in `inFlightOriginalRequests` without returning `res`. Foreground viewer received `undefined` when attaching to in-flight prefetch, hanging UI on `"Memuat Original..."`. | Made prefetch and foreground share an identical result contract (`return res`). Implemented foreground controller promotion and background rejection suppression. | `TEST 3 PASS` |
| **BUG 3** | **Timeout Does Not Cover Body Transfer** | In `fetchAuthorizedOriginalBlob()`, timeout timers (`timeoutId`, `sliceTimeoutId`) were cleared immediately after `fetch()` returned headers, before `response.blob()` or `sliceRes.blob()`. Stalled streams hung indefinitely. | Extended bounded cancellation timers to cover BOTH header fetch and body streaming for initial request and all parallel chunk workers. | `TEST 4 PASS`<br>`TEST 5 PASS` |
| **BUG 4** | **Image Decode Errors Are Ignored** | `loadViewerAuthenticOriginal()` caught `img.decode()` with `catch (_) { }` and unconditionally displayed `"Original 100%"`, masking corrupt originals. | Added `decodeSuccessful` boolean gate. If `img.decode()` rejects, viewer truthfully displays `"Mode Preview"` without claiming original is ready. | `TEST 6 PASS`<br>`TEST 7 PASS` |

---

## 2. Exact Files & Functions Modified

### `app.html`

1. **`saveToOriginalBlobCache(cacheKey, blobOrUrl)` (lines 11876–11908)**:
   - Enforces ONE canonical project-scoped cache key per original (`${projectToken}:${fileId}`).
   - Removes all raw `fileId` aliases.
   - Enforces bounded memory (`MAX_ORIGINAL_CACHE = 8`).
   - Implements active-viewer-safe eviction: if the oldest entry is currently open in the viewer, skips to the next oldest entry so the active image is never revoked while being viewed.
   - Invokes `URL.revokeObjectURL(oldUrl)` and removes the evicted key completely, ensuring zero dangling aliases.

2. **`prefetchNeighborOriginal(neighborIndex)` (lines 11910–11956)**:
   - Returns `res` from `.then()` handler, ensuring downstream consumers receive the complete `{ blob, filename, size, type }` contract.
   - Saves to `originalBlobCache` using canonical `saveToOriginalBlobCache(nKey, actualBlob)`.
   - Registers a suppression catch handler (`pPromise.catch(() => {})`) so background cancellations never trigger unhandled promise rejections.
   - Stores `{ promise, controller, isPrefetch: true }` in `inFlightOriginalRequests`.

3. **`loadViewerAuthenticOriginal(item, reqId)` (lines 11958–12168)**:
   - Reads cache strictly via canonical `cacheKey = getOriginalCacheKey(item, projectToken)`. Removed all `.has(fileId)` and `.get(fileId)` checks.
   - When attaching to in-flight prefetch:
     - Promotes prefetch controller to foreground: `window.__viewerOriginalController = inFlightTask.controller`.
     - Clears `window.__viewerPrefetchController`.
     - Aborts any previous foreground download from an old photo.
   - On download completion, executes `await img.decode()` with truthful verification.
   - If image decode succeeds: displays `"Original 100% (X.X MB)"` with green checkmark.
   - If image decode fails: displays `"Mode Preview"` without claiming original is ready.

4. **`openImageViewer` (lines 12204–12240) & `navigateViewer` (lines 12310–12345)**:
   - Removed un-scoped `targetItem.id` and `nextImg.id` lookups.
   - Now checks strictly canonical `origKey` / `nextOrigKey`.

5. **`fetchAuthorizedOriginalBlob(url, filename, options)` (lines 16159–16530)**:
   - Initial Request: `timeoutId` covers both `fetch(fetchUrl)` AND `await response.blob()`. If body streaming stalls, `controller.abort()` fires with `isTimeout: true`.
   - Chunk Workers (`downloadChunkWorker`): `sliceTimeoutId` covers both `fetch()` AND `await sliceRes.blob()`.
   - Guaranteed timer cleanup in `finally` blocks.
   - Preserves exact HTTP Range headers (`Range: bytes=0-4194303`), HTTP 206 validations (`INVALID_CONTENT_RANGE`, `CHUNK_TRUNCATED`), and conservative concurrency 2.

### `test/phase6-fast-original-viewer.test.js`

- Created an end-to-end benchmark and test suite that extracts and executes actual production functions directly from `app.html` within a sandboxed Node.js VM/DOM environment.
- Implements executable reproductions and automated assertions for TEST 1 through TEST 10.

---

## 3. Before / After Executable Bug Reproductions

### Bug 1: Unscoped Cache Aliases

- **Before:**
  ```javascript
  // OLD CODE IN app.html
  originalBlobCache.set(cacheKey, bUrl);
  originalBlobCache.set(fileId, bUrl); // ALIAS CREATED
  ...
  // On eviction:
  originalBlobCache.delete(oldestKey); // Only deletes cacheKey, leaving fileId pointing to revoked bUrl!
  ```
  *Reproduction:* Opening photo `F1` in `project_alpha` cached `bUrl`. Switching to `project_beta` and reading `originalBlobCache.get('F1')` returned `project_alpha`'s Blob URL (cross-project leak). If evicted, `fileId` pointed to revoked memory, causing broken black images.
- **After:**
  ```javascript
  // NEW CODE IN app.html
  function saveToOriginalBlobCache(cacheKey, blobOrUrl) {
      ...
      originalBlobCache.set(cacheKey, bUrl); // STRICTLY ONE KEY
  }
  ```
  *Result:* Verified by `TEST 1` and `TEST 2`. Raw `fileId` lookups return `false` / `undefined`. Cache eviction deletes the entire entry and revokes the URL with zero dangling aliases.

### Bug 2: Broken Prefetch Deduplication

- **Before:**
  ```javascript
  // OLD CODE IN prefetchNeighborOriginal
  var pPromise = fetchAuthorizedOriginalBlob(...).then(function (res) {
      var actualBlob = (res && res.blob) ? res.blob : res;
      originalBlobCache.set(nKey, bUrl);
      // MISSING: return res;
  });
  ```
  *Reproduction:* Foreground viewer attached to `inFlightOriginalRequests.get(cacheKey)`. The promise resolved to `undefined`. `if (actualBlob)` check evaluated to `false`, leaving the status badge stuck on `"Memuat Original..."` forever.
- **After:**
  ```javascript
  // NEW CODE IN prefetchNeighborOriginal
  var pPromise = fetchAuthorizedOriginalBlob(...).then(function (res) {
      var actualBlob = (res && res.blob) ? res.blob : res;
      if (actualBlob && actualBlob.size > 0) {
          saveToOriginalBlobCache(nKey, actualBlob);
      }
      return res; // CONTRACT PRESERVED
  });
  ```
  *Result:* Verified by `TEST 3`. Opening a photo during prefetch receives the completed authentic original, displays `"Original 100% (X.X MB)"`, and triggers zero duplicate network downloads.

### Bug 3: Timeout Does Not Cover Body Transfer

- **Before:**
  ```javascript
  // OLD CODE IN fetchAuthorizedOriginalBlob
  try {
      response = await fetch(fetchUrl, fetchOpts);
  } finally {
      if (timeoutId) clearTimeout(timeoutId); // TIMEOUT CLEARED BEFORE BODY!
  }
  ...
  var firstChunk = await response.blob(); // UNPROTECTED HANG
  ```
  *Reproduction:* If upstream headers returned HTTP 206 but body transmission stalled (common on mobile cellular edge or throttled Google Drive links), `response.blob()` or `sliceRes.blob()` hung indefinitely.
- **After:**
  ```javascript
  // NEW CODE IN fetchAuthorizedOriginalBlob
  var firstChunk;
  try {
      firstChunk = await response.blob();
  } catch (bErr) {
      if (bErr.name === 'AbortError') {
          var toErr = new Error("Waktu permintaan habis saat mengunduh berkas foto asli.");
          toErr.isTimeout = true;
          throw toErr;
      }
      throw bErr;
  } finally {
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
  }
  ```
  *Result:* Verified by `TEST 4` and `TEST 5`. Stalled body transfers trigger AbortController timeout cancellation after `timeoutMs` (15s default).

### Bug 4: Image Decode Errors Masked

- **Before:**
  ```javascript
  // OLD CODE IN loadViewerAuthenticOriginal
  if (typeof img.decode === 'function') {
      try { await img.decode(); } catch (_) { } // SILENT SWALLOW
  }
  statusEl.innerHTML = '<span>Original 100%</span>'; // WRONGLY DISPLAYED
  ```
  *Reproduction:* A truncated or corrupted image triggered a decode failure inside `img.decode()`. The error was swallowed and the UI falsely claimed `"Original 100%"`.
- **After:**
  ```javascript
  // NEW CODE IN loadViewerAuthenticOriginal
  var decodeSuccessful = false;
  if (typeof img.decode === 'function') {
      try {
          await img.decode();
          decodeSuccessful = true;
      } catch (_) {
          decodeSuccessful = false;
      }
  } else {
      decodeSuccessful = true;
  }
  if (decodeSuccessful) {
      statusEl.innerHTML = '<span>Original 100% (' + sizeStr + ')</span>';
  } else {
      statusEl.innerHTML = '<span>Mode Preview</span>';
  }
  ```
  *Result:* Verified by `TEST 6` and `TEST 7`. Failed decodes fall back truthfully to `"Mode Preview"`. Valid decodes display `"Original 100%"`.

---

## 4. Actual Test Results (TEST 1 to TEST 10)

Executing `node test/phase6-fast-original-viewer.test.js` under controlled VM environment:

```text
================================================================
PHASE 6 — FAST AUTHENTIC ORIGINAL VIEWER BENCHMARK & AUDIT
================================================================

--- 1. End-to-End Bottleneck Measurements (Sequential vs Parallel) ---
📊 [MEASURED BENCHMARK] 1MB (1048576 bytes):
   - Range Requests: 1
   - Sequential Duration: 47.7ms
   - Parallel (2x) Duration: 34.2ms
   - Measured Speedup: 1.39x faster
📊 [MEASURED BENCHMARK] 6MB (6291456 bytes):
   - Range Requests: 2
   - Sequential Duration: 91.3ms
   - Parallel (2x) Duration: 83.4ms
   - Measured Speedup: 1.10x faster
📊 [MEASURED BENCHMARK] 18MB (18874368 bytes):
   - Range Requests: 5
   - Sequential Duration: 201.8ms
   - Parallel (2x) Duration: 104.8ms
   - Measured Speedup: 1.92x faster
📊 [MEASURED BENCHMARK] 32MB (33554432 bytes):
   - Range Requests: 8
   - Sequential Duration: 289.6ms
   - Parallel (2x) Duration: 194.6ms
   - Measured Speedup: 1.49x faster

--- 2. Required Actual Execution Tests (TEST 1 - TEST 10) ---
✅ [CONTROLLED VM PASS] TEST 1: Same Google file ID from two different projects never shares cached originals
✅ [CONTROLLED VM PASS] TEST 2: Cache eviction removes entire valid entry and never leaves revoked URL aliases
✅ [CONTROLLED VM PASS] TEST 3: Open photo while prefetch in progress displays original without second download
✅ [CONTROLLED VM PASS] TEST 4: Body transfer stalls after headers; timeout cancels request
✅ [CONTROLLED VM PASS] TEST 5: Cancel viewer during parallel Range transfer terminates all active requests
✅ [CONTROLLED VM PASS] TEST 6: Image decode fails: truthful Mode Preview fallback (Original 100% NOT displayed)
✅ [CONTROLLED VM PASS] TEST 7: Valid JPEG decodes successfully and displays Original 100%
✅ [AUTOMATED PASS] TEST 8: Exact SHA-256 assembly verified across 1MB, 6MB, 18MB, and 32MB fixtures
✅ [CONTROLLED VM PASS] TEST 9: Reopening verified cached original produces zero repeat network requests
✅ [AUTOMATED PASS] TEST 10: Fast gallery performance invariants preserved (CDN previews, bounded queue)

--- 3. Strict Safety & Platform Invariants ---
✅ [AUTOMATED PASS] INV-1: Cross-project original requests strictly rejected with 403
✅ [AUTOMATED PASS] INV-2: Strictly zero Git CLI commands across codebase
✅ [AUTOMATED PASS] INV-3: Single canonical cache key format used everywhere (pTok + ":" + fId)

================================================================
TOTAL TESTS  : 13
PASSED       : 13
FAILED       : 0
================================================================
```

### Full Regression Test Summary

| Test Suite File | Tests Passed | Status |
|---|---|---|
| `test/phase6-fast-original-viewer.test.js` | **13 / 13** | **PASSED** |
| `test/phase6-theme-loading-performance.test.js` | **38 / 38** | **PASSED** |
| `test/phase6-original-tracking.test.js` | **43 / 43** | **PASSED** |
| `test/phase6-legacy-fast-gallery.test.js` | **15 / 15** | **PASSED** |
| `test/phase6-emergency-photo-loading.test.js` | **14 / 14** | **PASSED** |
| `test/phase6-public-drive.test.js` | **20 / 20** | **PASSED** |
| `test/phase6-drive-performance.test.js` | **20 / 20** | **PASSED** |

---

## 5. Remaining Google Drive & Vercel Limitations

1. **Google Drive Public Rate Limits (HTTP 429 / 503):**
   Rapid automated downloads of dozens of camera originals over public Drive links can encounter Google IP rate limiting. The client implements 400ms exponential backoff retry.
2. **Files Exceeding 100MB:**
   Public Google Drive links present an HTML virus scan prompt for files larger than ~100MB. The backend bridge detects this safely and returns `PUBLIC_DOWNLOAD_LIMITATION`.
3. **Vercel Serverless Function Payload Bounds (4.5MB):**
   Vercel serverless functions strictly fail closed if a single HTTP response exceeds 4.5MB. Chunk sizes are bounded at 4 MiB (4,194,304 bytes), preserving 100% compliance.
4. **Browser Memory Boundedness:**
   In-memory authentic originals are bounded to `MAX_ORIGINAL_CACHE = 8` entries. Evictions explicitly revoke Blob URLs to safeguard against mobile Safari/Chrome OOM tab termination.

---

## 6. Manual Preview UAT Verification Steps

1. **Open Vercel Preview Gallery:** Navigate to the client gallery URL (e.g. `https://<preview-domain>/app?c=<token>`).
2. **Open Fullscreen Photo:**
   - Observe immediate display of cached high-res preview (0ms lag).
   - Observe status badge `"Memuat Original... X%"` incrementing dynamically.
   - Observe final transition to `"Original 100% (X.X MB)"` with emerald badge.
3. **Inspect Focus Sharpness:** Double-click or pinch-to-zoom to verify authentic camera sensor sharpness.
4. **Fast Navigation Test:**
   - Rapidly press `ArrowRight` through 4–5 photos.
   - Verify network requests for previous photos abort promptly via `AbortController` without network choking.
5. **Prefetch Verification:**
   - Remain on Photo #1 until `"Original 100%"` completes.
   - Press `ArrowRight` to Photo #2.
   - Observe Photo #2 loads authentic original faster or immediately due to background prefetch.
6. **Cross-Project Isolation Verification:**
   - Open Photo `F1` in Gallery A.
   - Open a separate tab with Gallery B (containing same file ID).
   - Verify Gallery B does NOT use Gallery A's cached Blob URL and requires independent authorization.

---

## Final Status

# **READY FOR PREVIEW UAT**
