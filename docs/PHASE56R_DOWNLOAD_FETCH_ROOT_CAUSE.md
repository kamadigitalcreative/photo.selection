# Phase 5.6R — Root Cause Analysis: "Failed to fetch" on Client Photo Download

**Project:** Photo Selection / KMBC  
**Evaluation Phase:** Phase 5.6R — Download Runtime Failure & Client UI Correction  
**Investigation Date:** October 2026  
**Final Status:** READY FOR OPERATOR VISUAL RECHECK (Production Originals Gated)  

---

## 1. Executive Summary

During operator UAT of Phase 5.6R, triggering the download of single or multiple original photos in the Client Gallery resulted in an immediate failure modal:
```text
Gagal Mengunduh
Failed to fetch
```
All five UAT test cases failed at this barrier.

This document records the exact technical diagnosis, root causes, URL schemes, CSP directive interactions, and the implemented solution that eliminates network errors without weakening security boundaries.

---

## 2. Root Cause Breakdown

### A. The Exact URL Scheme Involved
In the mock test environment, photo fixtures rendered in the client gallery using in-memory base64 data URIs:
```text
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAA...
```
The browser's `<img>` tag rendered these images without issue because the Content-Security-Policy (CSP) `img-src` directive explicitly included:
```text
img-src 'self' data: blob: https://*.googleusercontent.com ...
```

### B. The Fetch Incompatibility & CSP Violation
When the client clicked the download button, the download routine executed:
```javascript
const response = await fetch(url);
const blob = await response.blob();
```
In modern Chromium and web engines, executing a JavaScript `fetch()` against a `data:` URL is classified as a network connect request governed by `connect-src`, NOT `img-src`.

The application's CSP header (defined in `test/phase55-browser-uat.js` and `vercel.json`) strictly restricts network connections:
```text
connect-src 'self' http://127.0.0.1:4173 http://localhost:4173 https://*.supabase.co ...
```
Because `data:` is intentionally **NOT** listed under `connect-src` (to prevent data exfiltration and inline protocol attacks), Chromium's network engine immediately blocked the `fetch(data:...)` call with:
```text
TypeError: Failed to fetch
Refused to connect to 'data:image/png;base64,...' because it violates the following Content Security Policy directive: "connect-src 'self' ..."
```

### C. Conflation of Preview URL and Original Download Source
The gallery mock data used the same `url` property for both visual preview rendering and original binary download. In photography workflows, a preview representation (often scaled, compressed, or embedded data URI) must never be conflated with the authoritative raw/original binary.

---

## 3. Why Weakening CSP Was Strictly Rejected

Per strict safety guidelines, the following "quick fixes" were considered and **expressly rejected**:
1. ❌ **Adding `data:` to `connect-src`**: Weakens CSP defense-in-depth against malicious script payloads attempting to establish local exfiltration channels.
2. ❌ **Opening an unrestricted HTTP proxy**: Introduces Server-Side Request Forgery (SSRF) risk.
3. ❌ **Setting `fetch(..., { mode: 'no-cors' })`**: Yields an opaque response that prevents reading byte blobs and fails silently.

---

## 4. The Architectural Solution

A two-tiered correction was implemented:

### 1. Dual-Path Mock Architecture: Preview vs. Original Fixtures
The mock data structure in [test/phase55-browser-uat.js](file:///d:/FILE%20GITHUB/photo.selection/test/phase55-browser-uat.js) was restructured to explicitly separate preview from original download targets:
- `previewUrl`: `data:image/png;base64,...` (or thumbnail URL) served strictly to `<img src="...">` for UI display and lightbox rendering.
- `originalUrl` / `originalDownloadUrl`: `/test/phase55-fixtures/photo{1..5}.png` served over standard same-origin HTTP (`http://127.0.0.1:4173/...`) with authentic PNG headers and binary content.

### 2. Zero-Network `dataUrlToBlob` Decoder Fallback
In [app.html](file:///d:/FILE%20GITHUB/photo.selection/app.html), when an image source is a `data:` URI (e.g. local offline fallback or preview), the application no longer calls `fetch()`. Instead, it uses a pure in-memory JavaScript binary parser:
```javascript
function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const binaryStr = atob(parts[1]);
    const len = binaryStr.length;
    const u8arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        u8arr[i] = binaryStr.charCodeAt(i);
    }
    return new Blob([u8arr], { type: mime });
}
```
Because this occurs completely in-memory via TypedArray parsing, no network request is issued, zero CSP directives are violated, and no browser console error occurs.

### 3. Same-Origin HTTP Retrieval with Authentic Verification
When `originalUrl` is an HTTP/HTTPS URL:
- Fetch is performed with standard CORS credentials and client token headers (`X-Client-Token`).
- Response status is verified (`response.ok`).
- Magic byte detection validates authentic file headers (PNG: `0x89 0x50 0x4E 0x47`, JPEG: `0xFF 0xD8 0xFF`, WebP: `RIFF`).
- HTML or JSON error payloads returned under HTTP 200/404 are detected and rejected.
- Direct file download is triggered via temporary object URL and revoked immediately after trigger.

---

## 5. Verification Matrix

| Check | Scenario | Previous Behavior | Phase 5.6R Corrected Behavior | Status |
|---|---|---|---|---|
| **V1** | Direct click on photo download icon | Modal: "Failed to fetch" | Real PNG bytes downloaded (`photo1.png`) | ✅ PASSED |
| **V2** | Batch download selected photos | Modal: "Failed to fetch" | Sequential individual download initiated | ✅ PASSED |
| **V3** | CSP Violations in Console | `connect-src` violation logged | 0 CSP violations logged | ✅ PASSED |
| **V4** | Magic Bytes Inspection | Unchecked | Verified `89 50 4E 47` before download | ✅ PASSED |
| **V5** | Data URL Fallback | Network fetch failure | Pure in-memory blob decode | ✅ PASSED |

---

## 6. Summary

The "Failed to fetch" runtime defect was completely resolved by aligning the mock architecture with real-world original-file retrieval patterns, eliminating unnecessary network calls for data URIs, and enforcing strict same-origin byte transfer for disk fixtures.
