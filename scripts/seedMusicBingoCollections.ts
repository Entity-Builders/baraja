import {
  createSpotifyPlaylistFromQueries,
  parseSpotifyPlaylistId,
  normalizeSeedQueryKey,
  resolveSpotifyPlaylist,
  type SpotifyPlaylistData,
  type SpotifyPlaylistSeedResult,
  type SpotifyPlaylistSeedTrackMatch,
} from '@eb-packages/spotify-service';
import {
  getMusicBingoUsableSongPool,
  type MusicBingoSong,
} from '@eb-packages/deck-engine';
import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BARAJA_MUSIC_BINGO_SEED_COLLECTIONS,
  type BarajaMusicBingoSeedCollection,
} from './musicBingoCollectionSeeds';

interface CliOptions {
  check: boolean;
  cachePath: string;
  catalogSqlPath: string;
  catalogMaxTracks: number;
  catalogApply: boolean;
  catalogApplyRemote: boolean;
  create: boolean;
  enforceTarget: boolean;
  help: boolean;
  includeSeededPrefix: boolean;
  list: boolean;
  market?: string;
  maxQueries?: number;
  fallbackRateLimitWaitSeconds: number;
  maxRateLimitWaits: number;
  onlyCollectionIds: string[];
  queryOffset: number;
  rateLimitBufferSeconds: number;
  reportPath: string;
  requestDelayMs?: number;
  runAllSafe: boolean;
  selectAll: boolean;
  stopOnRateLimit: boolean;
  syncCatalog: boolean;
  useCache: boolean;
  waitOnRateLimit: boolean;
  visibility?: boolean;
}

interface CollectionRunSummary {
  id: string;
  name: string;
  ok: boolean;
  dryRun: boolean;
  requestedSongCount: number;
  submittedQueryCount: number;
  minimumSongCount: number;
  targetSongCount: number;
  targetGap: number;
  matchedTrackCount: number;
  unmatchedQueryCount: number;
  addedTrackCount: number;
  cachedMatchCount: number;
  searchedQueryCount: number;
  playlistUrl: string | null;
  failedOperation?: string;
  failedQuery?: string;
  message?: string;
  reason?: string;
  retryAfterSeconds?: number;
  unmatchedQueries: string[];
}

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const appRoot = path.resolve(scriptsDir, '..');
const repoRoot = path.resolve(appRoot, '../..');
const DEFAULT_REPORT_PATH = path.join(
  appRoot,
  'tmp',
  'music-bingo-collection-seed-report.json',
);
const DEFAULT_CACHE_PATH = path.join(
  appRoot,
  'tmp',
  'music-bingo-spotify-track-cache.json',
);
const DEFAULT_CATALOG_SQL_PATH = path.join(
  appRoot,
  'tmp',
  'music-bingo-catalog-sync.sql',
);

interface SpotifySeedTrackCacheFile {
  version: 1;
  updatedAt: string;
  matches: Record<string, CachedSpotifySeedTrackMatch>;
}

type CachedSpotifySeedTrackMatch = SpotifyPlaylistSeedTrackMatch & {
  cachedAt?: string;
  market?: string;
};

interface CatalogSyncRow {
  collection: BarajaMusicBingoSeedCollection;
  playlist: SpotifyPlaylistData | null;
}

interface CatalogTrack {
  id: string | null;
  title: string;
  artistDisplayName: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
}

