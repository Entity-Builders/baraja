import assert from 'node:assert/strict';
import {
  getOrCreateBarajaAcquisitionContext,
  resolveBarajaAcquisitionContext,
  toBarajaAcquisitionAnalyticsProperties,
  type BarajaSessionStorage,
} from '../src/lib/acquisitionAttribution';

function memoryStorage(): BarajaSessionStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

const taggedContext = resolveBarajaAcquisitionContext({
  search:
    '?utm_source=Instagram%20Bio&utm_medium=Organic%20Social&utm_campaign=Music%20Bingo%20July&utm_content=Reel%2001&utm_term=never-store-this',
  referrer: 'https://l.instagram.com/?secret=do-not-store',
  host: 'baraja.cards',
});

assert.deepEqual(taggedContext, {
  source: 'instagram_bio',
  medium: 'organic_social',
  campaign: 'music_bingo_july',
  content: 'reel_01',
});
assert.deepEqual(toBarajaAcquisitionAnalyticsProperties(taggedContext), {
  acquisition_source: 'instagram_bio',
  acquisition_medium: 'organic_social',
  acquisition_campaign: 'music_bingo_july',
  acquisition_content: 'reel_01',
});

assert.deepEqual(
  resolveBarajaAcquisitionContext({
    search: '',
    referrer: 'https://www.google.com/search?q=bingo+musical',
    host: 'baraja.cards',
  }),
  { referrerHost: 'www.google.com' }
);

assert.deepEqual(
  resolveBarajaAcquisitionContext({
    search: '?utm_source=buyer%40example.com&utm_campaign=' + 'x'.repeat(65),
    referrer: 'https://baraja.cards/bingo-musical?private=value',
    host: 'baraja.cards',
  }),
  {}
);

const storage = memoryStorage();
const firstEntry = getOrCreateBarajaAcquisitionContext(
  {
    search: '?utm_source=instagram&utm_medium=organic_social&utm_campaign=launch',
    referrer: 'https://www.instagram.com/p/example',
    host: 'baraja.cards',
  },
  storage
);
const laterEntry = getOrCreateBarajaAcquisitionContext(
  {
    search: '?utm_source=tiktok&utm_medium=organic_social&utm_campaign=replacement',
    referrer: 'https://www.tiktok.com/@baraja/video/example',
    host: 'baraja.cards',
  },
  storage
);

assert.deepEqual(firstEntry, {
  source: 'instagram',
  medium: 'organic_social',
  campaign: 'launch',
});
assert.deepEqual(laterEntry, firstEntry);

console.log('Baraja acquisition attribution checks passed.');
