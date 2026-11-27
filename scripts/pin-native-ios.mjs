import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = 'ios/App/CapApp-SPM/Package.swift';
if (existsSync(file)) {
  const version = JSON.parse(readFileSync('node_modules/@capacitor/ios/package.json', 'utf8')).version;
  const content = readFileSync(file, 'utf8');
  const expected = `.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "${version}")`;
  const pinned = `.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "${version}")`;
  if (!content.includes(expected) && !content.includes(pinned)) {
    throw new Error('Unexpected Apple package shape/version; refusing to overwrite owner changes.');
  }
  if (content.includes(expected)) writeFileSync(file, content.replace(expected, pinned));
  console.log('Pinned Apple Capacitor package to the installed exact version.');
}