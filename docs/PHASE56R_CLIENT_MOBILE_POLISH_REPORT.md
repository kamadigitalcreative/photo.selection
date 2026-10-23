# PHASE 5.6R — CLIENT MOBILE RESPONSIVE & DOWNLOAD MODE UX POLISH REPORT

**Project:** KMBC Photo Selection  
**Branch:** Active local working branch (zero Git CLI, zero checkout, zero deployment)  
**Date:** October 2026  
**Status:** **READY FOR OPERATOR VISUAL RECHECK** *(Local Mock Sandbox Only)*  

---

## 1. Masalah yang Diperbaiki

Berdasarkan hasil Operator UAT pada perangkat mobile / HP, ditemukan beberapa ketidaknyamanan visual dan kebingungan pengguna awam:

1. **Responsiveness & Tipografi HP (Issue A):**
   - Area atas (header & banner) dan area bawah (sticky action bar) terasa terlalu padat di layar ponsel (375px - 414px).
   - Ukuran heading terlalu besar memakan layar, sementara tombol WA dan navigasi terasa terdesak.
   - Tombol "Kirim WA" dan action bar bawah di HP sempat terlalu tinggi sehingga menutupi foto-foto di grid galeri.
2. **Ringkasan Foto Terpilih yang Terlalu Penuh (Issue B):**
   - Mode "Pilih Foto" sebelumnya menampilkan chip/tag berisi nama setiap berkas (`photo1.png`, `photo2.png`, dst.).
   - Hal ini membuat layar HP sesak dan berantakan, padahal nama berkas sudah jelas terlihat pada kartu foto dan di modal Preview.
3. **Tumpang Tindih Kartu Foto (Issue C):**
   - Pada kartu foto dalam kondisi terkunci atau terpilih, nama file dan tombol aksi saling menimpa / bertumpukan karena adanya manipulasi `position: absolute; bottom-3; right-3` pada status terkunci.
4. **Mode "Download Foto" vs "Pilih Foto" Masih Membingungkan (Issue D):**
   - Saat berpindah ke mode "Download Foto", kartu foto masih menampilkan status "Terkunci" jika klien sudah menyelesaikan sesi seleksi sebelumnya.
   - Istilah-istilah tombol terasa rancu bagi klien non-teknis.
   - Status watermark belum ditampilkan secara visual yang mudah dipahami.

---

## 2. File yang Diubah

