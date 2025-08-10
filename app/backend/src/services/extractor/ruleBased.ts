import { z } from 'zod';
import type { SrtCue } from './srt.js';

export const BrandHitSchema = z.object({
  brand: z.string(),
  certainty: z.number().min(0).max(1),
  input: z.string(),
  context: z.string(),
  alias_used: z.string().optional(),
  timestamp_start: z.string().optional(),
  timestamp_end: z.string().optional(),
  source_id: z.string().optional(),
  start_char: z.number().optional(),
  end_char: z.number().optional(),
});
export type BrandHit = z.infer<typeof BrandHitSchema>;

export type AnalyzeSource =
  | { kind: 'plain'; filename?: string; text: string }
  | { kind: 'srt'; filename: string; cues: SrtCue[] };

type AliasMap = Record<string, string>; // alias -> canonical brand

const DEFAULT_ALIAS_ADD: AliasMap = {
  // Sample of provided map (can be extended)
  'Zillow': 'Zillow', 'Zestimate': 'Zillow', 'Zillowed': 'Zillow',
  'The New York Times': 'The New York Times',
  'Never Have I Ever': 'Never Have I Ever',
  'WhatsApp': 'WhatsApp', 'Telegram': 'Telegram', 'YouTube': 'YouTube',
  'Instagram': 'Instagram', 'Facebook': 'Facebook', 'HBO': 'HBO', 'Max': 'HBO',
  'Paramount+': 'Paramount+', 'Prime Video': 'Prime Video', 'Netflix': 'Netflix',
  'Uber': 'Uber', 'Lyft': 'Lyft', 'Tesla': 'Tesla', 'BMW': 'BMW', 'Audi': 'Audi',
  'Mercedes': 'Mercedes', 'Toyota': 'Toyota', 'Ford': 'Ford', 'Chevrolet': 'Chevrolet',
  'Lexus': 'Lexus', 'Jaguar': 'Jaguar', 'Coca-Cola': 'Coca-Cola', 'Coke': 'Coca-Cola',
  'Pepsi': 'Pepsi', 'Red Bull': 'Red Bull', 'Burger King': 'Burger King',
  "McDonald's": "McDonald's", 'KFC': 'KFC', 'Subway': 'Subway',
  "Domino's": "Domino's", 'Pizza Hut': 'Pizza Hut', 'Starbucks': 'Starbucks',
  'Apple': 'Apple', 'Microsoft': 'Microsoft', 'Google': 'Google', 'Sony': 'Sony',
  'PlayStation': 'PlayStation', 'Xbox': 'Xbox', 'Disney+': 'Disney+',
  'Marvel': 'Marvel', 'PayPal': 'PayPal', 'Visa': 'Visa',
  'Mastercard': 'Mastercard', 'American Express': 'American Express', 'TikTok': 'TikTok',
  // Canonicalization examples
  'iPhone': 'Apple', 'iPad': 'Apple', 'MacBook': 'Apple', 'AirPods': 'Apple',
  'PS5': 'PlayStation', 'Disney Plus': 'Disney+', 'Amazon Prime Video': 'Prime Video',
  'X': 'Twitter', 'X (formerly Twitter)': 'Twitter', 'Googled': 'Google'
};

const AMBIGUOUS_REMOVE = new Set(['apple', 'windows', 'office', 'prime', 'max']);
const CONTEXT_BOOST_CUES = ['operating system','OS','streaming','app','login','App Store','subscription','series','movie','newspaper','magazine','brand','poster','advert','commercial'];

export type RuleConfig = {
  aliasMapAdd?: AliasMap;
  aliasRemoveLower?: string[]; // lowercased tokens to ignore
  contextWindow?: { prev: number; next: number; max_chars: number };
  dedupPerCue?: boolean;
  minCertainty?: number;
};

const DEFAULT_CFG: RuleConfig = {
  aliasMapAdd: DEFAULT_ALIAS_ADD,
  aliasRemoveLower: Array.from(AMBIGUOUS_REMOVE),
  contextWindow: { prev: 1, next: 1, max_chars: 400 },
  dedupPerCue: true,
  minCertainty: 0,
};

