// Define available fonts for pdfme text rendering

export type FontFamilyName = 'Inter' | 'Outfit' | 'Cormorant Garamond';

export interface FontNode {
  src: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
}

export const FONT_REGISTRY: Record<FontFamilyName, FontNode[]> = {
  'Inter': [
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf', fontWeight: 400 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-500-normal.ttf', fontWeight: 500 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.ttf', fontWeight: 600 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf', fontWeight: 700 },
  ],
  'Outfit': [
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/outfit@latest/latin-400-normal.ttf', fontWeight: 400 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/outfit@latest/latin-500-normal.ttf', fontWeight: 500 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/outfit@latest/latin-600-normal.ttf', fontWeight: 600 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/outfit@latest/latin-700-normal.ttf', fontWeight: 700 },
  ],
  'Cormorant Garamond': [
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-400-normal.ttf', fontWeight: 400 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-500-normal.ttf', fontWeight: 500 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-600-normal.ttf', fontWeight: 600 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-700-normal.ttf', fontWeight: 700 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-400-italic.ttf', fontStyle: 'italic', fontWeight: 400 },
  ],
};

