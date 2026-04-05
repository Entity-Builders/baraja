import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' }); // Adjust if needed

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  try {
    const response = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: 'A tiny cute puppy reading a book',
        config: {
            numberOfImages: 1,
            aspectRatio: '16:9',
            outputMimeType: 'image/jpeg',
        }
    });

    const base64 = response.generatedImages[0].image.imageBytes;
    console.log("Success! Image generated with length:", base64.length);
  } catch (err) {
    console.error("API Error:", err);
  }
}

run();
