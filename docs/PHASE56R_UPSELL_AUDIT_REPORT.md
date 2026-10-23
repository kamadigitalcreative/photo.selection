# AUDIT FITUR UPSELL FOTO EKSTRA (ADD-ON PRO) — KMBC PHOTO SELECTION

**Mode:** READ-ONLY AUDIT + SAFE LOCAL MOCK TESTING  
**Branch:** `fix/phase-5.6r-ui-stabilization`  
**Waktu Audit:** 2026-10-23  
**Status Audit:** **COMPLETED — NO CODE MODIFICATION (READ-ONLY)**

---

## 1. Status Fitur Upsell Saat Ini
Fitur **Upsell Foto Ekstra** saat ini **BERFUNGSI SECARA PENUH DI FRONTEND & TERLINDUNGI OLEH BACKEND PADA SAAT PEMBUATAN PROYEK**:
- Fotografer **PRO Aktif** atau **PRO Lifetime** dapat mengatur `extraPrice` per foto saat membuat proyek baru.
- Fotografer reguler, akun Demo, atau fotografer dengan PRO kedaluwarsa **dikunci di antarmuka frontend** (`p_extra_price disabled` + SweetAlert PRO) dan **ditolak keras di backend** (`HTTP 403: Fitur Sistem Upsell membutuhkan Add-On PRO yang aktif`).
- Klien pada proyek ber-Upsell dapat memilih melebihi kuota setelah menyetujui konfirmasi biaya SweetAlert.
- Perhitungan biaya, pengurangan biaya saat deselect, pembuatan pesan WhatsApp, invoice transfer bank, dan status *"Menunggu Konfirmasi Pembayaran"* berjalan akurat.
- Ditemukan **2 celah/gap validasi backend** pada endpoint `updateClientStatus` (klien direct API call), yang dirinci di bawah.

---

## 2. Bagian yang Sudah Benar-Benar Bekerja

1. **Gatekeeping Otorisasi PRO di Backend (`api/supabase.js`):**
   - Fungsi `getUserProEntitlement(username)` memvalidasi tabel otoritatif `pro_entitlements` (bukan sekadar flag legacy).
   - Validasi `createProject` memeriksa `extraPriceNum > 0` dan menolak fotografer non-PRO dengan `HTTP 403`.
   - Admin mendapatkan bypass resmi (`isPro: true, isLifetime: true`).
2. **Kunci Antarmuka Modal Pembuatan Proyek (`app.html`):**
   - Input `#p_extra_price` otomatis di-disable jika `!isPremiumAddon()`.
   - Placeholder berganti menjadi `Terkunci (Add-On PRO)`.
   - Klik atau pengetikan pada input memicu modal penawaran `showPremiumAlert()`.
3. **Alur Pemilihan Foto Klien (`app.html`):**
   - Foto 1 s/d kuota (misal 3): tidak ada biaya ekstra (Rp0).
   - Foto ke-4 (melebihi kuota): memunculkan konfirmasi SweetAlert biaya tambahan (misal Rp15.000).
   - Jika klien klik *Batal*, foto tidak ditambahkan dan kuota tetap 3.
   - Jika klien klik *Ya, Lanjutkan*, foto ditambahkan dan total tagihan bertambah Rp15.000.
   - Foto ke-5: langsung ditambahkan dan total tagihan otomatis bertambah menjadi Rp30.000.
4. **Alur Pembatalan (Deselect):**
   - Menghapus foto ke-5 mengurangi total tagihan kembali ke Rp15.000.
   - Menghapus foto ke-4 mengurangi tagihan ekstra kembali ke Rp0.
5. **Proyek Tanpa Upsell (`extraPrice = 0`):**
   - Klien yang mencoba memilih melebihi kuota langsung diblokir dengan peringatan *"Batas Maksimal Tercapai"*.
6. **Alur Submit & Status Transisi:**
   - Klien dengan foto ekstra otomatis dialihkan ke modal pembayaran `promptExtraPayment` berisi nomor rekening dan invoice transfer.
   - Status proyek berubah menjadi `'Menunggu Konfirmasi Pembayaran'`.
   - Teks pesan WhatsApp otomatis memuat rincian: Total Foto Terpilih, Kuota Proyek, Foto Ekstra, dan Total Tagihan Ekstra.
7. **Dashboard Fotografer:**
   - Kartu proyek menampilkan lencana khusus berwarna kuning berkedip: `Menunggu Konfirmasi` dengan ikon `fa-file-invoice-dollar`.
   - Fotografer memiliki tombol `btn-confirm-payment` (*Konfirmasi Lunas* -> status jadi `Selesai`) dan `btn-reject-payment` (*Tolak Pembayaran* -> status kembali ke `Sedang Memilih`).
   - Endpoint `processPayment` di `api/supabase.js` memvalidasi hak akses pemilik proyek.

