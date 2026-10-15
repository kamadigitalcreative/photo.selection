# PHOTO SELECTION — PHASE 5.0B
## REGRESSION BASELINE & TEST SUITE VERIFICATION REPORT
**Dokumen:** `docs/PHASE50B_REGRESSION_BASELINE.md`  
**Target:** Seluruh Suite Pengujian Lokal & Checklist Regresi Antarmuka  
**Status:** Terverifikasi 100% Lolos Uji Lokal (Zero Failure)  
**Baseline Produksi:** Phase 4.7.5 (Commit: `34570d5`)

---

## 1. Hasil Eksekusi Suite Pengujian Otomatis Lokal

Pengujian otomatis dijalankan secara ketat pada mesin lokal tanpa menyentuh jaringan produksi, database Supabase live, layanan email Google Apps Script, atau gateway Mayar. Seluruh operasi eksternal dimock secara aman di memori.

### Ringkasan Hasil Pengujian:
```
======================================================================
TOTAL SUITE TEST SUMMARY: 100 PASSED | 0 FAILED | 13 NOT RUN
======================================================================
1. security-and-regression.test.js : 25 PASSED | 0 FAILED | 11 NOT RUN
2. mayar-webhook-audit.test.js     : 75 PASSED | 0 FAILED |  2 NOT RUN
======================================================================
```

---

## 2. Rincian Eksekusi Test Suite 1: `security-and-regression.test.js`

- **Perintah Eksekusi:** `node test/security-and-regression.test.js`
- **Waktu Eksekusi:** < 1 detik
- **Hasil:** **25 PASSED | 0 FAILED | 11 NOT RUN**

### Cakupan Pengujian (Yang Dicakup):
1. **CORS & Origin Security (Test 1–6):** Memvalidasi domain produksi yang diizinkan (`ps.kamacreative.my.id`), preview Vercel, penolakan domain pihak ketiga yang tidak sah (403), origin malformed, handling OPTIONS preflight (204/403), dan panggilan server-to-server tanpa header Origin.
2. **Envelope & Parsing (Test 7–8):** Validasi JSON standar, penolakan payload malformed atau array kosong (400).
3. **Proteksi Otorisasi Akun & Sesi (Test 9–12):** Penolakan mutasi akun tanpa sesi (401), penolakan fotografer A mengubah proyek fotografer B (403), validasi sesi galeri klien (`clientAccessToken`), penolakan sesi klien tidak valid (403).
4. **Keamanan OTP & Anti-Brute-Force (Test 13–14):** Enforcing cooldown 60 detik antar pengiriman OTP, penguncian akun setelah 5 kali gagal verifikasi OTP.
5. **Autentikasi Webhook Mayar (Test 15):** Penolakan signature webhook palsu/tanpa token (401), penerimaan signature valid (200).
6. **Integritas Database (Test 16–17):** Memastikan tidak ada penulisan data jika request ditolak, 16 panggilan backend terbukti tertangkap di mock.
7. **Application Invariants & Regression Gates (Test REG-1 – REG-8):**
   - `REG-1`: Memvalidasi integritas `vercel.json` (headers keamanan, rewrite rules, maxDuration).
   - `REG-2`: **Memvalidasi jumlah tag script pada `app.html` (tepat 12 tag: 6 eksternal, 6 inline)**.
   - `REG-3`: Memvalidasi sintaks seluruh 6 script inline `app.html` bebas error sintaks.
   - `REG-4`: Memvalidasi struktur 29 template Collage PRO bawaan sistem.
   - `REG-5`: Memastikan tidak ada referensi usang `folder.subfolders`.
   - `REG-6`: Memvalidasi format payload seleksi foto `{n, f, u, c}` dan batas kuota foto 999.999.
   - `REG-7`: Memvalidasi integrasi ekspor handler pada `api/bridge.js` dan `api/supabase.js`.
   - `REG-8`: Memvalidasi proteksi anti-DevTools Phase 4.7.4 (tanpa debugger timing loops, tanpa body wipeout).

### Yang TIDAK Dicakup & Alasan NOT RUN (Test 18–28):
- **11 Pengujian Distributed Rate Limiting ditandai `NOT RUN`:** Pengujian ini membutuhkan infrastruktur rate-limiting terdistribusi (Redis / Upstash / Supabase RPC counter). Karena arsitektur saat ini menggunakan serverless stateless murni tanpa Redis terpasang, suite ini dengan benar dilewati (*skipped by design*) agar tidak memicu kegagalan palsu (*false failure*).

