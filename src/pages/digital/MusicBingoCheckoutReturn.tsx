import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { readEntityCheckoutReturnFromUrl, type EntityCheckoutReturnState } from '@entity-builders/billing-core';
import { BrandIcon } from '../../components/BrandIcon';
import { getBarajaInquiryHref } from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';
import {
  BarajaMusicBingoCheckoutError,
  getBarajaMusicBingoOrderDownloadUrl,
  getBarajaMusicBingoOrderStatus,
  type BarajaMusicBingoOrderStatusResponse,
} from '../../services/musicBingoCheckout';

const CHECKOUT_RETURN_PATH = '/bingo-musical/checkout/return';

const RETURN_COPY: Record<
  EntityCheckoutReturnState,
  { title: string; body: string; tone: 'success' | 'pending' | 'failed' | 'neutral' }
> = {
	  success: {
	    title: 'Pago recibido por Mercado Pago',
	    body:
	      'Estamos terminando de confirmar tu pedido. Si Mercado Pago ya aprobó el pago, el PDF aparece acá en unos segundos.',
	    tone: 'success',
	  },
	  pending: {
	    title: 'Pago pendiente',
	    body:
	      'Mercado Pago todavía está procesando el pago. Dejamos esta pantalla lista para avisarte cuando se confirme.',
	    tone: 'pending',
	  },
	  failed: {
	    title: 'Pago rechazado',
	    body:
	      'Mercado Pago no pudo aprobar este intento. Podés volver al creador y probar de nuevo.',
	    tone: 'failed',
	  },
	  cancelled: {
	    title: 'Checkout cancelado',
	    body:
	      'No se registró una compra. Podés volver al creador para revisar el preview e intentar de nuevo.',
	    tone: 'neutral',
	  },
	  unknown: {
	    title: 'Estado de pago sin confirmar',
	    body:
	      'No pudimos leer un estado claro del pago. Si hiciste el pago, lo revisamos con soporte.',
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
  const orderAccess = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id')?.trim() || '';
    const accessToken = params.get('access_token')?.trim() || '';
    const providerPaymentId =
      params.get('payment_id')?.trim() ||
      params.get('collection_id')?.trim() ||
      params.get('provider_payment_id')?.trim() ||
      null;
    return orderId && accessToken ? { orderId, accessToken, providerPaymentId } : null;
  }, []);
  const [orderState, setOrderState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; data: BarajaMusicBingoOrderStatusResponse }
    | { status: 'not_ready'; data: BarajaMusicBingoOrderStatusResponse }
    | { status: 'error'; message: string }
  >(orderAccess ? { status: 'loading' } : { status: 'idle' });
  const state = returnInfo?.state ?? 'unknown';
  const serverOrder = orderState.status === 'ready' || orderState.status === 'not_ready'
    ? orderState.data.order
    : null;
  const copy = getReturnCopy(state, orderState, serverOrder);
  const downloadUrl = serverOrder?.ready && orderAccess
    ? getBarajaMusicBingoOrderDownloadUrl(orderAccess.orderId, orderAccess.accessToken)
    : '';
  const supportHref = getBarajaInquiryHref(
    [
      'Hola, volvi de Mercado Pago por un Bingo Musical de Baraja y quiero confirmar el estado del pedido.',
      '',
      `Estado que vi en Baraja: ${state}`,
      orderAccess ? `Pedido: ${orderAccess.orderId}` : 'Pedido: sin referencia en la URL',
      'No incluyo datos de tarjeta ni capturas con informacion sensible.',
    ].join('\n')
  );

  useEffect(() => {
    if (!orderAccess) return;
    let cancelled = false;
    let intervalId: number | undefined;

    const loadOrder = async () => {
      try {
        const data = await getBarajaMusicBingoOrderStatus(
          orderAccess.orderId,
          orderAccess.accessToken,
          orderAccess.providerPaymentId
        );
        if (cancelled) return;
        setOrderState(data.order.ready
          ? { status: 'ready', data }
          : { status: 'not_ready', data });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof BarajaMusicBingoCheckoutError
          ? error.message
          : 'No pudimos leer el estado del pedido.';
        setOrderState({ status: 'error', message });
      }
    };

    setOrderState({ status: 'loading' });
    void loadOrder();
    intervalId = window.setInterval(() => void loadOrder(), 6000);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [orderAccess]);

  useEffect(() => {
    trackBarajaEvent('baraja_checkout_returned', {
      provider: 'mercado_pago',
      route: CHECKOUT_RETURN_PATH,
      surface: 'music_bingo_checkout_return',
      checkout_return_state: state,
      has_provider_reference: returnInfo?.hasProviderReference ?? false,
      has_external_reference: Boolean(orderAccess) || (returnInfo?.hasExternalReference ?? false),
    });
  }, [orderAccess, returnInfo?.hasExternalReference, returnInfo?.hasProviderReference, state]);

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
        <p className="baraja-kicker baraja-brand-kicker">
          <BrandIcon name="mercadoPago" className="baraja-kicker-provider-icon" />
          Mercado Pago
        </p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <div className="baraja-checkout-return-note">
          <strong>{copy.noteTitle}</strong>
          <span>{copy.note}</span>
        </div>
        <footer>
          <Link to="/bingo-musical/crear" className="baraja-checkout-cancel">
            Volver al creador
          </Link>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              className="baraja-checkout-proceed"
              onClick={() => {
                trackBarajaEvent('baraja_printable_pdf_download_requested', {
                  route: CHECKOUT_RETURN_PATH,
                  surface: 'music_bingo_checkout_return',
                  provider: 'mercado_pago',
                  source: 'checkout_return',
                });
              }}
            >
              Descargar PDF
            </a>
          ) : (
            <a href={supportHref} className="baraja-checkout-proceed">
              <BrandIcon name="whatsapp" className="baraja-checkout-provider-icon" />
              Hablar con soporte
            </a>
          )}
        </footer>
      </section>
    </main>
  );
}

