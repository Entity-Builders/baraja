import { Analytics, PostHogProvider } from '@entity-builders/analytics';
import { getInstallPlatform, getViewportOrientation, isPwaStandalone } from '../lib/pwa';
import { toBarajaAcquisitionAnalyticsProperties, getBarajaAcquisitionContext } from '../lib/acquisitionAttribution';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST =
  import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

export const BARAJA_ANALYTICS_EVENTS = [
  'app_opened',
  'baraja_campaign_landing_viewed',
  'baraja_music_bingo_card_marked',
  'baraja_music_bingo_creator_started',
  'baraja_music_bingo_song_source_selected',
  'baraja_music_bingo_songs_validated',
  'baraja_music_bingo_card_count_selected',
  'baraja_music_bingo_grid_size_selected',
  'baraja_music_bingo_preview_generated',
  'baraja_music_bingo_price_viewed',
  'baraja_music_bingo_playlist_opened',
  'baraja_music_bingo_catalog_viewed',
  'baraja_music_bingo_catalog_filter_selected',
  'baraja_music_bingo_catalog_theme_selected',
  'baraja_music_bingo_seo_page_viewed',
  'baraja_music_bingo_seo_cta_clicked',
  'baraja_music_bingo_order_started',
  'baraja_music_bingo_checkout_started',
  'baraja_music_bingo_checkout_completed',
  'baraja_music_bingo_checkout_failed',
  'baraja_offer_cta_clicked',
  'baraja_deck_library_viewed',
  'baraja_deck_detail_viewed',
  'baraja_catalog_filter_selected',
  'baraja_inquiry_started',
  'baraja_preview_opened',
  'baraja_related_deck_clicked',
  'baraja_sample_drawn',
  'baraja_paywall_viewed',
  'baraja_checkout_started',
  'baraja_checkout_failed',
  'baraja_checkout_returned',
  'baraja_entitlement_activated',
  'baraja_printable_pdf_interest',
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
  'baraja_session_gallery_opened',
  'baraja_session_gallery_card_selected',
  'baraja_session_paused',
  'baraja_session_resumed',
  'baraja_session_ended',
] as const;

export type BarajaAnalyticsEvent = (typeof BARAJA_ANALYTICS_EVENTS)[number];

const SAFE_PROPERTY_NAMES = new Set([
  'access_state',
  'acquisition_campaign',
  'acquisition_content',
  'acquisition_medium',
  'acquisition_referrer_host',
  'acquisition_source',
  'amount_cents',
  'app',
  'board_size',
  'card_count',
  'card_id',
  'card_number',
  'campaign_id',
  'can_preview',
  'category_id',
  'checkout_return_state',
  'checkout_outcome',
  'collection_id',
  'cta_id',
  'cta_kind',
  'currency',
  'deck_count',
  'deck_id',
  'deck_slug',
  'environment',
  'event_version',
  'face',
  'filter_id',
  'filter_label',
  'has_external_reference',
  'has_free_space',
  'has_provider_reference',
  'href_type',
  'install_platform',
  'license_scope_count',
  'locked_count',
  'marked_count',
  'mode',
  'offer_id',
  'offering_id',
  'offer_type',
  'orientation',
  'order_status',
  'platform',
  'played_count',
  'playlist_provider',
  'playlist_title',
  'price_label',
  'price_mode',
  'preview_card_count',
  'previewable',
  'printable_enabled',
  'project',
  'provider',
  'required_song_count',
  'recent_count',
  'result_count',
  'route',
  'safe_error_code',
  'session_mode',
  'seo_intent',
  'seo_slug',
  'source',
  'source_deck_id',
  'source_deck_slug',
  'standalone',
  'surface',
  'target_deck_id',
  'target_deck_slug',
  'vibration_enabled',
  'sound_enabled',
  'song_count',
  'venue_id',
  'theme_id',
  'use_context',
  'warning_count',
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

  trackBarajaEvent('app_opened', {
    install_platform: getInstallPlatform(),
    orientation: getViewportOrientation(),
    standalone: isPwaStandalone(),
    surface: 'app_boot',
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
    ...toBarajaAcquisitionAnalyticsProperties(getBarajaAcquisitionContext()),
  });
}

/**
 * Returns only PostHog's default anonymous UUID so a verified provider payment
 * can be connected back to this browser's analytics funnel.
 */
export function getBarajaAnalyticsDistinctId(): string | null {
  const distinctId = analytics.getDistinctId();
  return isUuid(distinctId) ? distinctId : null;
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

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}