---

## 3. Bug & Celah Keamanan yang Ditemukan (Audit Findings)

### Celah 1: Validasi Status Server-Side pada `updateClientStatus`
- **Lokasi:** `api/supabase.js` (baris ~2725–2741).
- **Temuan:**
  Pada frontend `app.html`, klien yang memilih foto melebihi kuota diarahkan untuk mengirim `status = 'Menunggu Konfirmasi Pembayaran'`. Namun, pada level endpoint API `updateClientStatus`, server **tidak memvalidasi** apakah jumlah foto yang dikirim melebihi `Max Foto` proyek berbayar.
- **Dampak Potensial:**
  Jika klien teknis mengirimkan payload mentah via HTTP POST langsung ke API dengan `status: "Selesai"` dan `selectedFiles: [5 foto]`, backend akan menerimanya dan menandai proyek sebagai `Selesai` tanpa melalui status `Menunggu Konfirmasi Pembayaran`.
- **Mitigasi Direkomendasikan:**
  Di `handleUpdateClientStatus`, tambahkan validasi server-side: jika `project.ExtraPrice > 0` dan `cleanFiles.length > currentMax`, paksa status menjadi `'Menunggu Konfirmasi Pembayaran'` bila status yang diminta klien adalah `'Selesai'`.

### Celah 2: Backend Tidak Membatasi Kuota Jika `extraPrice == 0`
- **Lokasi:** `api/supabase.js` (baris ~2743–2758).
- **Temuan:**
  Saat proyek dibuat tanpa fitur upsell (`extraPrice == 0`), frontend `app.html` membatasi seleksi foto maksimal sesuai `maxFoto`. Namun, di level API `updateClientStatus`, backend hanya memeriksa `countNum <= 10000` dan `files.length <= 10000`.
- **Dampak Potensial:**
  Klien jahat yang memanggil API secara langsung dapat menyuntikkan daftar pilihan melebihi kuota gratis tanpa terdeteksi oleh backend.
- **Mitigasi Direkomendasikan:**
  Di `handleUpdateClientStatus`, tambahkan pengecekan: jika `extraPrice === 0` dan `cleanFiles.length > currentMax`, tolak dengan `HTTP 400: Jumlah foto melebihi kuota project`.

### Celah 3: Belum Ada Fitur Edit `extraPrice` Setelah Proyek Dibuat
- **Lokasi:** `app.html` (`openProjectSettings`).
- **Temuan:**
  Setelah proyek dibuat, menu `Pengaturan Project` fotografer menyediakan opsi edit Password, Watermark, Download, Kuota Max, Deadline, dan Hapus. Tidak ada modal untuk mengubah nominal `extraPrice`.
- **Dampak:**
  Fotografer yang salah memasukkan tarif ekstra harus membuat ulang proyek atau mengubahnya langsung di database.

---

## 4. Hasil Audit 12 Poin Pertanyaan

| No | Pertanyaan Audit | Status Evaluasi | Klasifikasi | Keterangan |
| :---: | :--- | :---: | :---: | :--- |
| **1** | Fotografer PRO dapat mengatur biaya tambahan saat buat proyek? | **YA** | `RUNTIME PASS` | Input `#p_extra_price` terbuka dan tersimpan ke kolom `ExtraPrice`. |
| **2** | Fotografer reguler & Demo ditolak jika mencoba mengaktifkan? | **YA** | `RUNTIME PASS` | Terkunci di frontend (`disabled`) dan ditolak backend (`HTTP 403`). |
| **3** | Add-On PRO kedaluwarsa tidak dapat mengaktifkan fitur Upsell? | **YA** | `RUNTIME PASS` | `resolveUserProEntitlement` mendeteksi `expires_at < now` -> `isPro: false` -> ditolak `HTTP 403`. |
| **4** | Otorisasi PRO divalidasi oleh backend (bukan hanya frontend)? | **YA** | `RUNTIME PASS` | Diperiksa di `api/supabase.js:2259-2271` via `getUserProEntitlement`. |
| **5** | Klien dapat memilih melebihi kuota saat Upsell aktif? | **YA** | `RUNTIME PASS` | Dialog konfirmasi SweetAlert mengizinkan seleksi bertambah melebihi kuota. |
| **6** | Muncul konfirmasi biaya tambahan sebelum foto ekstra ditambahkan? | **YA** | `RUNTIME PASS` | SweetAlert menampilkan nominal tarif per foto dan opsi *Batal*. |
| **7** | Biaya dihitung otomatis dan akurat? | **YA** | `RUNTIME PASS` | Formula `(selected - maxFoto) * extraPrice` konsisten di seluruh aplikasi. |
| **8** | Pembatalan foto ekstra mengurangi total biaya dengan benar? | **YA** | `RUNTIME PASS` | Deselect menghapus foto dari array dan total tagihan berkurang seketika. |
| **9** | Data pilihan ekstra tersimpan & tersinkronisasi tanpa hilang? | **YA** | `RUNTIME PASS` | Tersimpan di `localStorage` klien dan tersinkronisasi via `updateClientStatus`. |
| **10**| Fotografer menerima info jumlah foto ekstra, harga & status? | **YA** | `RUNTIME PASS` | Dikirim via pesan WhatsApp terformat dan muncul di dashboard fotografer. |
| **11**| Sistem membedakan status *"Menunggu Konfirmasi"* dari *"Selesai"*? | **YA** | `RUNTIME PASS` | Status `'Menunggu Konfirmasi Pembayaran'` memiliki warna, ikon, dan tombol aksi berbeda. |
| **12**| Klien bisa memanipulasi harga/kuota melalui request API? | **PARSIAL (ADA CELAH)** | `SECURITY AUDIT FINDING` | Klien **tidak bisa** mengubah nilai `ExtraPrice` atau `Max Foto` di DB, tetapi **bisa** mengirim status `'Selesai'` langsung via request API mentah. |

