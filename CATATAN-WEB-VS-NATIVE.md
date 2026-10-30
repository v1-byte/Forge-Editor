# Catatan: Web vs Native untuk CodeForge

Tanggal: 30 Oktober 2026
Status: **full-hybrid diterapkan**: UI/editor tetap web, akses berkas besar memakai plugin native.

## Rekomendasi: hibrida

- Editor tetap web (Monaco di dalam WebView), karena Monaco adalah mesin VS Code dan fiturnya sudah lengkap.
- Bagian yang berat atau butuh akses sistem ditulis native (Kotlin) dan dihubungkan lewat plugin Capacitor.
- Satu basis UI untuk web dan APK, tetap dengan build otomatis lewat GitHub Actions.

## Alasan

### Web (kondisi sekarang: Capacitor + Monaco)
- Fitur editor lengkap dan sudah berjalan.
- Satu basis kode untuk web dan APK.
- Build APK sudah diotomasi (`.github/workflows/apk.yml`).
- Kelemahan: file besar, akses penyimpanan terbatas, dan rasa "native" kurang di HP kelas bawah.

### Native penuh (Kotlin/Compose)
- Performa, akses file lewat SAF, dan gesture yang terasa seperti Android.
- Kelemahan: tidak ada editor native yang setara Monaco. Menulis ulang editor butuh waktu jauh lebih lama, dan dua basis kode harus dirawat.

## Temuan spesifik: batas file 100 MB di APK

Sebelumnya `www/index.html` memiliki konstanta `BV_NATIVE_MAX = 100 * 1024 * 1024` yang dipakai di `srcOf()`. Di APK, berkas di atas 100 MB ditolak sebelum parser streaming berjalan.

Akibatnya, **Qwen3-4B-Q8_0.gguf (3,99 GB) tidak bisa dibuka di tab Info versi APK**, meskipun parser GGUF sudah membaca secara bertahap. Batas ini berasal dari jembatan Capacitor, bukan dari parser.

Dengan hibrida, plugin Java kecil membaca berkas langsung lewat `RandomAccessFile`/`ContentResolver` dan mengirim potongan byte ke WebView. Batas biner 100 MB hilang, dan parser yang ada bisa dipakai ulang.

## Rencana kerja hibrida (usulan)

1. Jalankan `npm install` lalu `npx cap sync android`, pastikan `NativeFile` terdaftar.
2. Build debug APK dan perbaiki error kompilasi bila ada.
3. Uji tab Info dengan Qwen3-4B-Q8_0.gguf sungguhan di HP, lewat tombol buka file (SAF) dan dari folder Documents/CodeForge.
4. Setelah berhasil, uji GGUF multi-gigabyte pada perangkat Android nyata.

## Status

- Plugin `plugins/native-file` (Java) sudah ditulis: `stat`, `read` per potongan (maks 4 MB), dan `pick` lewat SAF. Terpasang sebagai dependency lokal di `package.json`.
- `srcOf()` dan `pick()` di `www/index.html` memakai plugin bila tersedia. Jalur biner, pencarian byte, dan parser GGUF kini streaming tanpa batas 100 MB; batas 100 MB hanya dipertahankan untuk teks yang dimuat penuh ke Monaco.
- Jalur plugin sudah diuji di Chromium dengan plugin tiruan (GGUF terbaca dengan benar).
- `npm install` dan `npm run verify` sudah berhasil; bundel Monaco + JSZip tersedia lokal untuk mode offline.
- Build APK final tetap perlu dijalankan pada mesin yang memiliki Android SDK/Gradle; sandbox ini tidak menyediakan Android SDK.
- Tab Info GGUF sudah diperbarui di web (sub-tab Ringkasan, Metadata yang bisa dicari, dan Tokenizer), dan sudah diuji dengan file uji kecil di Chromium headless.
- Belum diuji dengan berkas Qwen3-4B asli, dan belum diuji di APK.

## Keputusan arsitektur

- Target saat ini adalah APK Android full-hybrid: Monaco/UI web untuk pengalaman editor, Capacitor untuk shell aplikasi, dan NativeFile untuk akses berkas besar.
- Native penuh tidak dipilih karena akan menggandakan basis kode dan kehilangan kemampuan editor Monaco.
- iOS tidak termasuk ruang lingkup perubahan ini; plugin NativeFile saat ini khusus Android.
