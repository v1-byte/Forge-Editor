// Utilitas proyek Android (folder android/ dibuat oleh `npx cap add android`, tidak di-commit).
//   node scripts/android.js prepare        ikon + splash, versionCode/versionName
//   node scripts/android.js signing        pasang signingConfig rilis (butuh env CF_KEYSTORE_*)
//   node scripts/android.js debug-flags    aktifkan debugging di hasil sync (hanya build debug)
//   node scripts/android.js guard-release  gagalkan bila ada flag uji coba di hasil sync
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const A = path.join(root, 'android');
const gradleFile = path.join(A, 'app', 'build.gradle');
const manifestFile = path.join(A, 'app', 'src', 'main', 'AndroidManifest.xml');
const resDir = path.join(A, 'app', 'src', 'main', 'res');
const syncedCfg = path.join(A, 'app', 'src', 'main', 'assets', 'capacitor.config.json');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const die = msg => { console.error('✖ ' + msg); process.exit(1); };
const need = f => { if (!fs.existsSync(f)) die(`Tidak ada ${path.relative(root, f)} — jalankan "npm run android" dulu.`); };
const rd = f => fs.readFileSync(f, 'utf8');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

// versionCode naik otomatis tiap versi: 1.9.0 -> 10900, 1.10.2 -> 11002. Bisa ditimpa env VERSION_CODE.
function versionCode() {
  if (process.env.VERSION_CODE) {
    const n = parseInt(process.env.VERSION_CODE, 10);
    if (!(n > 0 && n < 2100000000)) die('VERSION_CODE tidak valid: ' + process.env.VERSION_CODE);
    return n;
  }
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(pkg.version);
  if (!m) die('package.json version harus berformat x.y.z');
  const [maj, min, pat] = [+m[1], +m[2], +m[3]];
  if (min > 99 || pat > 99) die('minor/patch maksimal 99 untuk rumus versionCode');
  return maj * 10000 + min * 100 + pat;
}

function prepare() {
  need(A);
  // 1) ikon launcher + splash
  copyDir(path.join(root, 'resources', 'android', 'res'), resDir);
  console.log('✔ Ikon launcher & splash disalin ke android/app/src/main/res');

  // 2) splash Android 12+ (ikon + warna latar)
  const stylesFile = path.join(resDir, 'values', 'styles.xml');
  if (fs.existsSync(stylesFile)) {
    let s = rd(stylesFile);
    if (!s.includes('windowSplashScreenBackground')) {
      const re = /(<style\s+name="AppTheme\.NoActionBarLaunch"[^>]*parent="[^"]*SplashScreen[^"]*"[^>]*>)/;
      if (re.test(s)) {
        s = s.replace(re, '$1\n        <item name="windowSplashScreenBackground">@color/cf_splash_background</item>' +
          '\n        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>');
        fs.writeFileSync(stylesFile, s);
        console.log('✔ Tema splash Android 12+ diatur');
      } else console.warn('! Style AppTheme.NoActionBarLaunch (SplashScreen) tidak ditemukan — splash Android 12+ memakai bawaan.');
    }
  }

  // 3) versionCode / versionName
  need(gradleFile);
  let g = rd(gradleFile);
  const vc = versionCode();
  if (!/versionCode\s+\d+/.test(g) || !/versionName\s+"[^"]*"/.test(g)) die('versionCode/versionName tidak ditemukan di android/app/build.gradle');
  g = g.replace(/versionCode\s+\d+/, `versionCode ${vc}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
  fs.writeFileSync(gradleFile, g);
  console.log(`✔ versionName ${pkg.version}, versionCode ${vc}`);
}

function signing() {
  need(gradleFile);
  const miss = ['CF_KEYSTORE_PATH', 'CF_KEYSTORE_PASSWORD', 'CF_KEY_ALIAS', 'CF_KEY_PASSWORD'].filter(k => !process.env[k]);
  if (miss.length) die('Env belum diisi: ' + miss.join(', ') + '\n  Lihat README bagian "APK rilis bertanda tangan".');
  if (!fs.existsSync(process.env.CF_KEYSTORE_PATH)) die('Keystore tidak ditemukan: ' + process.env.CF_KEYSTORE_PATH);

  let g = rd(gradleFile);
  if (g.includes('// CodeForge signing')) return console.log('✔ signingConfig sudah terpasang');
  const a = /^android\s*\{/m, b = /(buildTypes\s*\{\s*release\s*\{)/;
  if (!a.test(g) || !b.test(g)) die('Struktur build.gradle tidak dikenali (blok android / buildTypes.release).');
  g = g.replace(a, `android {
    // CodeForge signing
    signingConfigs {
        release {
            storeFile file(System.getenv("CF_KEYSTORE_PATH"))
            storePassword System.getenv("CF_KEYSTORE_PASSWORD")
            keyAlias System.getenv("CF_KEY_ALIAS")
            keyPassword System.getenv("CF_KEY_PASSWORD")
        }
    }`);
  g = g.replace(b, '$1\n            signingConfig signingConfigs.release');
  fs.writeFileSync(gradleFile, g);
  console.log('✔ signingConfig rilis dipasang di build.gradle');
}

function debugFlags() {
  need(syncedCfg);
  const c = JSON.parse(rd(syncedCfg));
  c.server = Object.assign({}, c.server, { cleartext: true });
  c.android = Object.assign({}, c.android, { allowMixedContent: true, webContentsDebuggingEnabled: true });
  fs.writeFileSync(syncedCfg, JSON.stringify(c, null, 2));
  console.log('✔ Mode debug: debugging WebView, cleartext & mixed content AKTIF (hanya untuk APK debug)');
}

function guardRelease() {
  need(syncedCfg); need(manifestFile);
  const c = JSON.parse(rd(syncedCfg)), m = rd(manifestFile), bad = [];
  if (c.server && c.server.cleartext) bad.push('server.cleartext = true');
  if (c.android && c.android.allowMixedContent) bad.push('android.allowMixedContent = true');
  if (c.android && c.android.webContentsDebuggingEnabled) bad.push('android.webContentsDebuggingEnabled = true');
  if (/usesCleartextTraffic\s*=\s*"true"/.test(m)) bad.push('manifest: usesCleartextTraffic="true"');
  if (/android:debuggable\s*=\s*"true"/.test(m)) bad.push('manifest: android:debuggable="true"');
  if (bad.length) die('Konfigurasi rilis tidak aman:\n  - ' + bad.join('\n  - ') + '\n  Jalankan ulang "npm run android" (jangan pakai sisa build debug).');
  console.log('✔ Konfigurasi rilis bersih (debugging, cleartext, mixed content mati)');
}

const cmd = process.argv[2];
({ prepare, signing, 'debug-flags': debugFlags, 'guard-release': guardRelease }[cmd] || (() => die('Perintah: prepare | signing | debug-flags | guard-release')))();
