import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is missing from .env");
  process.exit(1);
}

const EDITION_SLUG = 'barometro';
const ART_DIRECTION = 'Generative abstract art, depicting emotional regulation, DBT grounding, and distress tolerance. Earthy and ethereal, subtle gradients.';

const VIBE_MATRIX = [
  { timeOfDay: 'morning', season: 'spring', description: 'crisp, foggy, gentle morning light, fresh greens and soft yellows' },
  { timeOfDay: 'afternoon', season: 'summer', description: 'bright, warm golden hour, energetic light' },
  { timeOfDay: 'evening', season: 'autumn', description: 'moody dusk, rain, deep purples, blues, wet textures' },
  { timeOfDay: 'night', season: 'winter', description: 'dark, starry, profound calm, deep navy and silver' },
];

async function generateBackground(vibe: typeof VIBE_MATRIX[0]) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`;
  
  const prompt = `${ART_DIRECTION}. Vibe adaptation: ${vibe.description}. Minimalist, atmospheric background, empty center perfect for text overlay. Soft, diffuse lighting.`;
  
  console.log(`Generating vibe: ${vibe.timeOfDay} / ${vibe.season}...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [
        { "prompt": prompt }
      ],
      parameters: {
        "sampleCount": 1,
        "aspectRatio": "16:9",
        "outputOptions": {
            "mimeType": "image/jpeg"
        }
      }
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`API Error for ${vibe.timeOfDay}:`, err);
    return;
  }

  const data = await response.json() as any;
  const base64 = data.predictions?.[0]?.bytesBase64Encoded;
  
  if (!base64) {
    console.error(`No image returned for ${vibe.timeOfDay}`);
    return;
  }

  const outDir = path.join(__dirname, '../public/assets/vibes', EDITION_SLUG);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const filename = `${vibe.timeOfDay}_${vibe.season}.jpg`;
  const buf = Buffer.from(base64, 'base64');
  fs.writeFileSync(path.join(outDir, filename), buf);
  
  console.log(`✅ Saved ${filename} (${buf.length} bytes)`);
}

async function run() {
  console.log(`=== Generating Vibe Matrix for Edition: ${EDITION_SLUG} ===`);
  for (const vibe of VIBE_MATRIX) {
    await generateBackground(vibe);
    // basic wait to avoid rate limits
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('=== Vibe generation complete! ===');
}

run();
