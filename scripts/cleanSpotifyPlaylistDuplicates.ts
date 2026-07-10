import {
  cleanupSpotifyPlaylistDuplicates,
  type SpotifyCredentials,
  type SpotifyPlaylistDuplicateCleanupResult,
  type SpotifyPlaylistDuplicateMatchMode,
} from '@eb-packages/spotify-service';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BARAJA_MUSIC_BINGO_SEED_COLLECTIONS,
} from './musicBingoCollectionSeeds';

interface CliOptions {
  apply: boolean;
  collectionId?: string;
  help: boolean;
  market?: string;
  matchMode: SpotifyPlaylistDuplicateMatchMode;
  playlistUrl?: string;
}

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const appRoot = path.resolve(scriptsDir, '..');
const repoRoot = path.resolve(appRoot, '../..');

loadEnv();

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const playlistUrl = getPlaylistUrl(options);
  const result = await cleanupSpotifyPlaylistDuplicates({
    playlistUrl,
    credentials: getSpotifyCredentials(),
    dryRun: !options.apply,
    market: options.market,
    matchMode: options.matchMode,
  });

  printCleanupResult(result);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

function loadEnv(): void {
  for (const envPath of [
    path.join(repoRoot, '.env'),
    path.join(appRoot, '.env.local'),
    path.join(appRoot, '.env'),
    path.join(appRoot, '.dev.vars'),
  ]) {
    dotenv.config({ path: envPath, override: false });
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    help: false,
    matchMode: 'song',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--dry-run') {
      options.apply = false;
    } else if (arg === '--collection') {
      options.collectionId = readArgValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--collection=')) {
      options.collectionId = arg.slice('--collection='.length);
    } else if (arg === '--playlist') {
      options.playlistUrl = readArgValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--playlist=')) {
      options.playlistUrl = arg.slice('--playlist='.length);
    } else if (arg === '--market') {
      options.market = readArgValue(argv, index, arg).toUpperCase();
      index += 1;
    } else if (arg.startsWith('--market=')) {
      options.market = arg.slice('--market='.length).toUpperCase();
    } else if (arg === '--match') {
      options.matchMode = parseMatchMode(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--match=')) {
      options.matchMode = parseMatchMode(arg.slice('--match='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.playlistUrl && options.collectionId) {
    throw new Error('Use either --playlist or --collection, not both.');
  }

  return options;
}

function readArgValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${arg}.`);
  }
  return value;
}

function parseMatchMode(value: string): SpotifyPlaylistDuplicateMatchMode {
  if (value === 'song' || value === 'uri') return value;
  throw new Error('--match must be "song" or "uri".');
}

function getPlaylistUrl(options: CliOptions): string {
  if (options.playlistUrl?.trim()) return options.playlistUrl.trim();

  if (options.collectionId) {
    const collection = BARAJA_MUSIC_BINGO_SEED_COLLECTIONS.find(
      (candidate) => candidate.id === options.collectionId
    );
    if (!collection) {
      throw new Error(`Unknown collection id: ${options.collectionId}.`);
    }
    if (!collection.spotifyUrl) {
      throw new Error(`Collection ${collection.id} does not have a spotifyUrl.`);
    }
    return collection.spotifyUrl;
  }

  throw new Error('Pass --playlist <spotify-url> or --collection <id>.');
}

function getSpotifyCredentials(): SpotifyCredentials {
  const accessToken = process.env.SPOTIFY_ACCESS_TOKEN?.trim();
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN?.trim();

  if (accessToken) {
    return { accessToken };
  }

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Spotify credentials. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN with playlist-modify scopes.'
    );
  }

  return { clientId, clientSecret, refreshToken };
}

function printCleanupResult(result: SpotifyPlaylistDuplicateCleanupResult): void {
  if (!result.ok) {
    console.error(`${result.reason}: ${result.message}`);
    if (result.operation) console.error(`Operation: ${result.operation}`);
    if (result.retryAfterSeconds) console.error(`Retry after: ${result.retryAfterSeconds}s`);
    return;
  }

  console.log(
    `${result.dryRun ? 'Dry run' : 'Applied'} duplicate cleanup for ${result.playlistId}.`
  );
  console.log(
    `Match mode: ${result.matchMode}. Tracks: ${result.totalTrackCount}. Duplicate groups: ${result.duplicateGroups.length}. Duplicate tracks: ${result.duplicateTrackCount}. Removed: ${result.removedTrackCount}.`
  );

  if (result.duplicateGroups.length > 0) {
    console.table(
      result.duplicateGroups.flatMap((group) =>
        group.duplicateTracks.map((track) => ({
          key: group.key,
          keptPosition: group.keptTrack.position + 1,
          removePosition: track.position + 1,
          kept: `${group.keptTrack.artistDisplayName} - ${group.keptTrack.title}`,
          duplicate: `${track.artistDisplayName} - ${track.title}`,
          duplicateUri: track.uri,
        }))
      )
    );
  }

  if (result.dryRun && result.duplicateTrackCount > 0) {
    console.log('No se borro nada. Repeti con --apply para eliminar las posiciones duplicadas.');
  }
}

function printHelp(): void {
  console.log(`
Clean duplicate tracks from a Spotify playlist.

Dry-run by default:
  yarn workspace baraja clean:spotify-playlist:duplicates --collection rock-argentino-esenciales
  yarn workspace baraja clean:spotify-playlist:duplicates --playlist https://open.spotify.com/playlist/...

Apply removals:
  yarn workspace baraja clean:spotify-playlist:duplicates --collection rock-argentino-esenciales --apply

Options:
  --collection <id>      Use a configured Baraja music bingo collection.
  --playlist <url>       Use an explicit Spotify playlist URL or URI.
  --match song|uri       Match duplicates by artist/title (default) or exact URI.
  --market <code>        Spotify market, e.g. AR.
  --apply                Remove duplicates. Without this, the script only reports.
  --dry-run              Force report-only mode.
`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
