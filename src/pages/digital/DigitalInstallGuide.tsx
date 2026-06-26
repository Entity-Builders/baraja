import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FEATURED_DIGITAL_DECK, findDigitalDeck } from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';
import { usePwaStatus } from '../../hooks/usePwaStatus';

export default function DigitalInstallGuide() {
  const [searchParams] = useSearchParams();
  const deck = findDigitalDeck(searchParams.get('deck') ?? undefined) ?? FEATURED_DIGITAL_DECK;
  const { installPlatform, isStandalone } = usePwaStatus();
  const deckUrl = deck ? `/decks/${deck.slug}/session` : '/';

  useEffect(() => {
    trackBarajaEvent('baraja_pwa_install_guide_viewed', {
      deck_id: deck?.id ?? 'none',
      deck_slug: deck?.slug ?? 'none',
      install_platform: installPlatform,
      standalone: isStandalone,
      surface: 'install_guide',
    });
  }, [deck?.id, deck?.slug, installPlatform, isStandalone]);

  return (
    <main className="digital-shell">
      <nav className="digital-nav">
        <Link to="/" className="digital-brand">Baraja.cards</Link>
        <div className="digital-nav-links">
          {deck && <Link to={`/decks/${deck.slug}`}>Mazo</Link>}
          {deck && <Link to={deckUrl}>Jugar</Link>}
        </div>
      </nav>

      <section className="digital-install-hero">
        <p className="digital-kicker">{isStandalone ? 'App instalada' : 'Instalar Baraja'}</p>
        <h1>{isStandalone ? 'Listo para jugar desde la app.' : 'Guardá Baraja en tu pantalla de inicio.'}</h1>
        <p className="digital-lead">
          {isStandalone
            ? 'Ya estás en modo app. Elegí un mazo, girá el teléfono y entrá en la sesión landscape.'
            : 'La sesión se puede probar en el navegador. Instalá la PWA cuando quieras tenerla a mano para jugar en mesa, taller o sesión.'}
        </p>
        <div className="digital-actions">
          <Link to={deckUrl} className="btn-primary">
            {isStandalone ? 'Abrir sesión' : 'Probar antes de instalar'}
          </Link>
          {deck && (
            <Link to={`/decks/${deck.slug}`} className="btn-ghost">
              Ver mazo
            </Link>
          )}
        </div>
      </section>

      {!isStandalone && (
        <section className="digital-install-grid" aria-label="Guía de instalación">
          <InstallSteps platform={installPlatform} />
          <article className="digital-install-note">
            <p className="digital-kicker">Cuándo aparece</p>
            <h2>Primero jugás, después instalás.</h2>
            <p>
              Baraja no bloquea el preview con una instalación obligatoria. La
              guía aparece como CTA visible y vuelve a sugerirse después de la
              primera carta revelada o cuando hay intención de repetir la sesión.
            </p>
          </article>
        </section>
      )}
    </main>
  );
}

function InstallSteps({ platform }: { platform: string }) {
  if (platform === 'ios-safari') {
    return (
      <article className="digital-install-card">
        <p className="digital-kicker">iPhone / Safari</p>
        <h2>Agregar a inicio</h2>
        <ol>
          <li>Abrí Baraja desde Safari.</li>
          <li>Tocá el botón de compartir.</li>
          <li>Elegí “Agregar a pantalla de inicio”.</li>
          <li>Tocá “Agregar”.</li>
          <li>Abrí Baraja desde el nuevo icono.</li>
        </ol>
      </article>
    );
  }

  if (platform === 'android-chrome') {
    return (
      <article className="digital-install-card">
        <p className="digital-kicker">Android / Chrome</p>
        <h2>Instalar app</h2>
        <ol>
          <li>Abrí Baraja desde Chrome.</li>
          <li>Tocá el menú del navegador.</li>
          <li>Elegí “Instalar app” o “Agregar a pantalla principal”.</li>
          <li>Confirmá la instalación.</li>
          <li>Abrí Baraja desde el icono.</li>
        </ol>
      </article>
    );
  }

  return (
    <article className="digital-install-card">
      <p className="digital-kicker">Navegador</p>
      <h2>Usala como app</h2>
      <ol>
        <li>Abrí Baraja en un navegador compatible.</li>
        <li>Buscá la opción de instalar o agregar al inicio.</li>
        <li>Confirmá el nombre Baraja.</li>
        <li>Abrí desde el icono para una experiencia más limpia.</li>
      </ol>
    </article>
  );
}
