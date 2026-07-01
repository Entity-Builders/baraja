import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envTarget = process.env.BARAJA_DB_TARGET === 'production' ? 'production' : 'local';

dotenv.config({
  path: path.resolve(__dirname, `../.env.${envTarget}`),
  override: false,
});

// Provide a local URL by default, but require the service role key from env.
const SUPABASE_URL =
  process.env.BARAJA_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  'http://127.0.0.1:54321';
const SUPABASE_SERVICE_KEY =
  process.env.BARAJA_SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  throw new Error(
    `Missing Supabase service key for ${envTarget}. Set BARAJA_SUPABASE_SERVICE_KEY, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_SERVICE_KEY before running the Baraja seed script.`,
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: 'baraja' },
});

async function main() {
  console.log(`Starting Baraja Supabase seed (${envTarget}) at ${SUPABASE_URL}...`);

  const contentDir = path.resolve(__dirname, '../../../packages/deck-engine/src/content');
  const files = fs
    .readdirSync(contentDir)
    .filter(f => f.endsWith('.json') && !f.startsWith('failed_') && f !== 'frames_library.json');

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
        landing_config: rawContent.landing_config || {},
        metadata: rawContent.metadata || {},
        pricing: rawContent.pricing || { amount: 1500000, currency: 'ars' },
        digital: rawContent.digital || {},
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
