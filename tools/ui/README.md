# Forge Editor UI

Homepage default di `tools/ui` sekarang memakai workspace Forge Editor yang selaras dengan mockup Forge Editor. UI ini tetap memakai server llama.cpp yang ada; UI tidak mengasumsikan file model, folder proyek, atau proses server sudah tersedia.

## Menjalankan

```bash
cd tools/ui
npm ci
npm run dev
```

Dev server berjalan di `http://localhost:5173`. Permintaan API same-origin diteruskan oleh Vite ke `SERVER_ORIGIN` (fallback port `9931`), termasuk `/health`, `/v1/*`, `/models`, dan `/tools`. Jalankan `llama-server` secara terpisah sesuai mode MODEL atau ROUTER; halaman tidak menjalankan atau menghentikan proses server.

Build dan tes:

```bash
npm run check
npm run test:unit -- --run
npm run build
```

## Fungsi homepage

- **Workspace Explorer:** buka folder/file melalui pemilih file browser, daftar dan cari path, edit teks, buat file di folder yang dipilih, simpan, dan reload. Akses hanya ke folder/file yang pengguna pilih. Browser tanpa File System Access API memakai fallback pemilih file dan unduhan untuk menyimpan salinan.
- **GGUF Inspector:** membaca header GGUF versi 2–3, metadata, dan daftar tensor dari file lokal yang dipilih. Ukuran header yang dibaca dibatasi 64 MiB.
- **Metadata:** dapat mengubah key string deskriptif tertentu (`general.name`, `general.author`, `general.description`, `general.basename`, `general.finetune`, `general.license`, `general.url`, `general.organization`, `general.repo_url`) lalu mengekspor file GGUF baru. Array dan metadata struktural tetap read-only; sumber tidak ditimpa.
- **Hex/Binary:** menampilkan byte aktual file terpilih dan memungkinkan patch byte; hasil diekspor sebagai salinan terpisah. Penyimpanan file besar memakai Save As browser bila tersedia.
- **Chat Lab:** memakai model yang dipilih di panel Chat Lab melalui `POST /v1/chat/completions`.
- **Copilot:** memiliki pemilih model tersendiri. Di mode MODEL, pilihan dibatasi ke model yang sedang aktif. Di mode ROUTER, daftar mencakup cache server; model yang belum aktif dimuat lewat `POST /models/load` dan Copilot menunggu event status loaded sebelum inferensi. Copilot mengusulkan perubahan; pengguna meninjau sebelum menerapkan draft dan menyimpan file.
- **API Server:** status berasal dari `GET /health` dan model list dari `GET /v1/models`. API key opsional dimasukkan pengguna dan hanya berada di memori tab saat itu.
- **Import:** pilih GGUF lokal untuk inspeksi, atau minta server mode ROUTER mengunduh model HF/GGUF melalui `POST /models`; daftar cache dari `GET /models` diperbarui melalui `/models/sse`. Pilih model yang selesai diunduh di Copilot lalu muat dari cache. Setelah file tersedia di cache server, inferensi berjalan lokal; unduhan awal tetap memerlukan koneksi internet.
- **Quantize:** menyiapkan dan menyalin contoh perintah `llama-quantize`, tetapi tidak menjalankannya dari browser.

## Batasan yang disengaja

Repository belum menyediakan job API untuk quantization atau konversi Hugging Face → GGUF, endpoint untuk start/stop server, shell execution dari halaman, GitHub push, atau extension runtime. Kontrol terkait menjelaskan batasan ini dan tidak mengklaim operasi tersebut berhasil. Jalankan operasi CLI melalui terminal tepercaya dan lakukan Git push melalui Git client yang sudah diautentikasi.

File lokal tidak diunggah oleh workspace editor. Model download melalui router merupakan operasi terpisah yang dijalankan server. Untuk akses tulis langsung ke folder/model besar, gunakan Chromium desktop yang mendukung File System Access API; fallback browser dapat mengunduh salinan, tetapi tidak menimpa file lokal secara langsung.

## Struktur dan pengembangan

- `src/routes/(chat)/+page.svelte` menampilkan halaman utama statis `static/forge-editor.html`.
- `static/forge-editor-app.js` berisi interaksi UI dan parser/serializer GGUF.
- `tests/unit/forge-editor-app.test.js` menguji parser dan ekspor header; tes tersebut dijalankan bersama suite unit Vitest.
- Komponen/layanan SvelteKit lama tetap ada di source untuk penggunaan dan pengembangan terpisah; homepage default tidak lagi merender layout chat lama.