loadEnv();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const selectedCollections = selectCollections(options);
  validateCollections(BARAJA_MUSIC_BINGO_SEED_COLLECTIONS);

  if (options.list) {
    printCollectionList(BARAJA_MUSIC_BINGO_SEED_COLLECTIONS);
    return;
  }

  if (options.check) {
    printCollectionList(selectedCollections);
    console.log('Collection seed definitions are valid.');
    return;
  }

  if (options.syncCatalog) {
    await syncCatalogCollections(selectedCollections, options);
    return;
  }

  if (options.create && !options.selectAll && options.onlyCollectionIds.length === 0) {
    throw new Error('Creating playlists requires --all or at least one --collection <id>.');
  }

  const credentials = getSpotifyCredentials();
  const summaries: CollectionRunSummary[] = [];
  const cache = options.useCache ? await readTrackCache(options.cachePath) : createEmptyTrackCache();

  const requestDelayMs = options.requestDelayMs ?? (options.create ? 1500 : 0);

  for (let collectionIndex = 0; collectionIndex < selectedCollections.length; collectionIndex += 1) {
    const collection = selectedCollections[collectionIndex];
    const submittedSongs = getSubmittedSongs(collection, options);
    const market = options.market ?? collection.market;
    const initialCachedTrackMatches = getCachedTrackMatches(cache, market, submittedSongs);
    const initialCachedMatchCount = Object.keys(initialCachedTrackMatches).length;
    const initialSearchedQueryCount = submittedSongs.length - initialCachedMatchCount;
    if (options.enforceTarget && collection.songs.length < collection.minimumSongCount) {
      summaries.push({
        id: collection.id,
        name: collection.name,
        ok: false,
        dryRun: !options.create,
        requestedSongCount: collection.songs.length,
        submittedQueryCount: submittedSongs.length,
        minimumSongCount: collection.minimumSongCount,
        targetSongCount: collection.targetSongCount,
        targetGap: Math.max(0, collection.targetSongCount - collection.songs.length),
        matchedTrackCount: 0,
        unmatchedQueryCount: 0,
        addedTrackCount: 0,
        cachedMatchCount: initialCachedMatchCount,
        searchedQueryCount: initialSearchedQueryCount,
        playlistUrl: null,
        failedOperation: undefined,
        failedQuery: undefined,
        reason: 'below_minimum',
        message: `Collection has ${collection.songs.length} seed songs; minimum is ${collection.minimumSongCount}.`,
        retryAfterSeconds: undefined,
        unmatchedQueries: [],
      });
      continue;
    }

    let rateLimitWaitCount = 0;
    let result: SpotifyPlaylistSeedResult;
    let cachedMatchCount = initialCachedMatchCount;
    let searchedQueryCount = initialSearchedQueryCount;

    while (true) {
      const cachedTrackMatches = getCachedTrackMatches(cache, market, submittedSongs);
      cachedMatchCount = Object.keys(cachedTrackMatches).length;
      searchedQueryCount = submittedSongs.length - cachedMatchCount;

      const retryLabel = rateLimitWaitCount > 0 ? ` retry ${rateLimitWaitCount}` : '';
      console.log(`${options.create ? 'Creating' : 'Dry-running'} ${collection.name}${retryLabel}...`);

      result = await createSpotifyPlaylistFromQueries({
        credentials,
        name: collection.name,
        description: collection.description,
        cachedTrackMatches,
        dryRun: !options.create,
        isPublic: options.visibility ?? collection.isPublic,
        market,
        maxQueries: options.maxQueries,
        requestDelayMs,
        playlistUrl: collection.spotifyUrl,
        queries: submittedSongs,
      });

      if (result.ok) break;

      if (result.matchedTracks?.length) {
        addMatchesToCache(cache, market, result.matchedTracks);
        if (options.useCache) await writeTrackCache(options.cachePath, cache);
      }

      if (shouldWaitForRateLimit(result, options, rateLimitWaitCount)) {
        const waitSeconds = getRateLimitWaitSeconds(result, options);
        const interimSummary = createFailureSummary({
          collection,
          dryRun: !options.create,
          result,
          submittedSongs,
          cachedMatchCount,
          searchedQueryCount,
        });
        await writeReport(options.reportPath, [...summaries, interimSummary]);
        rateLimitWaitCount += 1;
        console.log(
          `Spotify rate-limited ${result.operation ?? 'unknown operation'}; waiting ${formatDuration(waitSeconds)} before retry ${rateLimitWaitCount}.`,
        );
        await sleep(waitSeconds * 1000);
        continue;
      }

      break;
    }

    if (!result.ok) {
      summaries.push(createFailureSummary({
        collection,
        dryRun: !options.create,
        result,
        submittedSongs,
        cachedMatchCount,
        searchedQueryCount,
      }));

      if (result.reason === 'rate_limited' && options.stopOnRateLimit) {
        appendSkippedAfterRateLimit(
          summaries,
          selectedCollections.slice(collectionIndex + 1),
          options,
        );
        break;
      }
      continue;
    }

    addMatchesToCache(cache, market, result.matchedTracks);
    if (options.useCache) await writeTrackCache(options.cachePath, cache);

    summaries.push({
      id: collection.id,
      name: collection.name,
      ok: true,
      dryRun: result.dryRun,
      requestedSongCount: collection.songs.length,
      submittedQueryCount: submittedSongs.length,
      minimumSongCount: collection.minimumSongCount,
      targetSongCount: collection.targetSongCount,
      targetGap: Math.max(0, collection.targetSongCount - collection.songs.length),
      matchedTrackCount: result.matchedTracks.length,
      unmatchedQueryCount: result.unmatchedQueries.length,
      addedTrackCount: result.addedTrackCount,
      cachedMatchCount,
      searchedQueryCount,
      playlistUrl: result.playlist?.spotifyUrl ?? collection.spotifyUrl ?? null,
      failedOperation: undefined,
      failedQuery: undefined,
      retryAfterSeconds: undefined,
      unmatchedQueries: result.unmatchedQueries,
    });
  }

  printRunSummary(summaries);
  await writeReport(options.reportPath, summaries);
}

