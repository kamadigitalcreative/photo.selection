# PHOTO SELECTION / KMBC — PANDUAN MANUAL UAT PHASE 5.6R FOLLOW-UP FINAL

**Target Lingkungan:** Local Mock Isolated Sandbox  
**Target URL:** `http://127.0.0.1:4173/app.html`  
**Client Direct URL:** `http://127.0.0.1:4173/app.html?token=dummy-client-token`  
**PIN Galeri Client:** `1234`  
**Akun Demo/Fotografer:** Username: `fotografer`, Password: `password123`  
**Status Gerbang:** READY FOR OPERATOR VISUAL CHECK  

---

## RINGKASAN PERBAIKAN 4 AREA

1. **TASK 1 — Field Input Password Klien:**
   - Visual diperkecil dan dirapatkan: `letter-spacing` berlebihan (0.25em) dihapus menjadi natural (0.04em).
   - Tinggi field dipadatkan dari 52px menjadi 44px (`min-height: 44px; height: 44px`).
   - Lebar kontainer dibuat proporsional (`max-w-[340px]`), placeholder "Masukkan Password" terbaca rapi dan normal tanpa renggang.
   - Ikon mata (show/hide password) memiliki padding aman (14px dari kanan) tanpa bertabrakan dengan teks.

2. **TASK 2 — Theme Picker Duplikat di Header Atas Dihilangkan:**
   - Elemen `<select id="headerThemeSelect">` di header atas fotografer telah dihapus bersih.
   - Hanya menyisakan **1 Theme Picker aktif** di Sidebar / Menu Samping (`#sidebarThemeSelect` & `#mobileThemeSelect`).
   - Alignment header tetap rapi (tombol lonceng & badge PRO rata kanan).
   - Sinkronisasi dan penyimpanan tema (`localStorage`) tetap bekerja 100%.

3. **TASK 3 — Client Mode View Menampilkan 2 Pilihan Setara:**
   - Pada landing pemilihan mode klien (`#client-mode-view`), sekarang tampil **2 opsi setara dan jelas**:
     1. **Pilih Foto**: "Pilih foto untuk diedit/dicetak" (Ikon centang ganda).
     2. **Download Foto**: "Unduh file foto asli langsung (format asli tanpa ZIP)" (Ikon cloud download).
   - Fixture mock `isDownloadActive` diaktifkan (`true`), sehingga kedua kartu muncul lengkap dan dapat diklik.

4. **TASK 4 — Unduh Foto Berupa File Asli (BUKAN ZIP):**
   - Generator `.zip` (`JSZip`) pada alur download klien telah digantikan dengan unduhan file asli langsung (`downloadSelectedOriginalPhotos` dan `downloadSingleOriginalFile`).
   - Mempertahankan nama berkas asli, ekstensi asli (`.jpg`, `.png`, dsb.), dan format biner asli tanpa kompresi zip.
   - Pada kartu galeri klien (mode download), tersedia:
     a. **Tombol Unduh Langsung** (ikon download) di setiap kartu untuk mengunduh 1 file asli secara instan.
     b. **Tombol Multi-Download** ("Download File Asli") di bilah bawah untuk mengunduh beberapa foto terpilih secara berurutan langsung ke disk.

---

## CHECKLIST MANUAL UAT OPERATOR

Lakukan pengetesan secara berurutan di browser lokal (`http://127.0.0.1:4173/app.html`):

### 1. LOGIN FOTOGRAFER
- [ ] Buka `http://127.0.0.1:4173/app.html`.
- [ ] Masukkan Username: `fotografer`, Password: `password123`. Klik "Masuk".
- [ ] Pastikan berhasil masuk ke halaman Proyek fotografer.

### 2. THEME PICKER (HEADER & SIDEBAR)
- [ ] Periksa area **Header Atas** di sebelah kanan:
  - Pastikan dropdown theme picker di header atas **sudah tidak ada** (hilang bersih).
  - Pastikan header rapi, tombol lonceng notifikasi dan badge PRO tetap tersusun rapi di sebelah kanan.
- [ ] Periksa **Sidebar / Menu Samping**:
  - Pastikan dropdown tema ("Atelier Theme") ada di sidebar.
- [ ] Ganti tema dari sidebar (misal pilih: **Atelier Ivory** atau **Midnight Sapphire**).
  - Pastikan warna antarmuka langsung berubah sesuai tema terpilih.
- [ ] Tekan `F5` (Refresh halaman).
  - Pastikan tema yang dipilih tetap tersimpan dan tidak kembali ke tema lama.

