import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { localDeckCmsPlugin } from './dev-server/localDeckCmsPlugin';

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const posthogKey = process.env.VITE_POSTHOG_KEY || process.env.ENTITY_BUILDERS_CORE_POSTHOG_KEY || '';
const posthogHost =
  process.env.VITE_POSTHOG_HOST ||
  process.env.ENTITY_BUILDERS_CORE_POSTHOG_HOST ||
  'https://us.i.posthog.com';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare(), localDeckCmsPlugin()],
  publicDir: 'public',
  define: {
    'import.meta.env.VITE_POSTHOG_KEY': JSON.stringify(posthogKey),
    'import.meta.env.VITE_POSTHOG_HOST': JSON.stringify(posthogHost),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(APP_DIR, 'node_modules/react'),
      'react-dom': path.resolve(APP_DIR, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(APP_DIR, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(APP_DIR, 'node_modules/react/jsx-dev-runtime.js'),
      'react-dom/client': path.resolve(APP_DIR, 'node_modules/react-dom/client.js'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
    exclude: ['@pdfme/ui'],
  },
  server: {
    allowedHosts: true,
    port: 5175,
  },
});
