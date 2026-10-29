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

const pkg = require(path.join(root, 'package.json'));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!match) {
  console.error('Versi package.json harus berformat MAJOR.MINOR.PATCH.');
  process.exit(1);
}
const versionCode = Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
const gradleFile = path.join(root, 'android', 'app', 'build.gradle');
let gradle = fs.readFileSync(gradleFile, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+['"][^'"]+['"]/, `versionName "${pkg.version}"`);
fs.writeFileSync(gradleFile, gradle);

console.log(`Ikon launcher terpasang; APK Android disetel ke versi ${pkg.version} (${versionCode}).`);
