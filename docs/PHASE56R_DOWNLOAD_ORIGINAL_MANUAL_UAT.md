# PHOTO SELECTION / KMBC — MANUAL UAT PENGUNDUHAN FOTO ASLI & RUNTIME SAFETY

**Dokumen:** Panduan Pengujian Visual & Interaktif Operator  
**Target URL:** `http://127.0.0.1:4173/app.html`  
**Direct Client Gallery URL:** `http://127.0.0.1:4173/app.html?token=dummy-client-token`  
**Direct Download-Disabled Gallery URL:** `http://127.0.0.1:4173/app.html?token=token-no-download`  
**PIN Galeri Valid:** `1234`  
**Akun Fotografer:** Username: `fotografer`, Password: `password123`  
**Status Gerbang:** **READY FOR OPERATOR VISUAL UAT**  

---

## PETUNJUK PERSIAPAN PENGUJIAN

1. Pastikan server mock lokal sandbox sedang aktif:
   ```bash
   node test/phase55-browser-uat.js
   ```
   *(Server aktif di port 4173 dengan status isolasi `MOCK-LOCAL-STRICT`)*
2. Buka browser (Google Chrome, Microsoft Edge, atau Firefox) dalam mode *Incognito* / *Private Window*.
3. Buka Console Developer Tools (`F12` -> tab **Console**) sepanjang pengujian untuk memverifikasi ketiadaan `ReferenceError` atau uncaught exception.

---

## TABEL SKENARIO PENGUJIAN MANUAL OPERATOR

