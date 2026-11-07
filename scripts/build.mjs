// Checks every module; unless --check, signs them into dist/index.json.
// PUBLISHED_URL, when set, is compared so a changed module has to raise its version.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { privateKey, problems, publicKeyOf, signEntry, versionProblem } from './lib.mjs';

const checkOnly = process.argv.includes('--check');
const raw = process.env.MODULE_SIGNING_KEY;
if (!checkOnly && !raw) {
  console.error('MODULE_SIGNING_KEY is not set. Run npm run keygen.');
  process.exit(1);
}
// A check only needs the shape of a signature, so any key will do.
const key = raw ? privateKey(raw) : generateKeyPairSync('ed25519').privateKey;

let published = null;
if (process.env.PUBLISHED_URL) {
  try {
    const res = await fetch(process.env.PUBLISHED_URL);
    if (res.ok) published = await res.json();
  } catch {
    // Nothing published yet.
  }
}

let failed = false;
const report = (message) => {
  failed = true;
  console.error(message);
};
const modules = [];
for (const file of readdirSync('modules').filter((f) => f.endsWith('.json')).sort()) {
  const slug = basename(file, '.json');
  let module;
  try {
    module = JSON.parse(readFileSync(`modules/${file}`, 'utf8'));
  } catch (e) {
    report(`${file}: ${e.message}`);
    continue;
  }
  const errors = problems(slug, module);
  errors.forEach((e) => report(`${file}: ${e}`));
  if (errors.length) continue;
  const entry = signEntry(slug, module, key);
  // Only a real signature's payload is comparable; the payload itself is the same either way.
  const stale = versionProblem(slug, entry, published);
  if (stale) report(stale);
  modules.push(entry);
}
if (failed) process.exit(1);
if (checkOnly) {
  console.log(`${modules.length} modules are fine.`);
} else {
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/index.json', `${JSON.stringify({ publicKey: publicKeyOf(key), modules }, null, 1)}\n`);
  console.log(`Signed ${modules.length} modules into dist/index.json.`);
}
