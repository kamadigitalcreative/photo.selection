# PHOTO SELECTION — PHASE 5.6R MANUAL UAT CHECKLIST
**Panduan Verifikasi Browser Nyata untuk Operator**
**Status Evaluasi:** STRICT NO-GO (Membutuhkan Verifikasi Manual Operator)
**URL Mock Server Lokal:** `http://127.0.0.1:4173`

---

## 1. PERSIAPAN LINGKUNGAN PENGUJIAN

1. Pastikan cabang aktif di **GitHub Desktop** adalah `fix/phase-5.6r-ui-stabilization`.
2. Pastikan server mock lokal berjalan di port 4173:
   ```bash
   node test/phase55-browser-uat.js
   ```
   *(Jika terminal menampilkan: `Server mock sudah aktif berjalan pada port 4173`, server siap digunakan).*
3. Buka browser (Google Chrome, Edge, atau Safari) dan buka `http://127.0.0.1:4173`.
4. Jika ingin membuka Developer Tools (Console/Network), gunakan:
   `Menu Browser (titik tiga) -> More Tools / Alat Lainnya -> Developer Tools`.

---

## 2. DAFTAR PERIKSA SKENARIO UAT MANUAL

### SKENARIO A — ADMIN DASHBOARD & KONTROL SISTEM
- **URL Akses:** `http://127.0.0.1:4173/app.html`
- **Kredensial Login:**
  - Username: `admin_atelier`
  - Password: `any_password` (mock menerima kredensial apapun)

| No | Langkah Pengujian | Hasil yang Diharapkan | Status Operator |
|---|---|---|---|
| A01 | Klik tombol **Login** sebagai Admin | Masuk ke Admin Dashboard **tanpa muncul pop-up SweetAlert error** | [ ] PASS / [ ] FAIL |
| A02 | Periksa Avatar Profil di kanan atas header | Menampilkan ikon profil SVG emas lokal yang tajam, tidak ada ikon gambar pecah | [ ] PASS / [ ] FAIL |
| A03 | Periksa Nama Studio pada sidebar kiri | Nama studio (misal: "The Atelier Collection") tampil proporsional tanpa terpotong kaku | [ ] PASS / [ ] FAIL |
| A04 | Periksa Bagian Bawah Sidebar Kiri | Kartu "Upgrade ke PRO" **tersembunyi** (tidak tampil untuk peran Admin) | [ ] PASS / [ ] FAIL |
| A05 | Periksa Banner Admin Hero | Teks fungsional: "RINGKASAN SISTEM", "Ringkasan & Analitik Sistem", tidak ada copy promosi | [ ] PASS / [ ] FAIL |
| A06 | Periksa Kontras Teks Tabel Fotografer (Dark Mode) | Teks nama fotografer, email, paket, dan status terbaca sangat jelas (kontras tinggi) | [ ] PASS / [ ] FAIL |
| A07 | Periksa Grafik Analitik (Chart.js) | Sumbu X dan Y terbaca jelas, garis grid halus, tidak ada error di Console | [ ] PASS / [ ] FAIL |
| A08 | Periksa Widget Sumber Trafik & Meta Ads | Menampilkan badge "Pelacakan UTM & Trafik" yang tenang dan informatif | [ ] PASS / [ ] FAIL |

---

### SKENARIO B — WORKSPACE FOTOGRAFER
- **Kredensial Login:**
  - Klik tombol Logout di kanan atas header
  - Login dengan Username: `kama_photographer`
  - Password: `any_password`

| No | Langkah Pengujian | Hasil yang Diharapkan | Status Operator |
|---|---|---|---|
| B01 | Masuk ke Workspace Fotografer | Menampilkan tab Daftar Proyek dan Pantau Klien | [ ] PASS / [ ] FAIL |
| B02 | Periksa Banner Fotografer Hero | Teks fungsional: "DAFTAR PROYEK SAYA", "Manajemen Proyek Foto" | [ ] PASS / [ ] FAIL |
| B03 | Periksa Sidebar Bawah Fotografer | Kartu "Upgrade ke PRO" tampil dengan copy operasional yang rapi | [ ] PASS / [ ] FAIL |
| B04 | Periksa Daftar Proyek (Mock Data) | Proyek "Siti & Budi Wedding" dan "Annisa & Dimas Prewedding" tampil dengan kontras jelas | [ ] PASS / [ ] FAIL |
| B05 | Toggle Mode Gelap / Terang (Sakelar Tema) | Kontras teks dan background beralih mulus tanpa ada elemen yang tidak terbaca | [ ] PASS / [ ] FAIL |

---

### SKENARIO C — GALERI SELEKSI KLIEN (DESKTOP & MOBILE)
- **URL Akses Galeri Klien:** `http://127.0.0.1:4173/app.html?token=dummy-client-token`
- **PIN Galeri:** `1234` atau `123456`

| No | Langkah Pengujian | Hasil yang Diharapkan | Status Operator |
|---|---|---|---|
| C01 | Buka URL Galeri Klien | Muncul layar kunci PIN dengan logo/nama studio yang elegan | [ ] PASS / [ ] FAIL |
| C02 | Masukkan PIN `1234` dan tekan Buka Galeri | Galeri terbuka menampilkan 5 foto sampel uji | [ ] PASS / [ ] FAIL |
| C03 | Periksa Banner Galeri Klien | Judul fungsional: "Pilih Foto Favorit Anda", branding dinamis | [ ] PASS / [ ] FAIL |
| C04 | Pilih Foto via Tombol Hati (Klik Mouse) | Foto terpilih: border emas champagne, badge hati aktif, counter kuota bertambah (1/3) | [ ] PASS / [ ] FAIL |
| C05 | Pilih Foto via Keyboard (Fokus tombol hati + Tekan Space/Enter) | Foto terpilih **tepat 1 kali** (tidak terjadi toggle ganda atau batal pilih otomatis) | [ ] PASS / [ ] FAIL |
| C06 | Klik Thumbnail Foto (Area Gambar) | Membuka lightbox preview perbesaran gambar (tidak mengubah status pilihan foto) | [ ] PASS / [ ] FAIL |
| C07 | Uji Responsivitas Mobile (Inspect -> Responsive View 375px/390px) | Galeri tampil dalam susunan 2 kolom rapi tanpa horizontal scrollbar bocor | [ ] PASS / [ ] FAIL |
| C08 | Periksa Network Tab di DevTools | Tidak ada pemanggilan berulang ke `placehold.co` atau loop error gambar | [ ] PASS / [ ] FAIL |

---

## 3. FORMULIR KEPUTUSAN OPERATOR

Setelah menyelesaikan checklist di atas, tentukan keputusan rilis:

- [ ] **GO (LULUS UAT):** Seluruh 10 temuan terverifikasi tuntas. Cabang `fix/phase-5.6r-ui-stabilization` siap di-commit dan di-merge melalui GitHub Desktop.
- [ ] **NO-GO (PERLU PERBAIKAN LANJUTAN):** Masih ditemukan anomali visual/fungsional. Catat nomor skenario dan deskripsi masalah di bawah ini:

**Catatan Operator:**
```text
____________________________________________________________________________________
____________________________________________________________________________________
```
