// Načtení denních kurzů ČNB (CZK za 1 jednotku měny). Sdílí aplikace i serverová funkce.

export const CNB_JSON_URL = 'https://api.cnb.cz/cnbapi/exrates/daily?lang=EN';
export const CNB_TXT_URL =
  'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt';

export interface CnbRates {
  date: string;
  rates: Record<string, number>;
}

/** Zpracuje JSON z api.cnb.cz: { rates: [{ validFor, currencyCode, amount, rate }] } */
export function parseCnbJson(data: unknown): CnbRates {
  const list = (data as { rates?: { validFor?: string; currencyCode: string; amount: number; rate: number }[] }).rates ?? [];
  const rates: Record<string, number> = { CZK: 1 };
  for (const r of list) if (r.currencyCode && r.amount) rates[r.currencyCode] = r.rate / r.amount;
  if (Object.keys(rates).length < 2) throw new Error('ČNB vrátila neočekávaná data.');
  return { date: list[0]?.validFor ?? '', rates };
}

/** Zpracuje textový formát: „06.11.2026 #217“ a řádky „země|měna|množství|kód|kurz“. */
export function parseCnbTxt(txt: string): CnbRates {
  const lines = txt.trim().split(/\r?\n/);
  const m = lines[0]?.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  const rates: Record<string, number> = { CZK: 1 };
  for (const line of lines.slice(2)) {
    const [, , amount, code, rate] = line.split('|');
    const a = Number(amount);
    const r = Number(String(rate).replace(',', '.'));
    if (code && a && r) rates[code] = r / a;
  }
  if (Object.keys(rates).length < 2) throw new Error('ČNB vrátila neočekávaná data.');
  return { date: m ? `${m[3]}-${m[2]}-${m[1]}` : '', rates };
}

export async function fetchCnbRates(fetcher: typeof fetch = fetch): Promise<CnbRates> {
  try {
    const r = await fetcher(CNB_JSON_URL);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return parseCnbJson(await r.json());
  } catch {
    const r = await fetcher(CNB_TXT_URL);
    if (!r.ok) throw new Error(`ČNB nedostupná (HTTP ${r.status})`);
    return parseCnbTxt(await r.text());
  }
}