---

## 3. Rincian Eksekusi Test Suite 2: `mayar-webhook-audit.test.js`

- **Perintah Eksekusi:** `node test/mayar-webhook-audit.test.js`
- **Waktu Eksekusi:** ~2 detik
- **Hasil:** **75 PASSED | 0 FAILED | 2 NOT VERIFIED / NOT RUN**

### Cakupan Pengujian (Yang Dicakup):
1. **Pemisahan Identitas Shared Email (Test 37–38, 46):** Admin dan Fotografer yang berbagi alamat email yang sama dapat melakukan reset password secara independen dengan menyertakan username; akun saudara tidak ikut termutasi.
2. **Validasi Finansial & Fail-Closed (Test 39–45, 51–52):** Event tanpa status atau nominal dibuang; pembayaran nominal Rp0 atau diskon tidak terverifikasi ditahan di antrean rekonsiliasi manual; mata uang asing (USD) ditolak; pembayaran arbitrer Rp1 gagal aman (*fail-closed*).
3. **Decoupling PRO Entitlements (Test 47–50, 53–56, 60–62):** Pembelian Add-On PRO 1 Tahun memberikan hak PRO 365 hari tanpa mengubah paket dasar atau `ExpiredAt`; pembaruan menumpuk durasi; hak Lifetime tidak ter-downgrade; fotografer non-PRO diblokir dari membuat proyek dengan watermark, upsell, atau musik latar (403); galeri yang sudah terpublikasi tetap dapat diakses klien saat masa aktif PRO habis.
4. **Isolasi Produk Toko Non-Aplikasi (Test 57–58):** Pembelian produk non-Photo Selection (misal membership lain) dicatat sebagai store sale tanpa mengaktifkan akun.
5. **Idempotensi Pembayaran Historis & Baru (Test 63–67, 69, 71–77):** 
   - Transaksi historis bertanda `HISTORICAL_SETTLED` yang dikirim ulang oleh Mayar dilewati tanpa perpanjangan tambahan (*zero extension*).
   - Pengiriman ganda untuk transaksi baru diproses persis satu kali via RPC; duplikat ditolak secara atomik.
   - Akun Demo yang membayar paket langsung dikonversi ke role `Photographer`.

### Yang TIDAK Dicakup (Batasan Mock):
- Test ini menggunakan database tiruan in-memory (`mockDb`). Test ini **tidak menguji** performa latensi jaringan rill, locking transaksi level baris PostgreSQL Supabase sesungguhnya, atau kendala firewall browser klien.

---

## 4. Evaluasi Berkas Uji SQL (Mengapa Tidak Dijalankan)

Di dalam folder `test/` dan `supabase/migrations/` terdapat sejumlah berkas SQL:
- `test/concurrency-setup.sql` & `test/concurrency-teardown.sql`
- `test/concurrent-postgresql-sessions.sql`, `test/concurrent-session1.sql`, `test/concurrent-session2.sql`
- `test/isolated-postgresql-runner.sql`
- `test/phase475_release_preflight_READ_ONLY.sql`

**Status:** **NOT RUN (DILARANG DIJALANKAN)**  
**Alasan Keamanan:** Skrip-skrip di atas dirancang untuk dijalankan via psql CLI langsung ke instance PostgreSQL. Karena instance PostgreSQL yang tersedia adalah **Supabase Produksi Aktif**, menjalankan skrip konkurensi atau teardown lokal berisiko mengunci (*deadlock*) atau menghapus tabel transaksi riil. Semua berkas ini dibekukan (*frozen*).

---

## 5. Checklist Regresi Manual Antarmuka (Browser Testing Matrix)

Sebelum dan sesudah implementasi fisik refaktoring dimulai, checklist berikut wajib diverifikasi secara manual oleh Operator di browser:

### A. Role: ADMIN
- [ ] **Login Admin:** Masuk menggunakan username & password Admin. Pastikan sesi tersimpan di storage dan mengarah ke dashboard.
- [ ] **Overview Analytics:** Membuka tab Dashboard. Pastikan angka kartu metrik (Total Project, Total Fotografer, Expired) dan grafik Chart.js tampil normal.
- [ ] **Kelola Fotografer:** Membuka tab Tim/Fotografer. Pastikan daftar user muncul, tombol *Approve* berfungsi, dan modal perpanjang masa aktif tampil.
- [ ] **Laporan Feedback:** Membuka tab Feedback. Memastikan pesan feedback dari fotografer terbaca dan form balasan aktif.
- [ ] **Branding Global:** Membuka modal pengaturan Settings. Memastikan nama brand dan preview logo terpasang.

