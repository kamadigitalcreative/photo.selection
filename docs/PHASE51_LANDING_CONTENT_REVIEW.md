# Photo Selection — Phase 5.1R Landing Content & Quality Review
**Dokumen Resolusi Audit Korektif, Keselarasan Komersial & Validasi Fungsional**
*Tanggal Koreksi: 18 Oktober 2026 | Arsitektur: Phase 5.1R (The Atelier Collection)*

---

## 1. Latar Belakang & Ringkasan Perbaikan
Berdasarkan hasil pengujian independen pasca-Phase 5.1, ditemukan sejumlah masalah fungsional, redaksional, dan aksesibilitas di luar cakupan automated test suite. Pada **Phase 5.1R (Combined)**, seluruh temuan tersebut diperbaiki secara tuntas dalam satu sesi kerja tanpa merusak identitas desain mewah *The Atelier Collection* (Noir Champagne + Atelier Ivory).

---

## 2. Matriks Resolusi 5 Blocker Temuan Kritis

| No | Blocker / Temuan Kritis | Kondisi Masalah Sebelumnya | Solusi Perbaikan Phase 5.1R | Status |
| :--- | :--- | :--- | :--- | :--- |
| **B1** | **Kerusakan Terjemahan Kartu (Selector Collision)** | Selektor umum seperti `#problem p.text-slate-400` dan `#fitur p.text-slate-400` menimpa seluruh paragraf kartu di seksi terkait dengan teks yang sama. Menghasilkan 1 teks berulang untuk 4-7 kartu berbeda. | **Arsitektur `data-i18n` Deterministik**:<br>Setiap elemen kartu kini memiliki kunci unik (misal: `problem.card1.desc`, `workflow.step1.desc`, `features.f1.desc`, `pro.p1.desc`). Kamus dwibahasa `I18N_DICT` menjamin setiap kartu mempertahankan deskripsi uniknya sendiri pada mode ID, EN, maupun saat beralih kembali ke ID. | **RESOLVED & VERIFIED** |
| **B2** | **Formulir Pendaftaran Lead Simulasi / Palsu** | `handleFormSubmit()` memunculkan pop-up SweetAlert2 "Pendaftaran Berhasil!" setelah timeout tanpa benar-benar menyimpan data atau membuat akun pengguna di backend. | **Alur Pendaftaran Jujur & Transparan**:<br>Dihilangkan pop-up keberhasilan palsu. Tombol pada modal pendaftaran kini mengarahkan fotografer langsung secara transparan ke rute registrasi resmi aplikasi (`app.html?auth=register`). Seluruh ID kontrak pengujian (`#leadModal`, `#leadForm`, `#btnSubmit`, dll.) tetap terjaga. | **RESOLVED & VERIFIED** |
| **B3** | **Testimoni Tanpa Izin Rilis Resmi** | Menggunakan kutipan bergaya ulasan pelanggan dengan nama studio fiktif/nyata (`Kama Visual Studio`, `Nely Portraiture`) tanpa bukti persetujuan rilis publikasi. | **Transformasi ke Studi Kasus Alur Kerja (Studio Use Cases)**:<br>Diformulasikan ulang sebagai ilustrasi studi kasus alur kerja fotografi objektif berdasarkan spesialisasi riil studio: (1) *Wedding & Prewedding*, (2) *Portrait & Editorial Studio*, (3) *Commercial & Corporate Event*. Kontrol slider dan tata letak mewah tetap dipertahankan. | **RESOLVED & VERIFIED** |
| **B4** | **Klaim Komersial & Parameter URL Tidak Didukung** | - Tautan harga menambahkan `&paket=1%20Bulan` yang ternyata tidak diproses oleh `app.html`.<br>- Klaim kuantitatif waktu ("Hemat 90%", "45 menit", "2-3 jam").<br>- Klaim bahwa watermark "mencegah screenshot".<br>- Status verifikasi harga PRO Rp 149.000/tahun. | - **Penyelarasan Rute**: Seluruh tombol diarahkan ke rute registrasi resmi `app.html?auth=register`.<br>- **Redaksi Faktual**: Menghapus klaim angka yang tidak terukur; diganti dengan deskripsi efisiensi proses pemindahan file RAW lokal.<br>- **Koreksi Watermark**: Dinyatakan secara akurat sebagai *watermark atribusi visual* untuk melindungi identitas karya.<br>- **Status Harga PRO**: Terverifikasi resmi Rp 149.000 / tahun di `api/supabase.js` (line 1159), `app.html` (line 5554), dan `mayar-webhook-audit.test.js` (Test 47), serta dicantumkan khusus sebagai paket tahunan. | **RESOLVED & VERIFIED** |
| **B5** | **Aksesibilitas Mobile (Zoom Terkunci)** | Tag meta viewport menggunakan `maximum-scale=1.0, user-scalable=no` yang melanggar standar aksesibilitas web (WCAG) karena mencegah pengguna memperbesar tampilan teks di layar sentuh. | **Pemulihan Pinch-to-Zoom**:<br>Tag meta viewport diubah menjadi standar `<meta name="viewport" content="width=device-width, initial-scale=1.0">`, memulihkan kontrol zoom bagi pengguna mobile. | **RESOLVED & VERIFIED** |

---

## 3. Status Verifikasi Harga & Parameter Rute

1. **Paket Dasar Fotografer (Base Plans)**:
   - **Free Trial**: Rp 0 / 1 Project (Uji coba alur kerja galeri & sortir lokal).
   - **1 Bulan**: Rp 25.000 / bulan.
   - **6 Bulan**: Rp 120.000 / 6 bulan (~Rp 20.000/bulan).
   - **1 Tahun**: Rp 199.000 / tahun (~Rp 16.500/bulan, hemat 33%).
2. **Paket Add-On PRO Suite**:
   - **Harga Terverifikasi**: Rp 149.000 / tahun.
   - **Ketersediaan**: Khusus paket tahunan (tidak ada opsi Add-On bulanan; di `mayar-webhook-audit.test.js`, transaksi Add-On 1 Bulan ditolak dengan `UNVERIFIED_PRODUCT_CATALOG`).
   - **Fitur Termasuk**: Watermark Dinamis, Kolase PRO 1-Klik (29 template), Multi-Kategori Galeri, Musik Latar Galeri, dan Kalkulator Biaya Ekstra Foto (Upsell).
3. **Rute Registrasi Aplikasi**:
   - Seluruh CTA tombol di landing page menggunakan rute kompatibel `app.html?auth=register` (atau `/register` via Vercel rewrite).
   - Parameter `paket` dihapus dari URL karena `app.html` menangani pemilihan paket langsung di dalam form dropdown pendaftaran.

---

## 4. Rekomendasi Keputusan Operator untuk Rilis Berikutnya
1. **Pilihan Bahasa Baku**:
   - Pengaturan awal adalah Bahasa Indonesia (ID) dengan deteksi otomatis `ps_lang` dari `localStorage`.
2. **Testimoni Nyata di Masa Depan**:
   - Jika di kemudian hari operator ingin menampilkan ulasan pelanggan nyata, pastikan telah mengantongi izin tertulis dan foto profil asli sebelum mempublikasikannya.
