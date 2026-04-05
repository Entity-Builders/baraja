import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' }); // Adjust if needed

const apiKey = process.env.GEMINI_API_KEY;

async function run() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-images:predict?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [
        { "prompt": "A small dog looking at a smartphone, cinematic lighting, dramatic." }
      ],
      parameters: {
        "sampleCount": 1,
        "aspectRatio": "16:9"
      }
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("API Error:", err);
    return;
  }

  const data = await response.json();
  const base64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!base64) {
    console.log("No base64 returned:", JSON.stringify(data, null, 2));
    return;
  }
  
  console.log("Success! Image generated with length:", base64.length);
}

run();
