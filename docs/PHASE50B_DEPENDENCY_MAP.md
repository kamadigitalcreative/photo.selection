# PHOTO SELECTION — PHASE 5.0B
## COMPLETE FRONTEND DEPENDENCY MAP & SYMBOL AUDIT
**Dokumen:** `docs/PHASE50B_DEPENDENCY_MAP.md`  
**Target:** Monolit `app.html` & `index.html`  
**Status:** Audit & Pemetaan Lengkap (Read-Only Preparation)  
**Baseline Produksi:** Phase 4.7.5 (Commit: `34570d5`)

---

## 1. Ringkasan Arsitektur Script Monolit `app.html`

Monolit `app.html` memiliki **18.508 baris kode** dengan total 12 tag `<script>` (6 script eksternal via CDN dan 6 script inline). Susunan dan urutan eksekusi script ini sangat menentukan ketersediaan simbol di memori browser.

### Inventarisasi Script & Urutan Muat:

| No | Lokasi Baris | Jenis | Library / Fungsi Utama | Lingkup Scope | Dependensi |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **S-1** | Baris 9 | Eksternal | Tailwind CSS v3 Play CDN (`https://cdn.tailwindcss.com`) | Global `window.tailwind` | Memproses class utilitas DOM saat runtime |
| **S-2** | Baris 10 | Eksternal | SweetAlert2 v11 (`sweetalert2@11`) | Global `window.Swal` | Modal dialog, toast konfirmasi & notifikasi |
| **S-3** | Baris 11 | Eksternal | JSZip v3.10.1 (`jszip.min.js`) | Global `window.JSZip` | Kompresi file ZIP klien & Sortir RAW lokal |
| **S-4** | Baris 12 | Eksternal | FileSaver.js v2.0.5 (`FileSaver.min.js`) | Global `window.saveAs` | Download file ZIP ke disk pengguna |
| **S-5** | Baris 14 | Eksternal | Lottie Bodymovin v5.12.2 (`lottie.min.js`) | Global `window.lottie` | Animasi loading vector Meta AI di layar pembuka |
| **S-6** | Baris 15 | Eksternal | Chart.js (`chart.js`) | Global `window.Chart` | Grafik analitik trafik & status fotografer Admin |
| **S-7** | Baris 18–66 | Inline 1 | Anti-Inspect & UX Deterrents | Event Listener DOM | Mencegah Context Menu & Tombol Inspect Element |
| **S-8** | Baris 68–82 | Inline 2 | Konfigurasi Tema Tailwind (`tailwind.config`) | Objek Global `tailwind` | Menambahkan palet warna kustom `kama: {50..900}` |
| **S-9** | Baris 3.648–4.279 | Inline 3 | Collage UI Modal Controls & Format Sizing | Global Scope | Manipulasi DOM rasio kanvas kolase, custom size, unit mm/cm |
| **S-10** | Baris 5.228–14.534 | Inline 4 | **Core Application Engine (9.306 Baris)** | Global Scope | Auth, Proyek, Galeri Klien, Translator, Sortir RAW, Quota |
| **S-11** | Baris 14.535–14.831 | Inline 5 | Admin Analytics & Dashboard Logic (296 Baris) | Global Scope | Chart.js instance, filter data grafik hari ini/bulan ini |
| **S-12** | Baris 14.834–18.505 | Inline 6 | **Collage PRO Engine V4 (3.671 Baris)** | Global Scope | Canvas 4K, Smart Auto Layout, Layer Transformer, Teks |

---

## 2. Verifikasi Kritis: Duplikasi Fungsi (`isDemoAccount` & `showDemoSubscribeAlert`)

Pemeriksaan mendalam terhadap baris kode riil menemukan fakta-fakta teknis berikut:

