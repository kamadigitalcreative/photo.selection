# PHOTO SELECTION — THE ATELIER COLLECTION
## PHASE 5.6 MANUAL UAT CHECKLIST UNTUK OPERATOR
**Panduan Verifikasi Visual & Interaktif Langsung di Browser Lokal**

Server mock terisolasi saat ini **SEDANG AKTIF BERJALAN** di latar belakang pada:
👉 **`http://127.0.0.1:4173`**

> [!IMPORTANT]
> **KEBIJAKAN JARINGAN & CSP SERVER MOCK:**  
> Server mock mengisolasi seluruh koneksi API backend melalui header *Content-Security-Policy* (`connect-src 'self' http://127.0.0.1:4173`). Seluruh permintaan API keluar ke Supabase, Mayar, Google Apps Script Mailer, dan WhatsApp diblokir ketat di level browser. Namun, browser masih dapat memuat aset statis CDN pihak ketiga tepercaya (seperti Google Fonts, Tailwind Play CDN, dan FontAwesome). Ini **bukan mode offline total**, melainkan isolasi ketat pada lapisan API dan mutasi data pelanggan nyata.

---

### INFORMASI KREDENSIAL & DATA MOCK AKTUAL
- **Port Server Mock:** `4173` (URL: `http://127.0.0.1:4173`)
- **Login Fotografer:**
  - Username: `kama_photographer` (atau `photographer@dummy.test`)
  - Password: `photographer123` (atau teks apa pun)
- **Login Admin:**
  - Username: `admin_atelier` (atau `admin@dummy.test`)
  - Password: `admin123` (atau teks apa pun)
- **PIN Galeri Klien:** `1234` atau `123456`
- **Token URL Klien:** `dummy-client-token`
- **Proyek Nyata dalam Mock:**
  1. **Siti & Budi Wedding** (Token: `dummy-client-token`, Status: `Sedang Memilih`, Kuota: 3 foto)
  2. **Annisa & Dimas Prewedding** (Token: `token-proj-2`, Status: `Selesai`, Kuota: 20 foto)

---

### SKENARIO 1: GALERI KLIEN (CLIENT GALLERY LUXURY)
Buka URL berikut di browser (Chrome / Edge):  
👉 **`http://127.0.0.1:4173/app.html?token=dummy-client-token`**

| No | Tindakan Operator | Hasil yang Diharapkan | Status |
| :---: | :--- | :--- | :---: |
| **1.1** | Masukkan PIN `1234` atau `123456` pada layar pembuka galeri. | Akses terbuka mulus ke proyek "Siti & Budi Wedding" dengan tema gelap Atelier Noir Champagne. | [ ] |
| **1.2** | Periksa bagian atas galeri klien. | Banner editorial "Curated Moments — The Final Selection" dan panduan 3 langkah visual (01 Eksplorasi -> 02 Pilih Favorit -> 03 Kirim) tampil anggun. | [ ] |
| **1.3** | Periksa kelima foto dummy pada kisi galeri. | Kelima thumbnail foto lokal termuat sempurna (`naturalWidth > 0`), zero gambar rusak atau placeholder error. | [ ] |
| **1.4** | Verifikasi pencegahan error loop gambar. | Jika ada foto yang gagal, handler gambar menggunakan single-attempt local SVG fallback (`this.onerror = null`) sehingga tidak ada request berulang ke placehold.co atau error loop di konsol. | [ ] |
| **1.5** | Klik ikon **Hati** di pojok kanan atas foto pertama dan kedua. | Kartu foto mendapatkan border emas bercahaya, ikon hati menjadi emas penuh dengan status aksesibilitas (`aria-checked="true"`), dan counter di dock bawah menunjukkan `2 / 3 Foto Terpilih`. | [ ] |
| **1.6** | Sinkronisasi tombol kartu: Periksa tombol di bawah nama foto. | Label tombol kartu berubah secara akurat menjadi "Batal" (Deselect) dengan class `btn-pilih-foto`. | [ ] |
| **1.7** | Aksesibilitas Keyboard: Navigasi tombol hati dengan tombol Tab dan tekan Enter atau Spasi. | Pilihan foto berganti (toggle) secara mulus via keyboard tanpa membuka viewer modal. | [ ] |
| **1.8** | Klik ikon **Hati** pada foto yang sudah terpilih untuk membatalkan. | Kartu kembali ke status normal, border emas hilang, label tombol kembali menjadi "Pilih", dan counter berkurang menjadi `1 / 3 Foto Terpilih`. | [ ] |
| **1.9** | Pilih 3 foto hingga mencapai kuota maksimal, lalu coba pilih foto ke-4. | Sistem menampilkan peringatan ramah bahwa kuota maksimal (3 foto) telah tercapai. | [ ] |
| **1.10**| Klik pada badan gambar untuk membuka mode Lightbox. | Lightbox terbuka dengan latar belakang gelap, tombol navigasi kiri/kanan responsif, dan tombol pilih di dalam lightbox berfungsi. | [ ] |
| **1.11**| Klik tombol **Pratinjau** di floating dock bawah. | Modal ringkasan seleksi terbuka menampilkan foto-foto yang telah dipilih. | [ ] |
| **1.12**| Buka DevTools (F12) -> Device Toolbar -> Pilih iPhone 12/14 (390px) atau 375px. | Mode `.adaptive-grid` maupun `.gallery-grid` otomatis menyusun tata letak 2-kolom rapi, touch target tombol hati berukuran luas (>= 44x44px), teks proporsional, dan bottom action dock tetap menempel tanpa overflow horizontal. | [ ] |

