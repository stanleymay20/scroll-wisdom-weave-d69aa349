import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import config from '../capacitor.config';
import { assertNativeAppId } from './native-beta-config.mjs';

assertNativeAppId(config.appId);
const requested = process.argv.slice(2);
const platforms = requested.length ? requested : ['android', 'ios'];
for (const platform of platforms) {
  if (platform !== 'android' && platform !== 'ios') throw new Error('Use android or ios.');
  // Never overwrite an existing target or owner customization.
  if (existsSync(platform)) continue;
  const result = spawnSync('bun', ['x', '--no-install', 'cap', 'add', platform], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}