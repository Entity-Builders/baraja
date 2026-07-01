import { createClient } from '@supabase/supabase-js';
import { DECKS, RAW_DECKS } from '@eb-packages/deck-engine';
import type {
  Card,
  DeckMetadata,
  DeckPricing,
  DeckSchema,
  DigitalDeckConfig,
  IDeckRepository,
  RawDeckContent,
} from '@eb-packages/deck-engine';

const viteEnv = (import.meta as unknown as {
  env?: Record<string, string | undefined>;
}).env ?? {};

// The app should provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY via env.
// Admin reads still fall back to bundled deck content when DB config is absent.
const supabaseUrl = viteEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY;
const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasSupabaseConfig) {
  console.error(
    '[deckRepository] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Admin deck reads will use bundled deck content.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseAnonKey || 'missing-anon-key',
{
  auth: {
    storageKey: 'eb:baraja:supabase-auth',
  },
  db: { schema: 'baraja' },
});

const localDecks = DECKS as Record<string, DeckSchema>;
const rawLocalDecks = RAW_DECKS as Record<string, RawDeckContent>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getLocalDeck(id: string): DeckSchema | undefined {
  return (
    localDecks[id] ??
    Object.values(localDecks).find(
      (deck) => deck.id === id || deck.slug === id || deck.edition === id
    )
  );
}

function getLocalDeckRows(): RawDeckContent[] {
  return Object.values(rawLocalDecks);
}

function getLocalDeckRow(id: string): RawDeckContent | null {
  return (
    rawLocalDecks[id] ??
    Object.values(rawLocalDecks).find(
      (deck) => deck.id === id || deck.slug === id || deck.edition === id
    ) ??
    null
  );
}

function buildEditionPayloadFromDeck(deck: RawDeckContent): Record<string, unknown> {
  return {
    slug: deck.slug || deck.id,
    name: deck.name,
    description: deck.description || '',
    print_spec_id: deck.print_spec_id,
    design_template_id: deck.design_template_id,
    print_specs_overrides: deck.print_specs_overrides || {},
    design_template_overrides: deck.design_template_overrides || {},
    landing_config: deck.landing_config || {},
    metadata: deck.metadata || {},
    pricing: deck.pricing || { amount: 1500000, currency: 'ars' },
    digital: deck.digital || {},
  };
}

function getDeckSlug(id: string): string {
  return getLocalDeckRow(id)?.slug || id;
}

function getLocalCard(deckId: string, cardId: string): Card | undefined {
  return getLocalDeckRow(deckId)?.cards.find(card => card.id === cardId);
}

function buildCardPayload(
  editionSlug: string,
  cardId: string,
  updates: Partial<Card>,
  fallback?: Card,
): Record<string, unknown> {
  const front = updates.front ?? fallback?.front;
  const back = updates.back ?? fallback?.back;

  if (!front || !back) {
    throw new Error('Card front and back are required before saving to Supabase.');
  }

  return {
    id: cardId,
    edition_slug: editionSlug,
    number: front.number,
    front,
    back,
    tags: updates.tags ?? fallback?.tags ?? [],
  };
}

function getDeckMetadata(value: unknown, fallback?: DeckMetadata): DeckMetadata {
  const base: DeckMetadata = fallback ?? {
    topic: '',
    tone: '',
    target_audience: '',
    player_count: '',
  };

  if (!isRecord(value)) return base;

  return {
    ...base,
    topic: typeof value.topic === 'string' ? value.topic : base.topic,
    tone: typeof value.tone === 'string' ? value.tone : base.tone,
    target_audience: typeof value.target_audience === 'string' ? value.target_audience : base.target_audience,
    player_count: typeof value.player_count === 'string' ? value.player_count : base.player_count,
    art_direction: isRecord(value.art_direction) ? value.art_direction as unknown as DeckMetadata['art_direction'] : base.art_direction,
  };
}

function getDeckPricing(value: unknown, fallback?: DeckPricing): DeckPricing {
  const base: DeckPricing = fallback ?? { amount: 1500000, currency: 'ars' };
  if (!isRecord(value)) return base;

  const currency = value.currency === 'usd' ? 'usd' : value.currency === 'ars' ? 'ars' : base.currency;
  return {
    amount: typeof value.amount === 'number' ? value.amount : base.amount,
    currency,
    stripe_price_id: typeof value.stripe_price_id === 'string' ? value.stripe_price_id : base.stripe_price_id,
  };
}

function getDigitalConfig(value: unknown, fallback?: DigitalDeckConfig): DigitalDeckConfig | undefined {
  if (!isRecord(value)) return fallback;
  return value as DigitalDeckConfig;
}

export class SupabaseDeckRepository implements IDeckRepository {
  private client: typeof supabase;

  constructor() {
    this.client = supabase;
  }

  private async ensureEditionRow(id: string): Promise<string> {
    if (!hasSupabaseConfig) {
      throw new Error('Supabase is not configured; deck changes cannot be persisted.');
    }

    const editionSlug = getDeckSlug(id);
    const { data: existing, error: existingError } = await this.client
      .from('editions')
      .select('slug')
      .eq('slug', editionSlug)
      .maybeSingle();

    if (!existingError && existing?.slug) {
      return String(existing.slug);
    }

    const localDeck = getLocalDeckRow(id);
    if (!localDeck) {
      throw new Error(`Deck "${id}" does not exist in Supabase and has no bundled seed content.`);
    }

    const { error } = await this.client
      .from('editions')
      .upsert(buildEditionPayloadFromDeck(localDeck), { onConflict: 'slug' });

    if (error) {
      console.error(`[SupabaseDeckRepository] ensureEditionRow error for ${id}:`, error);
      throw error;
    }

    return editionSlug;
  }

  async getDeckById(id: string): Promise<RawDeckContent | null> {
    if (!hasSupabaseConfig) {
      return getLocalDeckRow(id);
    }

    const localDeck = getLocalDeck(id);
    const localRawDeck = getLocalDeckRow(id);

    const { data: edition, error: editionError } = await this.client
      .from('editions')
      .select('*')
      .eq('slug', id)
      .single();

    if (editionError || !edition) {
      console.warn(`[SupabaseDeckRepository] getDeckById edition error for slug ${id}:`, editionError);
      return getLocalDeckRow(id);
    }

    const { data: cards, error: cardsError } = await this.client
      .from('cards')
      .select('*')
      .eq('edition_slug', id)
      .order('number', { ascending: true });

    if (cardsError) {
      console.warn(`[SupabaseDeckRepository] getDeckById cards error for slug ${id}:`, cardsError);
    }

    let dbDesignOverrides: Record<string, unknown> = {};
    if (edition.design_template_id) {
      const { data: dt, error: dtError } = await this.client
        .from('design_templates')
        .select('primary_color, accent_color, text_color, background, font_heading, font_body, layout_config, qr_color, hidden_fields')
        .eq('id', edition.design_template_id)
        .single();
        
      if (!dtError && dt) {
        dbDesignOverrides = dt;
      }
    }

    const resolvedCards = cards && cards.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (cards || []).map((card: any) => ({
          id: card.id,
          front: card.front,
          back: card.back,
          tags: card.tags || [],
        }))
      : localDeck?.cards ?? [];

    return {
      id: edition.slug || localDeck?.id || id,
      edition: edition.slug || localDeck?.edition || id,
      name: edition.name || localDeck?.name || id,
      slug: edition.slug || localDeck?.slug || id,
      description: edition.description || localDeck?.description || '',
      language: localDeck?.language ?? 'es',
      card_count: resolvedCards.length,
      metadata: getDeckMetadata(edition.metadata, localDeck?.metadata),
      print_spec_id: edition.print_spec_id || localRawDeck?.print_spec_id,
      design_template_id: edition.design_template_id || localRawDeck?.design_template_id,
      print_specs_overrides: edition.print_specs_overrides || {},
      // Combine DB template schema with local edition overrides
      design_template_overrides: {
        ...dbDesignOverrides,
        ...(edition.design_template_overrides || {})
      },
      landing_config: edition.landing_config || {},
      digital: getDigitalConfig(edition.digital, localDeck?.digital),
      pricing: getDeckPricing(edition.pricing, localDeck?.pricing),
      cards: resolvedCards,
    } as RawDeckContent;
  }

  async getAllDecks(): Promise<RawDeckContent[]> {
    if (!hasSupabaseConfig) {
      return getLocalDeckRows();
    }

    const { data: editions, error } = await this.client
      .from('editions')
      .select('*');

    if (error || !editions) {
      console.warn(`[SupabaseDeckRepository] getAllDecks error:`, error);
      return getLocalDeckRows();
    }

    if (editions.length === 0) {
      return getLocalDeckRows();
    }

    // Since we usually just list them in UI using name/description, fetching all cards for all decks
    // might be heavy but for now it satisfies the RawDeckContent structure.
    const allDecks: RawDeckContent[] = [];
    for (const edition of editions) {
      const deck = await this.getDeckById(edition.slug);
      if (deck) {
        allDecks.push(deck);
      }
    }

    const seen = new Set(allDecks.map((deck) => deck.slug || deck.id));
    for (const localDeck of getLocalDeckRows()) {
      const key = localDeck.slug || localDeck.id;
      if (!seen.has(key)) {
        allDecks.push(localDeck);
      }
    }

    return allDecks;
  }

  async updateDeckSettings(id: string, updates: Partial<RawDeckContent>): Promise<void> {
    if (!hasSupabaseConfig) {
      throw new Error('Supabase is not configured; deck settings cannot be persisted.');
    }

    const payload: Record<string, unknown> = {};

    if (updates.name !== undefined) {
      payload.name = updates.name;
    }
    if (updates.description !== undefined) {
      payload.description = updates.description;
    }
    if (updates.print_spec_id !== undefined) {
      payload.print_spec_id = updates.print_spec_id;
    }
    if (updates.design_template_id !== undefined) {
      payload.design_template_id = updates.design_template_id;
    }
    if (updates.print_specs_overrides !== undefined) {
      payload.print_specs_overrides = updates.print_specs_overrides;
    }
    if (updates.design_template_overrides !== undefined) {
      payload.design_template_overrides = updates.design_template_overrides;
    }
    if (updates.landing_config !== undefined) {
      payload.landing_config = updates.landing_config;
    }
    if (updates.metadata !== undefined) {
      payload.metadata = updates.metadata;
    }
    if (updates.pricing !== undefined) {
      payload.pricing = updates.pricing;
    }
    if (updates.digital !== undefined) {
      payload.digital = updates.digital;
    }

    if (Object.keys(payload).length > 0) {
      const editionSlug = await this.ensureEditionRow(id);

      const { error } = await this.client
        .from('editions')
        .update(payload)
        .eq('slug', editionSlug);

      if (error) {
        console.error(`[SupabaseDeckRepository] updateDeckSettings error for ${id}:`, error);
        throw error;
      }
    }
  }

  async updateCard(editionId: string, cardId: string, updates: Partial<Card>): Promise<void> {
    if (!hasSupabaseConfig) {
      throw new Error('Supabase is not configured; card changes cannot be persisted.');
    }

    const editionSlug = await this.ensureEditionRow(editionId);
    const fallbackCard = getLocalCard(editionId, cardId);
    const payload = buildCardPayload(editionSlug, cardId, updates, fallbackCard);

    const { error } = await this.client
      .from('cards')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error(`[SupabaseDeckRepository] updateCard error for ${editionId}/${cardId}:`, error);
      throw error;
    }
  }

  /**
   * Assigns a design preset to an edition and clears any per-edition overrides.
   * This is the "clean" assignment path — the preset owns all visual config.
   */
  async assignPreset(editionSlug: string, presetId: string): Promise<void> {
    if (!hasSupabaseConfig) {
      throw new Error('Supabase is not configured; preset assignment cannot be persisted.');
    }

    const resolvedEditionSlug = await this.ensureEditionRow(editionSlug);

    const { error } = await this.client
      .from('editions')
      .update({
        design_template_id: presetId,
        design_template_overrides: {}, // Clear overrides — preset is the source of truth
      })
      .eq('slug', resolvedEditionSlug);

    if (error) {
      console.error(`[SupabaseDeckRepository] assignPreset error:`, error);
      throw error;
    }
  }
}

