import assert from 'node:assert/strict';
import { getMusicBingoPriceQuote } from '@entity-builders/deck-engine';
import {
  getCuratedCatalogOfferingId,
  getMusicBingoCheckoutSource,
  getMusicBingoCreatorEntry,
  getMusicBingoPricingSongSource,
  isCuratedMusicBingoSelection,
} from '../src/pages/digital/musicBingoCreatorFlow';

assert.equal(getMusicBingoCreatorEntry(''), 'chooser');
assert.equal(getMusicBingoCreatorEntry('?entry=playlist'), 'playlist');
assert.equal(
  getMusicBingoCreatorEntry('?catalogCollectionId=rock-argentino-esenciales'),
  'collection'
);

assert.equal(getCuratedCatalogOfferingId('rock-argentino-esenciales'), 'rock-argentino-prebuilt');
assert.equal(getCuratedCatalogOfferingId('cumbia-cuarteto-argentina'), 'cumbia-retro-prebuilt');
assert.equal(getCuratedCatalogOfferingId('pop-latino-2000s'), 'hits-2000-prebuilt');
assert.equal(getCuratedCatalogOfferingId('unknown-collection'), null);

assert.equal(
  isCuratedMusicBingoSelection('manual', 'rock-argentino-esenciales'),
  true
);
assert.equal(isCuratedMusicBingoSelection('manual', 'unknown-collection'), false);

const curatedSource = getMusicBingoPricingSongSource({
  source: 'manual',
  selectedSyncedCollectionId: 'rock-argentino-esenciales',
});
const playlistSource = getMusicBingoPricingSongSource({
  source: 'manual',
  selectedSyncedCollectionId: '',
});

assert.equal(getMusicBingoPriceQuote(30, 'private_event', curatedSource).label, '$7.900 ARS');
assert.equal(getMusicBingoPriceQuote(30, 'private_event', playlistSource).label, '$9.900 ARS');
assert.equal(
  getMusicBingoCheckoutSource({
    source: 'manual',
    selectedSyncedCollectionId: 'rock-argentino-esenciales',
    spotifyImportSucceeded: true,
    hasSpotifyPlaylistUrl: true,
  }),
  'curated_spotify'
);
assert.equal(
  getMusicBingoCheckoutSource({
    source: 'manual',
    selectedSyncedCollectionId: '',
    spotifyImportSucceeded: true,
    hasSpotifyPlaylistUrl: true,
  }),
  'custom_spotify'
);

console.log('Music bingo creator entry and commercial source checks passed.');
