// src/components/cards/fontCatalog.ts
// Curated Google Fonts the AI can pick from.
// Kept in a separate non-component file so Vite Fast Refresh works
// correctly on CardCanvas.tsx (which cannot mix component + plain exports).

export const GOOGLE_FONT_CATALOG: string[] = [
  // Serif — elegant, card-game vibe
  'Cormorant Garamond',
  'Playfair Display',
  'Lora',
  'DM Serif Display',
  'EB Garamond',
  'Libre Baskerville',
  'Spectral',
  'Fraunces',
  'Cinzel',
  // Sans-serif — clean labels
  'Inter',
  'DM Sans',
  'Outfit',
  'Plus Jakarta Sans',
  'Nunito',
  'Jost',
];
