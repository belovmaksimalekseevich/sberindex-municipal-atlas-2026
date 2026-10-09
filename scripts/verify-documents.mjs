import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.slice(2).some(argument => argument !== '--dist')) {
  throw new Error('Usage: node scripts/verify-documents.mjs [--dist]');
}
const checkBuild = process.argv.includes('--dist');
const failures = [];
const documents = [];

for (const name of ['report.pdf', 'presentation.pdf']) {
  try {
    const source = readFileSync(path.join(root, 'docs', name));
    if (source.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('Document is not a PDF');
    }
    if (checkBuild && !source.equals(readFileSync(path.join(root, 'dist', 'docs', name)))) {
      throw new Error('Published PDF differs from the current document');
    }
    documents.push({ path: `docs/${name}`, bytes: source.length, sha256: createHash('sha256').update(source).digest('hex') });
  } catch (error) {
    failures.push({ path: `docs/${name}`, error: error.message });
  }
}
for (const name of ['report.md', 'presentation.md', 'presentation.pptx']) {
  for (const directory of checkBuild ? ['docs', 'dist/docs'] : ['docs']) {
    if (existsSync(path.join(root, directory, name))) {
      failures.push({ path: `${directory}/${name}`, error: 'Only PDF versions belong in the public document release' });
    }
  }
}

console.log(JSON.stringify({ passed: failures.length === 0, buildChecked: checkBuild, documents, failures }, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