function loadEnv() {
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
    cachePath: DEFAULT_CACHE_PATH,
    catalogApply: false,
    catalogApplyRemote: false,
    catalogMaxTracks: 500,
    catalogSqlPath: DEFAULT_CATALOG_SQL_PATH,
    check: false,
    create: false,
    enforceTarget: false,
    fallbackRateLimitWaitSeconds: 300,
    help: false,
    includeSeededPrefix: false,
    list: false,
    maxRateLimitWaits: 6,
    onlyCollectionIds: [],
    queryOffset: 0,
    rateLimitBufferSeconds: 5,
    reportPath: DEFAULT_REPORT_PATH,
    runAllSafe: false,
    stopOnRateLimit: true,
    selectAll: false,
    syncCatalog: false,
    useCache: true,
    waitOnRateLimit: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--all') {
      options.selectAll = true;
    } else if (arg === '--apply-catalog') {
      options.catalogApply = true;
    } else if (arg === '--apply-catalog-remote') {
      options.catalogApply = true;
      options.catalogApplyRemote = true;
    } else if (arg === '--cache') {
      options.cachePath = path.resolve(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--cache=')) {
      options.cachePath = path.resolve(arg.slice('--cache='.length));
    } else if (arg === '--catalog-max-tracks') {
      options.catalogMaxTracks = Number(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--catalog-max-tracks=')) {
      options.catalogMaxTracks = Number(arg.slice('--catalog-max-tracks='.length));
    } else if (arg === '--catalog-sql') {
      options.catalogSqlPath = path.resolve(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--catalog-sql=')) {
      options.catalogSqlPath = path.resolve(arg.slice('--catalog-sql='.length));
    } else if (arg === '--check') {
      options.check = true;
    } else if (arg === '--create') {
      options.create = true;
    } else if (arg === '--dry-run') {
      options.create = false;
    } else if (arg === '--enforce-target') {
      options.enforceTarget = true;
    } else if (arg === '--include-seeded-prefix') {
      options.includeSeededPrefix = true;
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--no-cache') {
      options.useCache = false;
    } else if (arg === '--continue-on-rate-limit') {
      options.stopOnRateLimit = false;
    } else if (arg === '--stop-on-rate-limit') {
      options.stopOnRateLimit = true;
    } else if (arg === '--sync-catalog') {
      options.syncCatalog = true;
    } else if (arg === '--public') {
      options.visibility = true;
    } else if (arg === '--private') {
      options.visibility = false;
    } else if (arg === '--collection') {
      options.onlyCollectionIds.push(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--collection=')) {
      options.onlyCollectionIds.push(arg.slice('--collection='.length));
    } else if (arg === '--market') {
      options.market = readArgValue(argv, index, arg).toUpperCase();
      index += 1;
    } else if (arg.startsWith('--market=')) {
      options.market = arg.slice('--market='.length).toUpperCase();
    } else if (arg === '--max-queries') {
      options.maxQueries = Number(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--max-queries=')) {
      options.maxQueries = Number(arg.slice('--max-queries='.length));
    } else if (arg === '--query-offset') {
      options.queryOffset = Number(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--query-offset=')) {
      options.queryOffset = Number(arg.slice('--query-offset='.length));
    } else if (arg === '--request-delay-ms') {
      options.requestDelayMs = Number(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--request-delay-ms=')) {
      options.requestDelayMs = Number(arg.slice('--request-delay-ms='.length));
    } else if (arg === '--run-all-safe') {
      options.runAllSafe = true;
    } else if (arg === '--wait-on-rate-limit') {
      options.waitOnRateLimit = true;
    } else if (arg === '--no-wait-on-rate-limit') {
      options.waitOnRateLimit = false;
    } else if (arg === '--max-rate-limit-waits') {
      options.maxRateLimitWaits = Number(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--max-rate-limit-waits=')) {
      options.maxRateLimitWaits = Number(arg.slice('--max-rate-limit-waits='.length));
    } else if (arg === '--rate-limit-buffer-seconds') {
      options.rateLimitBufferSeconds = Number(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--rate-limit-buffer-seconds=')) {
      options.rateLimitBufferSeconds = Number(arg.slice('--rate-limit-buffer-seconds='.length));
    } else if (arg === '--rate-limit-wait-seconds') {
      options.fallbackRateLimitWaitSeconds = Number(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--rate-limit-wait-seconds=')) {
      options.fallbackRateLimitWaitSeconds = Number(arg.slice('--rate-limit-wait-seconds='.length));
    } else if (arg === '--report') {
      options.reportPath = path.resolve(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--report=')) {
      options.reportPath = path.resolve(arg.slice('--report='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.runAllSafe) {
    options.create = true;
    options.selectAll = true;
    options.enforceTarget = true;
    options.visibility = false;
    options.waitOnRateLimit = true;
    if (options.requestDelayMs === undefined) {
      options.requestDelayMs = 10000;
    }
  }

  if (options.maxQueries !== undefined && (!Number.isFinite(options.maxQueries) || options.maxQueries < 1)) {
    throw new Error('--max-queries must be a positive number.');
  }
  if (!Number.isInteger(options.catalogMaxTracks) || options.catalogMaxTracks < 1) {
    throw new Error('--catalog-max-tracks must be a positive integer.');
  }
  if (!Number.isInteger(options.maxRateLimitWaits) || options.maxRateLimitWaits < 0) {
    throw new Error('--max-rate-limit-waits must be zero or a positive integer.');
  }
  if (!Number.isInteger(options.queryOffset) || options.queryOffset < 0) {
    throw new Error('--query-offset must be zero or a positive integer.');
  }
  if (!Number.isFinite(options.rateLimitBufferSeconds) || options.rateLimitBufferSeconds < 0) {
    throw new Error('--rate-limit-buffer-seconds must be zero or a positive number.');
  }
  if (!Number.isFinite(options.fallbackRateLimitWaitSeconds) || options.fallbackRateLimitWaitSeconds < 1) {
    throw new Error('--rate-limit-wait-seconds must be a positive number.');
  }
  if (
    options.requestDelayMs !== undefined &&
    (!Number.isFinite(options.requestDelayMs) || options.requestDelayMs < 0)
  ) {
    throw new Error('--request-delay-ms must be zero or a positive number.');
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

function selectCollections(options: CliOptions): BarajaMusicBingoSeedCollection[] {
  if (options.onlyCollectionIds.length === 0) {
    return BARAJA_MUSIC_BINGO_SEED_COLLECTIONS;
  }

  const collectionById = new Map(
    BARAJA_MUSIC_BINGO_SEED_COLLECTIONS.map((collection) => [collection.id, collection]),
  );
  return options.onlyCollectionIds.map((id) => {
    const collection = collectionById.get(id);
    if (!collection) {
      throw new Error(`Unknown collection id: ${id}. Run with --list to see options.`);
    }
    return collection;
  });
}

function getSubmittedSongs(collection: BarajaMusicBingoSeedCollection, options: CliOptions): string[] {
  const seededSongCount = collection.seededSongCount ?? 0;
  const shouldSkipSeededPrefix =
    !options.includeSeededPrefix &&
    Boolean(collection.spotifyUrl) &&
    seededSongCount > 0 &&
    seededSongCount < collection.songs.length;

  const unseededSongs = shouldSkipSeededPrefix ? collection.songs.slice(seededSongCount) : collection.songs;
  const offsetSongs = unseededSongs.slice(options.queryOffset);
  return options.maxQueries === undefined ? offsetSongs : offsetSongs.slice(0, options.maxQueries);
}

function validateCollections(collections: BarajaMusicBingoSeedCollection[]) {
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const collection of collections) {
    if (!collection.id.trim()) throw new Error('A collection is missing an id.');
    if (!collection.name.trim()) throw new Error(`Collection ${collection.id} is missing a name.`);
    if (ids.has(collection.id)) throw new Error(`Duplicate collection id: ${collection.id}.`);
    if (names.has(collection.name)) throw new Error(`Duplicate collection name: ${collection.name}.`);
    if (!/^[A-Z]{2}$/.test(collection.market)) {
      throw new Error(`Collection ${collection.id} has invalid market ${collection.market}.`);
    }
    if (collection.minimumSongCount <= 0 || collection.targetSongCount < collection.minimumSongCount) {
      throw new Error(`Collection ${collection.id} has invalid target counts.`);
    }
    if (!collection.catalog.categoryId.trim()) {
      throw new Error(`Collection ${collection.id} is missing catalog.categoryId.`);
    }
    if (!collection.catalog.categoryLabel.trim()) {
      throw new Error(`Collection ${collection.id} is missing catalog.categoryLabel.`);
    }
    if (!collection.catalog.genreLabel.trim()) {
      throw new Error(`Collection ${collection.id} is missing catalog.genreLabel.`);
    }
    if (!collection.catalog.energyLabel.trim()) {
      throw new Error(`Collection ${collection.id} is missing catalog.energyLabel.`);
    }
    if (collection.catalog.occasionLabels.length === 0) {
      throw new Error(`Collection ${collection.id} needs at least one occasion label.`);
    }
    if (collection.catalog.supportedBoardSizes.length === 0) {
      throw new Error(`Collection ${collection.id} needs supported board sizes.`);
    }
    if (
      collection.seededSongCount !== undefined &&
      (!Number.isInteger(collection.seededSongCount) ||
        collection.seededSongCount < 0 ||
        collection.seededSongCount > collection.songs.length)
    ) {
      throw new Error(`Collection ${collection.id} has invalid seeded song count.`);
    }

    const normalizedSongs = new Set<string>();
    for (const song of collection.songs) {
      const normalizedSong = song.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!normalizedSong) throw new Error(`Collection ${collection.id} has an empty song query.`);
      if (normalizedSongs.has(normalizedSong)) {
        throw new Error(`Collection ${collection.id} has duplicate song query: ${song}.`);
      }
      normalizedSongs.add(normalizedSong);
    }

    ids.add(collection.id);
    names.add(collection.name);
  }
}

function getSpotifyCredentials() {
  const accessToken = process.env.SPOTIFY_ACCESS_TOKEN?.trim();
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN?.trim();

  if (accessToken) {
    return { accessToken };
  }

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Spotify credentials. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN with playlist-modify scopes.',
    );
  }

  return { clientId, clientSecret, refreshToken };
}

function printCollectionList(collections: BarajaMusicBingoSeedCollection[]) {
  console.table(
    collections.map((collection) => ({
      id: collection.id,
      songs: collection.songs.length,
      seeded: collection.seededSongCount ?? 0,
      min: collection.minimumSongCount,
      target: collection.targetSongCount,
      market: collection.market,
      public: collection.isPublic,
    })),
  );
}

function printRunSummary(summaries: CollectionRunSummary[]) {
  console.table(
    summaries.map((summary) => ({
      id: summary.id,
      ok: summary.ok,
      dryRun: summary.dryRun,
      requested: summary.requestedSongCount,
      submitted: summary.submittedQueryCount,
      matched: summary.matchedTrackCount,
      unmatched: summary.unmatchedQueryCount,
      added: summary.addedTrackCount,
      cached: summary.cachedMatchCount,
      searched: summary.searchedQueryCount,
      targetGap: summary.targetGap,
      url: summary.playlistUrl ?? '',
      reason: summary.reason ?? '',
      operation: summary.failedOperation ?? '',
      retryAfter: summary.retryAfterSeconds ?? '',
      failedQuery: summary.failedQuery ?? '',
    })),
  );
}

async function syncCatalogCollections(
  collections: BarajaMusicBingoSeedCollection[],
  options: CliOptions,
) {
  const credentials = collections.some((collection) => Boolean(collection.spotifyUrl))
    ? getSpotifyCredentials()
    : null;
  const rows: CatalogSyncRow[] = [];

  for (const collection of collections) {
    let playlist: SpotifyPlaylistData | null = null;

    if (collection.spotifyUrl && credentials) {
      console.log(`Syncing ${collection.name} from Spotify...`);
      const result = await resolveSpotifyPlaylist({
        playlistUrl: collection.spotifyUrl,
        credentials,
        maxTracks: options.catalogMaxTracks,
        market: collection.market,
      });

      if (result.ok) {
        playlist = result.playlist;
      } else {
        console.warn(
          `Could not resolve ${collection.id}; using local seed metadata. ${result.reason}: ${result.message}`,
        );
      }
    }

    rows.push({ collection, playlist });
  }

  const sql = buildCatalogSyncSql(rows);
  await mkdir(path.dirname(options.catalogSqlPath), { recursive: true });
  await writeFile(options.catalogSqlPath, sql);
  console.log(`Catalog sync SQL written to ${options.catalogSqlPath}`);

  printCatalogSyncSummary(rows);

  if (options.catalogApply) {
    applyCatalogSql(options);
  }
}

function buildCatalogSyncSql(rows: CatalogSyncRow[]): string {
  const now = new Date().toISOString();
  const statements = rows.map((row, index) => buildCatalogUpsertStatement(row, index, now));

  return [
    '-- Generated by apps/baraja/scripts/seedMusicBingoCollections.ts --sync-catalog',
    `-- Generated at ${now}`,
    'BEGIN TRANSACTION;',
    ...statements,
    'COMMIT;',
    '',
  ].join('\n');
}

function buildCatalogUpsertStatement(
  row: CatalogSyncRow,
  index: number,
  syncedAt: string,
): string {
  const collection = row.collection;
  const playlist = row.playlist;
  const tracks = getCatalogTracks(collection, playlist);
  const spotifyUrl = playlist?.spotifyUrl ?? collection.spotifyUrl ?? null;
  const spotifyPlaylistId = spotifyUrl ? parseSpotifyPlaylistId(spotifyUrl) : null;
  const coverImageUrl = playlist?.coverImageUrl ?? tracks.find((track) => track.imageUrl)?.imageUrl ?? null;
  const title = toCatalogCollectionTitle(collection.name);
  const songCount = getCatalogUsableSongCount(tracks);
  const searchTerms = [
    ...collection.catalog.searchTerms,
    collection.name,
    collection.description,
    title,
  ];

  const values = [
    sqlValue(collection.id),
    sqlValue(title),
    sqlValue(collection.description),
    sqlValue(spotifyPlaylistId),
    sqlValue(spotifyUrl),
    sqlValue(coverImageUrl),
    sqlValue(collection.market),
    sqlValue(collection.isPublic ? 'public' : 'private'),
    sqlValue('published'),
    sqlValue(collection.catalog.categoryId),
    sqlValue(collection.catalog.categoryLabel),
    sqlValue(collection.catalog.genreLabel),
    sqlValue(collection.catalog.energyLabel),
    sqlValue(collection.catalog.decadeLabel ?? null),
    sqlValue(collection.catalog.useCaseLabel),
    sqlJson(collection.catalog.occasionLabels),
    sqlJson(collection.catalog.supportedBoardSizes),
    sqlJson(dedupeStrings(searchTerms)),
    sqlJson(tracks),
    sqlNumber(songCount),
    sqlNumber(collection.minimumSongCount),
    sqlNumber(collection.targetSongCount),
    collection.seededSongCount === undefined ? 'NULL' : sqlNumber(collection.seededSongCount),
    sqlNumber((index + 1) * 10),
    sqlValue('spotify-seed'),
    sqlValue(syncedAt),
  ].join(', ');

  return `INSERT INTO baraja_music_bingo_collections (
  id,
  title,
  description,
  spotify_playlist_id,
  spotify_url,
  cover_image_url,
  market,
  visibility,
  status,
  category_id,
  category_label,
  genre_label,
  energy_label,
  decade_label,
  use_case_label,
  occasion_labels,
  supported_board_sizes,
  search_terms,
  tracks_json,
  song_count,
  minimum_song_count,
  target_song_count,
  seeded_song_count,
  sort_order,
  source,
  synced_at
) VALUES (${values})
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  spotify_playlist_id = excluded.spotify_playlist_id,
  spotify_url = excluded.spotify_url,
  cover_image_url = excluded.cover_image_url,
  market = excluded.market,
  visibility = excluded.visibility,
  status = excluded.status,
  category_id = excluded.category_id,
  category_label = excluded.category_label,
  genre_label = excluded.genre_label,
  energy_label = excluded.energy_label,
  decade_label = excluded.decade_label,
  use_case_label = excluded.use_case_label,
  occasion_labels = excluded.occasion_labels,
  supported_board_sizes = excluded.supported_board_sizes,
  search_terms = excluded.search_terms,
  tracks_json = excluded.tracks_json,
  song_count = excluded.song_count,
  minimum_song_count = excluded.minimum_song_count,
  target_song_count = excluded.target_song_count,
  seeded_song_count = excluded.seeded_song_count,
  sort_order = excluded.sort_order,
  source = excluded.source,
  synced_at = excluded.synced_at,
  updated_at = datetime('now');`;
}

function getCatalogTracks(
  collection: BarajaMusicBingoSeedCollection,
  playlist: SpotifyPlaylistData | null,
): CatalogTrack[] {
  if (playlist && playlist.tracks.length > 0) {
    return playlist.tracks.map((track) => ({
      id: track.id,
      title: track.title,
      artistDisplayName: track.artistDisplayName,
      imageUrl: track.imageUrl,
      spotifyUrl: track.spotifyUrl,
    }));
  }

  return collection.songs.map((song, index) => {
    const parsedSong = parseSeedSongQuery(song);
    return {
      id: `seed-${collection.id}-${index + 1}`,
      title: parsedSong.title,
      artistDisplayName: parsedSong.artist,
      imageUrl: null,
      spotifyUrl: null,
    };
  });
}

function getCatalogUsableSongCount(tracks: CatalogTrack[]): number {
  const songs: MusicBingoSong[] = tracks.map((track, index) => ({
    id: track.id ?? `catalog-track-${index + 1}`,
    artist: track.artistDisplayName,
    title: track.title,
    artworkUrl: track.imageUrl ?? undefined,
    spotifyTrackUrl: track.spotifyUrl ?? undefined,
  }));

  return getMusicBingoUsableSongPool(songs).usableSongs.length;
}

function parseSeedSongQuery(query: string): { artist: string; title: string } {
  const parts = query.split(' - ');
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim() || 'Artista desconocido',
      title: parts.slice(1).join(' - ').trim() || query.trim(),
    };
  }

  return {
    artist: 'Artista desconocido',
    title: query.trim(),
  };
}

function toCatalogCollectionTitle(name: string): string {
  return name.replace(/^Baraja Bingo\s*-\s*/i, '').trim() || name;
}

function dedupeStrings(values: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    deduped.push(normalized);
    seen.add(key);
  }
  return deduped;
}

function printCatalogSyncSummary(rows: CatalogSyncRow[]) {
  console.table(
    rows.map(({ collection, playlist }) => ({
      id: collection.id,
      title: toCatalogCollectionTitle(collection.name),
      spotify: playlist ? 'resolved' : collection.spotifyUrl ? 'fallback' : 'local',
      tracks: playlist?.importedTrackCount ?? collection.songs.length,
      total: playlist?.totalTracks ?? collection.songs.length,
      url: playlist?.spotifyUrl ?? collection.spotifyUrl ?? '',
    })),
  );
}

function applyCatalogSql(options: CliOptions) {
  const args = [
    'wrangler',
    'd1',
    'execute',
    'baraja-db',
    options.catalogApplyRemote ? '--remote' : '--local',
    '--file',
    options.catalogSqlPath,
  ];
  console.log(`Applying catalog SQL with: yarn ${args.join(' ')}`);
  const result = spawnSync('yarn', args, {
    cwd: appRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error('Catalog SQL apply failed.');
  }
}

function sqlValue(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlJson(value: unknown): string {
  return sqlValue(JSON.stringify(value));
}

function sqlNumber(value: number): string {
  return Number.isFinite(value) ? String(Math.trunc(value)) : '0';
}

function createFailureSummary(input: {
  collection: BarajaMusicBingoSeedCollection;
  dryRun: boolean;
  result: Extract<SpotifyPlaylistSeedResult, { ok: false }>;
  submittedSongs: string[];
  cachedMatchCount: number;
  searchedQueryCount: number;
}): CollectionRunSummary {
  return {
    id: input.collection.id,
    name: input.collection.name,
    ok: false,
    dryRun: input.dryRun,
    requestedSongCount: input.collection.songs.length,
    submittedQueryCount: input.submittedSongs.length,
    minimumSongCount: input.collection.minimumSongCount,
    targetSongCount: input.collection.targetSongCount,
    targetGap: Math.max(0, input.collection.targetSongCount - input.collection.songs.length),
    matchedTrackCount: input.result.matchedTrackCount ?? 0,
    unmatchedQueryCount: input.result.unmatchedQueryCount ?? 0,
    addedTrackCount: 0,
    cachedMatchCount: input.cachedMatchCount,
    searchedQueryCount: input.searchedQueryCount,
    playlistUrl: input.collection.spotifyUrl ?? null,
    failedOperation: input.result.operation,
    failedQuery: input.result.failedQuery,
    message: input.result.message,
    reason: input.result.reason,
    retryAfterSeconds: input.result.retryAfterSeconds,
    unmatchedQueries: input.result.unmatchedQueries ?? [],
  };
}

function shouldWaitForRateLimit(
  result: SpotifyPlaylistSeedResult,
  options: CliOptions,
  waitCount: number,
): result is Extract<SpotifyPlaylistSeedResult, { ok: false }> {
  return !result.ok && result.reason === 'rate_limited' && options.waitOnRateLimit && waitCount < options.maxRateLimitWaits;
}

function getRateLimitWaitSeconds(
  result: Extract<SpotifyPlaylistSeedResult, { ok: false }>,
  options: CliOptions,
): number {
  const providerWaitSeconds = result.retryAfterSeconds;
  const baseWaitSeconds =
    typeof providerWaitSeconds === 'number' && Number.isFinite(providerWaitSeconds) && providerWaitSeconds > 0
      ? providerWaitSeconds
      : options.fallbackRateLimitWaitSeconds;
  return Math.ceil(baseWaitSeconds + options.rateLimitBufferSeconds);
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createEmptyTrackCache(): SpotifySeedTrackCacheFile {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    matches: {},
  };
}

async function readTrackCache(cachePath: string): Promise<SpotifySeedTrackCacheFile> {
  try {
    const rawCache = await readFile(cachePath, 'utf8');
    const parsedCache = JSON.parse(rawCache) as unknown;
    if (!isTrackCacheFile(parsedCache)) {
      console.warn(`Ignoring invalid Spotify track cache at ${cachePath}.`);
      return createEmptyTrackCache();
    }

    return parsedCache;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return createEmptyTrackCache();
    }
    throw error;
  }
}

async function writeTrackCache(cachePath: string, cache: SpotifySeedTrackCacheFile) {
  cache.updatedAt = new Date().toISOString();
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

function getCachedTrackMatches(
  cache: SpotifySeedTrackCacheFile,
  market: string,
  queries: string[],
): Record<string, SpotifyPlaylistSeedTrackMatch> {
  const cachedMatches: Record<string, SpotifyPlaylistSeedTrackMatch> = {};
  for (const query of queries) {
    const queryKey = normalizeSeedQueryKey(query);
    const cachedMatch = cache.matches[getCacheKey(market, query)];
    if (!cachedMatch) continue;

    cachedMatches[queryKey] = {
      query,
      uri: cachedMatch.uri,
      id: cachedMatch.id,
      title: cachedMatch.title,
      artists: cachedMatch.artists,
      artistDisplayName: cachedMatch.artistDisplayName,
      spotifyUrl: cachedMatch.spotifyUrl,
      imageUrl: cachedMatch.imageUrl,
    };
  }

  return cachedMatches;
}

function addMatchesToCache(
  cache: SpotifySeedTrackCacheFile,
  market: string,
  matches: SpotifyPlaylistSeedTrackMatch[],
) {
  const cachedAt = new Date().toISOString();
  for (const match of matches) {
    cache.matches[getCacheKey(market, match.query)] = {
      ...match,
      cachedAt,
      market,
    };
  }
}

function getCacheKey(market: string, query: string): string {
  return `${market.toUpperCase()}:${normalizeSeedQueryKey(query)}`;
}

function isTrackCacheFile(value: unknown): value is SpotifySeedTrackCacheFile {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.updatedAt !== 'string') return false;
  if (!isRecord(value.matches)) return false;

  return Object.values(value.matches).every(isCachedTrackMatch);
}

function isCachedTrackMatch(value: unknown): value is CachedSpotifySeedTrackMatch {
  if (!isRecord(value)) return false;
  if (typeof value.query !== 'string') return false;
  if (typeof value.uri !== 'string' || !value.uri.startsWith('spotify:track:')) return false;
  if (!(typeof value.id === 'string' || value.id === null)) return false;
  if (typeof value.title !== 'string') return false;
  if (!Array.isArray(value.artists) || !value.artists.every((artist) => typeof artist === 'string')) {
    return false;
  }
  if (typeof value.artistDisplayName !== 'string') return false;
  if (!(typeof value.spotifyUrl === 'string' || value.spotifyUrl === null)) return false;
  if (!(typeof value.imageUrl === 'string' || value.imageUrl === null)) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function writeReport(reportPath: string, summaries: CollectionRunSummary[]) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), summaries }, null, 2)}\n`);
  console.log(`Report written to ${reportPath}`);
}

function appendSkippedAfterRateLimit(
  summaries: CollectionRunSummary[],
  collections: BarajaMusicBingoSeedCollection[],
  options: CliOptions,
) {
  for (const collection of collections) {
    const submittedSongs = getSubmittedSongs(collection, options);
    summaries.push({
      id: collection.id,
      name: collection.name,
      ok: false,
      dryRun: !options.create,
      requestedSongCount: collection.songs.length,
      submittedQueryCount: submittedSongs.length,
      minimumSongCount: collection.minimumSongCount,
      targetSongCount: collection.targetSongCount,
      targetGap: Math.max(0, collection.targetSongCount - collection.songs.length),
      matchedTrackCount: 0,
      unmatchedQueryCount: 0,
      addedTrackCount: 0,
      cachedMatchCount: 0,
      searchedQueryCount: submittedSongs.length,
      playlistUrl: collection.spotifyUrl ?? null,
      failedOperation: undefined,
      failedQuery: undefined,
      message: 'Skipped because Spotify rate-limited a previous collection in this run.',
      reason: 'skipped_after_rate_limit',
      retryAfterSeconds: undefined,
      unmatchedQueries: [],
    });
  }
}

function printHelp() {
  console.log(`Usage:
  yarn workspace baraja seed:music-bingo:collections --list
  yarn workspace baraja seed:music-bingo:collections --check
  yarn workspace baraja seed:music-bingo:collections --all
  yarn workspace baraja seed:music-bingo:collections --collection rock-argentino-esenciales
  yarn workspace baraja seed:music-bingo:collections --create --all --private
  yarn workspace baraja seed:music-bingo:collections --sync-catalog --all --apply-catalog

Default mode is dry-run. Creating playlists requires --create plus --all or one
or more --collection flags. Collections with spotifyUrl are updated in place;
collections without spotifyUrl create a new Spotify playlist.

Options:
  --all                 Select every Baraja seed collection.
  --apply-catalog       Apply generated catalog SQL to local D1 via Wrangler.
  --apply-catalog-remote
                        Apply generated catalog SQL to remote D1 via Wrangler.
  --cache <path>        Read/write the Spotify query match cache.
  --catalog-max-tracks <n>
                        Max tracks to persist per synced playlist. Defaults to 500.
  --catalog-sql <path>  Write catalog sync SQL to a custom path.
  --collection <id>     Select one collection. Can be repeated.
  --continue-on-rate-limit
                        Continue selected collections after a Spotify 429.
  --create              Create Spotify playlists and add matched tracks.
  --dry-run             Preview matches only. This is the default.
  --enforce-target      Skip collections below their minimum song count.
  --include-seeded-prefix
                        Re-submit songs already marked as seeded.
  --list                List available collections.
  --check               Validate local collection definitions without Spotify.
  --market <AR|US>      Override Spotify market for every collection.
  --max-queries <n>     Limit search queries per collection.
  --max-rate-limit-waits <n>
                        Maximum automatic waits after Spotify 429. Defaults to 6.
  --no-cache            Disable local Spotify query match cache.
  --no-wait-on-rate-limit
                        Disable automatic waiting after Spotify 429.
  --public              Create public playlists.
  --private             Create private playlists.
  --query-offset <n>    Skip n pending queries after any seeded prefix.
  --rate-limit-buffer-seconds <n>
                        Extra seconds added to Spotify Retry-After. Defaults to 5.
  --rate-limit-wait-seconds <n>
                        Fallback wait when Spotify omits Retry-After. Defaults to 300.
  --request-delay-ms <n>
                        Delay between Spotify search requests. Create mode defaults to 1500.
  --report <path>       Write JSON report. Defaults to apps/baraja/tmp/.
  --run-all-safe        Shortcut for a full private create run with target enforcement,
                        cache, 10s search delay, and automatic rate-limit waiting.
  --sync-catalog        Resolve seeded playlist URLs once and write D1 catalog SQL.
  --wait-on-rate-limit  Wait and retry the same collection after Spotify 429.
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
