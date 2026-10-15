import { defineConfig } from 'vite';

/**
 * The server as one file, dist-server/main.js: server/ plus the game code it shares with the
 * browser (src/sim, src/ai, src/net, src/content), and ws, so the container needs no npm install.
 */
export default defineConfig({
  build: {
    ssr: 'server/main.ts',
    outDir: 'dist-server',
    target: 'node24',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    rollupOptions: { output: { entryFileNames: 'main.js', format: 'es' } },
  },
  ssr: { noExternal: true, target: 'node' },
});
