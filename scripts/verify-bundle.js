// Gagalkan build bila Monaco / JSZip belum terbundel di www/, atau versi tidak sinkron.
// Dipakai oleh: npm run verify, npm run android, npm run sync, build:* dan workflow CI.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const must = [
  ['www/vs/loader.js', 2000],
  ['www/vs/editor/editor.main.js', 500000],
  ['www/vs/editor/editor.main.css', 10000],
  ['www/vs/base/worker/workerMain.js', 10000],
  ['www/jszip.min.js', 10000]
];

const errors = [];
for (const [rel, minBytes] of must) {
  const f = path.join(root, rel);
  if (!fs.existsSync(f)) errors.push(`Tidak ada: ${rel}`);
  else if (fs.statSync(f).size < minBytes) errors.push(`Terlalu kecil / rusak: ${rel}`);
}

// Versi package.json harus sama dengan VER di index.html (dipakai juga untuk versionName APK)
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
const m = html.match(/const VER = '([^']+)'/);
if (!m) errors.push("Konstanta VER tidak ditemukan di www/index.html");
else if (m[1] !== pkg.version) errors.push(`Versi tidak sinkron: package.json=${pkg.version}, index.html VER=${m[1]}`);

// Config rilis harus bersih
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
if (cfg.server && cfg.server.cleartext) errors.push('capacitor.config.json: server.cleartext harus false/dihapus');
if (cfg.android && cfg.android.allowMixedContent) errors.push('capacitor.config.json: android.allowMixedContent harus false');
if (cfg.android && cfg.android.webContentsDebuggingEnabled) errors.push('capacitor.config.json: webContentsDebuggingEnabled harus false');

if (errors.length) {
  console.error('\n✖ Verifikasi bundel gagal:\n  - ' + errors.join('\n  - '));
  console.error('\nPerbaiki dengan:  npm install   (atau: npm run setup)\n');
  process.exit(1);
}
console.log('✔ Bundel lengkap: Monaco + JSZip lokal, versi & config rilis OK (v' + pkg.version + ')');
