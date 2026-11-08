import { cloud } from './backend';
import { getLocalAiKey } from './config';
import { blobToBase64, resizeImage } from './media';
import { AI_MODEL, buildTask, type AiTask } from '../../supabase/functions/_shared/prompts';
import { fetchCnbRates, type CnbRates } from '../../supabase/functions/_shared/cnb';
import type { AiListing, AiRecognition, CompanySettings, Machine } from './types';

export interface AiImage {
  media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  data: string; // base64
}

export async function prepareImages(files: Blob[], max = 5): Promise<AiImage[]> {
  const out: AiImage[] = [];
  for (const f of files.slice(0, max)) {
    const small = await resizeImage(f, 1568, 0.85);
    const t = small.type as AiImage['media_type'];
    out.push({ media_type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(t) ? t : 'image/jpeg', data: await blobToBase64(small) });
  }
  return out;
}

export function aiAvailable(): { ok: boolean; reason?: string } {
  if (cloud) return { ok: true };
  if (getLocalAiKey()) return { ok: true };
  return { ok: false, reason: 'Pro AI v lokálním režimu zadejte API klíč v Nastavení, nebo připojte cloud.' };
}

/** Zavolá Claude – v cloudu přes serverovou funkci (klíč na serveru), lokálně přímo. */
async function runTask<T>(task: AiTask): Promise<T> {
  if (cloud) {
    const { data, error } = await cloud.client.functions.invoke('ai', { body: task });
    if (error) throw new Error(`AI služba: ${error.message}`);
    if (data?.error) throw new Error(data.error);
    return data as T;
  }
  const apiKey = getLocalAiKey();
  if (!apiKey) throw new Error(aiAvailable().reason);
  const { prompt, schema, images } = buildTask(task);
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((img) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: img.media_type as AiImage['media_type'], data: img.data },
          })),
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new Error('AI požadavek odmítla.');
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('AI nevrátila odpověď.');
  return JSON.parse(text.text) as T;
}

/** Rozpozná stroj z 1–5 fotografií. */
export async function recognizeMachine(files: Blob[], categories: string[]): Promise<AiRecognition> {
  if (!files.length) throw new Error('Vyberte alespoň jednu fotografii.');
  const images = await prepareImages(files);
  const r = await runTask<AiRecognition>({ task: 'recognize', images, categories });
  return { ...r, recognized_at: new Date().toISOString() };
}

/** Napíše prodejní inzerát (CZ/EN/DE) z údajů o stroji a až 3 fotek. */
export async function generateListing(m: Machine, photos: Blob[], s: CompanySettings): Promise<AiListing> {
  const images = await prepareImages(photos, 3);
  const machine = {
    nazev: m.name,
    kategorie: m.category,
    znacka: m.brand,
    typ: m.model,
    rok_vyroby: m.year,
    motohodiny: m.hours,
    hmotnost_kg: m.weight_kg,
    vykon_kw: m.power_kw,
    stav: m.condition,
    umisteni: m.location,
    popis_a_vybava: m.description,
    prepravni_rozmery_m: [m.transport_length_m, m.transport_width_m, m.transport_height_m],
  };
  const company = [s.company_name, s.phone, s.email, s.web].filter(Boolean).join(', ');
  const r = await runTask<AiListing>({ task: 'listing', images, machine, company });
  return { ...r, generated_at: new Date().toISOString() };
}

/** Aktuální kurzy ČNB. */
export async function loadCnbRates(): Promise<CnbRates> {
  if (cloud) {
    const { data, error } = await cloud.client.functions.invoke('cnb-rates', { body: {} });
    if (error) throw new Error(`Kurzy ČNB: ${error.message}`);
    if (data?.error) throw new Error(data.error);
    return data as CnbRates;
  }
  try {
    return await fetchCnbRates();
  } catch {
    throw new Error('Kurzy ČNB se nepodařilo načíst přímo z prohlížeče. V cloudu je načte server; jinak je zadejte ručně.');
  }
}
