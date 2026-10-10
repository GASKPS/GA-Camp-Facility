# Mess Karyawan · Siap Upload V8

Pembaruan otomatis antaradmin, filter status penghuni, riwayat perubahan sebelum/sesudah, serta menu pengaturan di kanan atas dengan transisi halus. Bentuk kartu kamar dan login asli tetap digunakan. Bukti serah terima PDF belum ditambahkan.

## Jika database sudah V7

1. Gunakan proyek Supabase yang sama. Unduh cadangan dari Profil & Pengaturan → Download.
2. Buka supabase/update_v8.sql, tekan Ctrl+A lalu Ctrl+C. Tempel SELURUH file ke query baru di SQL Editor Supabase dan jalankan sampai commit;. Skrip sudah mengaktifkan RLS; jika dashboard menawarkan tambahan RLS otomatis, pilih Run without RLS.
3. Unggah SEMUA isi folder hasil ekstraksi ke root repository GitHub yang sama: index.html, coba.html, assets/, PANDUAN.html, dan file pendukung. Ganti file lama dengan file V8.
4. Settings → Pages → Deploy from a branch → main → /(root). Muat ulang web di semua perangkat, kemudian tekan Perbarui.

V8 memerlukan satu SQL tambahan. Tidak perlu membuat database baru, mengimpor ulang data, atau deploy ulang fungsi akun yang sudah bekerja. Jika belum V7, jalankan hanya pembaruan yang belum terpasang dalam urutan V5 → V6 → V7 → V8. Jangan jalankan setup dasar pada database yang sudah terisi.

Data baru menunggu jika formulir masih terbuka. Pembaruan langsung menggunakan Realtime; pemeriksaan cadangan berlangsung setiap 45 detik dan saat kembali ke tab. Riwayat perubahan mulai tercatat setelah SQL V8, bukan dari perubahan sebelum pemasangan. Hak baca riwayat diberikan kepada Administrator/Super Admin aktif. Filter status penghuni hanya menghitung karyawan aktif yang sudah mempunyai kamar; filter penempatan tetap tersedia untuk karyawan tanpa kamar.

Uji coba tanpa login tersedia melalui coba.html dan tidak menghubungi Supabase. Buka melalui HTTP/HTTPS. PANDUAN.html adalah panduan V8; PDF lama tetap referensi database V7. Folder supabase/ yang diunggah ke GitHub tidak menjalankan SQL secara otomatis.

153 pengujian otomatis dan build berhasil. Browser pengujian gagal dimulai pada lingkungan pembuat, sehingga inspeksi visual komputer/HP dan uji WebSocket browser belum selesai. Pengujian UI/sinkronisasi memakai adapter demo, subscription contoh, serta PostgreSQL lokal. SQL belum dijalankan pada proyek Supabase pemilik dan web belum diunggah ke GitHub.

Kode React terpisah tersedia di Mess_Karyawan_React_V8.zip.
