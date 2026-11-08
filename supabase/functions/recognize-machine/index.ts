// Supabase Edge Function: rozpoznání stavebního stroje z fotografií pomocí Claude (vision).
// API klíč je uložen jako secret na serveru – do mobilů ani PC se nedostane.
//
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy recognize-machine
//
// Funkci smí volat jen přihlášení uživatelé (výchozí ověření JWT je zapnuté).

import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0';

const MODEL = 'claude-opus-5-5';

const PROMPT = `Jsi expert na stavební a zemní stroje (rypadla, nakladače, dozery, válce, manipulátory, jeřáby, plošiny, dumpery, přídavná zařízení…) a jejich výrobce (Caterpillar, Komatsu, Volvo CE, JCB, Liebherr, Hitachi, Doosan/Develon, Hyundai, Kubota, Takeuchi, Yanmar, Bobcat, Case, New Holland, Wacker Neuson, Kramer, Manitou, Merlo, Bomag, Hamm, Dynapac, Ammann, Atlas, Mecalac, Sany, XCMG, Zoomlion, JLG, Genie, Haulotte a další).

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

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'brand', 'model', 'year_from', 'year_to', 'weight_kg', 'power_kw', 'serial_number', 'confidence', 'visible_condition', 'notes'],
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
};

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type ImageType = (typeof ALLOWED)[number];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const client = new Anthropic(); // čte ANTHROPIC_API_KEY ze secrets

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { images, categories } = (await req.json()) as {
      images: { media_type: string; data: string }[];
      categories?: string[];
    };
    if (!Array.isArray(images) || images.length === 0) return json({ error: 'Chybí fotografie.' }, 400);

    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            ...images.slice(0, 5).map((img) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: (ALLOWED.includes(img.media_type as ImageType) ? img.media_type : 'image/jpeg') as ImageType,
                data: img.data,
              },
            })),
            { type: 'text' as const, text: PROMPT.replace('{CATEGORIES}', (categories ?? []).join(', ')) },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') return json({ error: 'AI požadavek odmítla.' }, 422);
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return json({ error: 'AI nevrátila odpověď.' }, 502);
    return json(JSON.parse(text.text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'AI je přetížená, zkuste to za chvíli.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Neplatný ANTHROPIC_API_KEY na serveru.' }, 500);
    if (e instanceof Anthropic.APIError) return json({ error: `AI chyba: ${e.message}` }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