// ── Design Template types & repository ─────────────────────────

/** Position & style for a single back-face element (all values as % of card) */
export interface ElementLayout {
  visible: boolean;
  /** Top offset as % of card height */
  y: number;
  /** Left offset as % of card width */
  x: number;
  /** Width as % of card width */
  w: number;
  /** Height as % of card height (0 = auto) */
  h: number;
  /** Font size in pt (used identically in CSS & react-pdf) */
  fontSize: number;
  /** Text alignment */
  align: 'left' | 'center' | 'right';
  /** Text transform */
  transform?: 'uppercase' | 'none';
  /** Letter spacing (px) */
  letterSpacing?: number;
  /** Opacity 0-1 */
  opacity?: number;
  /** Font type: heading or body */
  fontType?: 'heading' | 'body';
  /** Font weight */
  fontWeight?: number;
  /** Font style */
  fontStyle?: 'normal' | 'italic';
  /** Line height multiplier */
  lineHeight?: number;
  /** Use accent color instead of text color */
  useAccentColor?: boolean;
  /** Explicit color override (hex / rgba) — takes precedence over theme defaults */
  color?: string;
}

/** Named elements on the back face */
export type BackElementKey = 'when_to_use' | 'phrase' | 'instruction' | 'fun_fact' | 'answer' | 'qr' | 'brand';

