import type { PdfTypographyHints } from '../../../../lib/pdfmeConfig';

export interface LibraryFrame {
  id?: string;
  url: string;
  prompt?: string;
  presetId?: string;
  face?: 'front' | 'back';
  widthMm?: number;
  heightMm?: number;
  timestamp?: number;
}

export interface FramesLibraryResponse {
  success: boolean;
  frames?: LibraryFrame[];
  error?: string;
}

export interface GenerateFrameResponse {
  success: boolean;
  dataUrl?: string;
  typography?: PdfTypographyHints | null;
  error?: string;
}

export interface AssetGenerationResponse {
  success: boolean;
  svg?: string;
  png?: string;
  error?: string;
}