---

## 5. Hasil Uji Simulasi Lokal (`test/phase56r-upsell-audit.test.js`)

Simulasi mesin seleksi klien dieksekusi dengan konfigurasi yang diminta:
- **Kuota Proyek:** 3 foto
- **Tarif Ekstra:** Rp15.000 / foto
- **Hasil Step-by-Step:**
  - Pilih 1 foto: 1 terpilih, ekstra 0, biaya Rp0 (`PASS`).
  - Pilih 2 foto: 2 terpilih, ekstra 0, biaya Rp0 (`PASS`).
  - Pilih 3 foto: 3 terpilih, ekstra 0, biaya Rp0 (`PASS`).
  - Pilih foto ke-4: konfirmasi muncul (+Rp15.000). Hasil: 4 terpilih, ekstra +1, total Rp15.000 (`PASS`).
  - Pilih foto ke-5: 5 terpilih, ekstra +2, total Rp30.000 (`PASS`).
  - Batalkan foto ke-5: 4 terpilih, ekstra +1, total Rp15.000 (`PASS`).
  - Batalkan foto ke-4: 3 terpilih, ekstra 0, total Rp0 (`PASS`).
  - Tolak konfirmasi biaya pada foto ke-4: seleksi dibatalkan, foto tetap 3 (`PASS`).
  - Proyek tanpa upsell (`extraPrice = 0`): foto ke-4 langsung diblokir `QUOTA_FULL` (`PASS`).
  - Submit 5 foto: status otomatis `'Menunggu Konfirmasi Pembayaran'`, total Rp30.000 (`PASS`).
  - Submit 3 foto: status otomatis `'Selesai'` (Lunas), total Rp0 (`PASS`).

---

## 6. Apakah Perlu Perbaikan Kode?

1. **Untuk Alur Normal (Pelanggan Biasa):**  
   **TIDAK MENDESAK.** Semua alur di antarmuka web klien, notifikasi WhatsApp, kalkulasi biaya, dan dashboard fotografer sudah berjalan normal dan rapi.
2. **Untuk Keamanan Backend (Hardening API):**  
   **YA, DISARANKAN PADA TAHAP HARDENING BERIKUTNYA.**  
   Menambahkan proteksi server-side pada `handleUpdateClientStatus` di `api/supabase.js` agar klien tidak bisa membypass alur pembayaran melalui direct HTTP API call.

---

## 7. Rekomendasi Implementasi Paling Aman (Untuk Tahap Berikutnya)

Jika Operator memutuskan untuk melakukan hardening pada fase berikutnya:
1. **Server-Side Status Guard:**
   Di `api/supabase.js` dalam `handleUpdateClientStatus`:
   ```javascript
   const extraPriceNum = Number(project.ExtraPrice) || 0;
   const countNum = cleanFiles.length;
   if (extraPriceNum > 0 && countNum > currentMax && payload.status === 'Selesai') {
     updateBody.Status = 'Menunggu Konfirmasi Pembayaran';
     updateBody['Status Client'] = 'Menunggu Konfirmasi Pembayaran';
   }
   ```
2. **Server-Side Quota Enforcement (Saat ExtraPrice == 0):**
   ```javascript
   if (extraPriceNum === 0 && cleanFiles.length > currentMax) {
     return error(res, `Jumlah foto terpilih (${cleanFiles.length}) melebihi kuota project (${currentMax}).`, 400);
   }
   ```
3. **Penyimpanan Snapshot Tagihan Ekstra:**
   Menyimpan nominal `TotalExtraFee` ke dalam database saat status menjadi `'Menunggu Konfirmasi Pembayaran'` agar fotografer dapat melihat angka persis tagihan langsung di tabel dashboard tanpa harus mengalikan manual.
