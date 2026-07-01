import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV_SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

export const APP_DIR = path.resolve(DEV_SERVER_DIR, '..');
export const REPO_ROOT = path.resolve(APP_DIR, '../..');
export const DECK_ENGINE_DIR = path.resolve(REPO_ROOT, 'packages/deck-engine');
export const CONTENT_DIR = path.resolve(DECK_ENGINE_DIR, 'src/content');
export const BARAJA_PUBLIC_DIR = path.resolve(APP_DIR, 'public');
export const ASSETS_DIR = path.resolve(BARAJA_PUBLIC_DIR, 'assets/editions');
export const ROOT_ENV_PATH = path.resolve(REPO_ROOT, '.env');
export const LOCAL_SOURCE_ENV_PATH = path.resolve(REPO_ROOT, '.env.source.local');
export const BARAJA_LOCAL_ENV_PATH = path.resolve(APP_DIR, '.env.local');
