import { createClient } from '@supabase/supabase-js';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import { getEnvValue, getFirstNonEmpty } from './env';

const CMS_SUPABASE_URL = getEnvValue('VITE_SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const CMS_SUPABASE_SERVICE_KEY = getFirstNonEmpty([
  getEnvValue('BARAJA_SUPABASE_SERVICE_KEY'),
  getEnvValue('SUPABASE_SERVICE_ROLE_KEY'),
]);

function createBarajaSupabaseClient(serviceKey: string) {
  // Local CMS writes server-side and needs a service key to bypass RLS.
  return createClient(CMS_SUPABASE_URL, serviceKey, {
    db: { schema: 'baraja' },
  });
}

let supabaseLocal: ReturnType<typeof createBarajaSupabaseClient> | undefined;

function getSupabaseLocal() {
  if (!CMS_SUPABASE_SERVICE_KEY) {
    throw new Error(
      'Missing Baraja Supabase service key. Set BARAJA_SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local or .env.source.local before using local CMS writes.',
    );
  }

  const serviceKey = CMS_SUPABASE_SERVICE_KEY;
  supabaseLocal ??= createBarajaSupabaseClient(serviceKey);

  return supabaseLocal;
}

type SupabaseSyncResult = {
  warnings: string[];
};

function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  const message = error?.message ?? '';
  return error?.code === 'PGRST204' || /column .* does not exist|could not find .* column/i.test(message);
}

/** Persist a freshly-generated edition directly into Supabase */
export async function saveEditionToSupabase(rawDeckContent: RawDeckContent): Promise<SupabaseSyncResult> {
  const { slug, cards = [] } = rawDeckContent;
  const warnings: string[] = [];
  const supabaseLocal = getSupabaseLocal();

  const editionPayload = {
    slug,
    name: rawDeckContent.name,
    description: rawDeckContent.description,
    print_spec_id: rawDeckContent.print_spec_id,
    design_template_id: rawDeckContent.design_template_id || null,
    print_specs_overrides: rawDeckContent.print_specs_overrides || {},
    design_template_overrides: rawDeckContent.design_template_overrides || {},
    landing_config: rawDeckContent.landing_config || {},
    metadata: rawDeckContent.metadata || {},
    pricing: rawDeckContent.pricing || { amount: 1500000, currency: 'ars' },
    digital: rawDeckContent.digital || {},
  };

  const legacyEditionPayload = {
    slug: editionPayload.slug,
    name: editionPayload.name,
    description: editionPayload.description,
    print_spec_id: editionPayload.print_spec_id,
    design_template_id: editionPayload.design_template_id,
    print_specs_overrides: editionPayload.print_specs_overrides,
    design_template_overrides: editionPayload.design_template_overrides,
    landing_config: editionPayload.landing_config,
  };

  const upsertEdition = async (payload: typeof editionPayload | typeof legacyEditionPayload) => supabaseLocal
    .from('editions')
    .upsert(payload, { onConflict: 'slug' });

  // Upsert edition row
  let { error: editionErr } = await upsertEdition(editionPayload);
  if (editionErr) {
    if (isMissingColumnError(editionErr)) {
      warnings.push('La base local todavía no tiene columnas digital/pricing/metadata; se guardaron contenido y assets, pero no la configuración de publicación.');
      const legacyResult = await upsertEdition(legacyEditionPayload);
      editionErr = legacyResult.error;
    }

    if (editionErr) {
      throw new Error(`No se pudo guardar la edición en Supabase: ${editionErr.message}`);
    }
  }

  // Replace cards — delete existing then bulk insert
  const { error: deleteErr } = await supabaseLocal.from('cards').delete().eq('edition_slug', slug);
  if (deleteErr) {
    throw new Error(`No se pudieron reemplazar las cartas en Supabase: ${deleteErr.message}`);
  }

  if (cards.length > 0) {
    const cardsToInsert = cards.map((card) => ({
      id: card.id,
      edition_slug: slug,
      number: card.front.number,
      front: card.front,
      back: card.back,
      tags: card.tags || [],
    }));

    const { error: cardsErr } = await supabaseLocal
      .from('cards')
      .insert(cardsToInsert);

    if (cardsErr) {
      throw new Error(`No se pudieron insertar las cartas en Supabase: ${cardsErr.message}`);
    }
  }

  console.log(`✅ [Supabase] ${slug}: ${cards.length} cards saved.`);
  return { warnings };
}