export interface LayoutConfig {
  /** Per-element positioning on back face (% based) */
  elements?: Partial<Record<BackElementKey, ElementLayout>>;
  /** Back face inner border frame */
  border?: {
    visible: boolean;
    style: 'solid' | 'dashed' | 'dotted';
    inset: number; // % from edges
    opacity: number;
  };
  /** Editable sample text for preview testing in editor */
  sample_text?: Partial<Record<BackElementKey, string>>;
}

export interface DesignTemplateRow {
  id: string;
  name: string;
  primary_color: string;
  accent_color: string;
  font_heading: string;
  font_body: string;
  background: string | null;
  text_color: string | null;
  surface_color: string | null;
  card_width: number;
  card_height: number;
  card_unit: string;
  layout_config: LayoutConfig;
  hidden_fields?: Record<string, boolean>;
  /** QR code foreground color for this preset. Null = use theme default. */
  qr_color: string | null;
  created_at: string;
  updated_at: string;
}

export type DesignTemplateId = string;
export type DesignTemplateInput = Omit<DesignTemplateRow, 'created_at' | 'updated_at'>;

export class DesignTemplateRepository {
  private client: typeof supabase;

  constructor() {
    this.client = supabase;
  }

  async getAll(): Promise<DesignTemplateRow[]> {
    const { data, error } = await this.client
      .from('design_templates')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[DesignTemplateRepository] getAll error:', error);
      throw error;
    }
    return data || [];
  }

  async getById(id: string): Promise<DesignTemplateRow | null> {
    const { data, error } = await this.client
      .from('design_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.warn('[DesignTemplateRepository] getById error:', error);
      return null;
    }
    return data;
  }

  async create(template: DesignTemplateInput): Promise<DesignTemplateRow> {
    const { data, error } = await this.client
      .from('design_templates')
      .insert(template)
      .select()
      .single();

    if (error) {
      console.error('[DesignTemplateRepository] create error:', error);
      throw error;
    }
    return data;
  }

  async update(id: string, updates: Partial<DesignTemplateInput>): Promise<DesignTemplateRow> {
    const { data, error } = await this.client
      .from('design_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[DesignTemplateRepository] update error:', error);
      throw error;
    }
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.client
      .from('design_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DesignTemplateRepository] delete error:', error);
      throw error;
    }
  }
}

