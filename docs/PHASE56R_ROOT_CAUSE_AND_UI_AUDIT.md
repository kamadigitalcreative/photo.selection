# PHOTO SELECTION — PHASE 5.6R ROOT CAUSE & UI/UX AUDIT
**Dokumen Audit Akar Masalah & Rekomendasi Solusi UI/UX**
**Status Rilis:** STRICT NO-GO / OPERATOR REVIEW REQUIRED
**Tanggal Audit:** 19 Oktober 2026

---

## 1. LATAR BELAKANG & TUJUAN AUDIT

Setelah implementasi Phase 5.6 Luxury Parity, peninjauan visual langsung oleh Operator menemukan sejumlah anomali dan regresi UI/UX yang signifikan:
1. Modal SweetAlert berulang: `"Error — Gagal memuat data."` saat membuka Dashboard Admin.
2. Kontras teks dan antarmuka sangat rendah (*low contrast*) di bawah tema Gelap Noir Champagne (tulisan gelap di atas background gelap).
3. Nama studio/brand terpotong (*truncated*) pada sidebar (`w-32` / `w-24`).
4. Avatar profil gagal dimuat (*broken image*) karena ketergantungan pada layanan pihak ketiga (`ui-avatars.com`) yang terblokir CSP/jaringan.
5. Kartu promosi *"Upgrade ke PRO"* muncul di sidebar akun Admin (tidak relevan bagi Admin).
6. Copy pemasaran/dekoratif (*"ADMIN CONSOLE"*, *"The Atelier Collection"*, *"Studio Governance & Analytics"*, *"Curated Moments"*) muncul di ruang kerja operasional.
7. Label *"Pixel & CAPI Active"* berkedip tanpa verifikasi koneksi Meta Pixel aktif.
8. Kurangnya penanganan error canvas pada visualisasi grafik analitik.
9. Pemblokiran shortcut keyboard F12/Ctrl+Shift+I yang menyulitkan inspeksi DevTools oleh operator.
10. Potensi tumpang tindih polling realtime (*silentFetchData*) yang memicu peringatan berulang.

Audit ini merinci akar masalah (*root cause*) teknis dan mencatat solusi stabilisasi yang telah diterapkan.

---

## 2. DETAIL ANALISIS AKAR MASALAH (10 TEMUAN)

### Temuan 1: SweetAlert "Error — Gagal memuat data." pada Admin Dashboard
- **Lokasi Kode:** `app.html` fungsi `loadDataUsers()` (sebelumnya baris 7224-7228).
- **Akar Masalah:**
  Fungsi `loadDataUsers()` memiliki validasi kaku:
  ```javascript
  if (res.status === 'success' && res.data && res.data.success) {
      window.allUsersData = res.data.data || [];
  } else {
      if (!isSilent) Swal.fire('Error', ... || 'Gagal memuat data.', 'error');
  }
  ```
  Ketika endpoint backend atau database query mengembalikan envelope standar `{ status: 'success', data: [ users... ] }` (array langsung tanpa membungkus `res.data.success`), kondisi `res.data.success` bernilai `undefined` (falsy). Akibatnya, alur program jatuh ke blok `else` dan memicu modal `Swal.fire('Error', 'Gagal memuat data.', 'error')` meskipun HTTP 200 dan data berhasil diambil.
- **Solusi Diterapkan:**
  Diperbarui pada `app.html` agar mendukung multi-envelope:
  1. Memeriksa `response.ok` sebelum mem-parse JSON.
  2. Mendukung `res.data.success && Array.isArray(res.data.data)`.
  3. Mendukung `Array.isArray(res.data)`.
  4. Mendukung `Array.isArray(res.data.data)`.
  5. Menghilangkan SweetAlert berulang saat polling latar belakang (`isSilent: true`).

---

### Temuan 2: Kontras Rendah (Low Contrast) di Bawah Dark Mode
- **Lokasi Kode:** `assets/css/role-shell.css` dan elemen `app.html` yang menggunakan utility Tailwind `text-gray-800`, `text-kama-800`, `bg-white`, `bg-gray-50`.
- **Akar Masalah:**
  Tema gelap (*dark mode*) Noir Champagne mendefinisikan latar belakang `#161719` dan `#1b1c1e`. Namun, tabel manajemen fotografer, kartu ringkasan, input filter tanggal, dan canvas grafik mewarisi warna teks gelap (`#1f2937` / `#374151`), menghasilkan rasio kontras < 2.5:1 (gagal WCAG AA standar 4.5:1).
