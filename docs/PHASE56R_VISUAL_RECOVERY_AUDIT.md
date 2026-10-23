# PHOTO SELECTION / KMBC — PHASE 5.6R VISUAL RECOVERY AUDIT
**Dokumen Audit Mendalam Akar Masalah CSS & UI/UX Unification**
**Status:** STRICT NO-GO / OPERATOR REVIEW REQUIRED
**Target Lingkungan:** Local Isolated Mock (`http://127.0.0.1:4173`)
**Branch Kerja:** `fix/phase-5.6r-ui-stabilization` (Dikelola oleh Operator via GitHub Desktop)
**Prinsip Keamanan:** Zero Git Commands, Zero Production Mutation, Zero RPC/Database Changes

---

## 1. EKSEKUTIF SUMMARY

Hasil pengujian browser manual oleh Operator pada Phase 5.6 dan 5.6R awal menemukan regresi visual mayor:
1. **Warna komponen bertabrakan:** Teks gelap muncul di atas background gelap; teks putih muncul di dalam kotak abu-abu terang.
2. **Keterbacaan buruk:** Header dan baris tabel Kelola Fotografer tidak terbaca karena kontras warna yang tidak harmonis.
3. **Sidebar tidak konsisten:** Ikon menu Sortir Lokal dan Kolase tidak sejajar (ikon Kolase terjepit/terbungkus `<span>` kustom, badge PRO tidak simetris).
4. **Project Grid View berantakan:** Kartu proyek memiliki header mengambang (`-top-10`), tombol berhimpitan, dan informasi metadata tersembunyi.
5. **Project List View perlu dirapikan:** Button toolbar dan progress indicator tidak proporsional.
6. **Pantau Klien tidak harmonis:** Kartu status, ringkasan, dan aktivitas memiliki background yang saling bersilangan antara light dan dark.
7. **Sortir Lokal:** Area dropzone dan textarea memiliki background putih menyilaukan di tengah workspace gelap.
8. **Kolase:** Pengaturan panel kanan padat, tombol format kanvas tidak konsisten, dan alignment kontrol terganggu.
9. **Pengaturan Studio:** Avatar profil pecah (broken image) dan input bercampur antara panel gelap dan form abu-abu.
10. **Client Gallery:** Hero banner terlalu besar, 5 kartu foto sampel tidak menampilkan gambar (seperti kotak hitam kosong).

Audit ini mengidentifikasi 10 akar masalah struktural dan menetapkan perbaikan arsitektural berbasis **Atelier Noir Champagne Design System**.

---

## 2. AUDIT SUMBER GAYA & URUTAN STYLESHEET

### 2.1 Urutan Pemuatan Stylesheet di `app.html`
Pemeriksaan urutan stylesheet pada tag `<head>`:
```html
1. <script src="https://cdn.tailwindcss.com"></script> (Tailwind CDN v3)
2. <link rel="stylesheet" href="assets/css/design-tokens.css">
3. <link rel="stylesheet" href="assets/css/app-core.css">
4. <link rel="stylesheet" href="assets/css/role-shell.css">
5. <link rel="stylesheet" href="assets/css/client-gallery-luxury.css">
6. <link rel="stylesheet" href="assets/css/auth-luxury.css">
```

### 2.2 Analisis Konflik Specificity & `!important` Collisions
1. **Tailwind Utility vs Scoped CSS:**
   - Elemen yang di-generate via JavaScript (`renderProjectsTable`, `renderUsersTable`) menggunakan utility classes Tailwind statis seperti `bg-white`, `bg-gray-50`, `text-gray-800`, `text-gray-500`, `border-gray-200`.
   - Di sisi lain, `role-shell.css` menambahkan aturan global seperti:
     ```css
     #admin-view .text-gray-800 { color: #f9f3ea !important; }
     ```
   - **Dampak Fatal:** Aturan ini mengubah warna teks menjadi putih (`#f9f3ea`), tetapi elemen kontainer induknya masih mempertahankan kelas Tailwind `.bg-gray-50` atau `.bg-slate-50` (abu-abu terang). Hasilnya adalah **teks putih di atas background abu-abu terang**, yang sama sekali tidak terbaca oleh operator.
