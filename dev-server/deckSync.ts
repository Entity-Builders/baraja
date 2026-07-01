import { exec } from 'node:child_process';
import { DECK_ENGINE_DIR } from './paths';

/** Regenerate decks.ts so Vite HMR picks up new JSON files */
export function runDeckSync(): Promise<void> {
  return new Promise((resolve, reject) => {
    exec('npm run sync', { cwd: DECK_ENGINE_DIR }, (error, stdout, stderr) => {
      if (stdout) {
        console.log(stdout.trim());
      }

      if (stderr) {
        console.error(stderr.trim());
      }

      if (error) {
        reject(error);
      } else {
        console.log('🔄 [Deck Sync] decks.ts regenerated.');
        resolve();
      }
    });
  });
}

export function triggerDeckSync() {
  runDeckSync().catch((error) => {
    console.error('⚠️ [Auto-Sync] Failed to regenerate decks.ts:', error);
  });
}
