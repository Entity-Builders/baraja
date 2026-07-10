import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const DEFAULT_SEED_LINES = [
  'Soda Stereo - De musica ligera',
  'Los Fabulosos Cadillacs - Matador',
  'Charly Garcia - Nos siguen pegando abajo',
].join('\n');

interface SpotifySeedSession {
  configured: boolean;
  connected: boolean;
  scopes: string[];
}

interface BarajaOperatorSession {
  authenticated: boolean;
  email?: string | null;
}

interface SpotifySeedQueryReport {
  submittedRowCount: number;
  normalizedQueryCount: number;
  ignoredRowCount: number;
  duplicateQueryCount: number;
  truncatedQueryCount: number;
  maxQueryCount: number;
}

interface SpotifySeedTrackMatch {
  query: string;
  uri: string;
  title: string;
  artistDisplayName: string;
  spotifyUrl: string | null;
  imageUrl: string | null;
}

interface SpotifySeedResult {
  ok: boolean;
  dryRun?: boolean;
  playlist?: {
    name: string;
    spotifyUrl: string;
  } | null;
  matchedTracks?: SpotifySeedTrackMatch[];
  unmatchedQueries?: string[];
  addedTrackCount?: number;
  message?: string;
  reason?: string;
  missingScopes?: string[];
  queryReport?: SpotifySeedQueryReport;
}

export default function MusicBingoSpotifySeed() {
  const location = useLocation();
  const [session, setSession] = useState<SpotifySeedSession | null>(null);
  const [operatorSession, setOperatorSession] = useState<BarajaOperatorSession | null>(null);
  const [playlistName, setPlaylistName] = useState('Baraja Seed Test');
  const [isPublic, setIsPublic] = useState(false);
  const [songLines, setSongLines] = useState(DEFAULT_SEED_LINES);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<SpotifySeedResult | null>(null);

  const spotifyConnectHref = useMemo(() => {
    const returnTo = `${location.pathname}${location.search}`;
    return `/api/spotify/auth/start?returnTo=${encodeURIComponent(returnTo)}`;
  }, [location.pathname, location.search]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch('/api/spotify/session', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        const value = await response.json() as SpotifySeedSession;
        if (!cancelled) setSession(value);
      } catch {
        if (!cancelled) {
          setSession({ configured: false, connected: false, scopes: [] });
        }
      }
    }

    async function loadOperatorSession() {
      try {
        const response = await fetch('/api/admin/session', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        const value = await response.json() as BarajaOperatorSession;
        if (!cancelled) setOperatorSession(value);
      } catch {
        if (!cancelled) {
          setOperatorSession({ authenticated: false });
        }
      }
    }

    void loadSession();
    void loadOperatorSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function submitSeed(dryRun: boolean) {
    setStatus('loading');
    setResult(null);

    try {
      const response = await fetch('/api/spotify/seed-playlist', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: playlistName,
          dryRun,
          public: isPublic,
          songLines,
        }),
      });
      const value = await response.json() as SpotifySeedResult;
      setResult(value);
      setStatus(response.ok && value.ok ? 'success' : 'error');
    } catch {
      setResult({
        ok: false,
        message: 'No pudimos llamar al seed de Spotify.',
      });
      setStatus('error');
    }
  }

  const missingWriteScopes = session
    ? ['playlist-modify-private', 'playlist-modify-public'].filter((scope) => !session.scopes.includes(scope))
    : [];
  const operatorReady = operatorSession?.authenticated === true;
  const canSubmit = operatorReady && session?.connected === true && missingWriteScopes.length === 0 && status !== 'loading';

  return (
    <main className="baraja-spotify-seed-shell">
      <nav className="baraja-spotify-seed-nav" aria-label="Navegacion interna">
        <Link to="/bingo-musical/crear">Crear bingo</Link>
        <Link to="/bingo-musical/catalogo">Catalogo</Link>
      </nav>

      <section className="baraja-spotify-seed-head">
        <p className="baraja-kicker">Spotify seed</p>
        <h1>Crear playlist propia</h1>
        <p>
          Herramienta interna para crear repertorios oficiales de Baraja desde
          listas copy/paste. La playlist queda en la cuenta de Spotify conectada.
        </p>
      </section>

      <section className="baraja-spotify-seed-layout">
        <form className="baraja-spotify-seed-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            <span>Nombre</span>
            <input
              type="text"
              value={playlistName}
              onChange={(event) => setPlaylistName(event.target.value)}
            />
          </label>

          <label>
            <span>Canciones</span>
            <textarea
              value={songLines}
              onChange={(event) => setSongLines(event.target.value)}
              rows={12}
              spellCheck={false}
            />
          </label>

          <label className="baraja-spotify-seed-toggle">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
            />
            <span>Publica</span>
          </label>

          <div className="baraja-spotify-seed-actions">
            {!operatorReady ? (
              <a href="/admin">Entrar como operador</a>
            ) : null}
            {session?.connected ? null : (
              <a href={spotifyConnectHref}>Conectar Spotify</a>
            )}
            {session?.connected && missingWriteScopes.length > 0 ? (
              <a href={spotifyConnectHref}>Reconectar permisos</a>
            ) : null}
            <button type="button" disabled={!canSubmit} onClick={() => void submitSeed(true)}>
              Revisar matches
            </button>
            <button type="button" disabled={!canSubmit} onClick={() => void submitSeed(false)}>
              Crear playlist
            </button>
          </div>

          <div className="baraja-spotify-seed-status" aria-label="Estado de conexiones">
            <span className={operatorReady ? 'is-ready' : ''}>
              Operador: {operatorReady ? operatorSession?.email ?? 'activo' : 'pendiente'}
            </span>
            <span className={session?.connected ? 'is-ready' : ''}>
              Spotify: {session?.connected ? 'conectado' : session?.configured ? 'sin conectar' : 'no configurado'}
            </span>
          </div>

          {!operatorReady ? (
            <p className="baraja-spotify-seed-note">
              Primero inicia sesion como operador Baraja. Esto evita que la
              herramienta cree playlists desde sesiones publicas.
            </p>
          ) : null}

          {session?.connected && missingWriteScopes.length > 0 ? (
            <p className="baraja-spotify-seed-note">
              La conexion actual es de lectura. Reconecta Spotify para permitir
              crear playlists privadas y publicas en la cuenta Baraja.
            </p>
          ) : null}
        </form>

        <SpotifySeedResultPanel status={status} result={result} />
      </section>
    </main>
  );
}