2. **Inline Style vs Design Tokens:**
   - Beberapa komponen dinamis JS menyuntikkan inline styles (misal: `style="color: #...;"` atau `style="background: ..."`).
   - Karakteristik ini mengalahkan CSS kelas biasa, kecuali ditimpa dengan selektor bertingkat dan deklarasi token CSS yang terarah.
3. **Ketiadaan Scope Khusus antar Role:**
   - Sebelumnya, selektor pada `role-shell.css` bersifat ambigu (`.bg-white { background: #17181b !important; }` tanpa pembatasan container), sehingga mempengaruhi area preview, form auth, dan modal secara tidak terduga.

---

## 3. IDENTIFIKASI 10 AKAR MASALAH UTAMA

| No | Komponen / Area | Gejala di Browser | Akar Masalah Teknis |
|:---|:---|:---|:---|
| 1 | **Tabel Kelola Fotografer** | Baris tabel berlatar abu terang dengan teks putih/krem tak terbaca | Kelas `.bg-gray-50` dan `.bg-slate-50` tidak dioverride ke elevated surface (`#212226`), sementara kelas `text-gray-*` dipaksa menjadi putih oleh override sebelumnya. |
| 2 | **Project Grid View** | Header kartu melayang (`-top-10`), tombol aksi berjejal di samping, card height melar tak beraturan | Template string HTML pada `renderProjectsTable()` menggunakan markup eksperimental yang menumpuk div absolut `-top-10`, flexbox tanpa wrapping, dan penempatan status badge yang menabrak judul. |
| 3 | **Sidebar Kolase & Sortir Lokal** | Ikon Kolase bergeser ke kiri, label tidak sejajar dengan menu lain, badge PRO menabrak teks | Elemen `<a id="tab-collage">` dibungkus dengan wrapper `div class="flex items-center justify-between w-full"`, sedangkan menu lain menggunakan flex langsung dengan `w-5 h-5` SVG. |
| 4 | **Client Gallery Thumbnails** | 5 kartu foto di mock gallery tampak sebagai kotak hitam kosong tanpa konten gambar | Generator fixture mock `generateSolidPng()` membuat gambar PNG solid dengan RGB gelap `(24, 24, 36)` dan `(34, 34, 48)` yang identik dengan background kartu galeri (`#1b1c1e`), sehingga tidak ada kontras visual sama sekali. |
| 5 | **Client Gallery Hero Banner** | Hero banner terlalu masif dan mendominasi layar | CSS `.client-banner-luxury` memiliki padding `28px 36px` dan judul font-size `2.25rem` yang memakan hampir 50% tinggi viewport desktop dan mobile. |
| 6 | **Sortir Lokal Workspace** | Dropzone folder dan textarea daftar file memiliki latar belakang terang yang menyilaukan | Utility Tailwind `bg-gray-50`, `border-gray-300`, dan `focus:bg-white` pada `section-sortir-lokal` belum di-scope ke surface Atelier Noir Champagne. |
| 7 | **Pengaturan Studio** | Panel profil bercampur antara header abu-abu, form putih, dan avatar broken image | Ketergantungan avatar pada `ui-avatars.com` gagal dimuat secara lokal, dan form inputs mewarisi style browser default putih (`bg-white`). |
| 8 | **Pantau Klien Dashboard** | Kartu status klien dan panel aktivitas tidak selaras dengan tema gelap | Filter dan status cards menggunakan latar belakang `bg-slate-50` dan badge berwarna pastel terang yang bertabrakan dengan aksen champagne. |
| 9 | **Kolase Right Sidebar** | Kontrol kanvas, teks, dan background padat serta border kontras tinggi | Form group pada panel kanan kolase tidak memiliki padding terukur dan kontrol warna tidak menggunakan token terpusat. |
| 10 | **Brand Truncation** | Nama studio terpotong menjadi "Kama Creati..." | Utility `truncate w-32` membatasi lebar container teks hingga 128px, mengorbankan keterbacaan nama studio fotografer. |

---

## 4. DESIGN SYSTEM UNIFIKASI: ATELIER NOIR CHAMPAGNE

Semua token visual kini dipusatkan pada `assets/css/design-tokens.css` dengan prinsip keterbacaan WCAG AA (rasio kontras >= 4.5:1 untuk body text dan >= 3:1 untuk large text/UI borders):

