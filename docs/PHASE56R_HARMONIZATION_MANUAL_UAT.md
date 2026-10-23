# PANDUAN PENGUJIAN MANUAL (OPERATOR VISUAL UAT) — PHASE 5.6R
**Project:** Photo Selection / KMBC  
**Branch:** fix/phase-5.6r-ui-stabilization  
**Status Target:** READY FOR OPERATOR VISUAL RECHECK  
**Lingkungan Uji:** Local Sandbox Mock (`http://localhost:4173`)  
**Kebijakan:** STRICT NO-GO FOR PRODUCTION (Dilarang Git CLI / Dilarang Deploy)

---

## Prasyarat Sebelum Mulai
1. Pastikan server mock berjalan pada port 4173.
2. Buka peramban (Chrome / Edge / Firefox) dan arahkan ke:
   `http://localhost:4173/app.html`
3. Lakukan **Hard Refresh (`Ctrl + F5` atau `Cmd + Shift + R`)** untuk memastikan cache stylesheet `role-shell.css` terbaru dimuat secara sempurna.

---

## Rangkaian Pengujian Langkah demi Langkah

### Uji 1: Verifikasi Imunitas Grid View terhadap Metric Cards CSS (Task 1)
- [ ] **Langkah 1.1:** Login sebagai fotografer (`fotografer` / `password123`) atau buka tab **Projects**.
- [ ] **Langkah 1.2:** Di samping judul daftar proyek, beralih ke mode **Grid View** (ikon kotak 4).
- [ ] **Langkah 1.3:** Periksa kartu proyek:
  - Header kartu (bagian atas berlatar gelap tipis yang memuat tanggal dan badge status) harus terbentang penuh (**full-width**).
  - Elemen pertama kartu **TIDAK BOLEH** mengecil menjadi kotak berukuran 38x38px.
  - Tanggal berada di kiri dan badge status berada di kanan tanpa saling tumpang tindih.
- [ ] **Langkah 1.4:** Buka Developer Tools (`F12`), inspeksi kartu proyek (`#projectTableBody > div`):
  - Pastikan style `padding: 16px 14px !important` dan `align-items: center` dari `#admin-view #section-projects .grid>div` **TIDAK LAGI AKTIF** pada kartu proyek.
- [ ] **Langkah 1.5:** Lakukan beralih tampilan berulang kali (**List View** <-> **Grid View**). Pastikan List View tetap rapi dan tidak terjadi layout shift.
- [ ] **Langkah 1.6:** Uji responsivitas pada viewport:
  - Desktop 1440px & 1280px (2 kolom grid).
  - Tablet / Laptop 1024px.
  - Mobile 390px (1 kolom vertikal).

---

### Uji 2: Validasi State PRO & Banner Upgrade (Task 2)
- [ ] **Langkah 2.1: Fotografer dengan PRO Add-On Aktif:**
  - Login sebagai akun PRO aktif (misal user dummy dengan `isPremiumAddon: true` dan masa aktif valid).
  - Periksa sidebar kiri bawah: kartu **"Upgrade ke PRO" HARUS TERSEMBUNYI (HILANG)**.
  - Periksa topbar header: badge menampilkan **PRO PLAN (EXP: YYYY-MM-DD)** dengan ikon mahkota warna emas hangat.
- [ ] **Langkah 2.2: Fotografer Reguler / Demo / Expired PRO:**
  - Buka console browser (`F12`) dan simulasikan akun tanpa PRO:
    ```javascript
    currentUser.isPremiumAddon = false;
    currentUser.proExpiredAt = '2020-01-01'; // Expired
    checkLoginState();
    ```
  - Periksa sidebar kiri: kartu **"Upgrade ke PRO" HARUS MUNCUL**.
  - Topbar header: tidak menampilkan badge PRO PLAN, melainkan badge paket reguler atau demo.
- [ ] **Langkah 2.3: Anti-Falsy String Trap ("FALSE" / "false"):**
  - Di console browser, masukkan string "FALSE":
    ```javascript
    currentUser.isPremiumAddon = "FALSE";
    currentUser.isPro = "false";
    checkLoginState();
    ```
  - Pastikan kartu "Upgrade ke PRO" **TETAP MUNCUL** (tidak tertipu oleh string non-kosong).