function SpotifySeedResultPanel({
  status,
  result,
}: {
  status: 'idle' | 'loading' | 'success' | 'error';
  result: SpotifySeedResult | null;
}) {
  if (status === 'idle') {
    return (
      <section className="baraja-spotify-seed-result" aria-label="Resultado">
        <strong>Listo para revisar</strong>
      </section>
    );
  }

  if (status === 'loading') {
    return (
      <section className="baraja-spotify-seed-result" aria-label="Resultado">
        <strong>Buscando en Spotify...</strong>
      </section>
    );
  }

  if (!result || !result.ok) {
    return (
      <section className="baraja-spotify-seed-result is-error" aria-label="Resultado">
        <strong>No se pudo crear el seed</strong>
        <p>{result?.message ?? 'Spotify rechazo la solicitud.'}</p>
        <SpotifySeedMetrics result={result} />
      </section>
    );
  }

  const matchedTracks = result.matchedTracks ?? [];
  const unmatchedQueries = result.unmatchedQueries ?? [];

  return (
    <section className="baraja-spotify-seed-result" aria-label="Resultado">
      <div className="baraja-spotify-seed-result-head">
        <strong>
          {result.dryRun
            ? `${matchedTracks.length} matches encontrados`
            : `${result.addedTrackCount ?? matchedTracks.length} canciones agregadas`}
        </strong>
        {result.playlist ? (
          <a href={result.playlist.spotifyUrl} target="_blank" rel="noreferrer">
            Abrir playlist
          </a>
        ) : null}
      </div>

      <SpotifySeedMetrics result={result} />

      <div className="baraja-spotify-seed-match-list">
        {matchedTracks.map((track) => (
          <article key={`${track.query}-${track.uri}`}>
            {track.imageUrl ? <img src={track.imageUrl} alt="" loading="lazy" decoding="async" /> : <i />}
            <div>
              <small>{track.query}</small>
              <strong>{track.title}</strong>
              <span>{track.artistDisplayName}</span>
            </div>
          </article>
        ))}
      </div>

      {unmatchedQueries.length > 0 ? (
        <div className="baraja-spotify-seed-unmatched">
          <strong>Sin match</strong>
          <textarea readOnly value={unmatchedQueries.join('\n')} aria-label="Canciones sin match" />
        </div>
      ) : null}
    </section>
  );
}

function SpotifySeedMetrics({ result }: { result: SpotifySeedResult | null }) {
  if (!result) return null;

  const matchedCount = result.matchedTracks?.length ?? 0;
  const unmatchedCount = result.unmatchedQueries?.length ?? 0;
  const report = result.queryReport;
  const requestedCount = report?.submittedRowCount ?? matchedCount + unmatchedCount;
  const normalizedCount = report?.normalizedQueryCount ?? matchedCount + unmatchedCount;
  const addedCount = result.addedTrackCount ?? 0;

  return (
    <div className="baraja-spotify-seed-metrics" aria-label="Resumen del seed">
      <span>
        <small>Filas</small>
        <strong>{requestedCount}</strong>
      </span>
      <span>
        <small>Unicas</small>
        <strong>{normalizedCount}</strong>
      </span>
      <span>
        <small>Matches</small>
        <strong>{matchedCount}</strong>
      </span>
      <span>
        <small>Sin match</small>
        <strong>{unmatchedCount}</strong>
      </span>
      <span>
        <small>Agregadas</small>
        <strong>{addedCount}</strong>
      </span>
      {report && (report.ignoredRowCount > 0 || report.duplicateQueryCount > 0 || report.truncatedQueryCount > 0) ? (
        <p>
          {report.ignoredRowCount} vacias o invalidas, {report.duplicateQueryCount} duplicadas,
          {' '}{report.truncatedQueryCount} fuera del limite de {report.maxQueryCount}.
        </p>
      ) : null}
    </div>
  );
}