### B. Role: PHOTOGRAPHER
- [ ] **Login Fotografer:** Masuk menggunakan akun fotografer aktif. Pastikan hanya menu fotografer yang tampil (tanpa tab kelola tim).
- [ ] **Projects Overview:** Membuka tab Projects. Memastikan filter 'Semua', 'Menunggu Klien', dan 'Selesai' berfungsi memfilter tabel.
- [ ] **Pembuatan Proyek:** Klik "Buat Project Baru". Memasukkan Link Google Drive publik. Pastikan sistem berhasil membaca jumlah foto tanpa OAuth.
- [ ] **Fitur PRO Watermark:** Mengaktifkan opsi watermark pada proyek (untuk user berhak PRO). Memastikan status watermark tersimpan di DB.
- [ ] **Fitur PRO Multi-Kategori & Musik:** Mengisi kuota kategori dan tautan MP3. Memastikan validasi form berjalan.
- [ ] **Sortir Lokal (RAW):** Membuka tab Sortir Lokal. Menempelkan list foto dan memilih folder lokal. Memastikan proses pencocokan nama file dan kompresi ZIP berhasil.
- [ ] **Collage PRO Maker:** Membuka tab Kolase. Memilih proyek, mengatur rasio (Story/Feed/Landscape), menyusun template Smart Auto, dan mengunduh gambar resolusi tinggi.

### C. Role: CLIENT (Klien Galeri)
- [ ] **Tautan Galeri Terbuka:** Membuka link galeri tanpa password (`app.html?token=...`). Pastikan foto termuat lancar dari CDN Google.
- [ ] **Tautan Galeri Berpassword:** Membuka link berpassword. Memastikan layar kunci muncul dan password benar dapat membuka galeri.
- [ ] **Interaksi Pemilihan Foto:** Mengklik foto untuk memilih/batal memilih. Memastikan angka counter "Terpilih: X / Max" bertambah dan menolak jika melampaui kuota.
- [ ] **Catatan Per Foto:** Mengisi catatan revisi pada foto tertentu.
- [ ] **Submit Pilihan:** Mengklik tombol "Selesai". Memastikan status berubah menjadi 'Selesai' dan tombol WhatsApp membuka chat dengan daftar nama file yang rapi.
- [ ] **Tampilan Mobile:** Membuka galeri di layar smartphone (viewport 375px–414px). Memastikan grid foto adaptif dan tombol navigasi sticky tidak menutupi foto.

### D. LANDING PAGE (`index.html`)
- [ ] **Navigasi Header:** Mengklik menu 'Cara Kerja', 'Fitur', 'Investasi', 'FAQ' memicu smooth scroll ke section yang tepat.
- [ ] **CTA Masuk & Daftar:** Tombol "Masuk" mengarah ke `app.html?auth=login`, tombol "Daftar" mengarah ke `app.html?auth=register`.
- [ ] **Tombol Harga:** Keempat tombol pada kartu paket harga (Gratis, 1 Bulan, 1 Tahun, 6 Bulan) mengarah ke form pendaftaran dengan benar.
- [ ] **Menu Mobile:** Membuka burger menu di layar mobile, memastikan drawer menu terbuka dan tombol CTA terlihat.
- [ ] **Deteksi Redirect Klien:** Mengakses `index.html?c=TOKEN123` di browser, memastikan seketika dialihkan (*redirect*) ke `app.html?c=TOKEN123`.

### E. KEAMANAN & INTEGRITAS
- [ ] **Separation of Concerns:** Memastikan akun fotografer yang mencoba mengakses `/admin/dashboard` langsung ditolak atau dialihkan.
- [ ] **Shared Email Login:** Memastikan akun Admin dan Fotografer yang menggunakan email sama tidak tertukar sesi loginnya saat memasukkan username masing-masing.
- [ ] **Idempotensi Pembayaran:** Memastikan webhooks Mayar tidak dapat dipicu secara publik tanpa signature valid.