---

### SKENARIO 2: WORKSPACE FOTOGRAFER (PHOTOGRAPHER DASHBOARD)
Buka URL berikut di browser:  
👉 **`http://127.0.0.1:4173/app.html`**

| No | Tindakan Operator | Hasil yang Diharapkan | Status |
| :---: | :--- | :--- | :---: |
| **2.1** | Masuk dengan Username: `kama_photographer` dan Password: `photographer123`. | Masuk ke antarmuka Fotografer tanpa SweetAlert error kosong; profil terisi `Kama Photographer` dengan paket `1 Tahun`. | [ ] |
| **2.2** | Periksa navigasi sidebar kiri (Desktop). | Mark logo 'S' emas gradien (`sidebar-mark`), tipografi serif nama studio, dan tab navigasi dengan border aktif emas tampil rapi. | [ ] |
| **2.3** | Periksa banner editorial di atas daftar proyek. | Banner `.photographer-hero` "The Atelier Collection — Sistem Kurasi Foto Mewah" tampil dengan tombol emas `+ Buat Project Baru`. | [ ] |
| **2.4** | Periksa 4 kartu metrik proyek. | Kartu metrik bergaya `.stat-card` dengan ikon emas 38px, angka metrik serif besar, dan label uppercase mikro. | [ ] |
| **2.5** | Periksa kartu proyek di bawahnya. | Tampil 2 proyek dummy nyata: **Siti & Budi Wedding** dan **Annisa & Dimas Prewedding** dengan gaya kartu Atelier Noir, border halus 1px, dan badge status pil yang elegan. | [ ] |
| **2.6** | Klik tombol emas **+ Buat Project Baru**. | Modal pembuatan proyek `#modalCreate` terbuka dengan gaya panel gelap mewah dan input beraksen emas. Klik Batal untuk menutup. | [ ] |
| **2.7** | Ketik "Siti" atau "Annisa" di kolom pencarian proyek. | Daftar proyek tersaring secara instan menampilkan proyek yang dicari. | [ ] |
| **2.8** | Klik menu navigasi **Pantau Klien**. | Seksi Pantau Klien terbuka dengan kartu status proyek "Siti & Budi Wedding" yang sedang berjalan. | [ ] |
| **2.9** | Kecilkan layar ke lebar 390px lalu klik ikon hamburger menu di header. | Drawer navigasi mobile (`mobile-sidebar`) bergeser halus dari kiri (slide-in) dengan mark logo 'S' emas. | [ ] |
| **2.10**| Tekan tombol F5 (Refresh) di browser. | Sesi login fotografer tetap terjaga mulus tanpa `ReferenceError: isDemo is not defined`. | [ ] |

---

### SKENARIO 3: WORKSPACE ADMIN (ADMIN CONSOLE)
Pada halaman `http://127.0.0.1:4173/app.html`:

| No | Tindakan Operator | Hasil yang Diharapkan | Status |
| :---: | :--- | :--- | :---: |
| **3.1** | Buka menu Akun -> Klik **Logout**, lalu login dengan Username: `admin_atelier` dan Password: `admin123`. | Masuk ke antarmuka Admin Console dengan hak akses administratif penuh. | [ ] |
| **3.2** | Periksa navigasi sidebar kiri. | Menu khusus Admin tampil (Dashboard Admin, Manajemen Tim/User, Laporan) ditandai dengan aksen sapphire/indigo halus. | [ ] |
| **3.3** | Periksa banner konsol admin. | Banner `.admin-hero` "Studio Governance & Analytics" tampil dengan tombol pintas `Kelola Fotografer` dan `Status PRO & Add-on`. | [ ] |
| **3.4** | Buka menu **Dashboard Admin**. | Grafik Chart.js analitik tampil rapi di dalam panel berbatas garis emas tipis. | [ ] |
| **3.5** | Klik menu **Manajemen Tim / Fotografer**. | Tabel pengguna termuat dengan header gelap elegan, teks uppercase berjarak huruf lebar, dan badge status pil berwarna tegas (Admin, PRO, Reguler, Demo). | [ ] |
| **3.6** | Verifikasi isolasi keamanan tampilan. | Saat logout dan masuk kembali sebagai fotografer, pastikan seluruh menu admin tersembunyi sempurna (`display: none !important`). | [ ] |

---

### KESIMPULAN EVALUASI OPERATOR
Setelah menyelesaikan pengujian manual di atas, laporkan hasil evaluasi visual atau detail penyempurnaan mikro jika ada sebelum penggabungan ke branch utama (merge).
