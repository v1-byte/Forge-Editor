// Dipanggil otomatis oleh `npm version <patch|minor|major>`: samakan VER di index.html dengan package.json.
const fs = require('fs');
const path = require('path');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const f = path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(f, 'utf8');
if (!/const VER = '[^']*'/.test(html)) { console.error('VER tidak ditemukan di index.html'); process.exit(1); }
fs.writeFileSync(f, html.replace(/const VER = '[^']*'/, `const VER = '${pkg.version}'`));
console.log('✔ VER di index.html → ' + pkg.version);