### A. Fungsi `isDemoAccount()`
- **Definisi 1:** [`app.html` Baris 6.182–6.188](file:///d:/FILE%20GITHUB/photo.selection/app.html#L6182-L6188)
  ```javascript
  function isDemoAccount() {
      if (!currentUser || currentUser.role === 'Admin') return false;
      if (currentUser.role === 'Demo') return true;
      if (!currentUser.paket || currentUser.paket === '-' || currentUser.paket === '') return true;
      var p = String(currentUser.paket).toUpperCase();
      return p.includes('DEMO') || p.includes('FREE PLAN');
  }
  ```
- **Definisi 2:** [`app.html` Baris 6.355–6.358](file:///d:/FILE%20GITHUB/photo.selection/app.html#L6355-L6358)
  ```javascript
  function isDemoAccount() {
      // Memastikan deteksi akun demo lebih akurat
      return currentUser && (currentUser.username.toLowerCase() === 'demo' || currentUser.role === 'Demo' || currentUser.status === 'DEMO');
  }
  ```
- **Analisis Scope & Hoisting:** 
  Kedua fungsi berada di dalam script block yang sama (Inline Script 4). Karena deklarasi fungsi JavaScript di-hoist ke tingkat scope script, **Definisi 2 menimpa (*overwrites*) Definisi 1 secara absolut**.
- **Konsekuensi Perilaku:**
  - Definisi 1 memeriksa paket (`currentUser.paket.includes('DEMO')` atau `FREE PLAN`).
  - Definisi 2 HANYA memeriksa `username === 'demo'`, `role === 'Demo'`, atau `status === 'DEMO'`.
  - Jika pengguna memiliki akun dengan `Role: 'Photographer'` namun `Paket: 'Demo'`, Definisi 2 akan mengembalikan `FALSE` (dianggap akun berbayar!). 
  - Backend [`api/supabase.js` baris 1870](file:///d:/FILE%20GITHUB/photo.selection/api/supabase.js#L1870) secara konsisten memberikan `Role: 'Demo'` saat registrasi paket Demo/Free, sehingga akun registrasi baru tetap terdeteksi sebagai Demo. Namun akun lama yang memiliki variasi paket tidak terlindungi secara konsisten.

### B. Fungsi `showDemoSubscribeAlert()`
- **Definisi 1:** [`app.html` Baris 6.190–6.219](file:///d:/FILE%20GITHUB/photo.selection/app.html#L6190-L6219)
  - Dilengkapi logika dwibahasa (`isEn`) untuk judul, teks, dan tombol.
  - Menggunakan link Mayar statis tanpa parameter pengguna.
- **Definisi 2:** [`app.html` Baris 6.360–6.392](file:///d:/FILE%20GITHUB/photo.selection/app.html#L6360-L6392)
  - Teks bahasa Indonesia di-hardcode (kehilangan dukungan multi-bahasa).
  - Menggunakan `getMayarUrlWithUser()` untuk menyisipkan nama, email, nomor HP, dan username ke URL checkout Mayar.
- **Konsekuensi Perilaku:**
  - Definisi 2 menimpa Definisi 1. Akibatnya, popup demo selalu berbahasa Indonesia sekalipun bahasa aplikasi diubah ke Inggris (`en`).
  - Menghapus Definisi 2 akan mengembalikan fitur multi-bahasa tetapi merusak fitur checkout terpersonalisasi Mayar. Solusi yang benar pada refaktoring nanti adalah menggabungkan keduanya (*merge*), bukan menghapus sembarangan.

---

## 3. Verifikasi Independensi Modul: Collage PRO Engine & Sortir Lokal

Audit Phase 5.0A mengindikasikan bahwa Collage PRO dan Sortir Lokal berpotensi diekstrak sebagai modul mandiri. Pemeriksaan kode riil membuktikan bahwa **keduanya TIDAK sepenuhnya independen** dan memiliki keterikatan erat dengan simbol global:

### A. Keterikatan Collage PRO Engine (Baris 14.834–18.505)
Collage PRO Engine mengakses dan bergantung pada simbol-simbol di luar dirinya:
1. **`currentUser`:** Mengakses `currentUser.username` ([baris 15.295](file:///d:/FILE%20GITHUB/photo.selection/app.html#L15295)) untuk membaca cache proyek fotografer dari `localStorage` (`ps_cache_projects_<username>`).
2. **`syncCollageCanvasFormatUI`:** Fungsi ini didefinisikan di **Script Block 3 (Baris 3.660)** dan memanipulasi tombol-tombol navigasi di luar area kanvas (`btn_tpl_story`, `btn_tpl_feed`, dll.).
3. **`syncCollageTemplateUI`:** Didefinisikan di Script Block 3 ([baris 3.686](file:///d:/FILE%20GITHUB/photo.selection/app.html#L3686)).
4. **`remapCollageTextPositions` & `syncCollageTextStylePanel`:** Didefinisikan di Script Block 3 ([baris 3.904](file:///d:/FILE%20GITHUB/photo.selection/app.html#L3904)).
5. **Akses Hak PRO & Status Langganan:** Navigasi tab kolase (`switchAdminTab('collage')` di [baris 7.620](file:///d:/FILE%20GITHUB/photo.selection/app.html#L7620)) memanggil `isAccountExpired()`, `isPremiumAddon()`, `showExpiredAlert()`, dan `showPremiumAlert()`.
6. **Library Eksternal:** Bergantung langsung pada objek `JSZip` untuk export batch kolase ([baris 18.194](file:///d:/FILE%20GITHUB/photo.selection/app.html#L18194)).

> **Kesimpulan Arsitektur:** Collage PRO tidak dapat dipotong begitu saja menjadi berkas terisolasi tanpa menyediakan jembatan konteks (*context bridge*) atau memastikan pemisahan mencakup fungsi kontrol modal di baris 3.648–4.279.

### B. Keterikatan Sortir Lokal RAW (Baris 10.400–11.040)
Sortir Lokal adalah alur kerja fotografer untuk memproses file RAW di laptop secara instan:
1. **Variabel State Global:** Menggunakan variabel state `loadedLocalFiles`, `isProcessingSorter`, `isCancelledSorter`.
2. **Keterikatan DOM:** Berinteraksi langsung dengan elemen ID monolit: `#sourceDirectory`, `#targetNames`, `#resStatusBadge`, `#progressArea`, `#btnSingleZip`, `#btnDirectCopy`.
3. **Navigasi & Sesi:** Menggunakan `openSortirLokal()`, `closeSortirLokal()`, serta bergantung pada `currentUser` dan routing `switchAdminTab('sortir-lokal')`.
4. **Browser File API:** Menggunakan `window.showSaveFilePicker` (Chromium File System Access API) dengan fallback ke `JSZip` + `saveAs`.

---

## 4. Peta Simbol Global & State Mutation Points

### A. Variabel Global Utama di `window` Scope:
- `currentUser` ([baris 6.018](file:///d:/FILE%20GITHUB/photo.selection/app.html#L6018)): Objek sesi fotografer/admin yang aktif (berisi `username`, `role`, `status`, `paket`, `expiredAt`, `isPremiumAddon`, `bankName`, dll.).
- `clientState` ([baris 5.937](file:///d:/FILE%20GITHUB/photo.selection/app.html#L5937)): Objek galeri klien (`token`, `namaClient`, `nomorWA`, `maxFoto`, `selectedImages`, `notes`, dll.).
- `collageState` ([baris 14.839](file:///d:/FILE%20GITHUB/photo.selection/app.html#L14839)): Objek kanvas kolase (`layers`, `texts`, `canvasW`, `canvasH`, `smartAutoPhotos`, dll.).
- `appBranding` ([baris 6.017](file:///d:/FILE%20GITHUB/photo.selection/app.html#L6017)): Pengaturan branding aplikasi (`name`, `logo`).
- `clientRouteIdentifier` ([baris 5.936](file:///d:/FILE%20GITHUB/photo.selection/app.html#L5936)): Menyimpan token atau slug galeri dari URL.
- `API_ENDPOINT` / `baseAppUrl` ([baris 5.935](file:///d:/FILE%20GITHUB/photo.selection/app.html#L5935)): URL dasar API backend `/api/supabase`.

### B. Titik Mutasi State Kritis (*State Mutation Points*):
1. **Login Selesai (`handleLoginSuccess`):** Menulis ke `localStorage.setItem('ps_user', ...)` dan memutasi `currentUser`.
2. **Logout (`logoutUser`):** Membersihkan `currentUser = null`, menghapus `ps_user`, dan mereset view ke `auth-view`.
3. **Seleksi Foto Klien (`toggleSelectImage`):** Memutasi array `clientState.selectedImages`, menulis cache `ps_client_selected_<token>`, dan memicu ping heartbeat ke backend (`updateClientStatus`).
4. **Peralihan Tab Admin (`switchAdminTab`):** Mengubah class Tailwind `hidden` / `flex` pada kontainer section (`#section-projects`, `#section-dashboard`, dll.) dan memperbarui `window.history.pushState`.
5. **Ganti Bahasa (`changeLanguage`):** Menulis `localStorage.setItem('ps_lang', lang)` dan memanggil `applyLanguage(lang)` yang melakukan mutasi teks DOM secara masif.

---

## 5. Bahaya Refaktoring ES Modules (Peringatan Keras)

Aplikasi saat ini menggunakan **Vanilla JavaScript Tradisional** dengan atribut event handler HTML inline, contohnya:
- `<button onclick="openModalCreate()">`
- `<button onclick="switchAdminTab('projects')">`
- `<input onchange="toggleSelectAllClient()">`
- `<button onclick="applyCustomSize()">`

### Peringatan Teknis Arsitek:
> Jika berkas JavaScript dipisahkan menggunakan `<script type="module" src="...">`, **SEMUA fungsi di dalam modul tersebut berada di Module Scope, BUKAN di Window Scope**.  
> Akibatnya: Setiap atribut `onclick="..."` di HTML akan mengalami **`Uncaught ReferenceError: [function] is not defined`** dan seluruh tombol aplikasi akan mati seketika!

### Strategi Ekstraksi Aman:
1. **Pertahankan Pemuatan Script Biasa (Tanpa `type="module"`):** Menjaga fungsi tetap berada di global namespace selama fase transisi.
2. **Atau Daftarkan Simbol ke Objek `window` Secara Eksplisit:** 
   ```javascript
   // Contoh pola jembatan aman:
   window.openModalCreate = openModalCreate;
   window.switchAdminTab = switchAdminTab;
   ```
3. Jangan pernah mengubah pemuatan script monolit menjadi modul tanpa rencana jembatan global yang terverifikasi.
