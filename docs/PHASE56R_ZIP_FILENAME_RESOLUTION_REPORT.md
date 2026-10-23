# PHASE 5.6R — TASK B: DYNAMIC CLIENT & PHOTOGRAPHER ZIP FILENAME RESOLUTION

## 1. Overview & Objective
In Phase 5.6R Task B, the client ZIP download filename requirement was upgraded from a static or generic name (`<namaClient>_kmbc.zip`) to a strictly structured, dynamic naming format:

```
<Nama-Klien>-<Nama-Fotografer>.zip
```

### Examples:
- **Client Project:** `Siti & Budi Wedding`
  - **Photographer/Studio:** `kamavisual`
  - **Generated Filename:** `Siti-Budi-kamavisual.zip`
  - **Prohibited Filenames:** `Siti-Budi-Wedding.zip`, `KMBC-Siti-Budi.zip`, `PhotoSelection-Siti-Budi.zip`.

- **Client Project:** `Annisa & Dimas Prewedding`
  - **Photographer/Studio:** `Pro Studio Bali`
  - **Generated Filename:** `Annisa-Dimas-Pro-Studio-Bali.zip`

- **Client Project:** `Reguler Studio Project` (Unrelated event title)
  - **Photographer/Studio:** `Reguler Studio`
  - **Generated Filename:** `Reguler-Studio-Project-Reguler-Studio.zip`

---

## 2. Architecture & Implementation Details

### A. Dynamic Extraction Logic (`generateClientZipFilename`)
Located in [app.html](file:///d:/FILE%20GITHUB/photo.selection/app.html) (lines ~14500-14585):

1. **Client / Couple Name Resolution:**
   - Checks explicit `state.coupleName` first.
   - If not set, inspects `state.namaClient` or `state.title` using regex:
     ```javascript
     /^([A-Za-z0-9\s]+?)\s*(?:&|\band\b|\+|\bx\b)\s*([A-Za-z0-9\s]+?)(?:\s+(?:Wedding|Prewedding|Pre-wedding|Engagement|Akad|Resepsi|Maternity|Graduation|Siraman|Ngunduh\s+Mantu))?$/i
     ```
   - If a couple pattern matches, extracts `Name1-Name2` (e.g. `Siti & Budi Wedding` -> `Siti-Budi`).
   - If title does NOT match a couple pattern (e.g., `Reguler Studio Project`), preserves full title words without arbitrary guessing or truncation (`Reguler-Studio-Project`).
   - Fallback if client name is empty: `Klien`.

2. **Photographer / Studio Name Resolution:**
   - Resolves from verified project ownership metadata:
     ```javascript
     state.studioName || state.ownerStudio || state.brandName || state.photographerName || state.ownerDisplayName || state.ownerName || state.owner
     ```
   - Prioritizes configured studio display name / brand name.
   - If no studio name is present, falls back to owner's display name.
   - Prohibits hardcoding "kamavisual" (dynamically resolved per project).
   - Prohibits using currently logged-in client or other photographer accounts.
   - Fallback if photographer metadata is absent: `studio`.

3. **Sanitization for Windows/macOS Filesystems:**
   - Removes filesystem reserved characters: `[\\/:*?"<>|#%&{}\\$!'@+`=~^;,]`.
   - Replaces spaces and separators with a single hyphen `-`.
   - Collapses consecutive hyphens (`-+` -> `-`) and trims leading/trailing hyphens.
   - Prevents leaking of secrets, customer emails, internal DB IDs, or session IDs.

4. **Integration with `downloadSelectedAsZip`:**
   - [app.html](file:///d:/FILE%20GITHUB/photo.selection/app.html) calls:
     ```javascript
     var zipName = generateClientZipFilename(clientState);
     ```
   - Original photo filenames and bytes inside the ZIP are strictly preserved.
   - No `KMBC` subfolder or folder nesting added inside the ZIP.

---

## 3. Mock Server Metadata Integration
In [test/phase55-browser-uat.js](file:///d:/FILE%20GITHUB/photo.selection/test/phase55-browser-uat.js):
- Studio metadata registered in `mockPhotographerSettings`:
  - `fotografer`: `studioName: 'kamavisual'`
  - `pro_studio`: `studioName: 'Pro Studio Bali'`
- `getProjectForClient` and `verifyClientPassword` endpoints propagate `studioName`, `photographerName`, and `ownerStudio` to the client upon gallery load.

---

## 4. Verification & Test Results

A comprehensive test suite was created in [test/phase56r-zip-filename.test.js](file:///d:/FILE%20GITHUB/photo.selection/test/phase56r-zip-filename.test.js). All 15 tests passed with 0 failures:

| Test ID | Description | Result | Output Filename |
| :--- | :--- | :--- | :--- |
| **FN-01** | Project `Siti & Budi Wedding` with studio `kamavisual` | **PASS** | `Siti-Budi-kamavisual.zip` |
| **FN-02** | Filename excludes `Wedding`, `KMBC`, or `PhotoSelection` | **PASS** | `Siti-Budi-kamavisual.zip` |
| **FN-03** | Project `Annisa & Dimas Prewedding` with studio `Pro Studio Bali` | **PASS** | `Annisa-Dimas-Pro-Studio-Bali.zip` |
| **FN-04** | Non-couple title preserves all words without guessing (`Reguler Studio Project`) | **PASS** | `Reguler-Studio-Project-Reguler-Studio.zip` |
| **FN-05** | Couple variations (`and`, `+`, `x`) normalize cleanly | **PASS** | `Siti-Budi-kamavisual.zip` |
| **FN-06** | Explicit `coupleName` property takes precedence if provided | **PASS** | `Siti-Budi-kamavisual.zip` |
| **FN-07a**| Falls back to `brandName` when `studioName` is omitted | **PASS** | `Siti-Budi-Kama-Photography-Studio.zip` |
| **FN-07b**| Falls back to `photographerName`/owner when studioName is omitted | **PASS** | `Siti-Budi-john-doe.zip` |
| **FN-08** | Safe neutral fallback when all metadata is missing | **PASS** | `Klien-studio.zip` |
| **FN-09** | All illegal characters and punctuation sanitized to hyphens | **PASS** | `Maya-The-Bride-Rian-Groom-Special-Studio-Visual-Pro.zip` |
| **FN-10** | Zero tokens, emails, or session IDs leaked | **PASS** | Verified |
| **FN-11** | Live HTTP mock server project `dummy-client-token` resolves | **PASS** | `Siti-Budi-kamavisual.zip` |
| **FN-12** | Live HTTP mock server project `token-proj-2` resolves dynamically | **PASS** | `Annisa-Dimas-Pro-Studio-Bali.zip` |
| **FN-13** | `app.html` script tag count invariant strictly preserved at 12 | **PASS** | Count: `12` |
| **FN-14** | `downloadSelectedAsZip` invokes `generateClientZipFilename(clientState)` | **PASS** | Verified |

---

## 5. System Invariants & Safety Verification
- **Script Tag Invariant:** Exactly **12** `<script>` tags preserved in `app.html`.
- **Git Safety:** Zero Git CLI commands executed.
- **Production Safety:** Zero production mutations; Supabase and Mayar production APIs never called.
- **Existing Logic:** Direct download, authorization headers, 403 session recovery, and PIN re-auth flow preserved completely intact.
