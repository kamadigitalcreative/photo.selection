# PANDUAN OPERATOR UAT — PHASE 5.6R CLIENT MOBILE & DOWNLOAD MODE UX POLISH

**Tujuan Pengujian:** Memvalidasi perbaikan tampilan HP (mobile responsive), penghapusan chip nama file di ringkasan foto terpilih, eliminasi tumpang-tindih kartu foto, dan kejelasan mode Download Foto tanpa badge "Terkunci".

**Target URL:** `http://127.0.0.1:4173/app.html?token=dummy-client-token`  
**PIN Galeri:** `1234`  
**Browser yang Direkomendasikan:** Google Chrome (Gunakan mode Incognito)

---

## Langkah Pengujian Manual Klik-per-Klik

### Skenario 1: Buka Mode "Pilih Foto" Desktop
1. Buka Chrome Incognito dan akses: `http://127.0.0.1:4173/app.html?token=dummy-client-token`.
2. Masukkan PIN `1234`.
3. Galeri terbuka dengan 5 foto.
4. Klik tombol **Pilih** pada `photo1.png` dan `photo2.png`.
5. **Verifikasi:**
   - [ ] Kartu yang terpilih mendapatkan border champagne keemasan dan tombol berubah menjadi **"Terpilih (Batal)"**.
   - [ ] Tidak ada tombol download atau kontrol ZIP di mode Pilih Foto.

---

### Skenario 2: Buka Mode "Pilih Foto" Mobile (Tampilan HP)
1. Buka Chrome DevTools (`F12` atau `Ctrl + Shift + I`).
2. Aktifkan **Toggle Device Toolbar** (`Ctrl + Shift + M`).
3. Pilih perangkat ponsel: **iPhone SE (375px)** atau **iPhone 12/14 (390px)**.
4. **Verifikasi Tampilan Atas & Tipografi HP:**
   - [ ] Judul proyek/galeri di header tidak menutupi tombol **"Ganti Mode"**.
   - [ ] Tombol **"Ganti Mode"** memiliki kontras jelas dan teks terbaca.
   - [ ] Banner editorial atas terasa lebih ringkas dan lega (tidak menelan separuh layar HP).
   - [ ] Langkah panduan 01, 02, 03 tersaji rapi dan proporsional.

---

### Skenario 3: Verifikasi Ringkasan Foto Terpilih Tanpa Nama File
1. Perhatikan bilah ringkasan foto di atas grid galeri.
2. **Verifikasi:**
   - [ ] Bilah ringkasan menampilkan status bersih: **"Foto Terpilih: 2 / 10"** (atau disertai badge sisa kuota).
   - [ ] **TIDAK ADA** deretan chip/tag nama file (`photo1.png`, `photo2.png`) yang memenuhi layar HP.
   - [ ] Tampilan tetap ringkas dan elegan.

---

### Skenario 4: Verifikasi Kartu Foto Tidak Overlap / Bertumpuk
1. Periksa bagian bawah setiap kartu foto di layar HP.
2. **Verifikasi:**
   - [ ] Nama berkas foto berada di barisnya sendiri di atas tombol.
   - [ ] Tombol **"Pilih"** / **"Terpilih (Batal)"** berada di barisnya sendiri di bawah nama berkas.
   - [ ] Nama file dan tombol sama sekali **TIDAK SALING MENUTUPI / BERTUMPUK**.
   - [ ] Teks nama berkas terpotong dengan elipsis (`...`) jika terlalu panjang sehingga tidak meluap ke luar kartu.

---

### Skenario 5: Verifikasi Action Bar Bawah & Tombol WA di HP
1. Perhatikan bilah bawah (sticky action bar) di tampilan HP.
2. **Verifikasi:**
   - [ ] Tinggi action bar bawah proporsional dan tidak menutupi grid foto secara berlebihan.
   - [ ] Angka counter terpilih (`2 terpilih`) terbaca jelas.
   - [ ] Tombol **"Reset"**, **"Preview"**, dan **"Copy"** memiliki ukuran pas untuk disentuh (touch target >= 38px).
   - [ ] Tombol **"Kirim WA"** tampil rapi, proporsional, dengan icon WhatsApp dan teks hijau yang kontras.

