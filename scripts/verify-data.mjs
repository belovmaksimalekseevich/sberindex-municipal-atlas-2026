import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'DATA_MANIFEST.json'), 'utf8'));
if (process.argv.slice(2).some(argument => argument !== '--dist')) {
  throw new Error('Usage: node scripts/verify-data.mjs [--dist]');
}
const checkBuild = process.argv.includes('--dist');
const failures = [];
let checked = 0;

function verifyFile(relativePath, expected) {
  const absolutePath = path.resolve(projectRoot, relativePath);
  if (!absolutePath.startsWith(projectRoot + path.sep)) {
    throw new Error(`Path is outside the project: ${relativePath}`);
  }
  checked += 1;
  try {
    const data = readFileSync(absolutePath);
    const digest = createHash('sha256').update(data).digest('hex');
    if (digest !== expected.sha256 || data.length !== expected.bytes) {
      failures.push({ path: relativePath, error: 'File differs from the accepted source' });
    }
  } catch (error) {
    failures.push({ path: relativePath, error: error.message });
  }
}

if (manifest.accepted_data.length !== 35 || manifest.geography.length !== 2) {
  throw new Error('Expected 35 accepted data assets and two geography assets');
}

for (const asset of [...manifest.accepted_data, ...manifest.geography]) {
  verifyFile(asset.path, asset);
}

if (checkBuild) {
  const publicAssets = manifest.accepted_data.filter(asset => asset.path.startsWith('public-landing/'));
  if (publicAssets.length !== 28) throw new Error('Expected 28 public data assets');
  for (const asset of publicAssets) {
    verifyFile(asset.path.replace('public-landing/', 'dist/'), asset);
  }
}

console.log(JSON.stringify({ passed: failures.length === 0, checked, buildChecked: checkBuild, failures }, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
