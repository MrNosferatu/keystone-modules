import { generateKeyPairSync } from 'node:crypto';
import { publicKeyOf } from './lib.mjs';

const { privateKey } = generateKeyPairSync('ed25519');
const raw = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('base64');
console.log(`MODULE_SIGNING_KEY=${raw}`);
console.log(`WXT_RECIPE_PUBLIC_KEY=${publicKeyOf(privateKey)}`);
