import { cloud } from './backend';
import { getLocalAiKey } from './config';
import { blobToBase64, resizeImage } from './media';
import type { AiRecognition } from './types';

// POZOR: stejný prompt a schéma jsou i v supabase/functions/recognize-machine/index.ts
export const AI_MODEL = 'claude-opus-5-5';

export const RECOGNITION_PROMPT = `Jsi expert na stavební a zemní stroje (rypadla, nakladače, dozery, válce, manipulátory, jeřáby, plošiny, dumpery, přídavná zařízení…) a jejich výrobce (Caterpillar, Komatsu, Volvo CE, JCB, Liebherr, Hitachi, Doosan/Develon, Hyundai, Kubota, Takeuchi, Yanmar, Bobcat, Case, New Holland, Wacker Neuson, Kramer, Manitou, Merlo, Bomag, Hamm, Dynapac, Ammann, Atlas, Mecalac, Sany, XCMG, Zoomlion, JLG, Genie, Haulotte a další).

Na základě přiložených fotografií urči o jaký stroj se jedná. Využij logo, nápisy, typové štítky, barvy, tvar kabiny, ramene, podvozku a dalších prvků.
- category: jedna z kategorií: {CATEGORIES}
- brand: výrobce
- model: přesné typové označení, pokud je čitelné nebo jednoznačně odvoditelné (např. "320 GC", "PC210LC-11", "3CX"), jinak nejpravděpodobnější řada
- year_from / year_to: odhad rozmezí roku výroby podle generace modelu (null pokud nelze)
- weight_kg: provozní hmotnost typická pro tento model (null pokud nevíš)
- power_kw: výkon motoru typický pro tento model (null pokud nevíš)
- serial_number: výrobní číslo / VIN pouze pokud je čitelné na fotce, jinak null
- confidence: vysoka / stredni / nizka – jak jistá je identifikace značky a modelu
- visible_condition: krátký popis viditelného stavu (opotřebení, poškození, rez, stav pásů/pneu, lžíce…)
- notes: další užitečné postřehy pro prodej či servis (výbava, přídavná zařízení, rychloupínák, klimatizace…)
Odpovídej česky. Nevymýšlej si údaje, které z fotek nelze rozumně odvodit.`;

export const RECOGNITION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'category',
    'brand',
    'model',
    'year_from',
    'year_to',
    'weight_kg',
    'power_kw',
    'serial_number',
    'confidence',
    'visible_condition',
    'notes',
  ],
  properties: {
    category: { type: 'string' },
    brand: { type: 'string' },
    model: { type: 'string' },
    year_from: { type: ['integer', 'null'] },
    year_to: { type: ['integer', 'null'] },
    weight_kg: { type: ['number', 'null'] },
    power_kw: { type: ['number', 'null'] },
    serial_number: { type: ['string', 'null'] },
    confidence: { type: 'string', enum: ['vysoka', 'stredni', 'nizka'] },
    visible_condition: { type: 'string' },
    notes: { type: 'string' },
  },
} as const;

export interface AiImage {
  media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  data: string; // base64
}

export async function prepareImages(files: Blob[]): Promise<AiImage[]> {
  const out: AiImage[] = [];
  for (const f of files.slice(0, 5)) {
    const small = await resizeImage(f, 1568, 0.85);
    const t = small.type as AiImage['media_type'];
    out.push({ media_type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(t) ? t : 'image/jpeg', data: await blobToBase64(small) });
  }
  return out;
}

export function aiAvailable(): { ok: boolean; reason?: string } {
  if (cloud) return { ok: true };
  if (getLocalAiKey()) return { ok: true };
  return { ok: false, reason: 'Pro AI rozpoznávání v lokálním režimu zadejte API klíč v Nastavení, nebo připojte cloud.' };
}

/** Rozpozná stroj z 1–5 fotografií. */
export async function recognizeMachine(files: Blob[], categories: string[]): Promise<AiRecognition> {
  if (!files.length) throw new Error('Vyberte alespoň jednu fotografii.');
  const images = await prepareImages(files);

  let result: AiRecognition;
  if (cloud) {
    const { data, error } = await cloud.client.functions.invoke('recognize-machine', { body: { images, categories } });
    if (error) throw new Error(`AI služba: ${error.message}`);
    if (data?.error) throw new Error(data.error);
    result = data as AiRecognition;
  } else {
    const apiKey = getLocalAiKey();
    if (!apiKey) throw new Error(aiAvailable().reason);
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: RECOGNITION_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((img) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: img.media_type, data: img.data },
            })),
            { type: 'text', text: RECOGNITION_PROMPT.replace('{CATEGORIES}', categories.join(', ')) },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal') throw new Error('AI požadavek odmítla.');
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') throw new Error('AI nevrátila odpověď.');
    result = JSON.parse(text.text) as AiRecognition;
  }
  return { ...result, recognized_at: new Date().toISOString() };
}
