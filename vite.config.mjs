import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFile } from 'node:fs/promises';

export default defineConfig({
  root: 'app/public',
  publicDir: false,
  base: './',
  plugins: [vue(), {
    name: 'third-party-notices',
    async generateBundle() {
      for (const [name, path] of [
        ['marked', 'app/public/vendor/marked-LICENSE'],
        ['dompurify', 'app/public/vendor/dompurify-LICENSE'],
        ['vue', 'node_modules/vue/LICENSE']
      ]) this.emitFile({ type: 'asset', fileName: `licenses/${name}.txt`, source: await readFile(path, 'utf8') });
    }
  }],
  build: { outDir: '../../dist/web', emptyOutDir: true, target: 'es2020' }
});
