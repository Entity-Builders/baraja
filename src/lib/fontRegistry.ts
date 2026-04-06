import { Font } from '@react-pdf/renderer';

export type FontFamilyName = 'Inter' | 'Cormorant Garamond';

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
  'Cormorant Garamond': [
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-400-normal.ttf', fontWeight: 400 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-500-normal.ttf', fontWeight: 500 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-600-normal.ttf', fontWeight: 600 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-700-normal.ttf', fontWeight: 700 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-400-italic.ttf', fontStyle: 'italic', fontWeight: 400 },
  ],
};

const registeredFonts = new Set<string>();

/**
 * Registers all fonts needed for the current design dynamically.
 * React-PDF ignores duplicate calls for the same family name.
 */
export const registerDynamicFonts = (fontFamilies: string[]) => {
  for (const family of fontFamilies) {
    if (registeredFonts.has(family)) continue; // Already registered in this session
    
    const nodes = FONT_REGISTRY[family as FontFamilyName];
    if (nodes) {
      Font.register({
        family,
        fonts: nodes,
      });
      registeredFonts.add(family);
    } else {
      console.warn(`Font family "${family}" defined in design template is not present in FONT_REGISTRY.`);
    }
  }
};
