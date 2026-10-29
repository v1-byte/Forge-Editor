# ⚡ CodeForge

Editor kode berbasis **Monaco Editor** (mesin yang sama dengan VS Code), tersedia sebagai:

- **Web app** (buka `www/index.html`)
- **Android APK** via Capacitor 6

## Fitur

- Syntax highlighting untuk puluhan bahasa (tema warna cerah, bracket berwarna, ganti bahasa lewat status bar)
- Tombol **Preview** (F5 / Alt+P): HTML (CSS/JS lokal ikut dimuat), SVG, Markdown, CSS, JS (dengan console), JSON; ada mode tablet & HP
- Pengaturan tampilan: ukuran ikon, ukuran teks, warna aksen (6 pilihan), font, glow, dan **tombol geser kanan** untuk scroll cepat di HP
- Gaya tampilan **Formal** (default, ala editor desktop: ikon netral, tanpa glow) atau **Cerah** (berwarna), diatur di Pengaturan
- Tombol lipat (‹) di tepi sidebar untuk menutup Explorer ke kiri
- Ikon SVG berwarna menyala, tombol besar mudah ditekan di HP (min 44px)
- Ikon launcher Android CodeForge (adaptif dan resolusi density) dibuat dari logo brand
- Multi-tab, explorer, cari di file terbuka & workspace
- Buka file / folder / ZIP, drag & drop
- GGUF metadata viewer untuk file `.gguf`: menampilkan metadata dan hingga 100 info tensor pertama; hanya membaca 20 MiB awal, bukan seluruh bobot model. Parser dimuat dari CDN saat viewer digunakan (perlu internet).
- Simpan ke Documents/CodeForge di Android (Capacitor Filesystem)
- Ekspor workspace ke ZIP
- Tema gelap / terang, minimap, word wrap, ligature
- Bilah menu IDE lengkap: **File, Edit, Selection, View, Go, Run, Alat, GitHub, Help**; menu dapat digeser horizontal di layar kecil
- Menu Selection menyediakan seleksi pintar, multi-kursor, dan pilih semua; menu Run menyediakan preview, muat ulang preview, dan palet perintah
- Menu GitHub: fork repositori dari URL GitHub, pencarian repositori, dan panduan fork
- Menu Alat: duplikat file aktif, tutup tab lain, statistik dokumen (baris/kata/karakter/kesalahan), format dokumen, palet perintah, ekspor ZIP, dan muat ulang editor
- Salin seluruh isi file aktif ke clipboard
- Keyboard shortcuts + tombol cepat di mobile
- Offline setelah `npm run setup` (Monaco & JSZip lokal)

## Cara pakai (Web)

```bash
npm install          # otomatis jalankan setup (salin Monaco + JSZip)
# lalu buka www/index.html di browser
```

Tanpa `npm install`, Monaco akan dimuat dari CDN (butuh internet).

## Build APK otomatis (GitHub Actions)

1. Upload / push folder ini ke repositori GitHub.
2. Buka tab **Actions** → **Build APK** → **Run workflow**.
3. Setelah selesai, unduh artifact **CodeForge-APK**.

## Build APK manual

```bash
npm install
npm run android          # setup + cap add android (sekali) + sync
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Atau satu perintah:

```bash
npm run build:apk
```

Buka di Android Studio:

```bash
npm run open:android
```

## Catatan Android

- **Buka Folder** bergantung pada WebView; jika tidak muncul, gunakan **Buka ZIP** atau **Buka File**.
- **Simpan** menulis ke `Documents/CodeForge/...` (plugin Filesystem).
- File biner akan diminta konfirmasi sebelum dibuka sebagai teks.
- File `.gguf` dibuka di metadata viewer khusus; konten biner tidak dimasukkan ke Monaco atau disalin ke Documents.
- Folder `node_modules`, `.git`, `build`, `dist` diabaikan saat buka folder/ZIP.

## Menu GitHub
Pilih **GitHub → Fork Repositori…**, lalu masukkan URL repositori publik/private yang bisa diakses di GitHub (contoh `https://github.com/pemilik/proyek`). CodeForge akan membuka halaman fork resmi GitHub; login dan konfirmasi fork dilakukan di GitHub. Menu ini tidak mengunggah workspace lokal secara otomatis.

## Pintasan utama

| Pintasan     | Aksi              |
|--------------|-------------------|
| Ctrl/Cmd+S   | Simpan            |
| F5 / Alt+P   | Preview kode      |
| Ctrl/Cmd+F   | Cari              |
| Ctrl/Cmd+H   | Ganti             |
| Ctrl/Cmd+G   | Ke baris          |
| F1           | Palet perintah    |
| Alt+↑ / ↓    | Pindah baris      |
| Ctrl/Cmd+D   | Pilih kata sama   |
| Alt+Klik     | Multi-kursor      |

## Struktur

```
├── www/index.html          # Aplikasi utama (single-file)
├── www/assets/             # Logo FORGE (WebP/PNG ringan)
├── capacitor.config.json
├── package.json
├── copy.js                 # Salin Monaco + JSZip ke www/
├── .github/workflows/apk.yml
└── README.md
```

## Lisensi

MIT — gunakan bebas.
