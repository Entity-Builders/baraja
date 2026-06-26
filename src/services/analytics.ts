import { Analytics, PostHogProvider } from '@eb-packages/analytics';
import { getInstallPlatform, getViewportOrientation, isPwaStandalone } from '../lib/pwa';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST =
  import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

export const BARAJA_ANALYTICS_EVENTS = [
  'baraja_deck_library_viewed',
  'baraja_deck_detail_viewed',
  'baraja_sample_drawn',
  'baraja_paywall_viewed',
  'baraja_checkout_started',
  'baraja_checkout_returned',
  'baraja_entitlement_activated',
  'baraja_printable_pdf_download_requested',
  'baraja_pwa_install_guide_viewed',
  'baraja_pwa_standalone_launched',
  'baraja_pwa_session_resumed',
  'baraja_session_started',
  'baraja_card_front_viewed',
  'baraja_card_revealed',
  'baraja_card_next_requested',
  'baraja_card_previous_requested',
  'baraja_card_saved',
  'baraja_card_shared',
  'baraja_session_paused',
  'baraja_session_resumed',
  'baraja_session_ended',
] as const;

export type BarajaAnalyticsEvent = (typeof BARAJA_ANALYTICS_EVENTS)[number];

const SAFE_PROPERTY_NAMES = new Set([
  'access_state',
  'app',
  'card_count',
  'card_id',
  'card_number',
  'checkout_return_state',
  'deck_count',
  'deck_id',
  'deck_slug',
  'environment',
  'event_version',
  'install_platform',
  'license_scope_count',
  'locked_count',
  'mode',
  'orientation',
  'platform',
  'played_count',
  'preview_card_count',
  'previewable',
  'printable_enabled',
  'project',
  'recent_count',
  'session_mode',
  'source',
  'standalone',
  'surface',
  'vibration_enabled',
  'sound_enabled',
]);

const analytics = new Analytics(new PostHogProvider());

export function initAnalytics() {
  analytics.init({
    apiKey: POSTHOG_KEY,
    apiHost: POSTHOG_HOST,
    autocapture: false,
    disableSessionRecording: true,
    disabled: import.meta.env.DEV || !POSTHOG_KEY,
  });

  analytics.setGlobalProperties({
    app: 'baraja',
    project: 'baraja',
    environment: import.meta.env.MODE || 'production',
  });

  if (isPwaStandalone()) {
    trackBarajaEvent('baraja_pwa_standalone_launched', {
      install_platform: getInstallPlatform(),
      orientation: getViewportOrientation(),
      standalone: true,
      surface: 'app_boot',
    });
  }
}

export function trackBarajaEvent(
  event: BarajaAnalyticsEvent,
  properties: Record<string, unknown> = {}
) {
  analytics.track(event, {
    app: 'baraja',
    event_version: 1,
    ...safeBarajaAnalyticsProperties(properties),
  });
}

export function safeBarajaAnalyticsProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      if (!SAFE_PROPERTY_NAMES.has(key)) {
        return false;
      }

      return isSafePrimitive(value);
    })
  );
}

function isSafePrimitive(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}
