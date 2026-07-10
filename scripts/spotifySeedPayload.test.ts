import {
  buildSpotifySeedQueryInput,
  getMissingSpotifyWriteScopes,
} from '../src/worker';
import {
  formatSyncedMusicBingoSongs,
  getSyncedMusicBingoCollectionSongCounts,
  type SyncedMusicBingoCatalogCollection,
} from '../src/pages/digital/musicBingoCatalogApi';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function run(): void {
  const seedInput = buildSpotifySeedQueryInput({
    songLines: [
      'Soda Stereo - De musica ligera',
      '',
      '  Soda   Stereo - De musica ligera  ',
      'Charly Garcia - Nos siguen pegando abajo',
      'Fito Paez - 11 y 6',
    ].join('\n'),
    songs: [
      { artist: 'Los Fabulosos Cadillacs', title: 'Matador' },
      { title: 'Persiana Americana' },
      { artist: 'Sin titulo' },
    ],
    queries: ['Virus - Pronta entrega'],
  }, 5);

  assertEqual(seedInput.queries.length, 5, 'keeps unique normalized rows up to the max');
  assertEqual(seedInput.queries[0], 'Virus - Pronta entrega', 'reads explicit query arrays first');
  assertEqual(seedInput.queries[1], 'Los Fabulosos Cadillacs - Matador', 'formats artist/title objects');
  assertEqual(seedInput.queries[2], 'Persiana Americana', 'uses title-only objects');
  assertEqual(seedInput.report.submittedRowCount, 9, 'counts all submitted payload rows');
  assertEqual(seedInput.report.ignoredRowCount, 2, 'counts blank or unusable rows');
  assertEqual(seedInput.report.duplicateQueryCount, 1, 'counts normalized duplicates');
  assertEqual(seedInput.report.truncatedQueryCount, 1, 'counts valid rows beyond the max');
  assertEqual(seedInput.report.normalizedQueryCount, 5, 'reports final normalized query count');

  const missingReadOnly = getMissingSpotifyWriteScopes([
    'playlist-read-private',
    'playlist-read-collaborative',
  ]);
  assertEqual(missingReadOnly.join(','), 'playlist-modify-private,playlist-modify-public', 'reports missing write scopes');

  const missingWritable = getMissingSpotifyWriteScopes([
    'playlist-read-private',
    'playlist-modify-private',
    'playlist-modify-public',
  ]);
  assert(missingWritable.length === 0, 'accepts connections with write scopes');

  const collection: SyncedMusicBingoCatalogCollection = {
    id: 'test-rock',
    title: 'Test Rock',
    description: 'Test collection',
    spotifyPlaylistId: 'playlist-1',
    spotifyUrl: 'https://open.spotify.com/playlist/playlist-1',
    coverImageUrl: null,
    market: 'AR',
    visibility: 'public',
    categoryId: 'rock',
    categoryLabel: 'Rock',
    genreLabel: 'Rock argentino',
    energyLabel: 'Alta',
    decadeLabel: null,
    useCaseLabel: 'Test',
    occasionLabels: ['Test'],
    supportedBoardSizes: [5],
    searchTerms: ['test'],
    tracks: [
      {
        id: 'track-1',
        title: 'Flaca',
        artistDisplayName: 'Andres Calamaro',
        imageUrl: null,
        spotifyUrl: null,
      },
      {
        id: 'track-2',
        title: 'Flaca',
        artistDisplayName: 'Andres Calamaro',
        imageUrl: null,
        spotifyUrl: null,
      },
    ],
    songCount: 2,
    minimumSongCount: 1,
    targetSongCount: 2,
    seededSongCount: null,
    syncedAt: null,
  };
  const counts = getSyncedMusicBingoCollectionSongCounts(collection);
  assertEqual(counts.importedSongCount, 2, 'keeps imported synced track count');
  assertEqual(counts.usableSongCount, 1, 'dedupes synced songs for creator use');
  assertEqual(counts.duplicateSongCount, 1, 'reports duplicate synced songs');
  assertEqual(formatSyncedMusicBingoSongs(collection).length, 1, 'formats only usable synced songs');
}

run();
console.log('Spotify seed payload checks passed.');