// ── Saved Config types & repository ─────────────────────────────

/** A complete snapshot of a deck's visual configuration */
export interface SavedConfigRow {
  id: string;
  name: string;
  edition_slug: string | null;
  design_template_id: string | null;
  layout_config: Record<string, unknown>;
  hidden_fields: Record<string, boolean>;
  card_width: number;
  card_height: number;
  card_unit: string;
  created_at: string;
  updated_at: string;
}

export type SavedConfigInput = Omit<SavedConfigRow, 'id' | 'created_at' | 'updated_at'>;

export interface SavedConfigApplyOverrides {
  layout_config?: Record<string, unknown>;
  hidden_fields?: Record<string, boolean>;
  card_width?: number;
  card_height?: number;
  design_template_id?: string | null;
}

export class SavedConfigRepository {
  private client: typeof supabase;

  constructor() {
    this.client = supabase;
  }

  /** List all saved configs, optionally filtered by edition */
  async getAll(editionSlug?: string): Promise<SavedConfigRow[]> {
    let query = this.client
      .from('saved_configs')
      .select('*')
      .order('created_at', { ascending: false });

    if (editionSlug) {
      // Return configs for this edition + global configs (edition_slug IS NULL)
      query = query.or(`edition_slug.eq.${editionSlug},edition_slug.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[SavedConfigRepository] getAll error:', error);
      throw error;
    }
    return data || [];
  }

  async create(config: SavedConfigInput): Promise<SavedConfigRow> {
    const { data, error } = await this.client
      .from('saved_configs')
      .insert(config)
      .select()
      .single();

    if (error) {
      console.error('[SavedConfigRepository] create error:', error);
      throw error;
    }
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.client
      .from('saved_configs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[SavedConfigRepository] delete error:', error);
      throw error;
    }
  }

  /**
   * Apply a saved config to an edition.
   * Writes the config's layout, size, hidden fields, and template reference
   * back to the edition's design_template_overrides.
   */
  async applyToEdition(
    configId: string,
    editionSlug: string,
    overrides: SavedConfigApplyOverrides = {},
  ): Promise<void> {
    // 1. Fetch the saved config
    const { data: config, error: fetchError } = await this.client
      .from('saved_configs')
      .select('*')
      .eq('id', configId)
      .single();

    if (fetchError || !config) {
      throw new Error('Saved config not found');
    }

    // 2. Build edition update payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {
      design_template_overrides: {
        layout_config: overrides.layout_config ?? config.layout_config,
        hidden_fields: overrides.hidden_fields ?? config.hidden_fields,
        card_width: overrides.card_width ?? config.card_width,
        card_height: overrides.card_height ?? config.card_height,
      },
    };

    const designTemplateId = overrides.design_template_id ?? config.design_template_id;
    if (designTemplateId) {
      payload.design_template_id = designTemplateId;
    }

    // 3. Update the edition
    const { error: updateError } = await this.client
      .from('editions')
      .update(payload)
      .eq('slug', editionSlug);

    if (updateError) {
      console.error('[SavedConfigRepository] applyToEdition error:', updateError);
      throw updateError;
    }
  }
}
