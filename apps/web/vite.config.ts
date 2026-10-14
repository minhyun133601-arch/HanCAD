import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const appRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ command }) => ({
  root: appRoot,
  resolve: {
    alias: [{ find: /^@hancad\/(.+)$/, replacement: `${workspaceRoot}/packages/$1/src/index.ts` }],
  },
  plugins: [
    react(),
    {
      name: 'hancad-local-development-csp',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) =>
          command === 'serve'
            ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
            : html,
      },
    },
  ],
  base: './',
  server: {
    headers: { 'X-HanCAD-Preview': '1' },
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    fs: { allow: [workspaceRoot] },
  },
  preview: { host: '127.0.0.1', port: 1420, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
}));