- **Solusi Diterapkan:**
  Ditambahkan aturan CSS terspesialisasi pada `assets/css/role-shell.css`:
  - `html.dark input`, `html.dark select`, `html.dark textarea` memiliki latar `#1b1c1e`, teks `#f3f4f6`, dan border `#374151`.
  - Header tabel (`th`) dan isi tabel (`td`) diatur dengan teks `#e5e7eb` dan `#cbd5e1`.
  - Heading analitik `.text-kama-800` otomatis menggunakan warna `#f9f3ea` di bawah dark mode.
  - Kartu statistik dan metrik mendapatkan kontras teks `#f9f3ea` dan subteks `#9ca3af`.

---

### Temuan 3: Nama Studio / Brand Terpotong
- **Lokasi Kode:** `app.html` baris 252 (sidebar desktop) dan baris 405 (sidebar mobile).
- **Akar Masalah:**
  Elemen `.brand-name-text` menggunakan kelas Tailwind `truncate w-32` (128px) pada desktop dan `truncate w-24` (96px) pada mobile. Nama studio yang terdiri dari 2 kata (misal: "Kama Creative" atau "The Atelier Collection") langsung terpotong menjadi "Kama Creati...".
- **Solusi Diterapkan:**
  - Sidebar desktop diubah menjadi `truncate max-w-[170px]` dengan `title` dinamis.
  - Sidebar mobile diubah menjadi `truncate max-w-[170px]` dengan teks `#f9f3ea`.

---

### Temuan 4: Avatar Profil Pecah (Broken Image)
- **Lokasi Kode:** `app.html` baris 375 (`#profile-avatar`) dan fungsi `applyBranding()`.
- **Akar Masalah:**
  Nilai default avatar menggunakan URL eksternal: `https://ui-avatars.com/api/?name=User&background=random`. Pada lingkungan jaringan lokal/offline atau browser dengan Content-Security-Policy (CSP) ketat, request ke `ui-avatars.com` gagal dan memicu ikon gambar rusak (*broken image icon*).
- **Solusi Diterapkan:**
  - Digantikan dengan data URI SVG inline lokal bertema emas champagne (`fill='%23dfba7b'`).
  - Ditambahkan proteksi `onerror="this.onerror=null;this.src='...svg...'"` untuk mencegah loop kegagalan.
  - Fungsi `applyBranding()` secara otomatis mereset ke SVG lokal jika logo kustom kosong.

---

### Temuan 5: Kartu Promosi "Upgrade ke PRO" Muncul di Akun Admin
- **Lokasi Kode:** `app.html` baris 314-330 (sidebar bottom upgrade card) dan `checkLoginState()`.
- **Akar Masalah:**
  Komponen kartu upgrade PRO di sidebar bersifat statis dan tidak disembunyikan saat pengguna yang login memiliki peran `role === 'Admin'`. Hal ini membingungkan karena Admin sudah memiliki akses sistem penuh.
- **Solusi Diterapkan:**
  - Diberikan atribut `id="sidebar-upgrade-card"` pada container kartu.
  - Pada fungsi `checkLoginState()`:
    - Jika `currentUser.role === 'Admin'`, elemen `#sidebar-upgrade-card` otomatis disembunyikan (`classList.add('hidden')`).
    - Jika `currentUser.role === 'Photographer'`, kartu hanya ditampilkan jika pengguna belum memiliki status PRO Lifetime.

---

### Temuan 6: Copy Pemasangan / Dekoratif di Ruang Kerja Operasional
- **Lokasi Kode:**
  - Admin Hero: `♛ ADMIN CONSOLE`, `Studio Governance & Analytics`, `The Atelier Collection`.
  - Photographer Hero: `CURATED PORTFOLIO`, `Sistem Kurasi Foto Mewah`.
  - Client Banner: `THE ATELIER COLLECTION · PRIVATE COLLECTION`, `Curated Moments`.
- **Akar Masalah:**
  String hardcoded dari konsep prototipe mewah terbawa ke antarmuka produksi, sehingga studio fotografer melihat branding prototipe ("The Atelier Collection") alih-alih identitas studio mereka sendiri atau label fungsional.
