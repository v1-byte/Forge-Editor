# Yang masih kurang agar bisa menyaingi VS Code

CodeForge memakai Monaco (mesin editor VS Code), jadi **editor-nya** sudah setara. Selisihnya ada di platform di sekelilingnya.

## Prioritas 1 — penentu (tanpa ini tetap "editor teks", bukan IDE)
1. **Language Server (LSP)**: Monaco hanya punya IntelliSense bawaan untuk JS/TS/JSON/CSS/HTML. Python, Java, Kotlin, Go, Rust, dll. belum punya autocomplete cerdas, go-to-definition, rename symbol, dan diagnostik. Solusi: LSP lewat WebSocket ke server, atau pakai WASM (Pyright, rust-analyzer).
2. **Terminal terintegrasi**: belum ada shell. Di Android bisa lewat Termux (intent) atau runtime lokal; di web lewat WebContainers/backend.
3. **Run & Debug**: ada Preview (HTML/JS/MD), tetapi belum ada breakpoint, call stack, watch, atau debug adapter (DAP).
4. **Git**: belum ada source control (status, diff, commit, branch, merge). Minimal: isomorphic-git + panel diff (Monaco punya DiffEditor).
5. **Ekosistem ekstensi**: VS Code punya puluhan ribu ekstensi; CodeForge belum punya API plugin. Minimal: format JSON untuk tema, snippet, dan bahasa.

## Prioritas 2 — produktivitas harian
6. **Cari & ganti di seluruh workspace** dengan regex, filter file, dan pratinjau hasil (sekarang hanya pencarian dasar).
7. **Formatter & linter** (Prettier, ESLint, Black) dan format saat simpan.
8. **Panel Problems** (daftar error/peringatan) dan **Outline/Symbols** (peta fungsi/kelas), breadcrumbs.
9. **Split editor** (dua file berdampingan), drag tab, pin tab, dan restore sesi saat dibuka ulang.
10. **Palet perintah penuh + keybinding yang bisa diubah**, import tema VS Code (.json), settings.json.
11. **Snippet & Emmet**, auto-rename tag, Auto Import.
12. **Simpan & sinkron**: auto-save yang andal, riwayat lokal (timeline/undo antar sesi), pemulihan jika aplikasi ditutup paksa.

## Prioritas 3 — kolaborasi dan skala
13. **Live Share / kolaborasi real-time** (Yjs + WebRTC).
14. **Remote development** (SSH/Container/Codespaces) dan sinkron pengaturan antarperangkat.
15. **Performa file besar** (>10 MB), workspace ribuan file (indeks pencarian di Web Worker), dan akses folder native di Android (SAF, bukan hanya Documents/CodeForge).
16. **Aksesibilitas & i18n**: screen reader, mode kontras tinggi, terjemahan UI selain Indonesia.
17. **Mutu rekayasa**: tes otomatis, pemecahan `index.html` (±150 KB satu file) menjadi modul, TypeScript, PWA + service worker, update otomatis, telemetri opsional.

## Keunggulan yang bisa dipertajam (agar tidak sekadar "meniru")
- **Mobile-first**: tombol cepat, geser cepat, mode satu tangan — VS Code tidak punya ini. Jadikan pembeda utama.
- **Offline penuh & ringan** (aset gambar ±330 KB, tanpa Electron ±200 MB).
- **Preview instan** HTML/MD/SVG di HP.
- **Asisten AI bawaan** (jelaskan/perbaiki kode, generate dari perintah) — jika terhubung API.
