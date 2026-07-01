import fsSync from 'node:fs';
import dotenv from 'dotenv';
import { BARAJA_LOCAL_ENV_PATH, LOCAL_SOURCE_ENV_PATH, ROOT_ENV_PATH } from './paths';

// Keep legacy root env loading for existing non-Gemini admin integrations.
dotenv.config({ path: ROOT_ENV_PATH });

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fsSync.existsSync(filePath)) return {};
  return dotenv.parse(fsSync.readFileSync(filePath));
}

const barajaEnvFiles = [
  loadEnvFile(BARAJA_LOCAL_ENV_PATH),
  loadEnvFile(LOCAL_SOURCE_ENV_PATH),
  loadEnvFile(ROOT_ENV_PATH),
];

export function getFirstNonEmpty(values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();
}

export function getEnvValue(key: string): string | undefined {
  return getFirstNonEmpty([
    process.env[key],
    ...barajaEnvFiles.map((env) => env[key]),
  ]);
}

export function getBarajaGeminiApiKey(): string | undefined {
  return getFirstNonEmpty([
    getEnvValue('BARAJA_GEMINI_API_KEY'),
    getEnvValue('ENTITYBUILDERS_LOCAL_GEMINI_API_KEY'),
    getEnvValue('GEMINI_API_KEY'),
  ]);
}

export const MISSING_GEMINI_API_KEY_ERROR =
  'Gemini API key not configured. Set BARAJA_GEMINI_API_KEY or ENTITYBUILDERS_LOCAL_GEMINI_API_KEY in .env.source.local, or legacy GEMINI_API_KEY in root .env.';
