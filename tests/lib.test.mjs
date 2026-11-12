import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { problems, signEntry, versionProblem } from '../scripts/lib.mjs';

const api = { version: 1, name: 'R', domain: 'reddit.com', modes: ['manual', 'scheduled'], source: { type: 'api', url: 'https://www.reddit.com/u/{username}.json' }, fields: [{ key: 'k', path: 'a.b' }] };
const bad = (change) => problems('r', { ...api, ...change }).length > 0;

test('every module in the repo is fine', () => {
  for (const f of readdirSync('modules')) assert.deepEqual(problems(f.replace('.json', ''), JSON.parse(readFileSync(`modules/${f}`, 'utf8'))), [], f);
});
test('a module stays on its own site, over https', () => {
  assert.equal(problems('r', api).length, 0);
  assert.ok(bad({ source: { type: 'api', url: 'https://evil.example/{username}' } }));
  assert.ok(bad({ source: { type: 'api', url: 'http://www.reddit.com/x' } }));
  assert.ok(bad({ source: { type: 'api', url: 'https://reddit.com.evil.example/x' } }));
  assert.ok(bad({ source: { type: 'api' } }));
});
test('a key is only for an api source that checks its owner on its own site', () => {
  const source = (over) => ({ source: { type: 'api', url: 'https://www.reddit.com/x', auth: 'key', identity: 'name', identityUrl: 'https://www.reddit.com/me', ...over } });
  assert.equal(problems('r', { ...api, ...source({}) }).length, 0);
  assert.ok(bad(source({ identityUrl: 'https://evil.example/me' })));
  assert.ok(bad(source({ identityUrl: undefined })));
  assert.ok(bad(source({ identity: undefined })));
  assert.ok(bad(source({ session: true })));
  assert.ok(bad(source({ auth: 'cookie' })));
});
test('a list field names what it keeps from each entry', () => {
  const list = (field) => ({ fields: [{ key: 'k', path: 'a', ...field }] });
  assert.equal(problems('r', { ...api, ...list({ items: { n: 'name' } }) }).length, 0);
  assert.ok(bad(list({ items: {} })));
  assert.ok(bad(list({ items: { n: 1 } })));
  assert.ok(bad(list({ items: { n: 'name' }, transform: 'number' })));
});
test('anything unknown is refused', () => {
  assert.ok(bad({ script: 'alert(1)' }));
  assert.ok(bad({ fields: [{ key: 'k', path: 'a', code: 'x' }] }));
  assert.ok(bad({ source: { type: 'json', url: 'https://www.reddit.com/x' } }));
});
test('approaches get only what fits them', () => {
  const intercept = { source: { type: 'intercept', match: '^/api/' }, modes: ['auto'] };
  assert.equal(problems('r', { ...api, ...intercept }).length, 0);
  assert.ok(bad({ source: { type: 'intercept', match: '^/api/' } }), 'no schedule without the site open');
  assert.ok(bad({ ...intercept, source: { type: 'intercept', match: '(' } }), 'bad pattern');
  assert.ok(bad({ ...intercept, source: { type: 'intercept' } }), 'no match');
  assert.ok(bad({ source: { type: 'page' }, modes: ['manual'] }), 'path on a page');
  assert.equal(problems('r', { ...api, source: { type: 'page' }, modes: ['manual'], fields: [{ key: 'k', selector: '.a' }] }).length, 0);
  assert.ok(bad({ fields: [{ key: 'k', selector: '.a' }] }), 'selector on an api');
  assert.ok(bad({ fields: [{ key: 'k', path: 'a' }, { key: 'k', path: 'b' }] }), 'key twice');
});
test('a signature covers the exact text', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const entry = signEntry('r', api, privateKey);
  assert.ok(verify(null, Buffer.from(entry.payload), publicKey, Buffer.from(entry.signature, 'base64')));
  assert.equal(JSON.parse(entry.payload).version, 1);
  assert.equal(JSON.parse(entry.payload).recipe.version, undefined);
});
test('a change has to raise the version', () => {
  const published = { modules: [{ slug: 'r', version: 2, payload: 'old' }] };
  assert.equal(versionProblem('r', { version: 2, payload: 'old' }, published), null);
  assert.equal(versionProblem('r', { version: 3, payload: 'new' }, published), null);
  assert.equal(versionProblem('new', { version: 1, payload: 'x' }, published), null);
  assert.ok(versionProblem('r', { version: 2, payload: 'new' }, published));
  assert.ok(versionProblem('r', { version: 1, payload: 'old' }, published));
});
