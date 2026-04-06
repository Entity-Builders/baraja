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
      design_template_overrides: edition.design_template_overrides || {},
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
    if (updates.print_specs_overrides !== undefined) {
      payload.print_specs_overrides = updates.print_specs_overrides;
    }
    if (updates.design_template_overrides !== undefined) {
      payload.design_template_overrides = updates.design_template_overrides;
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
}
