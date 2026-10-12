# Pembaruan26 — Kartu Rombongan dan Menu Pengaturan Akun

## Tampilan Tamu

Kartu kini menonjolkan **asal tamu**, **tanggal on site**, **status**, serta jumlah orang. Nama dan jabatan anggota ditampilkan sebagai daftar dengan inisial kecil. Klik nama untuk membuka detail orang tersebut.

Tamu digabung dalam satu kartu jika **asal/perusahaan, tanggal on site, jenis kunjungan, dan status** sama. Perbedaan kapital dan spasi pada asal tidak membuat kartu tambahan. Tamu yang belum memiliki asal atau tanggal tetap mendapat kartu sendiri agar tidak tergabung dengan orang yang belum jelas rombongannya. Penggabungan ini mengatur tampilan; data masing-masing orang tetap tersedia.

Tampilan awal memuat maksimal **lima kartu**. **Selengkapnya** membuka seluruh kartu dengan navigasi halaman. Setiap kartu menampilkan sampai tiga nama agar tetap ringkas; jika anggotanya lebih banyak, jumlah sisanya terlihat di footer. **Detail kunjungan** membuka seluruh anggota rombongan. Klik nama anggota untuk menuju informasi dan tindakan edit/keluar site yang sudah tersedia.

Kartu tersusun dua kolom di desktop dan satu kolom di HP. Gaya mengikuti Portal GA: warna netral, batas tipis, ukuran teks yang jelas, dan ruang yang konsisten. Tema gelap serta penggunaan keyboard tetap didukung.

## Pengaturan Profil di Kanan Atas

Klik foto profil untuk memilih langsung:

- **Profil Saya**
- **Ganti Kata Sandi**
- **Hak Akses**
- **Kelola Office**
- **Download**

Pilihan yang tampil mengikuti hak akses akun. Administrator memperoleh kelima pilihan; Super Admin memperoleh Hak Akses tetapi bukan Kelola Office; Admin mendapat Download; Pembaca mendapat Profil Saya dan Ganti Kata Sandi. Semua tetap memakai izin database yang sudah ada.

Pilihan membuka bagian yang sesuai dengan judul halaman yang jelas. Deretan tab lama dipindahkan dari tampilan Portal ke menu akun. **Keluar** berada di bawah garis pemisah. Animasi menu, foto akun, keyboard, dan peringatan formulir yang belum disimpan tetap tersedia.

## Pemasangan

1. Ekstrak ZIP.
2. Dari **02_Portal_GA**, unggah dan ganti **index.html**, **agenda.js**, **agenda.css**, **profil.js**, **akun-menu.js**, dan **akun-menu.css**. Tambahkan **tamu-kartu.js** ke folder hosting yang sama.
3. Tekan **Ctrl+F5** setelah membuka ulang Portal. Berkas yang berubah memakai versi pemuatan `v=26`.
4. Periksa kartu Tamu, Detail kunjungan, dan pilihan pengaturan dari foto profil kanan atas.

**Tidak perlu SQL baru.** Jika mengunggah seluruh folder, pertahankan **konfigurasi.js** instalasi Anda. ZIP menyediakan Portal lengkap dari Pembaruan25 dengan perubahan terbaru. Panduan sebelumnya tetap disertakan sebagai riwayat.

Pengelompokan membaca seluruh halaman hasil filter Tamu sebelum membentuk kartu agar rombongan tidak terpisah akibat batas halaman. Navigasi kartu selanjutnya memakai hasil yang sudah dimuat. Untuk jumlah tamu yang sangat besar, pemuatan awal dapat membutuhkan waktu lebih lama. Pencarian, Aktif/Riwayat, dan jenis kunjungan mengikuti filter server yang sudah ada.

## Pemeriksaan

Pengujian JavaScript dengan DOM tiruan serta data contoh lulus untuk pengelompokan lintas halaman, batas lima kartu, daftar lengkap, seluruh anggota rombongan, detail setiap orang, respons lama tanpa jabatan, pencarian, kondisi kosong, kegagalan koneksi, respons terlambat, dan hak akses.

Pengujian menu profil lulus untuk lima tujuan langsung, indikator pilihan aktif, tab lama yang tersembunyi, peringatan formulir, pembatasan peran, keyboard, serta Escape. Sintaks JavaScript, aset lokal, perbandingan berkas, dan integritas ZIP diperiksa.

Tampilan langsung di browser belum dapat diuji dari lingkungan ini. Pengujian tidak memakai akun atau Supabase produksi. Paket tidak memasang perubahan ke hosting secara otomatis.
