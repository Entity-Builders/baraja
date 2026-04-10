import fs from 'fs';
import path from 'path';

// Let's read the api key from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const apiKeyMatch = envFile.match(/VITE_GEMINI_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : '';

if (!apiKey) {
    console.error("No API key");
    process.exit(1);
}

// We will test if Imagen accepts an image input in instances
async function testImageEdit() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`;
  
  // Create a minimal 1x1 png base64
  const dummyB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  
  const body = {
    instances: [
      {
        prompt: "Make it red",
        image: {
            bytesBase64Encoded: dummyB64
        }
      }
    ],
    parameters: { sampleCount: 1 }
  };

  const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
  });

  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text.substring(0, 300));
}

testImageEdit().catch(console.error);