- [ ] **Langkah 2.4: Pelanggan Core Lifetime tanpa Add-On PRO:**
  - Di console browser, masukkan data pelanggan lifetime inti:
    ```javascript
    currentUser.paket = "Lifetime";
    currentUser.expiredAt = "Lifetime";
    currentUser.isPremiumAddon = false;
    currentUser.isProLifetime = false;
    currentUser.proExpiredAt = null;
    checkLoginState();
    ```
  - Pastikan badge di topbar bertuliskan **LIFETIME (EXP: Lifetime)** dengan warna hijau lembut.
  - Pastikan kartu "Upgrade ke PRO" **TETAP MUNCUL** agar pelanggan dapat mengambil modul Add-On PRO.

---

### Uji 3: Keterbacaan Status Badge pada Tema Terang (Task 3)
- [ ] **Langkah 3.1:** Buka Theme Picker di header pojok kanan atas, pilih **Atelier Ivory**.
- [ ] **Langkah 3.2:** Buka tab **Projects** dan **Pantau Status Klien**.
- [ ] **Langkah 3.3:** Periksa seluruh varian status badge:
  - **Selesai (`.status-badge-green`):** Teks hijau tua `#1b6338` terbaca sangat kontras dan jelas di atas surface ivory terang.
  - **Sedang Memilih / Menunggu (`.status-badge-amber`):** Teks amber tua `#8a5a14` terbaca tajam dan tidak pudar.
  - **Belum Memilih / Demo (`.status-badge-slate`):** Teks abu-abu gelap `#4b5563` memiliki kontras tinggi.
  - **Admin / Info (`.status-badge-blue`):** Teks biru tegas `#1d4ed8` terbaca jelas.
- [ ] **Langkah 3.4:** Buka Theme Picker, pilih **Olive Heritage**.
  - Pastikan kelima badge di atas tetap mempertahankan kontras tinggi yang sama pada background bernuansa sage/olive.
- [ ] **Langkah 3.5:** Beralih kembali ke tema gelap (**Noir Champagne** & **Midnight Sapphire**).
  - Pastikan badge kembali ke palet lembut gelap (`#49be88`, `#eab565`, `#ee7979`, dll) tanpa menjadi neon.

---

### Uji 4: Keterbacaan Tipografi Panel Kanan "Mulai Cepat" (Task 4)
- [ ] **Langkah 4.1:** Periksa panel kanan "Mulai Cepat" di samping daftar proyek.
- [ ] **Langkah 4.2:** Pastikan deskripsi di bawah setiap langkah ("Upload folder foto mentah...", "Masukkan link folder Drive...", dll) menggunakan ukuran font **12px (`text-xs`)** yang nyaman dibaca dan tidak menyiksa mata.
- [ ] **Langkah 4.3:** Pastikan judul langkah berukuran sekitar **13px** dengan line-height yang seimbang.
- [ ] **Langkah 4.4:** Pastikan box "Butuh bantuan?" dan tombol "Hubungi Support" tampak proporsional dan tidak kebesaran.

---

### Uji 5: Verifikasi Kontrol Kolase (Task 5)
- [ ] **Langkah 5.1:** Buka menu **Kolase**.
- [ ] **Langkah 5.2: Format Kanvas:**
  - Klik berturut-turut: **Story 9:16**, **Feed 4:5**, **Square 1:1**, **Landscape 16:9**, dan **Custom**.
  - Pastikan tombol aktif mendapatkan border emas (`var(--gold)`) dan latar wash emas lembut.
- [ ] **Langkah 5.3: Jarak Antar Foto (Spacing):**
  - Periksa 3 tombol spacing aktual:
    1. **Rapat (0px)**
    2. **Normal (20px)**
    3. **Longgar (60px)**
  - Klik masing-masing tombol dan pastikan canvas kolase merespons dengan mengubah jarak foto.
- [ ] **Langkah 5.4: Ekspor Kolase:**
  - Pastikan tombol "Generate Kolase HD" memiliki gradient emas yang elegan.
  - Pastikan kalkulasi kanvas tidak mengalami eror.

---

## Rekapitulasi Keputusan UAT

Jika seluruh pengujian di atas terpenuhi dengan baik pada peramban operator:
1. Operator dapat menyetujui perubahan visual.
2. Operator melakukan commit berkas melalui **GitHub Desktop** pada branch `fix/phase-5.6r-ui-stabilization`.
3. Ingat: **DILARANG** melakukan git via CLI dan **DILARANG** melakukan deploy langsung.
