# PHOTO SELECTION / KMBC — PHASE 5.6R MANUAL UAT CHECKLIST
**Panduan Verifikasi Browser Interaktif Operator (Local Mock Environment)**
**Target URL:** `http://127.0.0.1:4173/app.html`
**Status Gerbang:** STRICT NO-GO / OPERATOR REVIEW REQUIRED
**Browser Rekomendasi:** Google Chrome / Microsoft Edge / Safari / Firefox
**Resolusi Viewport:** Desktop (1440x900, 1280x800), Tablet (768x1024), Mobile (390x844, 375x667)

---

## PETUNJUK PERSIAPAN LOKAL BAGI OPERATOR

1. Buka terminal di direktori proyek: `d:\FILE GITHUB\photo.selection`
2. Jalankan server mock terisolasi:
   ```bash
   node test/phase55-browser-uat.js
   ```
   *(Pastikan terminal menampilkan log: `Server mock aktif pada http://127.0.0.1:4173`)*
3. Buka browser pada mode *Incognito* / *Private Window* menuju:
   `http://127.0.0.1:4173/app.html`
4. Lakukan pengetesan secara runut sesuai checklist bernomor di bawah ini.
5. Catat hasil pengamatan visual Anda pada kolom `STATUS OPERATOR`.

---

## A. AUTH & SESSION TESTING

| TEST ID | LANGKAH KLIK | EXPECTED RESULT | STATUS OPERATOR | CATATAN TEKNIS |
|:---|:---|:---|:---:|:---|
| **UAT-AUTH-01** | Buka `http://127.0.0.1:4173/app.html`. Amati tampilan form login awal. | Form login berlatar Atelier Noir Champagne, teks kontras tinggi, input memiliki border `#35363b`, tombol "Masuk" aksen emas champagne. | [ ] PASS / [ ] FAIL | Tidak ada elemen buram atau teks putih pada background putih. |
| **UAT-AUTH-02** | Klik tautan toggle "Daftar Akun Baru". | Formulir berganti ke pendaftaran fotografer tanpa reload halaman. Field Nama, Email, Password, dan Pilihan Paket tersusun rapi. | [ ] PASS / [ ] FAIL | Toggle halus, touch target >= 44px. |
| **UAT-AUTH-03** | Klik kembali tautan "Sudah punya akun? Masuk". | Formulir kembali ke form login dengan transisi instan. | [ ] PASS / [ ] FAIL | State form bersih. |
| **UAT-AUTH-04** | Masukkan Username: `admin`, Password: `password123`. Klik tombol "Masuk". | Berhasil masuk ke Admin Workspace. Sidebar menampilkan menu admin (`#tab-admin-dash`, `#tab-admin-users`). Avatar profil menampilkan inisial SVG champagne lokal. | [ ] PASS / [ ] FAIL | Zero modal error SweetAlert saat data dimuat. |
| **UAT-AUTH-05** | Klik tombol "Keluar" (Logout) pada bagian profil sidebar. | Sesi terhapus dari localStorage/sessionStorage. Halaman kembali ke login view secara bersih. | [ ] PASS / [ ] FAIL | Sesi admin ditutup sempurna. |
| **UAT-AUTH-06** | Masukkan Username: `fotografer`, Password: `password123`. Klik "Masuk". | Berhasil login sebagai Fotografer. Menu admin (Kelola Fotografer & Laporan) tersembunyi sepenuhnya. Muncul menu Proyek, Pantau Klien, Sortir Lokal, Kolase PRO. | [ ] PASS / [ ] FAIL | Isolasi role sempurna, tidak ada kebocoran menu. |
| **UAT-AUTH-07** | Tekan `F5` (Refresh halaman) saat berada di sesi Fotografer. | Sesi fotografer tetap aktif tanpa logout paksa, halaman langsung merender daftar proyek fotografer. | [ ] PASS / [ ] FAIL | Session persistence via local storage terverifikasi. |
| **UAT-AUTH-08** | Buka tab baru di browser menuju `http://127.0.0.1:4173/app.html`. | Sesi sinkron secara otomatis tanpa meminta login ulang. | [ ] PASS / [ ] FAIL | Multi-tab session sharing berjalan benar. |

