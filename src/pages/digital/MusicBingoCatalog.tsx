import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MUSIC_BINGO_MVP_THEMES,
  type MusicBingoBoardSize,
  type MusicBingoTheme,
} from '@entity-builders/deck-engine';
import { trackBarajaEvent } from '../../services/analytics';
import {
  fetchSyncedMusicBingoCatalog,
  getSyncedMusicBingoCollectionSongs,
  type SyncedMusicBingoCatalogCollection,
} from './musicBingoCatalogApi';

const CATALOG_ROUTE = '/bingo-musical/catalogo';
const CREATOR_ROUTE = '/bingo-musical/crear';
const CATALOG_SURFACE = 'music_bingo_catalog';
const ALL_CATEGORIES = 'all';

type CategoryFilter = typeof ALL_CATEGORIES | string;

interface CatalogSongPreview {
  id: string;
  artist: string;
  title: string;
  artworkUrl?: string | null;
}

interface MusicBingoCatalogItem {
  id: string;
  source: 'theme' | 'synced_collection';
  title: string;
  subtitle: string;
  summary: string;
  categoryId: string;
  categoryLabel: string;
  genreLabel: string;
  occasionLabels: string[];
  energyLabel: string;
  decadeLabel?: string | null;
  supportedBoardSizes: MusicBingoBoardSize[];
  searchTerms: string[];
  songCount: number;
  coverImageUrl?: string | null;
  spotifyUrl?: string | null;
  sampleSongs: CatalogSongPreview[];
  creatorUrl: string;
}

function getThemeCreatorUrl(theme: MusicBingoTheme): string {
  return `${CREATOR_ROUTE}?entry=collection&tema=${encodeURIComponent(theme.id)}`;
}

function getSyncedCollectionCreatorUrl(collection: SyncedMusicBingoCatalogCollection): string {
  return `${CREATOR_ROUTE}?entry=collection&catalogCollectionId=${encodeURIComponent(collection.id)}`;
}

function themeToCatalogItem(theme: MusicBingoTheme): MusicBingoCatalogItem {
  return {
    id: theme.id,
    source: 'theme',
    title: theme.playlist?.title ?? theme.title,
    subtitle: theme.title,
    summary: theme.summary,
    categoryId: theme.catalog.categoryId,
    categoryLabel: theme.catalog.categoryLabel,
    genreLabel: theme.catalog.genreLabel,
    occasionLabels: theme.catalog.occasionLabels,
    energyLabel: theme.catalog.energyLabel,
    decadeLabel: theme.catalog.decadeLabel,
    supportedBoardSizes: theme.catalog.supportedBoardSizes,
    searchTerms: theme.catalog.searchTerms,
    songCount: theme.songs.length,
    coverImageUrl: theme.playlist?.coverImageUrl ?? theme.songs[0]?.artworkUrl ?? null,
    spotifyUrl: theme.playlist?.url ?? null,
    sampleSongs: theme.songs.slice(0, 3).map((song) => ({
      id: song.id,
      artist: song.artist,
      title: song.title,
      artworkUrl: song.artworkUrl,
    })),
    creatorUrl: getThemeCreatorUrl(theme),
  };
}

function syncedCollectionToCatalogItem(
  collection: SyncedMusicBingoCatalogCollection
): MusicBingoCatalogItem {
  const songs = getSyncedMusicBingoCollectionSongs(collection);

  return {
    id: collection.id,
    source: 'synced_collection',
    title: collection.title,
    subtitle: collection.genreLabel,
    summary: collection.description,
    categoryId: collection.categoryId,
    categoryLabel: collection.categoryLabel,
    genreLabel: collection.genreLabel,
    occasionLabels: collection.occasionLabels,
    energyLabel: collection.energyLabel,
    decadeLabel: collection.decadeLabel,
    supportedBoardSizes: collection.supportedBoardSizes,
    searchTerms: collection.searchTerms,
    songCount: songs.length,
    coverImageUrl: collection.coverImageUrl ?? songs[0]?.artworkUrl ?? null,
    spotifyUrl: collection.spotifyUrl,
    sampleSongs: songs.slice(0, 3).map((song) => ({
      id: song.id,
      artist: song.artist,
      title: song.title,
      artworkUrl: song.artworkUrl,
    })),
    creatorUrl: getSyncedCollectionCreatorUrl(collection),
  };
}

