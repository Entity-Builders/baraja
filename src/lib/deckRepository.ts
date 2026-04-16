import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { IDeckRepository, RawDeckContent } from '@eb-packages/deck-engine';

// The app MUST provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY via .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[deckRepository] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Check apps/baraja/.env.local'
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export class SupabaseDeckRepository implements IDeckRepository {
  private client: SupabaseClient;

  constructor() {
    this.client = supabase;
  }

  async getDeckById(id: string): Promise<RawDeckContent | null> {
    const { data: edition, error: editionError } = await this.client
      .from('baraja_editions')
      .select('*')
      .eq('slug', id)
      .single();

    if (editionError || !edition) {
      console.warn(`[SupabaseDeckRepository] getDeckById edition error for slug ${id}:`, editionError);
      return null;
    }

    const { data: cards, error: cardsError } = await this.client
      .from('baraja_cards')
      .select('*')
      .eq('edition_slug', id)
      .order('number', { ascending: true });

    if (cardsError) {
      console.warn(`[SupabaseDeckRepository] getDeckById cards error for slug ${id}:`, cardsError);
    }

    let dbDesignOverrides: Record<string, unknown> = {};
    if (edition.design_template_id) {
      const { data: dt, error: dtError } = await this.client
        .from('baraja_design_templates')
        .select('primary_color, accent_color, text_color, background, font_heading, font_body, layout_config, qr_color, hidden_fields')
        .eq('id', edition.design_template_id)
        .single();
        
      if (!dtError && dt) {
        dbDesignOverrides = dt;
      }
    }

    return {
      id: edition.slug, // The legacy ID was the slug
      edition: edition.slug,
      name: edition.name,
      slug: edition.slug,
      description: edition.description || '',
      language: 'es', // Assume ES or derive
      card_count: cards ? cards.length : 0,
      metadata: {
        topic: '',
        tone: '',
        target_audience: '',
        player_count: '',
      },
      print_spec_id: edition.print_spec_id,
      design_template_id: edition.design_template_id,
      print_specs_overrides: edition.print_specs_overrides || {},
      // Combine DB template schema with local edition overrides
      design_template_overrides: {
        ...dbDesignOverrides,
        ...(edition.design_template_overrides || {})
      },
      landing_config: edition.landing_config || {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cards: (cards || []).map((card: any) => ({
        id: card.id,
        front: card.front,
        back: card.back,
        tags: card.tags || [],
      }))
    } as RawDeckContent;
  }

  async getAllDecks(): Promise<RawDeckContent[]> {
    const { data: editions, error } = await this.client
      .from('baraja_editions')
      .select('*');

    if (error || !editions) {
      console.warn(`[SupabaseDeckRepository] getAllDecks error:`, error);
      return [];
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

    return allDecks;
  }

  async updateDeckSettings(id: string, updates: Partial<RawDeckContent>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {};

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

    if (Object.keys(payload).length > 0) {
      const { error } = await this.client
        .from('baraja_editions')
        .update(payload)
        .eq('slug', id);

      if (error) {
        console.error(`[SupabaseDeckRepository] updateDeckSettings error for ${id}:`, error);
        throw error;
      }
    }
  }

  /**
   * Assigns a design preset to an edition and clears any per-edition overrides.
   * This is the "clean" assignment path — the preset owns all visual config.
   */
  async assignPreset(editionSlug: string, presetId: string): Promise<void> {
    const { error } = await this.client
      .from('baraja_editions')
      .update({
        design_template_id: presetId,
        design_template_overrides: {}, // Clear overrides — preset is the source of truth
      })
      .eq('slug', editionSlug);

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
  private client: SupabaseClient;

  constructor() {
    this.client = supabase;
  }

  async getAll(): Promise<DesignTemplateRow[]> {
    const { data, error } = await this.client
      .from('baraja_design_templates')
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
      .from('baraja_design_templates')
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
      .from('baraja_design_templates')
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
      .from('baraja_design_templates')
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
      .from('baraja_design_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DesignTemplateRepository] delete error:', error);
      throw error;
    }
  }
}