---

## B. ADMIN WORKSPACE TESTING

| TEST ID | LANGKAH KLIK | EXPECTED RESULT | STATUS OPERATOR | CATATAN TEKNIS |
|:---|:---|:---|:---:|:---|
| **UAT-ADM-01** | Login sebagai `admin`. Buka tab **Dashboard**. | Hero judul bersih ("Ringkasan Performa & Operasional Studio"), 4 kartu statistik (Total Klien, Proyek Aktif, Penyimpanan, Pendapatan) berlatar `#17181b` dengan angka jelas. | [ ] PASS / [ ] FAIL | Angka statistik terbaca jelas dengan subteks kontras tinggi. |
| **UAT-ADM-02** | Periksa filter tanggal (Dari Tanggal - Sampai Tanggal). | Input tanggal berlatar gelap `#212226` dengan teks terang `#f4f0e9`, border `#35363b`. | [ ] PASS / [ ] FAIL | Tidak ada input background putih menyilaukan. |
| **UAT-ADM-03** | Periksa rendering grafik analitik (Traffic & Status). | Grafik Chart.js tampil dengan gridline subtle dan label teks terbaca. Tidak ada canvas rusak atau blank. | [ ] PASS / [ ] FAIL | Background canvas serasi dengan surface gelap. |
| **UAT-ADM-04** | Klik tab **Kelola Fotografer** pada sidebar. | Halaman beralih ke tabel manajemen tim. Header tabel (`th`) berlatar `#212226` dengan teks kapital `#c9c4bc`. | [ ] PASS / [ ] FAIL | Kontras header memenuhi standar WCAG AA. |
| **UAT-ADM-05** | Periksa setiap baris fotografer pada tabel. | Baris tabel berlatar `#17181b` (hover: `#212226`). Teks nama berwarna `#f4f0e9`, email `#c9c4bc`. Badge status: Hijau untuk Aktif, Kuning untuk Pending, Merah untuk Nonaktif. | [ ] PASS / [ ] FAIL | **KRITIS:** Memastikan teks baris terlihat 100% jelas (bukan teks putih di atas abu terang). |
| **UAT-ADM-06** | Ketik nama "fotografer" pada input pencarian pengguna. | Tabel menyaring data secara instan hanya menampilkan akun yang sesuai. | [ ] PASS / [ ] FAIL | Realtime filter berfungsi tanpa reload. |
| **UAT-ADM-07** | Pilih filter paket (Dropdown: "Semua", "1 Bulan", "PRO Lifetime"). | Filter menyaring daftar berdasarkan paket langganan yang dipilih. | [ ] PASS / [ ] FAIL | Select dropdown berlatar gelap dan teks terbaca. |
| **UAT-ADM-08** | Periksa tombol aksi pada kolom aksi (Set Aktif, Kirim Pengingat, Hapus). | Tombol aksi teratur rapi dengan ikon dan tooltip informatif. | [ ] PASS / [ ] FAIL | Tidak ada tombol yang menabrak batas kolom tabel. |

---

## C. PHOTOGRAPHER WORKSPACE TESTING

