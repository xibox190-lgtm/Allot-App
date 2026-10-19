import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = JSON.parse(await readFile(resolve(root, 'public-files.json'), 'utf8'));
if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length) throw new Error('Invalid public file list');
const forbidden = /(^|\/)(?:\.git|\.allot|node_modules|dist|designs|build|\.env(?:\.[^/]+)?)(\/|$)|\.(?:apk|aab|png|jpe?g|webp|woff2?|ttf|otf|keystore|jks|pem|key|p12|pfx)$/i;
const checks = [
  ['possible API token', /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['embedded font', /data:(?:font\/|application\/(?:x-font|font))/i],
  ['personal machine path', /[A-Z]:\\(?:Users|Program Files|IntelliJ)[^\r\n"']*/i],
  ['personal mailbox', /[A-Z0-9._%+-]+@(?:qq|163|126|gmail|outlook|hotmail)\.com\b/i],
];
const verified = [];
const problems = [];
for (const file of files) {
  if (typeof file !== 'string' || file.includes('\\') || forbidden.test(file) || file.startsWith('.') && file !== '.gitignore' && !file.startsWith('.github/')) throw new Error(`Disallowed public path: ${file}`);
  const source = resolve(root, file);
  const rel = relative(root, source);
  if (rel.startsWith('..') || rel.includes('..' + sep) || rel !== file.split('/').join(sep)) throw new Error(`Unsafe path: ${file}`);
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink() || await realpath(source) !== source) throw new Error(`Only ordinary files are allowed: ${file}`);
  let bytes = await readFile(source);
  if (file === 'package.json') {
    const pkg = JSON.parse(bytes.toString('utf8'));
    // Historical benchmarks require private baselines, excluded from this export.
    for (const key of Object.keys(pkg.scripts)) if (key.startsWith('perf:')) delete pkg.scripts[key];
    bytes = Buffer.from(JSON.stringify(pkg, null, 2) + '\n');
  }
  if (bytes.includes(0)) throw new Error(`Binary content is not allowed: ${file}`);
  // Third-party license text can legitimately contain author mailboxes.
  const applicable = file.includes('/vendor/') ? checks.filter(([label]) => label !== 'personal mailbox') : checks;
  for (const [label, pattern] of applicable) if (pattern.test(bytes.toString('utf8'))) problems.push(`${file}: ${label}`);
  verified.push({ file, source, bytes, sha256: createHash('sha256').update(bytes).digest('hex') });
}
if (problems.length) throw new Error('Export stopped; review these files (values hidden):\n' + problems.join('\n'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = resolve(root, 'dist/open-source', 'Allot-' + stamp);
await mkdir(dirname(destination), { recursive: true });
await mkdir(destination); // Never overwrite an earlier export.
for (const item of verified) {
  const target = resolve(destination, item.file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, item.bytes, { flag: 'wx' });
}
// Manifest stays outside the publishable source directory.
await writeFile(destination + '.manifest.json', JSON.stringify(verified.map(({ file, sha256 }) => ({ file, sha256 })), null, 2) + '\n');
console.log(`Exported ${verified.length} checked files, without Git history or local data.\n${destination}`);