1. [app.html](file:///d:/FILE%20GITHUB/photo.selection/app.html):
   - **Pemisahan Baris Kartu Foto:** Menata `.info-overlay` dengan struktur baris tersendiri: `.photo-card-name-row` untuk nama berkas dan `.photo-card-action-row` untuk tombol aksi, mengeliminasi risiko tumpang-tindih teks dan tombol.
   - **Indikator Watermark:** Menambahkan `.watermark-indicator-tag` (mis. *"Preview ber-watermark"*) di kartu foto jika watermark aktif pada galeri klien sesuai konfigurasi fotografer.
   - **Mode Download Tanpa Kunci:** Memastikan fungsi `updateGalleryLock()` langsung return saat berada di mode download, sehingga kartu di mode download bebas dari label "Terkunci" atau status locked yang membingungkan.
   - **Penyederhanaan Ringkasan Foto:** Memperbarui `renderClientSelectionSummaryBar()` sehingga pada mode "Pilih Foto" hanya menampilkan ringkasan bersih yang elegan (misalnya: `Foto Terpilih: 3 / 10 (Sisa 7)` atau `Foto Terpilih: 3 / 3 (Kuota pas)`) tanpa deretan chip nama berkas.
   - **Copywriting Ramah Pengguna Awam:** Mengganti label tombol di mode download menjadi *"Pilih untuk ZIP"* dan *"Unduh"*, serta label bottom counter menjadi *"X foto dipilih untuk ZIP"*.
   - **Responsivitas Tombol Action Bar:** Mengoptimalkan padding, gap, dan fleksibilitas tombol Reset, Preview, Copy, dan Kirim WA di layar HP.
2. [assets/css/client-gallery-luxury.css](file:///d:/FILE%20GITHUB/photo.selection/assets/css/client-gallery-luxury.css):
   - **Struktur Baris Kartu:** Mendefinisikan `.photo-card-name-row`, `.photo-card-action-row`, dan `.watermark-indicator-tag`.
   - **Tipografi & Spacing Mobile (`@media (max-width: 640px)`):**
     - Header: padding kompak `6px 10px`, judul galeri proporsional (14px).
     - Banner Editorial: padding ramping `12px 14px 10px`, heading disesuaikan (17px) agar ruang pandang foto di HP lebih luas.
     - 3-Step Guide: padding dan bulatan angka langkah yang lebih ringkas.
     - Action Bar Dock: tinggi minimal 54px dengan padding aman (`env(safe-area-inset-bottom)`), tombol WA ergonomis dan teks tidak terpotong.
     - Grid Foto: padding `6px`, gap `8px`, tinggi tombol `34px`.
   - **Styling Badge Ringkasan:** Menambahkan `.summary-clean-badge` dan `.summary-quota-badge` (`.quota-full`, `.quota-left`, `.quota-extra`) dengan nuansa luxury champagne.

---

## 3. Alasan Desain UI/UX

1. **Hierarchy & Visual Breathing Room:**  
   Pengguna ponsel membutuhkan akses visual yang cepat ke foto. Mengurangi padding vertikal banner dan header sebesar ~40% di ponsel memberikan ruang lega bagi 2 kolom grid foto.
2. **Zero Text Clutter on Selection Summary:**  
   Nama berkas foto kamera seringkali panjang (`DSCF0912.JPG`, `IMG_20261022_WA0012.png`). Menampilkan deretan nama berkas dalam bentuk tag membuat layar ponsel terdorong ke bawah. Menggantinya dengan status kuota bersih (`Foto Terpilih: 3 / 10`) menjaga tampilan tetap mewah, rapi, dan langsung to-the-point.
3. **No Overlapping Elements:**  
   Dengan memisahkan area teks nama berkas dan area tombol ke dalam flex-row vertikal yang mandiri serta meniadakan pemaksaan `position: absolute`, nama berkas dan tombol aksi tidak akan pernah bertumpuk dalam kondisi status apa pun.
4. **Intuitive Download Intent:**  
   Klien yang membuka galeri unduhan ingin mengunduh berkas tanpa pusing dengan istilah teknis. Tombol "Unduh" langsung mengeksekusi satu foto asli, sedangkan "Pilih untuk ZIP" mengumpulkan beberapa foto ke dalam paket arsip ZIP. Tidak ada lagi status "Terkunci" yang menghalangi klien mengunduh berkas mereka.

---

## 4. Hasil Pengujian Otomatis

Seluruh regression test suite dijalankan secara lokal di isolated sandbox (`http://127.0.0.1:4173`):

| Test Suite | Perintah | Hasil |
| :--- | :--- | :--- |
| **Mock Isolation & SPA Routes** | `node test/phase55-browser-uat.js --audit-only` | **62 / 62 PASS** |
| **Download Authorization Gate** | `node test/phase56r-download-auth.test.js` | **18 / 18 PASS** |
| **Download Runtime & Magic Bytes** | `node test/phase56r-download-runtime.test.js` | **22 / 22 PASS** *(1 NOT RUN: Camera JPEG)* |
| **Client ZIP Runtime Verification** | `node test/phase56r-zip-runtime.test.js` | **20 / 20 PASS** *(2 NOT RUN: Manual Browser)* |
| **UI Polish & Non-blocking Toast** | `node test/phase56r-ui-polish.test.js` | **23 / 23 PASS** |
| **Session Authentication Final** | `node test/phase56r-session-auth.test.js` | **24 / 24 PASS** |
| **Final Auth & Session Recovery** | `node test/phase56r-auth-final.test.js` | **20 / 20 PASS** |
| **Security & System Invariants** | `node test/security-and-regression.test.js` | **25 / 25 PASS** *(11 NOT RUN: Distributed Rate Limit)* |

**Invariants Guard:**
- Script tag count invariant di `app.html` tetap persis **12** (7 eksternal, 5 inline).
- Zero git commands.
- Zero live mutations ke Supabase/Mayar production.

---

## 5. Status Akhir

**READY FOR OPERATOR VISUAL RECHECK**
