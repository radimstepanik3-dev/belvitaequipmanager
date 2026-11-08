// Zadání (prompty) a JSON schémata pro AI – sdílí je aplikace (src/lib/ai.ts)
// i serverová funkce (supabase/functions/ai). Bez importů, aby šly použít v obou prostředích.

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
- transport_length_m / transport_width_m / transport_height_m: typické přepravní rozměry tohoto modelu v metrech (u rypadel s rameny v přepravní poloze), null pokud nevíš
- confidence: vysoka / stredni / nizka – jak jistá je identifikace značky a modelu
- visible_condition: krátký popis viditelného stavu (opotřebení, poškození, rez, stav pásů/pneu, lžíce…)
- notes: další užitečné postřehy pro prodej či servis (výbava, přídavná zařízení, rychloupínák, klimatizace…)
Odpovídej česky. Nevymýšlej si údaje, které z fotek nelze rozumně odvodit.`;

const nullableNumber = { type: ['number', 'null'] };

export const RECOGNITION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'category', 'brand', 'model', 'year_from', 'year_to', 'weight_kg', 'power_kw', 'serial_number',
    'transport_length_m', 'transport_width_m', 'transport_height_m', 'confidence', 'visible_condition', 'notes',
  ],
  properties: {
    category: { type: 'string' },
    brand: { type: 'string' },
    model: { type: 'string' },
    year_from: { type: ['integer', 'null'] },
    year_to: { type: ['integer', 'null'] },
    weight_kg: nullableNumber,
    power_kw: nullableNumber,
    serial_number: { type: ['string', 'null'] },
    transport_length_m: nullableNumber,
    transport_width_m: nullableNumber,
    transport_height_m: nullableNumber,
    confidence: { type: 'string', enum: ['vysoka', 'stredni', 'nizka'] },
    visible_condition: { type: 'string' },
    notes: { type: 'string' },
  },
};

export const LISTING_PROMPT = `Jsi zkušený obchodník s použitými stavebními stroji. Napiš prodejní inzerát pro stroj z údajů níže (a z přiložených fotek, pokud jsou).

Údaje o stroji (JSON):
{MACHINE}

Prodávající firma: {COMPANY}

Požadavky:
- title: krátký výstižný titulek inzerátu (max. 70 znaků), např. "Pásové rypadlo Caterpillar 320 GC, 2019, 6 450 mth"
- text_cs: inzerát v češtině – úvodní věta, přehled hlavních parametrů v odrážkách, výbava, stav, závěrečná výzva ke kontaktu (prohlídka, možnost dopravy). 600–1200 znaků.
- text_en: stejný inzerát v angličtině pro zahraniční portály (Mascus, Machineryline)
- text_de: stejný inzerát v němčině
- highlights: 3–6 krátkých prodejních předností v češtině
Používej pouze údaje, které máš k dispozici (data a to, co je jasně vidět na fotkách). Nevymýšlej motohodiny, rok, výbavu ani stav, které nejsou uvedeny. Cenu do textu nepiš. Piš věcně a důvěryhodně, bez přehánění.`;

export const LISTING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'text_cs', 'text_en', 'text_de', 'highlights'],
  properties: {
    title: { type: 'string' },
    text_cs: { type: 'string' },
    text_en: { type: 'string' },
    text_de: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
  },
};

export interface AiImageInput {
  media_type: string;
  data: string; // base64
}

export type AiTask =
  | { task: 'recognize'; images: AiImageInput[]; categories: string[] }
  | { task: 'listing'; images: AiImageInput[]; machine: Record<string, unknown>; company: string };

/** Sestaví prompt a schéma pro danou úlohu. */
export function buildTask(t: AiTask): { prompt: string; schema: Record<string, unknown>; images: AiImageInput[] } {
  if (t.task === 'recognize') {
    return {
      prompt: RECOGNITION_PROMPT.replace('{CATEGORIES}', (t.categories ?? []).join(', ')),
      schema: RECOGNITION_SCHEMA,
      images: (t.images ?? []).slice(0, 5),
    };
  }
  return {
    prompt: LISTING_PROMPT.replace('{MACHINE}', JSON.stringify(t.machine, null, 2)).replace('{COMPANY}', t.company || ''),
    schema: LISTING_SCHEMA,
    images: (t.images ?? []).slice(0, 3),
  };
}