| TEST ID | LANGKAH KLIK | EXPECTED RESULT | STATUS OPERATOR | CATATAN TEKNIS |
|:---|:---|:---|:---:|:---|
| **UAT-PHO-01** | Login sebagai `fotografer`. Buka menu **Proyek**. Periksa **Project Grid View** (tampilan default). | Setiap kartu proyek tersusun proporsional dalam grid responsif: Header (Tanggal + Status), Body (Ikon Folder emas, Judul Proyek, Info Token/Hash, PIN badge, Progress bar), Footer (Toolbar aksi). | [ ] PASS / [ ] FAIL | **KRITIS:** Tidak ada box `-top-10` mengambang, tidak ada tombol bertabrakan, tidak ada kartu meluber. |
| **UAT-PHO-02** | Klik tombol toggle view **List** (ikon baris daftar). | Tampilan proyek beralih ke format baris rapi. Tombol toggle List aktif dengan highlight emas champagne. | [ ] PASS / [ ] FAIL | Transisi instan dan tidak merusak data proyek. |
| **UAT-PHO-03** | Klik tombol toggle view **Grid** kembali. Lakukan toggle 3 kali berturut-turut. | Tata letak stabil dan konsisten setiap kali berpindah antara List dan Grid. | [ ] PASS / [ ] FAIL | Memastikan tidak ada layout shift atau error DOM. |
| **UAT-PHO-04** | Ketik judul proyek pada search input proyek. | Daftar proyek menyaring secara instan sesuai kata kunci. | [ ] PASS / [ ] FAIL | Filter pencarian akurat. |
| **UAT-PHO-05** | Klik tombol **+ Buat Proyek Baru**. | Modal "Buat Proyek Baru" muncul di tengah layar dengan backdrop blur gelap. Form input (Judul, Tanggal, PIN, Kuota, Google Drive Link) terformat rapi. | [ ] PASS / [ ] FAIL | Form input berlatar `#212226` dengan teks `#f4f0e9`. |
| **UAT-PHO-06** | Klik tombol "Batal" atau ikon silang (X) pada modal. | Modal tertutup secara halus tanpa mengubah data proyek apapun. | [ ] PASS / [ ] FAIL | Close trigger berjalan lancar. |
| **UAT-PHO-07** | Pada kartu proyek pertama, klik tombol **Salin Link** (ikon copy). | Muncul notifikasi "Link berhasil disalin!" dan clipboard berisi URL galeri klien. | [ ] PASS / [ ] FAIL | Feedback visual instan. |
| **UAT-PHO-08** | Klik menu **Pantau Klien** pada sidebar. | Halaman status klien terbuka. Panel ringkasan progres, kartu klien aktif, dan log aktivitas tersusun dalam tema Atelier Noir Champagne yang harmonis. | [ ] PASS / [ ] FAIL | Warna progress bar dan teks status terbaca jelas. |
| **UAT-PHO-09** | Klik menu **Sortir Lokal** pada sidebar. | Area kerja Sortir File RAW lokal terbuka. Dropzone folder berlatar gelap `#17181b` dengan garis putus-putus champagne `#35363b`. Textarea daftar file berlatar `#212226` dengan teks terang. | [ ] PASS / [ ] FAIL | **KRITIS:** Tidak ada background putih silau di dropzone maupun textarea. |
| **UAT-PHO-10** | Klik menu **Kolase** pada sidebar. | Menu Kolase memiliki alignment ikon yang lurus dengan menu lain, badge PRO tampil anggun. Editor kolase terbuka: header, kanvas pratinjau, galeri template di bawah, dan panel pengaturan di kanan tersusun sejajar. | [ ] PASS / [ ] FAIL | **KRITIS:** Ikon sidebar lurus, panel kanan terstruktur rapi dan tidak berjejal. |
| **UAT-PHO-11** | Klik beberapa filter template pada Kolase (Semua, Story, Feed, Square, Landscape). | Pratinjau template memperbarui pilihan frame tanpa error. Template lama (29 template) tetap dapat dipilih dan berfungsi. | [ ] PASS / [ ] FAIL | Fungsionalitas kanvas dan drag/drop tetap utuh. |
| **UAT-PHO-12** | Klik menu **Pengaturan Studio** pada sidebar. | Panel pengaturan profil terbuka. Avatar menampilkan logo SVG champagne lokal. Form nama studio, kontak, dan rekening pembayaran tersusun rapi dalam tema gelap terpadu. | [ ] PASS / [ ] FAIL | **KRITIS:** Tidak ada avatar pecah atau form putih kontras silang. |

---

## D. CLIENT GALLERY TESTING

