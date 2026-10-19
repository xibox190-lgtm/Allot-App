import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const target = new URL('app/public/vendor/', root);
await mkdir(target, { recursive: true });
for (const [source, name] of [
  ['marked/lib/marked.esm.js', 'marked.mjs'],
  ['marked/LICENSE', 'marked-LICENSE'],
  ['dompurify/dist/purify.es.mjs', 'purify.mjs'],
  ['dompurify/LICENSE', 'dompurify-LICENSE']
]) await copyFile(new URL('node_modules/' + source, root), new URL(name, target));