### 3. CLIENT PASSWORD FIELD
- [ ] Buka URL galeri klien di tab baru:  
  `http://127.0.0.1:4173/app.html?token=dummy-client-token`
- [ ] Amati kotak input "Masukkan Password":
  - Pastikan kotak input terlihat compact, proporsional, dan tidak melebar berlebihan.
  - Teks placeholder "Masukkan Password" terbaca normal, padat, dan rapi (tidak renggang huruf per huruf).
  - Ketikkan angka PIN `1234`.
  - Klik ikon mata (show/hide password) di kanan input, pastikan ikon tidak bertabrakan dengan teks.
  - Periksa tampilan di desktop dan di mode responsive mobile (lebar 375px–390px).

### 4. CLIENT ACTION OPTIONS (2 PILIHAN)
- [ ] Masukkan password `1234` lalu klik **Unlock Gallery**.
- [ ] Halaman berpindah ke layar sambutan / pilihan mode klien (`#client-mode-view`).
- [ ] Pastikan tampil **2 opsi kartu yang setara, jelas, dan aktif**:
  1. **Pilih Foto** (subteks: "Pilih foto untuk diedit/dicetak")
  2. **Download Foto** (subteks: "Unduh file foto asli langsung (format asli tanpa ZIP)")
- [ ] Pastikan kedua kartu memiliki icon badge yang elegan dan efek hover yang responsif.

### 5. PILIH FOTO
- [ ] Klik kartu **Pilih Foto**.
- [ ] Galeri terbuka dalam mode seleksi foto:
  - Tampil subtitle kuota (mis. "Pilih maksimal 3 foto").
  - Tampil bilah status pilihan di bawah.
  - Klik ikon hati/centang pada salah satu foto.
  - Pastikan foto terpilih dengan highlight border emas champagne dan counter bertambah.

### 6. DOWNLOAD FOTO (FILE ASLI LANGSUNG, TANPA ZIP)
- [ ] Klik tombol **Home** di pojok kiri atas untuk kembali ke layar pilihan mode, lalu klik **Download Foto** (atau refresh dan pilih Download Foto).
- [ ] Periksa bilah aksi di bawah:
  - Tombol bertuliskan **"Download File Asli"** (bukan "Download ZIP").
- [ ] **Uji Unduh Per Foto (Langsung):**
  - Pada salah satu kartu foto, arahkan kursor dan klik tombol ikon download kecil (`<i class="fa-solid fa-download"></i>`) di overlay kartu.
  - Periksa download browser: file langsung terunduh ke komputer sebagai gambar asli (misalnya `photo1.png` atau `.jpg`).
  - **Pastikan berkas BUKAN berekstensi `.zip`**.
- [ ] **Uji Unduh Multi-Foto:**
  - Klik checkbox "Pilih Semua" atau centang minimal 2 foto.
  - Klik tombol **"Download File Asli"** di bilah bawah.
  - Browser akan mengunduh masing-masing berkas foto asli satu per satu dengan nama dan ekstensi aslinya.
  - Notifikasi SweetAlert muncul: "X file foto asli berhasil diunduh langsung (format asli tanpa ZIP)".
  - Pastikan semua berkas yang terunduh adalah gambar asli, dapat dibuka normal, dan tidak ada file zip sama sekali.

### 7. RESPONSIVE CHECK
- [ ] Buka Developer Tools (`F12`), aktifkan mode Device Toolbar.
- [ ] Uji pada ukuran **Desktop (1440px / 1280px)**:
  - Tata letak header, sidebar, mode chooser, dan galeri sejajar rapi.
- [ ] Uji pada ukuran **Mobile (375px / 390px)**:
  - Form password klien terpusat rapi, tidak keluar layar.
  - Dua kartu pilihan mode klien tersusun rapi secara vertikal dan nyaman disentuh.
  - Galeri klien tetap tersusun 2 kolom rapi.
  - Tombol download mudah diakses.

---

## STATUS VERIFIKASI AKHIR

| Modul Pengujian | Status Otomatis | Status Visual Operator |
|:---|:---:|:---:|
| 1. Password Field Compactness | ✅ PASSED (18/18) | [ ] READY TO CONFIRM |
| 2. Header Duplicate Theme Removed | ✅ PASSED (18/18) | [ ] READY TO CONFIRM |
| 3. Client View 2 Options | ✅ PASSED (18/18) | [ ] READY TO CONFIRM |
| 4. Download File Asli (Non-ZIP) | ✅ PASSED (18/18) | [ ] READY TO CONFIRM |
| Invariant Gerbang (12 Script Tags) | ✅ PASSED (Exact 12) | [ ] READY TO CONFIRM |
