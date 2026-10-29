const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const monacoSrc = path.join('node_modules', 'monaco-editor', 'min', 'vs');
const monacoDest = path.join('www', 'vs');
const jszipSrc = path.join('node_modules', 'jszip', 'dist', 'jszip.min.js');
const jszipDest = path.join('www', 'jszip.min.js');

if (!fs.existsSync(monacoSrc)) {
  console.error('monaco-editor belum terpasang. Jalankan: npm install');
  process.exit(1);
}

console.log('Menyalin Monaco Editor → www/vs …');
if (fs.existsSync(monacoDest)) fs.rmSync(monacoDest, { recursive: true, force: true });
copyDir(monacoSrc, monacoDest);

console.log('Menyalin JSZip → www/jszip.min.js …');
fs.copyFileSync(jszipSrc, jszipDest);

console.log('Selesai. Mode offline siap (Monaco + JSZip lokal).');
