import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { readEntityCheckoutReturnFromUrl, type EntityCheckoutReturnState } from '@eb-packages/billing-core';
import { getBarajaInquiryHref } from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';

const CHECKOUT_RETURN_PATH = '/bingo-musical/checkout/return';

const RETURN_COPY: Record<
  EntityCheckoutReturnState,
  { title: string; body: string; tone: 'success' | 'pending' | 'failed' | 'neutral' }
> = {
  success: {
    title: 'Pago recibido por Mercado Pago',
    body:
      'Mercado Pago nos devolvio un estado aprobado. Preparamos el pack cuando terminemos de confirmar el pago y los datos recuperables del pedido.',
    tone: 'success',
  },
  pending: {
    title: 'Pago pendiente',
    body:
      'Mercado Pago esta procesando el pago. Si queda aprobado, avanzamos con la preparacion del pack.',
    tone: 'pending',
  },
  failed: {
    title: 'Pago rechazado',
    body:
      'Mercado Pago no pudo aprobar este intento. Podes volver al creador y probar de nuevo.',
    tone: 'failed',
  },
  cancelled: {
    title: 'Checkout cancelado',
    body:
      'No se registro una compra desde este retorno. Podes volver al creador para revisar el preview e intentar de nuevo.',
    tone: 'neutral',
  },
  unknown: {
    title: 'Estado de pago sin confirmar',
    body:
      'No pudimos leer un estado claro del retorno. No entregamos packs automaticamente desde parametros del navegador.',
    tone: 'neutral',
  },
};

export default function MusicBingoCheckoutReturn() {
  const returnInfo = useMemo(
    () =>
      readEntityCheckoutReturnFromUrl(window.location, {
        returnPath: CHECKOUT_RETURN_PATH,
        fallbackOrigin: window.location.origin,
      }),
    []
  );
  const state = returnInfo?.state ?? 'unknown';
  const copy = RETURN_COPY[state];
  const supportHref = getBarajaInquiryHref(
    [
      'Hola, volvi de Mercado Pago por un Bingo Musical de Baraja y quiero confirmar el estado del pedido.',
      '',
      `Estado que vi en Baraja: ${state}`,
      'No incluyo datos de tarjeta ni capturas con informacion sensible.',
    ].join('\n')
  );

  useEffect(() => {
    trackBarajaEvent('baraja_checkout_returned', {
      provider: 'mercado_pago',
      route: CHECKOUT_RETURN_PATH,
      surface: 'music_bingo_checkout_return',
      checkout_return_state: state,
      has_provider_reference: returnInfo?.hasProviderReference ?? false,
      has_external_reference: returnInfo?.hasExternalReference ?? false,
    });
  }, [returnInfo?.hasExternalReference, returnInfo?.hasProviderReference, state]);

  return (
    <main className="baraja-music-checkout-return">
      <nav className="baraja-nav baraja-creator-app-nav">
        <Link to="/" className="baraja-brand">Baraja</Link>
        <div className="baraja-nav-links">
          <Link to="/bingo-musical/crear">Crear bingo</Link>
          <Link to="/bingo-musical">Bingo musical</Link>
        </div>
      </nav>

      <section className={`baraja-checkout-return-panel is-${copy.tone}`}>
        <p className="baraja-kicker">Mercado Pago</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <div className="baraja-checkout-return-note">
          <strong>Importante</strong>
          <span>
            El retorno del navegador no activa entrega por si solo. Usamos la
            confirmacion de Mercado Pago y soporte si hace falta revisar el caso.
          </span>
        </div>
        <footer>
          <Link to="/bingo-musical/crear" className="baraja-checkout-cancel">
            Volver al creador
          </Link>
          <a href={supportHref} className="baraja-checkout-proceed">
            Hablar con soporte
          </a>
        </footer>
      </section>
    </main>
  );
}
