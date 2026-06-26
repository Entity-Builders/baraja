import type { Template } from '@pdfme/common';

export function getPdfmeTemplateSize(template: Template, fallbackWidth: number, fallbackHeight: number) {
  return typeof template.basePdf === 'object' && 'width' in template.basePdf
    ? { width: template.basePdf.width, height: template.basePdf.height }
    : { width: fallbackWidth, height: fallbackHeight };
}
