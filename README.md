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
- Menu lengkap (File/Edit/View/Go/Help) dengan ikon, pintasan, dan tanda centang; Mode Zen & Layar Penuh
- Dialog Pintasan Keyboard & Tentang, logo FORGE di header/status bar
- Semua ikon SVG garis seragam (tanpa emoji/karakter simbol), lencana tipe file bergaya monogram tinted, tombol besar mudah ditekan di HP (min 44px)
- Tema **Forge** (default, v2.0): zamrud → cyan di atas biru-hitam pekat, selaras dengan logo kodok FORGE. Palet lain tetap ada: Ubuntu, Fedora, Arch, Mint, Kali, Pop!_OS (chip di status bar atau View → Ganti Distro)
- Menu bar lengkap berikon: File, Edit, Select, View, Go, Run, Help; menu klik kanan / tekan lama di tab & explorer; status bar interaktif
- Multi-tab, cari di file terbuka & workspace
- **Explorer lengkap**: folder baru, ganti nama, duplikat, pindah (dialog pilih folder), hapus dari workspace, dan **hapus file/folder asli**. Tombol ⋯ di tiap item atau tekan lama / klik kanan
- Buka file / folder / ZIP, drag & drop
- Simpan ke Documents/CodeForge di Android (Capacitor Filesystem)
- Ekspor workspace ke ZIP
- Tema gelap / terang, minimap, word wrap, ligature
- Keyboard shortcuts + tombol cepat di mobile
- Offline penuh: Monaco & JSZip **selalu terbundel di APK** (tanpa CDN)

## Cara pakai (Web)

```bash
npm install          # otomatis jalankan setup (salin Monaco + JSZip)
# lalu buka www/index.html di browser
```

Di **web**, tanpa `npm install` Monaco masih dimuat dari CDN sebagai cadangan (butuh internet).
Di **APK**, CDN dimatikan: build berhenti dengan pesan jelas (`npm run verify`) bila Monaco belum terbundel.

## Build APK

| Perintah | Hasil |
|---|---|
| `npm run build:debug` (alias `build:apk`) | `android/app/build/outputs/apk/debug/app-debug.apk` — debugging WebView, cleartext & mixed content **aktif** (uji coba) |
| `npm run build:release` | `android/app/build/outputs/apk/release/app-release.apk` + `bundle/release/app-release.aab` — bertanda tangan, semua flag uji coba **mati** |

`capacitor.config.json` sudah dalam keadaan **aman untuk rilis** (`webContentsDebuggingEnabled`, `cleartext`, `allowMixedContent` = false). Build debug menyalakannya hanya pada salinan hasil sync (`scripts/android.js debug-flags`); build rilis memeriksa ulang dan **gagal** bila masih ada flag uji coba.

`npm run android` (dipanggil otomatis) menyiapkan proyek: verifikasi Monaco → `cap add/sync` → ikon + splash → versionCode/versionName.

## APK rilis bertanda tangan

**1. Buat keystore (sekali saja, simpan baik-baik — kehilangannya = tidak bisa update aplikasi):**

```bash
keytool -genkeypair -v -keystore codeforge-release.jks -alias codeforge \
  -keyalg RSA -keysize 2048 -validity 10000
```

**2a. Build lokal:**

```bash
export CF_KEYSTORE_PATH=$PWD/codeforge-release.jks
export CF_KEYSTORE_PASSWORD=...  CF_KEY_ALIAS=codeforge  CF_KEY_PASSWORD=...
npm run build:release
```

**2b. Build di GitHub Actions** — isi *Settings → Secrets and variables → Actions*:

| Secret | Isi |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 codeforge-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | password keystore |
| `ANDROID_KEY_ALIAS` | `codeforge` |
| `ANDROID_KEY_PASSWORD` | password key |

Lalu rilis dengan tag:

```bash
npm version patch        # atau minor / major — menaikkan versi + menyamakan index.html + membuat tag
git push --follow-tags   # tag vX.Y.Z memicu build rilis + GitHub Release (APK + AAB)
```

Workflow juga bisa dijalankan manual (*Run workflow* → `release`). Push biasa ke `main` tetap menghasilkan APK debug.

**versionCode** dihitung dari versi di `package.json`: `major×10000 + minor×100 + patch` (2.0.0 → 20000, 1.10.2 → 11002), jadi otomatis naik setiap kali versi dinaikkan. Workflow menolak tag yang tidak sama dengan versi `package.json`. Bisa ditimpa dengan env `VERSION_CODE`.

## Ikon & splash Android

Hasil sudah dibuat dan di-commit di `resources/android/res/` (ikon adaptif + bulat + monokrom Android 13, splash potret/lanskap, tema splash Android 12+). Semua PNG dikuantisasi palet dan logo web berformat WebP, sehingga seluruh aset gambar hanya ±330 KB. Disalin otomatis ke proyek Android oleh `npm run android`.
Ganti logo? Ubah `assets/logo-source.png` (putih di atas hitam), lalu `python3 tools/make_android_res.py` (butuh `pillow`, `numpy` & `scipy`). Skrip itu juga membuat ulang logo/favicon web di `www/assets/`.

## Explorer

Klik tombol ⋯ pada file/folder, atau tekan lama / klik kanan:

- **Ganti Nama · Duplikat · Pindah ke…** — di Android ikut mengubah salinan sungguhan di `Documents/CodeForge/`. Tab yang terbuka tetap terbuka (isi yang belum disimpan dipertahankan).
- **Hapus dari Workspace** — hanya menyembunyikan dari explorer; file di penyimpanan tidak disentuh.
- **Hapus File/Folder Asli…** — menghapus permanen (dengan konfirmasi). Android: file di `Documents/CodeForge/`. Browser desktop: hanya bila browser mengizinkan (`FileSystemHandle.remove`); jika tidak, aplikasi memberi tahu dan hanya menghapus dari workspace.
- **Folder Baru** (tombol di header Explorer / menu File) dan **Muat dari Documents/CodeForge** (Android memuatnya otomatis saat dibuka).

Batasan: file yang dibuka lewat *Buka File/Folder/ZIP* di browser/Android tidak punya path asli yang bisa dikelola web — ganti nama/pindah hanya berlaku di workspace sampai disimpan ke `Documents/CodeForge`.

## Catatan Android

- **Buka Folder** bergantung pada WebView; jika tidak muncul, gunakan **Buka ZIP** atau **Buka File**.
- **Simpan** menulis ke `Documents/CodeForge/...` (plugin Filesystem).
- File biner akan diminta konfirmasi sebelum dibuka sebagai teks.
- Folder `node_modules`, `.git`, `build`, `dist` diabaikan saat buka folder/ZIP.

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
├── www/assets/             # Logo FORGE (WebP/PNG ringan) + favicon 192/512
├── ROADMAP.md              # Yang masih kurang untuk menyaingi VS Code
├── assets/                 # Logo sumber + master ikon/splash
├── resources/android/res/  # Ikon & splash Android (hasil jadi, disalin saat build)
├── scripts/                # verify-bundle, android (versi/signing/guard), sync-version
├── tools/make_android_res.py
├── capacitor.config.json
├── package.json
├── copy.js                 # Salin Monaco + JSZip ke www/
├── .github/workflows/apk.yml
└── README.md
```

## Lisensi

MIT — gunakan bebas.
