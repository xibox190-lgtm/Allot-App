import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, copyFile, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function fixture(t, files, contents = {}) {
  const root = await mkdtemp(join(tmpdir(), 'allot-public-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  await copyFile(new URL('../../scripts/export-open-source.mjs', import.meta.url), join(root, 'scripts/export-open-source.mjs'));
  await writeFile(join(root, 'public-files.json'), JSON.stringify(files));
  for (const [path, content] of Object.entries(contents)) await writeFile(join(root, path), content);
  return { root, run: () => spawnSync(process.execPath, ['scripts/export-open-source.mjs'], { cwd: root, encoding: 'utf8' }) };
}

test('public export copies only listed source, excludes local files and private benchmark commands', async t => {
  const f = await fixture(t, ['README.md', 'package.json'], {
    'README.md': 'Public documentation',
    'package.json': JSON.stringify({ scripts: { start: 'node app/server.mjs', 'perf:run': 'private baseline' } }),
    'personal.txt': 'Must never leave this directory',
  });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const exported = (await readdir(join(f.root, 'dist/open-source'))).find(name => !name.endsWith('.json'));
  const target = join(f.root, 'dist/open-source', exported);
  assert.deepEqual((await readdir(target)).sort(), ['README.md', 'package.json']);
  assert.deepEqual(JSON.parse(await readFile(join(target, 'package.json'))).scripts, { start: 'node app/server.mjs' });
});

test('public export blocks a planted token without echoing its value', async t => {
  const token = 'sk-' + 'test'.repeat(8);
  const f = await fixture(t, ['README.md'], { 'README.md': token });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /possible API token/);
  assert.equal(result.stderr.includes(token), false);
  await assert.rejects(readdir(join(f.root, 'dist')), { code: 'ENOENT' });
});

test('public export rejects traversal and sensitive paths before writing an output', async t => {
  for (const path of ['../outside.txt', '.allot/config.json', 'app/.env', 'android/release.jks']) {
    const f = await fixture(t, [path]);
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Disallowed public path|Unsafe path/);
    await assert.rejects(readdir(join(f.root, 'dist')), { code: 'ENOENT' });
  }
});