```css
:root {
  /* Atelier Noir Champagne — Palette Utama */
  --bg-main: #0e0f10;           /* Background dasar workspace */
  --bg-sidebar: #0a0b0c;        /* Background sidebar navigasi */
  --bg-surface: #17181b;        /* Surface utama (kartu, panel, tabel) */
  --bg-elevated: #212226;       /* Surface elevated (header tabel, modal, input) */
  --border-subtle: #35363b;     /* Border pembatas komponen */
  --border-focus: #dfba7b;      /* Border saat fokus keyboard/hover */
  
  /* Tipografi Berkontras Tinggi */
  --text-primary: #f4f0e9;      /* Teks judul & data penting (kontras > 12:1) */
  --text-secondary: #c9c4bc;    /* Teks deskripsi & label (kontras > 7:1) */
  --text-muted: #a8a39c;        /* Teks helper & metadata (kontras > 4.5:1) */
  
  /* Aksen Mewah Fungsional */
  --accent-champagne: #dfba7b;   /* Aksen emas champagne */
  --accent-highlight: #ffdfab;   /* Highlight hover emas */
  --text-on-gold: #241b11;       /* Teks di atas tombol emas (kontras > 8:1) */
  
  /* State Semantik Fungsional */
  --state-success: #49be88;      /* Sukses / Aktif (kontras > 4.5:1) */
  --state-warning: #eab565;      /* Warning / Pending (kontras > 4.5:1) */
  --state-danger: #ee7979;       /* Danger / Expired / Inactive (kontras > 4.5:1) */
}
```

---

## 5. STRATEGI PERBAIKAN ARCHITECTURAL

1. **Perbaikan DOM Dinamis di `app.html`:**
   - Merombak total template literal `renderProjectsTable()` untuk Grid View menjadi arsitektur 3 bagian:
     - **Header:** Tanggal pembuatan + Status badge berjarak proporsional.
     - **Body:** Ikon folder champagne, Judul proyek dengan truncate cerdas, Info Token/Hash, PIN pill badge, dan Progress bar kuota.
     - **Footer:** Toolbar aksi (View, Edit, Copy Link, Share, Delete) dengan styling terpadu tombol icon 32x32px berlatar `#212226`.
   - Mengubah `renderUsersTable()` agar setiap `<td>` dan badge status memiliki kelas warna kontras tinggi yang tegas (`text-[#f4f0e9]` untuk nama, `text-[#c9c4bc]` untuk email/username).
2. **Penyempurnaan Scoped Rules di `assets/css/role-shell.css`:**
   - Menambahkan override komprehensif untuk `#admin-view` yang menargetkan `.bg-white`, `.bg-gray-50`, `.bg-slate-50`, `.bg-slate-100`, dan `table` agar seragam menggunakan `--bg-surface: #17181b` dan `--bg-elevated: #212226`.
   - Menormalkan Sortir Lokal (`#section-sortir-lokal .dropzone`, `textarea`) ke surface gelap dengan border putus-putus champagne dan teks yang nyaman dibaca.
   - Merapikan right-panel Kolase (`#section-collage`) dengan typography bersih dan spacing konsisten.
3. **Penyelarasan Client Gallery di `assets/css/client-gallery-luxury.css`:**
   - Memadatkan hero banner agar fokus galeri langsung tertuju ke foto klien.
   - Memastikan aturan image rendering eksplisit: `width: 100% !important; height: 100% !important; object-fit: cover !important; opacity: 1 !important; visibility: visible !important;`.
4. **Perbaikan Mock Photographic Fixtures di `test/phase55-browser-uat.js`:**
   - Mengganti generator flat solid PNG dengan generator PNG fotografis berbasis komposisi multi-warna (Sunset Wedding, Fine Art Bridal, Emerald Garden, Coastal Twilight, Champagne Bokeh) berukuran 20KB–77KB.

---

## 6. STATUS KESIAPAN REVIEW OPERATOR

- **Status:** **STRICT NO-GO / OPERATOR REVIEW REQUIRED**
- **Alasan:** Otomasi browser Playwright/Puppeteer berstatus **BLOCKED** akibat ketiadaan binary driver browser lokal pada lingkungan kerja. Penilaian akhir wajib dilakukan oleh Operator secara visual di browser nyata menggunakan checklist UAT terperinci.
