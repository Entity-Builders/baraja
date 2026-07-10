import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { localDeckCmsPlugin } from './dev-server/localDeckCmsPlugin';
import { musicBingoValidationPdfPlugin } from './dev-server/musicBingoValidationPdfPlugin';

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const posthogKey = process.env.VITE_POSTHOG_KEY || process.env.ENTITY_BUILDERS_CORE_POSTHOG_KEY || '';
const posthogHost =
  process.env.VITE_POSTHOG_HOST ||
  process.env.ENTITY_BUILDERS_CORE_POSTHOG_HOST ||
  'https://us.i.posthog.com';
const BARAJA_PRODUCTION_SUPABASE_URL = 'https://xfcvuzcxvdpzkqpnahyx.supabase.co';

function isLocalUrl(value: string) {
  try {
    const { hostname } = new URL(value);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '0.0.0.0';
  } catch {
    return false;
  }
}

function getProductionSupabaseUrl() {
  const configuredUrl =
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    BARAJA_PRODUCTION_SUPABASE_URL;

  return isLocalUrl(configuredUrl) ? BARAJA_PRODUCTION_SUPABASE_URL : configuredUrl;
}

function getProductionCheckoutApiUrl() {
  const configuredUrl = process.env.VITE_BARAJA_MUSIC_BINGO_CHECKOUT_API_URL?.trim() || '';
  return configuredUrl && !isLocalUrl(configuredUrl) ? configuredUrl : '';
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isProductionBuild = command === 'build' && mode === 'production';

  return {
    plugins: [react(), cloudflare(), localDeckCmsPlugin(), musicBingoValidationPdfPlugin()],
    publicDir: 'public',
    define: {
      'import.meta.env.VITE_POSTHOG_KEY': JSON.stringify(posthogKey),
      'import.meta.env.VITE_POSTHOG_HOST': JSON.stringify(posthogHost),
      ...(isProductionBuild
        ? {
            'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(getProductionSupabaseUrl()),
            'import.meta.env.VITE_BARAJA_MUSIC_BINGO_CHECKOUT_API_URL': JSON.stringify(
              getProductionCheckoutApiUrl()
            ),
          }
        : {}),
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        'npm:pdf-lib@1.17.1': '@pdfme/pdf-lib',
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
  };
});