| TEST ID | LANGKAH KLIK | EXPECTED RESULT | STATUS OPERATOR | CATATAN TEKNIS |
|:---|:---|:---|:---:|:---|
| **UAT-CLI-01** | Buka URL galeri klien mock di tab baru: `http://127.0.0.1:4173/app.html?project=mock-project-001` | Muncul tampilan otentikasi PIN Galeri Klien ("Masukkan PIN Keamanan"). Tampilan mewah Atelier Noir Champagne, input PIN 4-digit berlatar gelap. | [ ] PASS / [ ] FAIL | Tampilan terisolasi penuh dari UI fotografer/admin. |
| **UAT-CLI-02** | Masukkan PIN salah: `9999`. Klik tombol "Buka Galeri". | Muncul pesan error "PIN Keamanan tidak sesuai". Galeri tetap terkunci. | [ ] PASS / [ ] FAIL | Proteksi PIN bekerja valid. |
| **UAT-CLI-03** | Masukkan PIN benar: `1234`. Klik "Buka Galeri". | Galeri terbuka. Muncul Banner Klien yang proporsional (tidak terlalu besar), instruksi 3 langkah singkat, dan **Grid Foto yang menampilkan 5 foto sampel berwarna asli**. | [ ] PASS / [ ] FAIL | **KRITIS:** Foto tampak jelas (bukan kotak hitam kosong). Banner tidak mendominasi layar. |
| **UAT-CLI-04** | Klik tombol hati / tombol "Pilih Foto" pada kartu foto pertama. | Kartu foto terpilih ditandai dengan border emas champagne, badge centang emas muncul, dan counter kuota di dock bawah bertambah menjadi `1 / 3 Foto Terpilih`. | [ ] PASS / [ ] FAIL | Seleksi foto responsif dan visual checkmark jelas. |
| **UAT-CLI-05** | Klik kembali foto pertama untuk membatalkan pilihan. | Pilihan dibatalkan, border emas menghilang, badge centang lenyap, counter kuota berkurang kembali ke `0 / 3`. | [ ] PASS / [ ] FAIL | Deselection berjalan normal. |
| **UAT-CLI-06** | Pilih 3 foto berturut-turut (mencapai batas kuota maksimal 3 foto). | Counter kuota menunjukkan `3 / 3 Foto Terpilih (Maksimal Tercapai)`. Tombol "Kirim Pilihan" pada dock bawah aktif berwarna emas. | [ ] PASS / [ ] FAIL | State kuota maksimal terverifikasi. |
| **UAT-CLI-07** | Coba pilih foto ke-4 saat kuota sudah penuh. | Sistem menampilkan peringatan ramah bahwa kuota foto maksimal telah tercapai. Foto ke-4 tidak dapat dipilih. | [ ] PASS / [ ] FAIL | Batas kuota terkunci aman di sisi klien. |
| **UAT-CLI-08** | Klik area gambar foto (bukan tombol pilih) untuk membuka Lightbox. | Lightbox layar penuh terbuka menampilkan foto resolusi tinggi, tombol navigasi Kiri/Kanan, nomor foto, dan tombol tutup (X). | [ ] PASS / [ ] FAIL | Lightbox modal bekerja mulus. |
| **UAT-CLI-09** | Tekan tombol panah Kanan (`ArrowRight`) atau tombol Berikutnya pada Lightbox. | Foto berpindah ke foto berikutnya secara halus. | [ ] PASS / [ ] FAIL | Navigasi keyboard & tombol berfungsi. |
| **UAT-CLI-10** | Tekan tombol `Esc` atau tombol silang (X) pada Lightbox. | Lightbox tertutup dan kembali ke posisi grid foto tanpa lompatan scroll. | [ ] PASS / [ ] FAIL | Penutupan modal bersih. |
| **UAT-CLI-11** | Buka Developer Tools (F12) dan aktifkan Toggle Device Toolbar pada ukuran **Mobile (375x667px)** dan **Mobile (390x844px)**. | Grid foto otomatis berubah menjadi 2 kolom rapi. Dock aksi di bagian bawah tetap terpasang rapi tanpa menutupi navigasi perangkat. Banner ringkas dan nyaman dibaca. | [ ] PASS / [ ] FAIL | Tampilan mobile sangat responsif dan mudah digunakan klien awam. |

---

## E. UI REGRESSION & CROSS-VIEW VISUAL AUDIT

