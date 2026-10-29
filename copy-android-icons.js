const fs = require('fs');
const path = require('path');

const root = __dirname;
const src = path.join(root, 'android-icon-assets');
const dest = path.join(root, 'android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(path.join(root, 'android'))) {
  console.error('Folder android/ belum ada. Jalankan: npm run android');
  process.exit(1);
}
if (!fs.existsSync(src)) {
  console.error('Aset ikon tidak ditemukan: android-icon-assets/');
  process.exit(1);
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

copyTree(src, dest);
console.log('Ikon launcher CodeForge berhasil dipasang ke Android resources.');
