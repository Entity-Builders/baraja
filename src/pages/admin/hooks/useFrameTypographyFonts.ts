import { useEffect } from 'react';
import { loadGoogleFonts } from '../../../lib/cardFrame';
import type { TypographySuggestion } from '../frameGeneratorTypes';
import { isTypoZone } from '../frameGeneratorTypes';

export function useFrameTypographyFonts(typography: TypographySuggestion | null | undefined) {
  useEffect(() => {
    if (!typography) return;

    const families: string[] = [];
    Object.keys(typography).forEach((key) => {
      if (['brand', 'qrFgColor', 'ttfUrls', 'focalPoints'].includes(key)) {
        if (key === 'brand' && typography.brand?.fontFamily) {
          families.push(typography.brand.fontFamily);
        }
        return;
      }

      const zone = typography[key];
      if (isTypoZone(zone) && zone.fontFamily) {
        families.push(zone.fontFamily);
      }
    });

    if (families.length) {
      loadGoogleFonts(families);
    }
  }, [typography]);
}
