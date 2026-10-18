# DOKUMEN KESIAPAN RILIS & PANDUAN MANUAL UAT — PHASE 5.5
### THE ATELIER COLLECTION — PRODUCTION RELEASE READINESS & SAFETY GATES

**Proyek:** Photo Selection  
**Domain Produksi:** [https://ps.kamacreative.my.id](https://ps.kamacreative.my.id/)  
**Active Development Branch:** `test/phase-5.5-browser-uat`  
**Parent Branch:** `test/phase-5.4-combined-uat`  
**Status Evaluasi:** **HOLD — MENUNGGU VERIFIKASI MANUAL OPERATOR**  

---

## 1. PANDUAN VERIFIKASI MANUAL OPERATOR DI BROWSER LOKAL

Server mock terisolasi telah aktif berjalan di latar belakang pada:
👉 **URL Server Lokal:** `http://127.0.0.1:4173`

Operator dapat membuka Google Chrome, Microsoft Edge, atau Safari di komputer lokal dan menjalankan checklist berikut:

### A. UAT Galeri Klien (Prioritas 1)
1. **Buka URL:** `http://127.0.0.1:4173/app.html?token=dummy-client-token`
2. **Layar PIN:** Masukkan PIN `1234`, lalu klik tombol **Unlock Gallery**.
3. **Pemuatan Galeri:**
   - Judul proyek menampilkan *"Siti & Budi Wedding"*.
   - Kuota menampilkan *"Maksimal: 3 Foto"*.
   - Ter-render tepat 5 kartu foto sampel.
4. **Alur Seleksi & Deseleksi:**
   - Klik tombol **Pilih** pada Foto 1 -> Cincin emas muncul, counter menjadi `1`.
   - Klik tombol **Pilih** pada Foto 2 -> Counter menjadi `2`.
   - Klik tombol **Batal** pada Foto 1 -> Cincin emas Foto 1 hilang, counter turun ke `1`.
   - Pilih kembali Foto 1 dan Foto 3 -> Counter menjadi `3 / 3` (Kuota penuh).
5. **Penegakan Batas Kuota:**
   - Klik tombol **Pilih** pada Foto 4 -> Muncul dialog SweetAlert *"Batas Maksimal Tercapai"*. Seleksi ditolak, counter tetap `3`.
6. **Lightbox & Preview:**
   - Klik ikon preview pada foto -> Modal lightbox layar penuh terbuka.
   - Klik tombol panah kanan / kiri -> Foto berganti mulus.
   - Klik tombol silang `x` -> Lightbox menutup rapi.
7. **Ringkasan Seleksi:**
   - Klik bilah aksi bawah -> Modal ringkasan foto terpilih terbuka.
   - Klik tombol konfirmasi pengiriman -> Dialog WhatsApp muncul tanpa ada request yang dikirim ke internet luar.

### B. UAT Ruang Kerja Fotografer (Prioritas 2)
1. **Buka URL:** `http://127.0.0.1:4173/app.html?auth=login`
2. **Login Fotografer:**
   - Masukkan username `kama_photographer` (password sembarang, misal `password`).
   - Klik **Login** -> Masuk ke dashboard Fotografer.
3. **Pemeriksaan Hak Akses & Menu:**
   - Menu khusus Admin otomatis tersembunyi (`display: none !important`).
   - Tab **Projects** menampilkan 2 proyek dummy ("Siti & Budi", "Annisa & Dimas").
   - Badge paket menampilkan warna emas champagne (Akun PRO 1 Tahun).
   - Buka tombol **Buat Project Baru** -> Modal terbuka, lalu tutup tanpa submit.
   - Klik tab **Pantau Klien** -> Seksi status pemantauan terbuka rapi.

### C. UAT Ruang Kerja Admin (Prioritas 3)
1. **Buka URL:** `http://127.0.0.1:4173/app.html?auth=login`
2. **Login Admin:**
   - Masukkan username `admin_atelier` (password sembarang).
   - Klik **Login** -> Masuk ke dashboard Admin.
3. **Pemeriksaan Antarmuka Admin:**
   - Tab menu Admin (Dashboard, Fotografer, Settings) tampil lengkap.
   - Tabel pengguna menampilkan 4 baris akun dengan badge berbeda:
     - Admin: Ungu Indigo
     - PRO: Emas Champagne
     - Reguler: Biru
     - Demo: Abu-abu Netral
   - Grafik analitik `#trafficChart` dan `#userStatusChart` ter-render rapi.

---

## 2. CHECKLIST KELAYAKAN RILIS PRODUKSI (PRE-RELEASE GATES)

| No | Gerbang Validasi (Gate) | Status Hasil | Penanggung Jawab |
| :---: | :--- | :---: | :---: |
| 1 | **Zero Production Code Mod** (Tidak ada perubahan kode bisnis) | **TERPENUHI (100%)** | AI Auditor |
| 2 | **Security & Regression Gate** (25 PASS / 0 FAIL) | **TERPENUHI (100%)** | AI Auditor |
| 3 | **Mayar Webhook Audit Gate** (75 PASS / 0 FAIL) | **TERPENUHI (100%)** | AI Auditor |
| 4 | **Structural UI Scoping Gate** (59 STATIC VERIFIED) | **TERPENUHI (100%)** | AI Auditor |
| 5 | **Runtime Logic Math Gate** (8 RUNTIME PASS) | **TERPENUHI (100%)** | AI Auditor |
| 6 | **Mock Isolation Integrity** (10 ISOLATION PASS) | **TERPENUHI (100%)** | AI Auditor |
| 7 | **Manual Operator UAT Verification** | **PENDING** | Operator |
| 8 | **GitHub Desktop Merge Review** | **PENDING** | Operator |

---

## 3. RENCANA ROLLBACK (ROLLBACK PROCEDURE)

Jika setelah deployment ke Vercel ditemukan anomali perilaku visual atau operasional:
1. **Vercel Instant Rollback:**
   - Masuk ke Dashboard Vercel -> Buka deployment sebelumnya yang bertanda *Production*.
   - Klik menu **...** pada deployment stabil -> Pilih **Instant Rollback**.
   - Waktu pemulihan: < 30 detik (Zero downtime).
2. **Git Branch Revert:**
   - Pada GitHub Desktop, branch target dapat di-revert ke commit stabil sebelum penggabungan branch `test/phase-5.5-browser-uat`.

---

## 4. PROTOKOL MONITORING PASCA-RILIS (POST-DEPLOYMENT MONITORING)

Segera setelah operator melakukan rilis melalui GitHub Desktop:
1. **Pemeriksaan Webhook Mayar:**
   - Pantau log serverless function `/api/bridge` dan `api/supabase.js`.
   - Pastikan webhook masuk berstatus `200 OK` dan tidak ada `PRICE_MISMATCH_RECONCILIATION` pada transaksi normal.
2. **Pemeriksaan Konsistensi Cache:**
   - Lakukan *Hard Refresh* (`Ctrl + Shift + R`) pada halaman klien untuk memastikan stylesheet `auth-luxury.css` dan `client-gallery-luxury.css` versi `?v=5.3.0` dimuat bersih.
3. **Pemeriksaan Konsol Browser:**
   - Buka Developer Tools (F12) pada galeri klien live dan pastikan tidak ada `ReferenceError` atau `SyntaxError`.

---

## 5. KESIMPULAN REKOMENDASI RILIS

# **STATUS: HOLD**
*(Rilis ditahan sementara menunggu verifikasi manual 5-10 menit oleh Operator di browser lokal `http://127.0.0.1:4173`).*

Setelah Operator selesai menguji langsung di browser fisik dan menyatakan puas:
👉 Operator dapat mengubah status menjadi **GO FOR RELEASE REVIEW** dan melakukan merge via GitHub Desktop.