function getReturnCopy(
  providerState: EntityCheckoutReturnState,
  orderState:
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; data: BarajaMusicBingoOrderStatusResponse }
    | { status: 'not_ready'; data: BarajaMusicBingoOrderStatusResponse }
    | { status: 'error'; message: string },
  serverOrder: BarajaMusicBingoOrderStatusResponse['order'] | null
) {
  if (orderState.status === 'loading') {
    return {
	      title: 'Confirmando tu pago',
	      body: 'Estamos confirmando tu pago. Suele tardar unos segundos; si ya se aprobó, el PDF aparece acá.',
	      tone: 'pending' as const,
	      noteTitle: 'Entrega segura',
	      note: 'Liberamos el PDF cuando Mercado Pago confirma el pago.',
	    };
	  }

  if (orderState.status === 'ready' && serverOrder) {
    return {
	      title: 'Gracias, tu Bingo Musical está listo',
	      body: `Ya podés descargar el PDF con ${serverOrder.purchase.cardCount} cartones y la hoja de control.`,
	      tone: 'success' as const,
	      noteTitle: 'También por email',
	      note: serverOrder.emailStatus === 'sent'
	        ? 'También te enviamos el link de descarga al email de entrega.'
	        : 'Si el email tarda, este botón de descarga sigue funcionando.',
	    };
	  }

  if (orderState.status === 'not_ready' && serverOrder) {
    const failed = ['failed', 'cancelled', 'refunded', 'disputed', 'expired', 'unverified']
      .includes(serverOrder.status);
    return {
	      title: failed ? 'No pudimos liberar este pedido' : 'Pago en confirmación',
	      body: failed
	        ? 'Mercado Pago no aprobó este pago. Si creés que es un error, escribinos y lo revisamos.'
	        : 'Encontramos el pedido, pero todavía no llegó la confirmación de Mercado Pago.',
	      tone: failed ? 'failed' as const : 'pending' as const,
	      noteTitle: 'Estamos atentos',
	      note: 'La página se actualiza automáticamente mientras queda abierta.',
	    };
	  }

  if (orderState.status === 'error') {
    return {
      title: 'No pudimos leer el pedido',
      body: orderState.message,
      tone: 'neutral' as const,
      noteTitle: 'Soporte',
	      note: 'El pago no se pierde por este error de pantalla. Podemos revisar el pedido desde Mercado Pago.',
    };
  }

  const fallback = RETURN_COPY[providerState];
  return {
    ...fallback,
    noteTitle: 'Importante',
    note:
	      'Liberamos el PDF cuando Mercado Pago confirma el pago. Si algo no cierra, lo revisamos por soporte.',
	  };
	}
