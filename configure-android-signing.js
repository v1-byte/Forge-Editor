const fs = require('fs');
const path = require('path');

const root = __dirname;
const appDir = path.join(root, 'android', 'app');
const gradleFile = path.join(appDir, 'build.gradle');
const keystoreFile = path.join(appDir, 'codeforge-release.jks');
const required = [
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD'
];

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Secret environment variable ${name} is required for release signing.`);
    process.exit(1);
  }
}

if (!fs.existsSync(gradleFile)) {
  console.error('android/app/build.gradle tidak ditemukan. Jalankan npm run android terlebih dahulu.');
  process.exit(1);
}

const keystore = Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, 'base64');
if (keystore.length < 1024) {
  console.error('Keystore tidak valid atau terlalu kecil.');
  process.exit(1);
}

let gradle = fs.readFileSync(gradleFile, 'utf8');
const marker = '// CODEFORGE_RELEASE_SIGNING';
if (!gradle.includes(marker)) {
  const androidBlock = /android\s*\{/;
  if (!androidBlock.test(gradle)) {
    console.error('Blok android { tidak ditemukan di build.gradle.');
    process.exit(1);
  }
  gradle = gradle.replace(androidBlock, `$&\n    ${marker}\n    signingConfigs {\n        release {\n            storeFile file("codeforge-release.jks")\n            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")\n            keyAlias System.getenv("ANDROID_KEY_ALIAS")\n            keyPassword System.getenv("ANDROID_KEY_PASSWORD")\n        }\n    }`);
}

if (!/buildTypes\s*\{\s*release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.release/.test(gradle)) {
  const releaseBlock = /(buildTypes\s*\{\s*release\s*\{)/;
  if (!releaseBlock.test(gradle)) {
    console.error('Blok buildTypes.release tidak ditemukan di build.gradle.');
    process.exit(1);
  }
  gradle = gradle.replace(releaseBlock, '$1\n            signingConfig signingConfigs.release');
}

fs.writeFileSync(keystoreFile, keystore, { mode: 0o600 });
fs.writeFileSync(gradleFile, gradle);
console.log('Signing release Android sudah dikonfigurasi.');
