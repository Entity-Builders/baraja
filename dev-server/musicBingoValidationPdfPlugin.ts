import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

const DEV_VALIDATION_PDF_PATH = '/__baraja__/music-bingo-validation-pdf';
const DEV_SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(DEV_SERVER_DIR, '../../..');
const PDF_GENERATOR_MODULE = path.resolve(
  REPO_ROOT,
  'eb-infra/supabase/functions/_shared/baraja-music-bingo-pdf.ts'
);

type MusicBingoValidationPdfModule = {
  createBarajaMusicBingoPdfBytes: (snapshot: unknown) => Promise<Uint8Array>;
  buildBarajaMusicBingoPreviewSnapshot: (snapshot: unknown) => unknown;
};

const readJsonBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (!rawBody.trim()) return null;
  return JSON.parse(rawBody) as unknown;
};

const getPackSnapshot = (body: unknown) => {
  if (body && typeof body === 'object' && 'packSnapshot' in body) {
    return (body as { packSnapshot?: unknown }).packSnapshot;
  }
  return body;
};

const slugify = (value: unknown) => {
  const text = typeof value === 'string' ? value : 'bingo-musical';
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'bingo-musical'
  );
};

const writeJson = (
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>
) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

export function musicBingoValidationPdfPlugin(): Plugin {
  return {
    name: 'baraja-music-bingo-validation-pdf',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const pathName = req.url?.split('?')[0];
        if (pathName !== DEV_VALIDATION_PDF_PATH) {
          next();
          return;
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'content-type, accept');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          writeJson(res, 405, { error: 'Metodo no permitido.' });
          return;
        }

        try {
          const body = await readJsonBody(req);
          const snapshot = getPackSnapshot(body);
          if (!snapshot || typeof snapshot !== 'object') {
            writeJson(res, 400, { error: 'Snapshot de bingo invalido.' });
            return;
          }

          const pdfModule = (await server.ssrLoadModule(
            PDF_GENERATOR_MODULE
          )) as MusicBingoValidationPdfModule;
          const previewSnapshot = pdfModule.buildBarajaMusicBingoPreviewSnapshot(snapshot);
          const bytes = await pdfModule.createBarajaMusicBingoPdfBytes(previewSnapshot);
          const title = (previewSnapshot as { title?: unknown }).title;
          const filename = `${slugify(title)}-prueba.pdf`;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
          );
          res.setHeader('Cache-Control', 'no-store');
          res.end(Buffer.from(bytes));
        } catch (error) {
          console.error('[baraja-music-bingo-validation-pdf]', error);
          writeJson(res, 500, {
            error: 'No pudimos generar el PDF local.',
          });
        }
      });
    },
  };
}
