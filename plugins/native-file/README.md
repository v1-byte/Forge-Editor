# @codeforge/native-file

Plugin Capacitor untuk CodeForge (Android). Menyediakan:

| Metode | Fungsi |
|---|---|
| `stat({ uri })` | Ukuran berkas: `{ size }` |
| `read({ uri, offset, length })` | Baca potongan (maks 4 MB): `{ data: base64, bytes }` |
| `pick()` | Pilih berkas lewat Storage Access Framework: `{ uri, name, size }` atau `{ cancelled: true }` |

Akses lewat JavaScript tanpa import, karena WebView sudah memakai global `Capacitor`:

```js
const NF = Capacitor.Plugins.NativeFile;
const { size } = await NF.stat({ uri });
const { data } = await NF.read({ uri, offset: 0, length: 1 << 20 });
```

## Pasang

Dari root proyek CodeForge (sudah tercantum di `package.json`):

```bash
npm install                  # memasang plugin dari file:plugins/native-file
npx cap sync android         # mendaftarkan plugin ke Android
```

Pastikan keluaran `cap sync` menyebut `NativeFile`. Jika tidak, periksa bagian `capacitor` di `package.json` plugin.

Lalu build seperti biasa: `npm run build:debug` atau lewat GitHub Actions.

## Catatan

- Plugin ditulis dalam **Java** agar tidak perlu konfigurasi Kotlin pada template Capacitor.
- `minSdk` 22 dan `compileSdk` 34 mengikuti template Capacitor 6. Jika app memakai nilai lain, samakan di `rootProject.ext`.
- Tidak ada izin tambahan di manifest. `pick()` memakai SAF, dan `read()` hanya membaca berkas yang bisa diakses app.