function buildRegexEntries(aliasMap: AliasMap) {
  const entries: { alias: string; brand: string; re: RegExp }[] = [];
  // Sort by length desc to prefer longer aliases
  const pairs = Object.entries(aliasMap).sort((a,b)=>b[0].length - a[0].length);
  for (const [alias, brand] of pairs) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Word boundaries around tokens; allow + in Paramount+
    const re = new RegExp(`(?<![\w+])(${escaped})(?![\w+])`, 'gi');
    entries.push({ alias, brand, re });
  }
  return entries;
}

function scoreHit(surface: string, context: string): number {
  // Base score
  let s = 0.7;
  // Case preference: if surface is capitalized or exact case match, boost
  if (/^[A-Z]/.test(surface)) s += 0.1;
  // Context cues
  const lower = context.toLowerCase();
  for (const cue of CONTEXT_BOOST_CUES) {
    if (lower.includes(cue.toLowerCase())) { s += 0.05; break; }
  }
  return Math.max(0, Math.min(1, s));
}

function buildContext(chunks: string[], idx: number, cfg: RuleConfig): { input: string; context: string } {
  const prev = Math.max(0, idx - (cfg.contextWindow?.prev ?? 1));
  const next = Math.min(chunks.length - 1, idx + (cfg.contextWindow?.next ?? 1));
  const window = chunks.slice(prev, next + 1).join(' ');
  const context = window.slice(0, cfg.contextWindow?.max_chars ?? 400);
  return { input: chunks[idx], context };
}

export async function ruleBasedExtract(text: string, cfg: RuleConfig = {}): Promise<BrandHit[]> {
  const sources: AnalyzeSource[] = [{ kind: 'plain', text }];
  return ruleBasedExtractFromSources(sources, cfg);
}

export async function ruleBasedExtractFromSources(sources: AnalyzeSource[], cfg: RuleConfig = {}): Promise<BrandHit[]> {
  const conf = { ...DEFAULT_CFG, ...cfg };
  // Build alias map (case-insensitive matching, but preserve original alias for alias_used)
  const aliasMap: AliasMap = { ...DEFAULT_ALIAS_ADD, ...(conf.aliasMapAdd || {}) };
  const regexEntries = buildRegexEntries(aliasMap);
  const remove = new Set((conf.aliasRemoveLower || []).map(s=>s.toLowerCase()));

  const hits: BrandHit[] = [];

  for (const src of sources) {
    if (src.kind === 'plain') {
      const text = src.text || '';
      const sentences = splitIntoSentences(text);
      sentences.forEach((sent, idx) => {
        const { input, context } = buildContext(sentences, idx, conf);
        const perBrand = new Set<string>();
        for (const e of regexEntries) {
          let m: RegExpExecArray | null;
          e.re.lastIndex = 0;
          while ((m = e.re.exec(sent)) !== null) {
            const surface = m[1];
            if (remove.has(surface.toLowerCase())) continue; // ambiguity suppression
            const brand = e.brand;
            if (conf.dedupPerCue && perBrand.has(brand)) continue;
            const certainty = scoreHit(surface, context);
            if (certainty < (conf.minCertainty ?? 0)) continue;
            hits.push({
              brand,
              certainty,
              input: input.trim(),
              context: context.trim(),
              alias_used: surface,
            });
            perBrand.add(brand);
          }
        }
      });
    } else if (src.kind === 'srt') {
      const cues = src.cues;
      const texts = cues.map(c => c.text);
      cues.forEach((cue, idx) => {
        const { input, context } = buildContext(texts, idx, conf);
        const perBrand = new Set<string>();
        for (const e of regexEntries) {
          let m: RegExpExecArray | null;
          e.re.lastIndex = 0;
          while ((m = e.re.exec(cue.text)) !== null) {
            const surface = m[1];
            if (remove.has(surface.toLowerCase())) continue;
            const brand = e.brand;
            if (conf.dedupPerCue && perBrand.has(brand)) continue;
            const certainty = scoreHit(surface, context);
            if (certainty < (conf.minCertainty ?? 0)) continue;
            hits.push({
              brand,
              certainty,
              input: input.trim(),
              context: context.trim(),
              alias_used: surface,
              timestamp_start: cue.start,
              timestamp_end: cue.end,
              source_id: `${src.filename}:${cue.index}`,
            });
            perBrand.add(brand);
          }
        }
      });
    }
  }

  return hits;
}

function splitIntoSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const parts = cleaned.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  return parts.length ? parts : [cleaned];
}
