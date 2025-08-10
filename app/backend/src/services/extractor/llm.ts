import OpenAI from 'openai';
import { z } from 'zod';
import type { AnalyzeSource, BrandHit } from './ruleBased.js';

const BrandHitOutSchema = z.object({
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

export type LlmConfig = {
  detection_mode?: 'strict'|'normal'|'lenient';
  min_certainty?: number;
  max_results?: number;
  context_window?: { prev: number; next: number; max_chars: number };
};

const DEFAULT_CONFIG: LlmConfig = {
  detection_mode: 'strict',
  min_certainty: 0.8,
  max_results: 5000,
  context_window: { prev: 1, next: 1, max_chars: 400 },
};

function sanitizeLlmItem(item: any): any {
  const num = (v: any): number | undefined => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = typeof v === 'string' ? Number(v) : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const str = (v: any): string | undefined => {
    if (v === null || v === undefined) return undefined;
    return String(v);
  };
  const out: any = {
    brand: String(item?.brand ?? ''),
    certainty: num(item?.certainty) ?? 0,
    input: String(item?.input ?? ''),
    context: String(item?.context ?? ''),
  };
  const alias = str(item?.alias_used); if (alias !== undefined) out.alias_used = alias;
  const tsStart = str(item?.timestamp_start); if (tsStart !== undefined) out.timestamp_start = tsStart;
  const tsEnd = str(item?.timestamp_end); if (tsEnd !== undefined) out.timestamp_end = tsEnd;
  const src = str(item?.source_id); if (src !== undefined) out.source_id = src;
  const sc = num(item?.start_char); if (sc !== undefined) out.start_char = sc;
  const ec = num(item?.end_char); if (ec !== undefined) out.end_char = ec;
  return out;
}

function sourcesToInputBlock(sources: AnalyzeSource[]): string {
  const parts: string[] = [];
  for (const src of sources) {
    if (src.kind === 'plain') {
      parts.push(src.text);
    } else {
      for (const cue of src.cues) {
        const id = `${src.filename}:${cue.index}`;
        const header = [cue.start, cue.end].filter(Boolean).join(' --> ');
        parts.push(`[${id}] ${header}\n${cue.text}`);
      }
    }
  }
  return parts.join('\n\n');
}

function buildPrompt(config: LlmConfig, sources: AnalyzeSource[]) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const CONFIG_BLOCK = JSON.stringify({
    detection_mode: cfg.detection_mode,
    min_certainty: cfg.min_certainty,
    max_results: cfg.max_results,
    case_sensitivity: 'smart',
    accept_lowercase_brand_tokens: false,
    context_mode: 'adjacent_cues',
    context_window: cfg.context_window,
    deduplication: { per_cue: true, merge_same_brand_same_cue: true, preserve_multiple_spans: false },
    output_fields: [
      'brand','certainty','input','context','alias_used','timestamp_start','timestamp_end','source_id','start_char','end_char'
    ],
    include_fictional_if_real_brand_exists: false,
    language: 'auto',
    return_empty_array_when_none: true,
    canonicalization: { prefer_parent_for_product_lines: true, examples: {} },
    alias_map_override: { add: {}, remove: [] },
    brand_whitelist: [],
    brand_blacklist: [],
    ambiguity_rules: {
      ambiguous_terms: ['apple','windows','office','prime','max'],
      boost_cues: ['operating system','OS','streaming','app','login','App Store','subscription','brand','poster','advert','commercial','series','movie','newspaper','magazine'],
      lower_cues: ['idiom','metaphor'],
      case_prefers_brand: true
    }
  }, null, 2);

  const INSTRUCTIONS = `You are a brand-entity extractor.\n\nGoal\nFrom the provided INPUT (plain text or SRT), extract every occurrence of a real-world brand/company/product line/streaming service.\n\nOutput\nReturn a strict JSON array of objects. Include only the fields listed in output_fields from CONFIG, in that exact field order if possible. If none found and return_empty_array_when_none is true, return [].\n\nDetection\n- Accept proper nouns and brand-verbs (e.g., “Googled”, “Zillowed”).\n- Accept proprietary product/feature names (e.g., “Zestimate”, “PageRank”) and map to parent brand.\n- Include media outlets and entertainment titles as brands.\n- Support co-branding: if a parent and child brand appear, return both.\n\nScoring\n- Assign certainty in [0,1] and enforce min_certainty and detection_mode.\n\nCanonicalization\n- Normalize aliases using canonicalization.examples and alias_map_override.add when present.\n- Exclude any alias listed in alias_map_override.remove.\n- If prefer_parent_for_product_lines is true, map well-known product lines to the parent brand.\n\nInput Handling\n- SRT: ignore index/timestamp markup; use each cue as a unit; include timestamps and source_id where available.\n- Plain text: treat sentences as units; context may include neighboring sentences.\n\nAmbiguity\n- Use ambiguity_rules. Boost certainty with boost_cues, reduce for idioms/metaphors.\n- case_sensitivity=smart means prefer proper-noun casing but allow lowercase with strong cues.\n\nContext\n- For context_mode=adjacent_cues, compose context from previous, current, next within limits, capped by max_chars.\n\nDeduplication\n- Apply deduplication settings.\n\nValidation\n- Enforce max_results. Produce valid JSON.`;

  const INPUT_BLOCK = sourcesToInputBlock(sources);

  const prompt = `## CONFIG\n\n${CONFIG_BLOCK}\n\n## INSTRUCTIONS\n\n${INSTRUCTIONS}\n\n## INPUT\n\n\n${'```'}\n${INPUT_BLOCK}\n${'```'}`;
  return prompt;
}

function extractJsonArray(text: string): any[] {
  // find first [ and matching closing ]
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  const slice = text.slice(start, end + 1);
  try { return JSON.parse(slice); } catch { return []; }
}

export async function llmExtractFromSources(
  sources: AnalyzeSource[],
  config: LlmConfig = {},
  apiKeyOverride?: string
): Promise<BrandHit[]> {
  const apiKey = apiKeyOverride || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }
  const client = new OpenAI({ apiKey });
  
  const prompt = buildPrompt(config, sources);

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [      
      { role: 'system', content: 'You extract brand entities and return strict JSON arrays only.' },
      { role: 'user', content: prompt }
    ]
  });

  const content = completion.choices[0]?.message?.content || '';
  const arr = extractJsonArray(content);
  const out: BrandHit[] = [];
  for (const item of arr) {
    const cleaned = sanitizeLlmItem(item);
    const parsed = BrandHitOutSchema.safeParse(cleaned);
    if (parsed.success) {
      out.push(parsed.data as BrandHit);
    } else {
      // minimal debug: keep silent in production, but helpful during dev
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('LLM item failed schema validation', { item, issues: parsed.error?.issues });
      }
    }
  }
  return out;
}
