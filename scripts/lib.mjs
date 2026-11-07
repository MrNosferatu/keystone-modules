import { createPrivateKey, createPublicKey, sign } from 'node:crypto';

const MODES = ['manual', 'auto', 'scheduled'];
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const KEY = /^[a-z0-9_]{1,32}$/;
const SLUG = /^[a-z0-9-]{1,64}$/;

const onlyKeys = (object, allowed, where, errors) => {
  for (const key of Object.keys(object)) if (!allowed.includes(key)) errors.push(`${where}: unknown setting "${key}"`);
};
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
function validPattern(pattern) {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/** What's wrong with a module, as a list. Empty means it's fine. */
export function problems(slug, module) {
  const errors = [];
  if (!SLUG.test(slug)) errors.push('file name: use lowercase letters, digits and -');
  if (typeof module !== 'object' || module === null) return ['not an object'];
  onlyKeys(module, ['version', 'name', 'description', 'domain', 'pages', 'source', 'fields', 'modes', 'send'], 'module', errors);
  if (!Number.isInteger(module.version) || module.version < 1) errors.push('version: a whole number from 1');
  if (!text(module.name, 60)) errors.push('name: required, up to 60 characters');
  if (module.description !== undefined && !text(module.description, 200)) errors.push('description: up to 200 characters');
  if (!DOMAIN.test(module.domain ?? '')) errors.push('domain: a bare site address like example.com');
  for (const page of module.pages ?? []) if (!validPattern(page)) errors.push(`pages: not a valid pattern: ${page}`);
  const modes = module.modes;
  if (!Array.isArray(modes) || !modes.length || modes.some((m) => !MODES.includes(m))) errors.push(`modes: some of ${MODES.join(', ')}`);

  const source = module.source;
  if (typeof source !== 'object' || source === null) return [...errors, 'source: required'];
  onlyKeys(source, ['type', 'url', 'session', 'match', 'identity', 'namedInAddress'], 'source', errors);
  if (!['page', 'api', 'intercept'].includes(source.type)) errors.push('source.type: page, api or intercept');
  if (source.type === 'api') {
    let url = null;
    try {
      url = new URL((source.url ?? '').replaceAll('{username}', 'x'));
    } catch {
      errors.push('source.url: required for api');
    }
    if (url) {
      const onSite = url.hostname === module.domain || url.hostname.endsWith(`.${module.domain}`);
      if (url.protocol !== 'https:' || !onSite) errors.push("source.url: must be https on the module's own domain");
    }
  } else if (source.url || source.session) {
    errors.push('source: url and session are for api');
  }
  if (source.type === 'intercept') {
    if (!source.match || !validPattern(source.match)) errors.push('source.match: a valid pattern is required for intercept');
  } else if (source.match) {
    errors.push('source.match is for intercept');
  }
  if (source.type !== 'api' && modes?.includes?.('scheduled')) errors.push('modes: only api can be scheduled, the others need the site open');
  if (source.type === 'page' && source.identity) errors.push('source.identity reads an answer, which page has not got');

  if (source.type !== 'page' && source.namedInAddress !== undefined) errors.push('source.namedInAddress is for page');

  if (module.send !== undefined) {
    if (module.send !== 'changed' || source.type === 'api') errors.push('send: "changed", on a page or intercept source');
    if (!modes?.includes?.('auto')) errors.push('send: needs the auto mode');
  }

  if (!Array.isArray(module.fields) || !module.fields.length || module.fields.length > 20) return [...errors, 'fields: 1 to 20'];
  const seen = new Set();
  for (const field of module.fields) {
    const where = `field ${field?.key ?? '?'}`;
    onlyKeys(field, ['key', 'label', 'path', 'selector', 'attr', 'regex', 'template', 'transform'], where, errors);
    if (!KEY.test(field.key ?? '')) errors.push(`${where}: key uses lowercase letters, digits and _`);
    if (seen.has(field.key)) errors.push(`${where}: listed twice`);
    seen.add(field.key);
    if ([field.path, field.selector, field.template].filter((v) => v !== undefined).length !== 1) errors.push(`${where}: use exactly one of path, selector or template`);
    if (source.type !== 'page' && field.selector) errors.push(`${where}: selector needs a page source`);
    if (source.type === 'page' && field.path) errors.push(`${where}: path needs an api or intercept source`);
    if (field.regex && !validPattern(field.regex)) errors.push(`${where}: regex is not a valid pattern`);
    if (field.transform && !['number', 'unix_date', 'exists'].includes(field.transform)) errors.push(`${where}: transform is number, unix_date or exists`);
  }
  return errors;
}

/** A changed module has to raise its version, or browsers holding it won't update. */
export function versionProblem(slug, entry, published) {
  const old = published?.modules?.find((m) => m.slug === slug);
  if (!old) return null;
  if (entry.version < old.version) return `${slug}: version ${entry.version} is below the published ${old.version}`;
  if (entry.version === old.version && entry.payload !== old.payload) return `${slug}: changed, so raise its version above ${old.version}`;
  return null;
}

const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
export const privateKey = (b64) => createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(b64, 'base64')]), format: 'der', type: 'pkcs8' });
export const publicKeyOf = (key) => createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');

/** The exact text the extension verifies, then parses. */
export function signEntry(slug, module, key) {
  const { version, ...recipe } = module;
  const payload = JSON.stringify({ slug, version, recipe });
  return { slug, version, payload, signature: sign(null, Buffer.from(payload), key).toString('base64') };
}