| ID Skenario | Akun / Token | URL Target | Langkah Klik Operator | Expected Result (Hasil yang Diharapkan) | Status Operator | Catatan Teknis |
|:---|:---|:---|:---|:---|:---:|:---|
| **UAT-DL-01** | `fotografer` | `http://127.0.0.1:4173/app.html` | 1. Buka URL.<br>2. Masukkan username `fotografer`, password `password123`.<br>3. Klik "Masuk". | Berhasil masuk ke dashboard fotografer. Header atas rapi, theme picker duplikat hilang, sidebar theme picker aktif. | [ ] PASS<br>[ ] FAIL | Console bersih dari error script. |
| **UAT-DL-02** | `dummy-client-token` | `http://127.0.0.1:4173/app.html?token=dummy-client-token` | 1. Buka URL galeri klien.<br>2. Amati form password. | Input password terlihat compact (tinggi 44px), placeholder *"Masukkan Password"* tidak merenggang, ikon mata di sisi kanan rapi. | [ ] PASS<br>[ ] FAIL | Padding kiri-kanan proporsional. |
| **UAT-DL-03** | `dummy-client-token` | `http://127.0.0.1:4173/app.html?token=dummy-client-token` | 1. Masukkan PIN salah: `9999`.<br>2. Klik "Unlock Gallery". | Muncul alert SweetAlert: *"PIN Keamanan tidak sesuai"*. Akses galeri tidak terbuka. | [ ] PASS<br>[ ] FAIL | Otentikasi negatif berfungsi benar. |
| **UAT-DL-04** | `dummy-client-token` | `http://127.0.0.1:4173/app.html?token=dummy-client-token` | 1. Masukkan PIN benar: `1234`.<br>2. Klik "Unlock Gallery". | Masuk ke layar sambutan (`#client-mode-view`). Menampilkan **2 opsi kartu setara**: (1) "Pilih Foto", (2) "Download Foto". | [ ] PASS<br>[ ] FAIL | Keduanya terlihat aktif dan ada hover effect emas. |
| **UAT-DL-05** | `dummy-client-token` | `#client-mode-view` | 1. Klik kartu **"Pilih Foto"**. | Masuk ke galeri seleksi. Tampil 5 kartu foto sampel. Muncul subtitle batas kuota ("Pilih maksimal 3 foto"). | [ ] PASS<br>[ ] FAIL | **Console zero ReferenceError**. |
| **UAT-DL-06** | `dummy-client-token` | `#client-gallery-view` | 1. Klik tombol "Pilih" pada foto 1.<br>2. Klik foto 2 dan foto 3.<br>3. Coba klik foto 4. | Foto 1-3 terpilih dengan border emas. Foto 4 ditolak dengan peringatan kuota penuh (maksimal 3 foto). | [ ] PASS<br>[ ] FAIL | Kuota seleksi tetap aman dan terjaga. |
| **UAT-DL-07** | `dummy-client-token` | `#client-gallery-view` | 1. Klik tombol "Preview" di bilah bawah.<br>2. Amati modal preview pilihan.<br>3. Klik ikon silang (X) untuk menutup. | Modal preview menampilkan 3 foto terpilih. Tombol close menutup modal secara mulus. | [ ] PASS<br>[ ] FAIL | Preview seleksi berfungsi normal. |
| **UAT-DL-08** | `dummy-client-token` | `#client-gallery-view` | 1. Klik tombol "Home" di kiri atas header. | Halaman kembali ke layar sambutan 2 pilihan mode (`#client-mode-view`). | [ ] PASS<br>[ ] FAIL | Navigasi kembali antar-mode lancar. |
| **UAT-DL-09** | `dummy-client-token` | `#client-mode-view` | 1. Klik kartu **"Download Foto"**. | Masuk ke galeri mode download. Subtitle kuota disembunyikan. Bilah bawah menampilkan tombol **"Download File Asli"**. | [ ] PASS<br>[ ] FAIL | **KRITIS: Zero btnPilih ReferenceError di Console!** Seluruh 5 kartu ter-render lengkap. |
| **UAT-DL-10** | `dummy-client-token` | Mode Download | 1. Arahkan mouse ke kartu foto pertama (`photo1.png`).<br>2. Klik ikon tombol download langsung (`<i class="fa-solid fa-download"></i>`) di kartu. | Muncul notifikasi *"Unduhan Dimulai: File asli sedang disimpan: photo1.png"*. Berkas `photo1.png` langsung terunduh ke folder Downloads komputer. | [ ] PASS<br>[ ] FAIL | **BUKAN .ZIP**. Berkas berekstensi asli `.png`. |
| **UAT-DL-11** | `dummy-client-token` | File hasil unduhan | 1. Buka folder Downloads di komputer.<br>2. Buka berkas `photo1.png`.<br>3. Periksa properties / tipe file. | Berkas terbuka sempurna sebagai gambar PNG. Ukuran berkas sesuai byte fixture (~20 KB). Header file valid PNG. | [ ] PASS<br>[ ] FAIL | Integritas byte 100% terjaga tanpa re-encoding canvas. |
| **UAT-DL-12** | `dummy-client-token` | Mode Download | 1. Klik checkbox "Pilih Semua" (atau centang photo2 dan photo3).<br>2. Klik tombol **"Download File Asli"** di bilah bawah. | Muncul loader progres per berkas. Masing-masing berkas foto terunduh satu per satu secara langsung. Muncul notifikasi *"Unduhan Dimulai"*. | [ ] PASS<br>[ ] FAIL | Tidak ada pembuatan zip sama sekali. |
| **UAT-DL-13** | `dummy-client-token` | Mode Download (Edge Case) | 1. Lepas semua centang hingga 0 foto terpilih.<br>2. Klik tombol "Download File Asli". | Muncul alert informatif: *"Pilih foto yang ingin di-download terlebih dahulu"*. Tidak ada fetch berjalan. | [ ] PASS<br>[ ] FAIL | Guard validasi input kosong aktif. |
| **UAT-DL-14** | `token-no-download` | `http://127.0.0.1:4173/app.html?token=token-no-download` | 1. Buka URL proyek yang download-nya dinonaktifkan.<br>2. Masukkan PIN `1234`.<br>3. Amati layar mode. | Tombol "Download Foto" tersembunyi / tidak tersedia. Pengguna hanya diarahkan ke mode "Pilih Foto". | [ ] PASS<br>[ ] FAIL | Otorisasi download aktif/nonaktif dihormati. |
| **UAT-DL-15** | Unknown Token | `http://127.0.0.1:4173/app.html?token=token-palsu-acak-999` | 1. Buka URL dengan token yang tidak ada di sistem. | Server mock mengembalikan error *"Proyek tidak ditemukan atau token tidak valid"*. Akses ditolak. | [ ] PASS<br>[ ] FAIL | Tidak ada fallback bocor ke akun default. |
| **UAT-DL-16** | Responsive Test | Desktop (1440px) vs Mobile (375px) | 1. Buka DevTools mode responsive mobile (375x667).<br>2. Periksa form PIN, kartu mode, galeri, dan tombol download. | Tampilan compact, teks tidak terpotong, grid 2 kolom rapi di mobile, tombol nyaman ditekan. | [ ] PASS<br>[ ] FAIL | Responsive visual stabil. |

---

## KESIMPULAN & TANDA TANGAN OPERATOR

- **Jumlah Skenario Pengujian:** 16 Skenario
- **Hasil Pengamatan Operator:**
  - [ ] **SEMUA SKENARIO PASS (Siap lanjut ke fase berikutnya)**
  - [ ] **ADA SKENARIO FAIL (Sebutkan ID Skenario pada catatan di bawah)**
- **Catatan Operator:**
  _________________________________________________________________________
  _________________________________________________________________________
- **Tanggal Pengujian:** ____________________
- **Nama Operator:** ________________________