| TEST ID | LANGKAH KLIK | EXPECTED RESULT | STATUS OPERATOR | CATATAN TEKNIS |
|:---|:---|:---|:---:|:---|
| **UAT-REG-01** | Inspeksi kontras teks pada seluruh halaman menggunakan Accessibility Inspector browser. | Semua teks judul dan konten utama memiliki contrast ratio >= 4.5:1 terhadap latar belakangnya. | [ ] PASS / [ ] FAIL | Standar WCAG AA terpenuhi. |
| **UAT-REG-02** | Periksa konsistensi palet warna di semua tab (Admin, Fotografer, Klien). | Semua elemen menggunakan turunan palet Atelier Noir Champagne (`#0e0f10`, `#17181b`, `#212226`, `#dfba7b`, `#f4f0e9`). Tidak ada warna asing/retro yang bocor. | [ ] PASS / [ ] FAIL | Satu design system utuh. |
| **UAT-REG-03** | Periksa alignment ikon di sidebar utama (Desktop & Mobile Drawer). | Semua ikon berada dalam container `w-5 h-5` dengan margin yang seragam. Ikon Kolase dan badge PRO lurus sejajar dengan menu lainnya. | [ ] PASS / [ ] FAIL | Alignment rapi dan presisi. |
| **UAT-REG-04** | Periksa teks nama brand studio panjang (misal diuji dengan nama 25 karakter). | Teks brand tidak terpotong kasar ("Kama Creati..."), container menampung teks dengan elegan hingga 170px dengan tooltip lengkap saat di-hover. | [ ] PASS / [ ] FAIL | Brand identity fotografer terlindungi. |
| **UAT-REG-05** | Periksa seluruh form input pada kondisi fokus (`focus-visible`). | Ring fokus berwarna emas champagne halus (`#dfba7b`) muncul tanpa outline browser bawaan yang kasar. | [ ] PASS / [ ] FAIL | Aksesibilitas keyboard terjamin. |
| **UAT-REG-06** | Buka halaman pada resolusi layar lebar (1440px / 1600px). | Layout terpusat dengan container `max-w-7xl` atau `max-w-[1600px]`, tidak melar ekstrem ke tepi layar. | [ ] PASS / [ ] FAIL | Layout desktop nyaman dipandang. |

---

## F. SECURITY & ISOLATION REGRESSION TESTING

| TEST ID | LANGKAH KLIK | EXPECTED RESULT | STATUS OPERATOR | CATATAN TEKNIS |
|:---|:---|:---|:---:|:---|
| **UAT-SEC-01** | Buka tab Network pada Developer Tools (F12) saat menjalankan seluruh pengujian di atas. | **Nol request** ke Supabase Production (`*.supabase.co`), nol request ke Mayar (`api.mayar.id`), nol request ke WhatsApp Web. | [ ] PASS / [ ] FAIL | Terisolasi 100% pada `127.0.0.1:4173`. |
| **UAT-SEC-02** | Cek header respon Content-Security-Policy di Network tab. | CSP menyertakan `connect-src 'self' http://127.0.0.1:4173` yang memblokir semua outbound connection ke server produksi. | [ ] PASS / [ ] FAIL | Sandbox isolasi aktif. |
| **UAT-SEC-03** | Lakukan simulasi pergantian URL dari galeri klien langsung ke `#section-projects`. | Sistem menolak tampilan admin/fotografer karena sesi klien tidak memiliki hak akses fotografer. | [ ] PASS / [ ] FAIL | Role boundary enforcement kuat. |
| **UAT-SEC-04** | Verifikasi integritas script `app.html` via test runner lokal: `node test/security-and-regression.test.js`. | Menghasilkan 25 PASSED, 0 FAILED (Invarian 12 script tags, format kuota, integritas vercel.json tetap terjaga). | [ ] PASS / [ ] FAIL | Kontrak fungsional inti aman. |

---

## KESIMPULAN & TANDA TANGAN OPERATOR

- **Hasil Keseluruhan Checklist:** _____ dari 39 Item Lulus
- **Keputusan Peninjau:**
  - [ ] **SETUJU (GO FOR OPERATOR APPROVAL)** — Tampilan visual dan pengalaman pengguna telah seragam, elegan, dan layak untuk branch utama.
  - [ ] **TOLAK (STRICT NO-GO)** — Masih ditemukan anomali visual pada item ID: ____________________.

**Nama Peninjau (Operator):** _____________________________  
**Tanggal Pengujian:** _____________________________
