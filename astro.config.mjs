import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  output: 'static',
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
