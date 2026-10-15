# PHOTO SELECTION — PHASE 5.0B
## SAFE REFACTORING PLAN & CSS EXTRACTION ROADMAP
**Dokumen:** `docs/PHASE50B_REFACTORING_PLAN.md`  
**Target:** Rencana Implementasi Bertahap (Phase 5.0C – 5.0F)  
**Status:** Perencanaan Arsitektur Aman (Read-Only Preparation)  
**Baseline Produksi:** Phase 4.7.5 (Commit: `34570d5`)

---

## 1. Audit Keselamatan Ekstraksi CSS (CSS Safety Audit)

Pemeriksaan mendalam terhadap styling internal pada monolit menghasilkan temuan teknis sebagai berikut:

### A. Blok `<style>` pada `app.html`
- **Lokasi Baris:** [`app.html` Baris 83–827](file:///d:/FILE%20GITHUB/photo.selection/app.html#L83-L827) (Total 744 baris CSS, ~26 KB).
- **Import Tipografi Eksternal:** 
  Baris 84 mengimpor 10 font Google Fonts sekaligus melalui `@import url(...)` (`Bodoni Moda`, `Cormorant Garamond`, `DM Serif Display`, `Great Vibes`, `Inter`, `Libre Baskerville`, `Lora`, `Montserrat`, `Playfair Display`, `Poppins`).
- **Variabel CSS (Custom Properties):** 
  Menggunakan `var(--watermark-bg)` pada selector `.has-watermark .photo-card::after` ([baris 114](file:///d:/FILE%20GITHUB/photo.selection/app.html#L114)) dan `#viewerImageWrapper::after` ([baris 125](file:///d:/FILE%20GITHUB/photo.selection/app.html#L125)). Nilai variabel ini disuntikkan secara dinamis oleh JavaScript saat galeri klien dimuat.
- **Interaksi Spesifisitas Tailwind & Dark Mode:**
  Sebagian besar baris 650–827 berisi aturan penimpaan mode gelap (`html.dark ... !important`). Aturan ini sengaja menggunakan `!important` untuk mengalahkan class utilitas Tailwind yang disuntikkan oleh Tailwind Play CDN.
- **Peringatan Risiko (Mengapa Ekstraksi BUKAN Nol Risiko):**
  1. *Urutan Cascade:* File CSS eksternal harus dipanggil **setelah** tag konfigurasi Tailwind CDN agar aturan `!important` tetap berada di posisi terakhir urutan spesifisitas.
  2. *Flash of Unstyled Content (FOUC):* Memindahkan 26 KB CSS ke file eksternal dapat menimbulkan FOUC pada koneksi internet seluler yang lambat jika browser mengunduh HTML lebih cepat daripada file stylesheet. Tag `<link rel="stylesheet">` harus ditempatkan tepat di dalam `<head>`.
  3. *Cache Browser Klien:* Peramban pengguna cenderung menyimpan cache agresif untuk file `.css`. Ekstraksi wajib menggunakan string versi (*cache-busting query parameter*), misalnya: `href="assets/css/app-core.css?v=5.0.0"`.

### B. Blok `<style>` pada `index.html`
- **Lokasi Baris:** [`index.html` Baris 79–116](file:///d:/FILE%20GITHUB/photo.selection/index.html#L79-L116) (Total 38 baris CSS, ~1.2 KB).
- **Karakteristik:** Sangat ringkas dan terisolasi. Hanya mendefinisikan `.hero-pattern`, `.glass-card`, `.wa-pattern`, `.hide-scrollbar`, dan transisi `.faq-content`.
- **Level Risiko Ekstraksi:** Sangat rendah (*Low Risk*). Dapat diekstrak ke `assets/css/landing.css` atau langsung digantikan oleh styling *The Atelier Collection*.

---

## 2. Rencana Kompatibilitas Landing Page (`index.html`)

### A. Pemetaan Elemen Interaktif Menuju Rute Aplikasi:
| Elemen UI | Jenis Interaksi | Target Rute / Handler | Keterangan Kritis |
| :--- | :--- | :--- | :--- |
| **Header Link Masuk** | Klik Navigasi | `app.html?auth=login` | Wajib dipertahankan persis |
| **Header Link Coba Gratis** | Klik Navigasi | `app.html?auth=register` | Wajib dipertahankan persis |
| **Hero Button Utama** | CTA Konversi | `app.html?auth=register` | Mengirim pengguna ke form pendaftaran |
| **Menu Mobile Toggle** | Button Toggle | Inline JS `classList.toggle('hidden')` | Membuka drawer menu mobile |
| **Kartu Harga Gratis** | CTA Paket | `app.html?auth=register` | Memicu `trackEvent('click_harga_trial')` |
| **Kartu Harga 1 Bulan** | CTA Paket | `app.html?auth=register` | Memicu `trackEvent('click_harga_1bulan')` |
| **Kartu Harga 1 Tahun** | CTA Paket | `app.html?auth=register` | Memicu `trackEvent('click_harga_1tahun')` |
| **Kartu Harga 6 Bulan** | CTA Paket | `app.html?auth=register` | Memicu `trackEvent('click_harga_6bulan')` |
| **FAQ Accordion** | Klik Dropdown | Inline JS toggle max-height | Menampilkan jawaban pertanyaan |
| **Head Script Redirect** | Auto-Detect URL | `app.html` + `window.location.search` | **VITAL:** Meneruskan `?token=`, `?c=`, `?confirm=` |

### B. Diskrepansi Pemasaran yang Wajib Divalidasi Operator:
1. **Klaim Paket Gratis:** Di landing page tertulis *"Paket starter selamanya (Rp0 / selamanya)"*, sedangkan di sistem backend dibatasi sebagai *"Demo (1 Project / Masa Aktif 7 Hari)"*. Operator disarankan menyelaraskan klaim ini menjadi *"Coba Gratis 1 Project"* agar ekspektasi pengguna sesuai.
2. **Ketiadaan Fitur PRO:** Landing page belum memajang fitur-fitur berdaya jual tinggi seperti *Watermark Dinamis, Kolase PRO 1-Klik, Multi-Kategori, Musik Latar Galeri, dan Kalkulator Biaya Ekstra Foto (Upsell)*. Menambahkan fitur ini pada desain mewah *The Atelier Collection* akan meningkatkan konversi penjualan Add-On PRO (Rp 149.000/tahun).
3. **Koordinasi Harga Mayar:** Harga paket (Rp 25.000, Rp 120.000, Rp 199.000) terikat erat dengan konfigurasi `MAYAR_CATALOG` di backend. Dilarang mengubah teks angka harga tanpa sinkronisasi SKU Mayar.

---

## 3. Rencana Implementasi Bertahap (*Safe Refactoring Batches*)

Untuk menjamin **Zero Downtime & Zero Regression**, pekerjaan refaktoring Phase 5 dipecah menjadi 8 batch terisolasi. Jangan pernah menggabungkan refaktoring arsitektur dengan perombakan desain visual dalam satu batch!

```
+─────────────────────────────────────────────────────────────────────────────+
│                URUTAN IMPLEMENTASI AMAN (PHASE 5.0C - 5.0F)                 │
+─────────────────────────────────────────────────────────────────────────────+
│ Batch 1: Ekstraksi CSS app.html -> assets/css/app-core.css                  │
│                                ↓                                            │
│ Batch 2: Ekstraksi CSS index.html -> assets/css/landing.css                 │
│                                ↓                                            │
│ Batch 3: Penyelarasan Konten & Klaim Landing Page (Teks Saja)               │
│                                ↓                                            │
│ Batch 4: Ekstraksi Collage PRO Engine -> assets/js/modules/collage-engine.js│
│                                ↓                                            │
│ Batch 5: Ekstraksi Sortir RAW Lokal -> assets/js/modules/local-sorter.js    │
│                                ↓                                            │
│ Batch 6: Ekstraksi Multi-Bahasa i18n -> assets/js/modules/i18n.js           │
│                                ↓                                            │
│ Batch 7: Normalisasi Core State & Perbaikan Duplikasi Fungsi                │
│                                ↓                                            │
│ Batch 8: Penerapan Desain Noir Champagne (The Atelier Collection)           │
+─────────────────────────────────────────────────────────────────────────────+
```

---

### BATCH 1: Ekstraksi Terisolasi CSS `app.html` (Fase 5.0C Pertama)
- **Target Berkas:**
  - Baru: `assets/css/app-core.css`
  - Modifikasi: `app.html` (Baris 83–827 diganti 1 tag `<link>`)
- **Tujuan:** Memotong 744 baris styling dari monolit tanpa mengubah markup atau JavaScript.
- **Level Risiko:** Rendah (*Low Risk*).
- **Pre-Change Checks:**
  1. Jalankan `node test/security-and-regression.test.js` (wajib 25 PASS).
  2. Buat snapshot commit/stiff save via GitHub Desktop.
- **Langkah Kerja:**
  1. Buat folder `assets/css/` jika belum ada.
  2. Salin isi baris 84–826 dari `app.html` ke dalam `assets/css/app-core.css`.
  3. Ganti blok `<style>...</style>` di `app.html` dengan:
     ```html
     <link rel="stylesheet" href="assets/css/app-core.css?v=5.0.0">
     ```
- **Post-Change Checks:**
  1. Jalankan `node test/security-and-regression.test.js`.
  2. Buka `app.html` di browser lokal. Periksa kesamaan visual login, dashboard admin, galeri klien, dan mode gelap.
- **STOP / GO Criteria:**
  - *GO:* Jika seluruh UI tampil 100% identik dan tidak ada error 404 pada network tab browser.
  - *STOP & Rollback:* Jika terjadi FOUC atau layout hancur, rollback perubahan via GitHub Desktop (*Discard changes*).

---

### BATCH 2: Ekstraksi CSS `index.html` (Landing Page)
- **Target Berkas:**
  - Baru: `assets/css/landing.css`
  - Modifikasi: `index.html` (Baris 79–116 diganti 1 tag `<link>`)
- **Level Risiko:** Sangat Rendah (*Very Low Risk*).
- **Post-Change Checks:** Verifikasi tampilan landing page di desktop dan mobile.

---

### BATCH 3: Penyelarasan Klaim Konten Landing Page
- **Target Berkas:** `index.html` (Hanya perubahan teks/prose).
- **Tujuan:** Menyelaraskan teks trial ("Coba Gratis 1 Project") dan menambahkan showcase fitur PRO Add-On sesuai arahan operator.
- **Level Risiko:** Rendah (*Low Risk*).
- **Syarat Mutlak:** Link CTA `app.html?auth=register` dan `app.html?auth=login` tidak boleh berubah.

---

### BATCH 4: Ekstraksi Collage PRO Engine & UI Controls
- **Target Berkas:**
  - Baru: `assets/js/modules/collage-engine.js`
  - Modifikasi: `app.html`
- **Tujuan:** Mengeluarkan 4.300+ baris logika kolase (Script 3 baris 3.648–4.279 & Script 6 baris 14.834–18.505) ke dalam satu berkas terstruktur.
- **Level Risiko:** Menengah (*Medium Risk*).
- **Kunci Keselamatan:** Seluruh fungsi yang dipanggil oleh atribut inline HTML (seperti `setCollageTemplate`, `applyCustomSize`, `addCollageTextLayer`, `exportCollageImage`) **wajib diekspos ke objek `window`**.

---

### BATCH 5: Ekstraksi Sortir Lokal RAW
- **Target Berkas:**
  - Baru: `assets/js/modules/local-sorter.js`
  - Modifikasi: `app.html`
- **Tujuan:** Mengeluarkan ~640 baris logika pemrosesan file RAW dan kompresi ZIP streaming.
- **Level Risiko:** Menengah (*Medium Risk*).

---

### BATCH 6: Ekstraksi Multi-Bahasa (`i18n.js`)
- **Target Berkas:**
  - Baru: `assets/js/modules/i18n.js`
  - Modifikasi: `app.html`
- **Tujuan:** Mengeluarkan kamus bahasa dan fungsi `applyLanguage()`, `changeLanguage()`, serta interceptor `Swal.fire`.
- **Level Risiko:** Rendah (*Low Risk*).

---

### BATCH 7: Normalisasi Core State & Resolusi Duplikasi Fungsi
- **Target Berkas:** `app.html`
- **Tujuan:**
  1. Menggabungkan fungsi `isDemoAccount()` menjadi satu definisi komprehensif yang memeriksa role, username, dan paket.
  2. Menggabungkan `showDemoSubscribeAlert()` sehingga memiliki teks dwibahasa (ID/EN) DAN tautan personalisasi Mayar.
- **Level Risiko:** Rendah (*Low Risk*).

---

### BATCH 8: Penerapan Desain Mewah "The Atelier Collection"
- **Target Berkas:** `index.html`, `app.html`, `assets/css/atelier-theme.css`.
- **Tujuan:** Mengaplikasikan tema visual Noir Champagne, charcoal backgrounds, champagne gold accents, dan tipografi editorial mewah.
- **Level Risiko:** Terkontrol (karena core logika JavaScript dan CSS dasar telah terpisah rapi pada Batch 1–7).

---

## 4. Prosedur Rollback Melalui GitHub Desktop

Karena Operator menggunakan GitHub Desktop sebagai satu-satunya alur kerja Git, berikut panduan mitigasi jika terjadi kendala pada saat implementasi batch:

1. **Sebelum Memulai Batch:**
   - Buka GitHub Desktop.
   - Pastikan tab *Changes* bersih (*No local changes*).
2. **Jika Pengujian Menemukan Masalah (Kondisi STOP):**
   - JANGAN melakukan commit.
   - Buka GitHub Desktop.
   - Pada panel *Changes*, klik kanan pada berkas yang bermasalah (misal: `app.html`).
   - Pilih **"Discard Changes..."** -> Konfirmasi.
   - Repositori lokal akan seketika kembali ke kondisi stabil baseline Phase 4.7.5.
