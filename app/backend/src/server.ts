import express from 'express';
import OpenAI from 'openai';
import cors from 'cors';
import multer from 'multer';
import pinoHttp from 'pino-http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { z } from 'zod';
import { createLogger } from './utils/logger.js';
import { parseHtmlVisibleText } from './services/parsing/html.js';
import { ruleBasedExtract, ruleBasedExtractFromSources, type AnalyzeSource } from './services/extractor/ruleBased.js';
import { llmExtractFromSources } from './services/extractor/llm.js';
import { parseSrt } from './services/extractor/srt.js';

const PORT = Number(process.env.PORT || 8080);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

const app = express();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });
const logger = createLogger();

app.use(
  pinoHttp({
    // Use pino-http's own logger instance to avoid TS type mismatches across pino versions
    serializers: {
      req(req) {
        return { id: (req as any).id, method: req.method, url: req.url };
      },
    },
  })
);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const isProd = process.env.NODE_ENV === 'production';
      if (!isProd) {
        // Allow any localhost/127.0.0.1 origin in development (any port)
        try {
          const u = new URL(origin);
          if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
            return cb(null, true);
          }
        } catch {}
      }
      if (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error('CORS not allowed'));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-OpenAI-Key'],
  })
);
app.use(express.json({ limit: '6mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Diagnostic: verify OpenAI SDK works and key is valid
app.get('/api/openai/check', async (req, res) => {
  try {
    const headerKey = req.header('x-openai-key');
    const key = headerKey || process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY not set' });
    const client = new OpenAI({ apiKey: key });
    const models = await client.models.list();
    res.json({ ok: true, total: models.data?.length ?? 0 });
  } catch (err: any) {
    res.status(err?.status ?? 500).json({
      ok: false,
      type: err?.name || err?.type,
      code: err?.code,
      message: err?.message,
      status: err?.status,
      requestID: err?.requestID,
    });
  }
});

const AnalyzeBodySchema = z
  .union([
    z.object({ text: z.string().min(1), config: z.any().optional(), useLLM: z.boolean().optional() }),
    z.object({ url: z.string().url(), config: z.any().optional(), useLLM: z.boolean().optional() })
  ]);

app.post('/api/analyze', upload.array('files'), async (req, res) => {
  try {
    let text = '';
    const sources: AnalyzeSource[] = [];
    let useLLM = false;

    // multipart
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const f of req.files as Express.Multer.File[]) {
        const name = f.originalname;
        const lower = name.toLowerCase();
        if (!lower.endsWith('.txt') && !lower.endsWith('.srt')) {
          return res.status(400).json({ code: 'UNSUPPORTED_FILE', message: 'Only .txt and .srt allowed' });
        }
        const content = f.buffer.toString('utf8');
        if (lower.endsWith('.srt')) {
          const cues = parseSrt(content);
          sources.push({ kind: 'srt', filename: name, cues });
        } else {
          sources.push({ kind: 'plain', filename: name, text: content });
        }
      }
      // note: multer parses fields into req.body as strings
      if (typeof (req.body as any)?.useLLM === 'string') {
        useLLM = ((req.body as any).useLLM).toLowerCase() === 'true';
      }
    } else if (req.is('application/json')) {
      const parsed = AnalyzeBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ code: "BAD_REQUEST", message: 'Invalid body' });
      }
      if ('text' in parsed.data) {
        text = parsed.data.text;
      } else if ('url' in parsed.data) {
        // server-side fetch and extract visible text
        const result = await parseHtmlVisibleText(parsed.data.url);
        text = result.text;
      }
      useLLM = Boolean((parsed.data as any).useLLM);
    } else {
      return res.status(400).json({ code: 'EMPTY', message: 'No input provided' });
    }

    // Build final sources set
    const finalSources: AnalyzeSource[] = sources.length > 0
      ? sources
      : (text.trim() ? [{ kind: 'plain', text }] : []);
    if (finalSources.length === 0) {
      return res.status(400).json({ code: 'EMPTY_TEXT', message: 'No text content found' });
    }

    let hits;
    if (useLLM) {
      const userApiKey = req.header('x-openai-key') || undefined;
      hits = await llmExtractFromSources(finalSources, {}, userApiKey);
    } else {
      hits = await ruleBasedExtractFromSources(finalSources, {});
    }
    res.json(hits);
  } catch (err: any) {
    req.log.error({ err }, 'analyze failed');
    if (err.code === 'ECONNABORTED') return res.status(504).json({ code: 'TIMEOUT', message: 'Fetch timed out' });
    if (err.message === 'OPENAI_API_KEY not set') {
      return res.status(400).json({ 
        code: 'OPENAI_KEY_MISSING', 
        message: 'OpenAI API key is required when using LLM mode. Please provide your API key in the header field or disable LLM mode.'
      });
    }
    res.status(500).json({ code: 'INTERNAL', message: 'Unexpected error' });
  }
});

app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ code: 'INTERNAL', message: 'Unexpected error' });
});

// In production, serve the built frontend after API routes, and exclude /api/* from SPA catch-all
if (process.env.NODE_ENV === 'production') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirnameEmu = path.dirname(__filename);
  const candidateFromFile = path.resolve(__dirnameEmu, '../..', 'frontend', 'dist');
  const candidateFromCwd = path.resolve(process.cwd(), 'app', 'frontend', 'dist');
  const frontendDist = fs.existsSync(candidateFromFile) ? candidateFromFile : candidateFromCwd;
  app.use(express.static(frontendDist));
  // Exclude API routes from SPA fallback
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'backend listening');
});
