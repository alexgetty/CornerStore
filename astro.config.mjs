import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  output: 'static',
  // Library build (tsc -p tsconfig.lib.json) writes to ./dist/.
  // Astro would clobber that output by default, breaking the self-import
  // of `corner-store` from src/pages/*.astro. Redirect Astro's build output
  // so the two artifacts can coexist during repo-local development.
  outDir: './dist-site/',
  integrations: [mdx()],
  vite: {
    plugins: [{
      name: 'corner-store-theme-watcher',
      configureServer(server) {
        server.watcher.add('./theme');
        server.watcher.on('change', (path) => {
          if (path.includes('theme')) {
            server.ws.send({ type: 'full-reload' });
          }
        });
      },
    }],
  },
});
