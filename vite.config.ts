import { defineConfig, type Plugin } from 'vite';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

/** A build végén elkészíti a service workert a teljes előtöltési listával (offline indulás). */
function serviceWorker(): Plugin {
  return {
    name: 'mikulas-sw',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const files: string[] = [];
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else if (f !== 'sw.js') files.push(relative(dist, p).split('\\').join('/'));
        }
      };
      walk(dist);
      const hash = createHash('sha1');
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(dist, f)));
      const version = hash.digest('hex').slice(0, 10);
      const tpl = readFileSync('src/sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__FILES__', JSON.stringify(['./', ...files.map((f) => `./${f}`)]));
      writeFileSync(join(dist, 'sw.js'), tpl);
    },
  };
}

export default defineConfig({
  base: './',
  server: { host: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  // a menüben látszó build-idő (így látszik, ha még régi változat fut)
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: [serviceWorker()],
});