function getCatalogItemSearchText(item: MusicBingoCatalogItem): string {
  return [
    item.title,
    item.subtitle,
    item.summary,
    item.categoryLabel,
    item.genreLabel,
    item.energyLabel,
    item.decadeLabel,
    item.occasionLabels.join(' '),
    item.searchTerms.join(' '),
    item.sampleSongs.map((song) => `${song.artist} ${song.title}`).join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function filterCatalogItems(
  items: MusicBingoCatalogItem[],
  search: string,
  category: CategoryFilter
): MusicBingoCatalogItem[] {
  const query = search.trim().toLowerCase();

  return items.filter((item) => {
    const matchesCategory = category === ALL_CATEGORIES || item.categoryId === category;
    const matchesSearch = !query || getCatalogItemSearchText(item).includes(query);

    return matchesCategory && matchesSearch;
  });
}

export default function MusicBingoCatalog() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>(ALL_CATEGORIES);
  const [syncedCollections, setSyncedCollections] = useState<SyncedMusicBingoCatalogCollection[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');

  const loadCatalog = useCallback((signal?: AbortSignal) => {
    setCatalogStatus('loading');
    void (async () => {
      try {
        const collections = await fetchSyncedMusicBingoCatalog(signal);
        setSyncedCollections(collections);
        setCatalogStatus(collections.length > 0 ? 'ready' : 'fallback');
      } catch {
        setSyncedCollections([]);
        setCatalogStatus('fallback');
      }
    })();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadCatalog(controller.signal);

    return () => controller.abort();
  }, [loadCatalog]);

  const catalogItems = useMemo(() => {
    if (syncedCollections.length > 0) {
      return syncedCollections.map(syncedCollectionToCatalogItem);
    }

    return MUSIC_BINGO_MVP_THEMES.map(themeToCatalogItem);
  }, [syncedCollections]);

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();

    catalogItems.forEach((item) => {
      if (!seen.has(item.categoryId)) {
        seen.set(item.categoryId, item.categoryLabel);
      }
    });

    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [catalogItems]);

  const filteredItems = useMemo(
    () => filterCatalogItems(catalogItems, search, category),
    [catalogItems, category, search]
  );

  useEffect(() => {
    trackBarajaEvent('baraja_music_bingo_catalog_viewed', {
      campaign_id: 'music_bingo',
      route: CATALOG_ROUTE,
      surface: CATALOG_SURFACE,
      result_count: catalogItems.length,
      source: syncedCollections.length > 0 ? 'd1_sync' : 'static_fallback',
    });
  }, [catalogItems.length, syncedCollections.length]);

  function updateCategory(nextCategory: CategoryFilter) {
    setCategory(nextCategory);
    trackBarajaEvent('baraja_music_bingo_catalog_filter_selected', {
      campaign_id: 'music_bingo',
      route: CATALOG_ROUTE,
      surface: CATALOG_SURFACE,
      category_id: nextCategory,
      result_count: filterCatalogItems(catalogItems, search, nextCategory).length,
    });
  }

  function trackItemSelection(item: MusicBingoCatalogItem) {
    trackBarajaEvent('baraja_music_bingo_catalog_theme_selected', {
      campaign_id: 'music_bingo',
      route: CATALOG_ROUTE,
      surface: CATALOG_SURFACE,
      source: item.source,
      theme_id: item.id,
      category_id: item.categoryId,
      song_count: item.songCount,
    });
  }

  return (
    <main className="baraja-music-catalog">
      <CatalogNav />

      <section className="baraja-music-catalog-hero">
        <div>
          <p className="baraja-kicker">Catálogo</p>
          <h1>Playlists para bingo musical</h1>
          <p>Elegi una lista y arma un PDF imprimible en el creador.</p>
        </div>
        <div className="baraja-music-catalog-actions">
          <Link to={CREATOR_ROUTE} className="baraja-button baraja-button-primary">
            Crear con mi playlist
          </Link>
        </div>
      </section>

      <section className="baraja-music-catalog-browser" id="playlists">
        <div className="baraja-music-catalog-controls">
          <label>
            <span>Buscar</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rock, cumbia, cumples..."
            />
          </label>
          <div role="group" aria-label="Filtrar por categoria">
            <button
              type="button"
              className={category === ALL_CATEGORIES ? 'is-selected' : ''}
              onClick={() => updateCategory(ALL_CATEGORIES)}
            >
              Todos
            </button>
            {categoryOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={category === option.id ? 'is-selected' : ''}
                onClick={() => updateCategory(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

	        <p className="baraja-music-catalog-count">
	          {catalogStatus === 'loading'
	            ? 'Cargando playlists...'
	            : filteredItems.length === catalogItems.length
	              ? `${catalogItems.length} playlists`
	              : `${filteredItems.length} de ${catalogItems.length}`}
	        </p>

	        {catalogStatus === 'fallback' ? (
	          <section className="baraja-music-catalog-status" role="status">
	            <span>Mostrando colecciones base. No pudimos actualizar el catálogo ahora.</span>
	            <button type="button" onClick={() => loadCatalog()}>
	              Reintentar
	            </button>
	          </section>
	        ) : null}

        {filteredItems.length > 0 ? (
          <div className="baraja-music-catalog-grid">
            {filteredItems.map((item) => (
              <CatalogThemeCard
                key={`${item.source}:${item.id}`}
                item={item}
                onSelect={() => trackItemSelection(item)}
              />
            ))}
          </div>
        ) : (
          <section className="baraja-music-catalog-empty" aria-label="Sin resultados">
            <span aria-hidden="true">♫</span>
            <strong>Sin resultados.</strong>
            <p>Proba otro filtro o arma uno propio.</p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                updateCategory(ALL_CATEGORIES);
              }}
            >
              Limpiar filtros
            </button>
          </section>
        )}
      </section>

      <section className="baraja-music-catalog-boundary">
        <strong>Musica</strong>
        <p>Baraja vende el juego; la música, reproducción, permisos e impresión quedan a cargo del organizador.</p>
      </section>
    </main>
  );
}

function CatalogNav() {
  return (
    <nav className="baraja-nav baraja-music-catalog-nav">
      <Link to="/" className="baraja-brand">Baraja</Link>
      <div className="baraja-nav-links">
        <Link to="/bingo-musical">Bingo musical</Link>
        <Link to={CREATOR_ROUTE}>Creador</Link>
        <a href="#playlists">Playlists</a>
      </div>
    </nav>
  );
}

function CatalogThemeCard({
  item,
  onSelect,
}: {
  item: MusicBingoCatalogItem;
  onSelect: () => void;
}) {
  return (
    <article className="baraja-music-catalog-card">
      <div className="baraja-music-catalog-card-art" aria-hidden="true">
        {item.coverImageUrl ? (
          <img src={item.coverImageUrl} alt="" loading="lazy" decoding="async" />
        ) : null}
        <span>{item.categoryLabel}</span>
      </div>

      <div className="baraja-music-catalog-card-body">
        <div>
          <p>{item.occasionLabels.join(' / ')}</p>
          <h3>{item.title}</h3>
        </div>

        <p className="baraja-music-catalog-card-summary">{item.summary}</p>

        <div className="baraja-music-catalog-fit">
          <span>{item.energyLabel}</span>
          <span>{item.decadeLabel ?? item.genreLabel}</span>
          <span>{item.songCount} canciones</span>
        </div>

        <div className="baraja-music-catalog-board-sizes" aria-label="Formatos compatibles">
          {item.supportedBoardSizes.map((boardSize) => (
            <span key={boardSize}>{boardSize}x{boardSize}</span>
          ))}
        </div>

        <div className="baraja-music-catalog-song-list" aria-label={`Canciones de muestra para ${item.title}`}>
          {item.sampleSongs.map((song) => (
            <span key={song.id}>{song.artist} - {song.title}</span>
          ))}
        </div>

        <footer>
          <Link
            to={item.creatorUrl}
            className="baraja-button baraja-button-primary"
            onClick={onSelect}
          >
            Armar bingo con esta playlist
          </Link>
          {item.spotifyUrl ? (
            <a href={item.spotifyUrl} target="_blank" rel="noreferrer">
              Ver playlist de referencia
            </a>
          ) : null}
        </footer>
      </div>
    </article>
  );
}