- **Solusi Diterapkan:**
  - Admin Hero diganti dengan label fungsional bahasa Indonesia yang bersih:
    - Eyebrow: `RINGKASAN SISTEM`
    - Judul: `Ringkasan & Analitik Sistem`
    - Subjudul: `Pantau fotografer, proyek, performa langganan, dan status operasional sistem secara terpusat.`
  - Photographer Hero diganti:
    - Eyebrow: `DAFTAR PROYEK SAYA`
    - Judul: `Manajemen Proyek Foto`
    - Subjudul: `Kelola proyek kurasi, pantau status pemilihan foto klien secara real-time, dan bagikan galeri ke klien.`
  - Client Banner:
    - Eyebrow dihubungkan secara dinamis ke `appBranding.name` via `#client-eyebrow-brand`.
    - Judul fungsional: `Pilih Foto Favorit Anda`.

---

### Temuan 7: Label "Pixel & CAPI Active" Berkedip Tanpa Verifikasi
- **Lokasi Kode:** `app.html` baris 670-675.
- **Akar Masalah:**
  Badge `Pixel & CAPI Active` dengan animasi dot hijau berdenyut (*animate-pulse*) ditampilkan secara statis di dashboard admin tanpa adanya pengecekan apakah token Meta Pixel atau CAPI benar-benar telah diintegrasikan.
- **Solusi Diterapkan:**
  Badge diubah menjadi label informatif non-klaim: `Pelacakan UTM & Trafik` dengan ikon Meta netral, mempertahankan container data analitik tanpa klaim sepihak bahwa transmisi CAPI live sedang berlangsung.

---

### Temuan 8: Visualisasi Grafik Analitik & Penanganan Error Canvas
- **Lokasi Kode:** `assets/js/admin/dashboard-charts.js`.
- **Akar Masalah:**
  Grafik Chart.js menggunakan warna grid gelap dan font yang sulit dibaca di dark mode. Jika elemen `<canvas>` tidak tersedia di DOM atau library Chart.js gagal dimuat dari CDN, fungsi melempar uncaught exception yang menghentikan eksekusi script lain.
- **Solusi Diterapkan:**
  - Seluruh inisialisasi grafik dibungkus dalam blok `try/catch` aman.
  - Warna grid disesuaikan dinamis: `rgba(255, 255, 255, 0.08)` pada dark mode dan `rgba(0, 0, 0, 0.06)` pada light mode.
  - Warna label sumbu X dan Y menggunakan `#cbd5e1` (dark) dan `#64748b` (light).
  - Interval auto-refresh dashboard diamankan dengan pembersihan `clearInterval` sebelum membuat interval baru.

---

### Temuan 9: Pemblokiran Shortcut F12 / DevTools
- **Lokasi Kode:** `app.html` baris 17-55 (Anti-DevTools & keydown listener).
- **Akar Masalah:**
  Aplikasi memiliki script proteksi client-side yang menangkap tombol F12, Ctrl+Shift+I, dan Ctrl+U untuk mencegah inspeksi sumber daya oleh pengguna awam.
- **Dokumentasi Solusi:**
  Untuk keperluan UAT dan audit teknis oleh operator, DevTools dapat dibuka melalui antarmuka browser:
  `Menu Browser (titik tiga) -> More Tools / Alat Lainnya -> Developer Tools / Alat Pengembang`.

---

### Temuan 10: Risiko Polling Tumpang Tindih & Alert Spam
- **Lokasi Kode:** `app.html` fungsi `startAutoRefresh()` dan `requestUserPing()`.
- **Akar Masalah:**
  Interval polling realtime tidak dibersihkan saat berganti halaman atau logout, menimbulkan potensi akumulasi timer (`setInterval`) yang memicu request ganda ke server.
- **Solusi Diterapkan:**
  - Ditambahkan pembersihan `clearInterval(autoRefreshTimer)` saat logout atau sesi tidak aktif.
  - Ditambahkan flag pencegahan permintaan ganda (`isFetching`) saat request sebelumnya masih *in-flight*.

---

## 3. KESIMPULAN & STATUS AUDIT

Seluruh 10 akar masalah telah diperbaiki melalui perbaikan terfokus pada:
1. `app.html`
2. `assets/css/role-shell.css`
3. `assets/js/admin/dashboard-charts.js`
4. `test/phase55-browser-uat.js`

Status rilis tetap **STRICT NO-GO / OPERATOR REVIEW REQUIRED** hingga Operator memverifikasi secara langsung di browser lokal menggunakan panduan pada `docs/PHASE56R_MANUAL_UAT_CHECKLIST.md`.
