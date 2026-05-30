import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Provide local URL and service role key (from npx supabase status)
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_KEY = 'REDACTED_SUPABASE_SERVICE_KEY'; // Use service key to bypass RLS if needed

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: 'baraja' },
});

async function main() {
  console.log('Starting seed...');

  const contentDir = path.resolve(__dirname, '../../../packages/deck-engine/src/content');
  const files = fs.readdirSync(contentDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const rawContent = JSON.parse(fs.readFileSync(path.join(contentDir, file), 'utf-8'));
    const slug = rawContent.slug;
    
    console.log(`Processing deck: ${slug}`);

    // Insert or update edition
    const { error: editionError } = await supabase
      .from('editions')
      .upsert({
        slug,
        name: rawContent.name,
        description: rawContent.description,
        print_spec_id: rawContent.print_spec_id,
        design_template_id: rawContent.design_template_id,
        print_specs_overrides: rawContent.print_specs_overrides || {},
        design_template_overrides: rawContent.design_template_overrides || {},
      }, { onConflict: 'slug' })
      .select()
      .single();

    if (editionError) {
      console.error(`❌ Error upserting edition ${slug}:`, editionError);
      continue;
    }

    console.log(`✅ Upserted edition ${slug}`);

    // Insert cards
    // First clear existing cards for this edition to avoid duplicates during seed
    await supabase.from('cards').delete().eq('edition_slug', slug);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cardsToInsert = rawContent.cards.map((card: any) => ({
      id: card.id,
      edition_slug: slug,
      number: card.front.number,
      front: card.front,
      back: card.back,
      tags: card.tags || [],
    }));

    if (cardsToInsert.length > 0) {
      const { error: cardsError } = await supabase
        .from('cards')
        .insert(cardsToInsert);

      if (cardsError) {
        console.error(`❌ Error inserting cards for ${slug}:`, cardsError);
      } else {
        console.log(`✅ Inserted ${cardsToInsert.length} cards for ${slug}`);
      }
    }
  }

  console.log('Seed complete!');
}

main().catch(console.error);