---

### Skenario 6: Ganti ke Mode "Download Foto"
1. Klik tombol **"Ganti Mode"** di header atas.
2. Pilih **"Download Foto"**.
3. Galeri berpindah ke mode download.
4. **Verifikasi:**
   - [ ] Header banner berganti menjadi panduan unduh file asli.
   - [ ] Subtitle kuota ("Pilih maksimal X foto") otomatis disembunyikan.
   - [ ] Bilah ringkasan atas bertuliskan status unduhan ringkas (mis. *"Siap Diunduh: X foto dipilih untuk ZIP"*).

---

### Skenario 7: Verifikasi Kartu di Mode Download — TIDAK ADA Badge "Terkunci"
1. Perhatikan kartu-kartu foto pada mode Download.
2. **Verifikasi:**
   - [ ] **SAMA SEKALI TIDAK ADA** badge atau teks bertuliskan **"Terkunci"** ataupun **"Terpilih (Terkunci)"**.
   - [ ] Setiap kartu foto memiliki tombol unduh langsung yang jelas: icon download + teks **"Unduh"**.
   - [ ] Setiap kartu foto memiliki tombol pemilihan arsip: **"Pilih untuk ZIP"** (atau **"Dipilih untuk ZIP"** jika aktif).
   - [ ] Jika fitur watermark aktif pada proyek, tampil tag label kecil yang elegan: **"Preview ber-watermark"**.
   - [ ] Nama berkas dan tombol di mode download tertata rapi tanpa overlap.

---

### Skenario 8: Verifikasi Download Langsung & Download ZIP Tetap Berfungsi
1. Pada `photo1.png`, klik tombol **"Unduh"** langsung pada kartu foto.
   - [ ] Foto asli langsung terunduh sebagai file PNG utuh tanpa membuka dialog ZIP.
2. Pilih `photo1.png` dan `photo2.png` dengan mengklik **"Pilih untuk ZIP"**.
   - [ ] Counter bawah bertambah menjadi *"2 untuk ZIP"*.
   - [ ] Tombol **"Pilih Semua"** checkbox berfungsi.
3. Klik tombol **"Download Pilihan (ZIP)"** di action bar bawah.
   - [ ] Browser mengunduh satu berkas ZIP yang valid berisi kedua foto tersebut.
4. Ekstrak ZIP dan pastikan kedua foto dapat dibuka dengan sempurna.

---

## Lembar Ceklis Hasil UAT Operator

| No | Kriteria Pengujian | Hasil yang Diharapkan | Status (PASS / FAIL) |
| :--- | :--- | :--- | :--- |
| 1 | Ringkasan foto terpilih di HP | Tampil bersih (`Foto Terpilih: X/Y`) tanpa chip nama file | [ ] |
| 2 | Kartu foto bebas overlap | Nama berkas dan tombol aksi berada di baris terpisah | [ ] |
| 3 | Tampilan mobile ergonomis | Banner & header ringkas, tombol WA rapi di 375px | [ ] |
| 4 | Mode Download bebas "Terkunci" | Tidak ada kata "Terkunci" di mode download | [ ] |
| 5 | Tombol download per foto | Jelas dan langsung mengunduh 1 file asli | [ ] |
| 6 | Tombol Download Pilihan (ZIP) | Mengemas foto terpilih ke arsip ZIP secara utuh | [ ] |
| 7 | Alur Ganti Mode | Beralih mulus antara Pilih Foto dan Download Foto | [ ] |

---
**Status Gate:** **READY FOR OPERATOR VISUAL RECHECK**
