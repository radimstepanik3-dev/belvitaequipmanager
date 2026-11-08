// Obchod: prodej strojů, zájemci, nákup a dovoz do ČR.
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { CompanySettings, LeadStatus, Machine, Purchase, PurchaseSource, PurchaseStatus, VatRegime } from './types';

// ---------- prodej ----------

export const LEAD_STATUS: Record<LeadStatus, { label: string; color: string; open: boolean }> = {
  novy: { label: 'Nový', color: 'bg-sky-100 text-sky-800', open: true },
  kontaktovan: { label: 'Kontaktován', color: 'bg-indigo-100 text-indigo-800', open: true },
  prohlidka: { label: 'Prohlídka', color: 'bg-violet-100 text-violet-800', open: true },
  nabidka: { label: 'Nabídka odeslána', color: 'bg-amber-100 text-amber-800', open: true },
  vyjednavani: { label: 'Vyjednávání', color: 'bg-orange-100 text-orange-800', open: true },
  vyhrano: { label: 'Koupil', color: 'bg-emerald-100 text-emerald-800', open: false },
  ztraceno: { label: 'Nekoupil', color: 'bg-slate-200 text-slate-600', open: false },
};
export const LEAD_FLOW: LeadStatus[] = ['novy', 'kontaktovan', 'prohlidka', 'nabidka', 'vyjednavani'];

export const LEAD_SOURCES = [
  'Telefon',
  'E-mail',
  'Vlastní web',
  'Mascus',
  'Machineryline',
  'TruckScout24',
  'Bazoš',
  'Facebook',
  'Doporučení',
  'Stávající zákazník',
  'Veletrh / osobně',
  'Jiné',
];

/** Prodejní cena navržená z pořizovacích nákladů a cílové marže (zaokrouhleno na tisíce). */
export function suggestSalePrice(landed: number, s: CompanySettings): number {
  return Math.ceil((landed * (1 + s.target_margin_pct / 100)) / 1000) * 1000;
}

export function margin(price: number | null | undefined, cost: number) {
  if (!price || !cost) return null;
  const abs = price - cost;
  return { abs, pct: (abs / cost) * 100 };
}

/** Kolik dní je stroj ve firmě (od nákupu / založení do prodeje nebo dneška). */
export function stockDays(m: Machine, p?: Purchase): number {
  const from = p?.purchase_date ?? m.created_at.slice(0, 10);
  const to = m.sold_at ?? new Date().toISOString().slice(0, 10);
  return Math.max(0, differenceInCalendarDays(parseISO(to), parseISO(from)));
}

// ---------- nákup ----------

export const PURCHASE_STATUS: Record<PurchaseStatus, { label: string; color: string }> = {
  vyhlednuto: { label: 'Vyhlédnuto', color: 'bg-slate-100 text-slate-700' },
  proverovani: { label: 'Prověřování', color: 'bg-sky-100 text-sky-800' },
  vyjednavani: { label: 'Vyjednávání', color: 'bg-indigo-100 text-indigo-800' },
  koupeno: { label: 'Koupeno – čeká na odvoz', color: 'bg-amber-100 text-amber-800' },
  preprava: { label: 'Na cestě do ČR', color: 'bg-teal-100 text-teal-800' },
  dorazilo: { label: 'Dorazilo', color: 'bg-emerald-100 text-emerald-800' },
  nekoupeno: { label: 'Nekoupeno', color: 'bg-rose-100 text-rose-700' },
};
export const PURCHASE_FLOW: PurchaseStatus[] = ['vyhlednuto', 'proverovani', 'vyjednavani', 'koupeno', 'preprava', 'dorazilo'];

export const PURCHASE_SOURCE: Record<PurchaseSource, string> = {
  dealer: 'Dealer / obchodník',
  aukce: 'Aukce',
  firma: 'Firma (koncový uživatel)',
  soukromnik: 'Soukromá osoba',
  leasing: 'Leasingová / úvěrová společnost',
  protiucet: 'Protiúčet (výkup od zákazníka)',
};

export const VAT_REGIME: Record<VatRegime, { label: string; hint: string }> = {
  eu: {
    label: 'Pořízení z EU (reverse charge)',
    hint: 'Prodejce plátce DPH z jiného státu EU fakturuje bez DPH, DPH přiznáte a zároveň uplatníte v ČR. Ověřte DIČ prodejce ve VIES. Zadejte cenu bez DPH.',
  },
  cz: { label: 'Tuzemsko s DPH', hint: 'Faktura s českou DPH, nárok na odpočet. Zadejte cenu bez DPH.' },
  import: {
    label: 'Dovoz ze třetí země (mimo EU)',
    hint: 'Celní řízení: clo + DPH při dovozu (DPH lze odečíst). Zadejte cenu bez DPH, clo do pole Clo.',
  },
  margin: {
    label: 'Zvláštní režim (použité zboží, § 90)',
    hint: 'Faktura bez vyčíslené DPH, odpočet nelze uplatnit – zadejte celkovou zaplacenou cenu.',
  },
  neplatce: { label: 'Od neplátce / soukromníka', hint: 'Bez DPH, zadejte celkovou zaplacenou cenu.' },
};

export interface Country {
  code: string;
  name: string;
  eu: boolean;
  km: number; // orientační vzdálenost po silnici do středu ČR
  extra: number; // trajekt, mýto mimo běžnou sazbu, námořní doprava (Kč)
  note?: string;
}

/** Orientační hodnoty – vždy si vyžádejte nabídku dopravce. */
export const COUNTRIES: Country[] = [
  { code: 'CZ', name: 'Česko', eu: true, km: 150, extra: 0 },
  { code: 'SK', name: 'Slovensko', eu: true, km: 280, extra: 0 },
  { code: 'DE', name: 'Německo', eu: true, km: 600, extra: 0 },
  { code: 'AT', name: 'Rakousko', eu: true, km: 350, extra: 0 },
  { code: 'PL', name: 'Polsko', eu: true, km: 450, extra: 0 },
  { code: 'HU', name: 'Maďarsko', eu: true, km: 450, extra: 0 },
  { code: 'NL', name: 'Nizozemsko', eu: true, km: 950, extra: 0 },
  { code: 'BE', name: 'Belgie', eu: true, km: 1000, extra: 0 },
  { code: 'LU', name: 'Lucembursko', eu: true, km: 800, extra: 0 },
  { code: 'FR', name: 'Francie', eu: true, km: 1250, extra: 0 },
  { code: 'IT', name: 'Itálie', eu: true, km: 1000, extra: 0 },
  { code: 'SI', name: 'Slovinsko', eu: true, km: 550, extra: 0 },
  { code: 'HR', name: 'Chorvatsko', eu: true, km: 750, extra: 0 },
  { code: 'DK', name: 'Dánsko', eu: true, km: 1000, extra: 0 },
  { code: 'SE', name: 'Švédsko', eu: true, km: 1400, extra: 4000, note: 'most Øresund / trajekt' },
  { code: 'FI', name: 'Finsko', eu: true, km: 1700, extra: 18000, note: 'trajekt' },
  { code: 'ES', name: 'Španělsko', eu: true, km: 2200, extra: 0 },
  { code: 'PT', name: 'Portugalsko', eu: true, km: 2800, extra: 0 },
  { code: 'IE', name: 'Irsko', eu: true, km: 2000, extra: 20000, note: 'trajekt' },
  { code: 'RO', name: 'Rumunsko', eu: true, km: 1000, extra: 0 },
  { code: 'BG', name: 'Bulharsko', eu: true, km: 1300, extra: 0 },
  { code: 'GB', name: 'Velká Británie', eu: false, km: 1500, extra: 15000, note: 'trajekt + celní odbavení, mimo EU' },
  { code: 'CH', name: 'Švýcarsko', eu: false, km: 800, extra: 0, note: 'mimo EU – celní odbavení' },
  { code: 'NO', name: 'Norsko', eu: false, km: 1600, extra: 12000, note: 'mimo EU – celní odbavení, trajekt' },
  { code: 'TR', name: 'Turecko', eu: false, km: 2000, extra: 0, note: 'celní unie, ale celní odbavení nutné' },
  { code: 'US', name: 'USA / Kanada', eu: false, km: 650, extra: 140000, note: 'námořní přeprava do Hamburku/Bremerhavenu + silnice' },
  { code: 'JP', name: 'Japonsko', eu: false, km: 650, extra: 160000, note: 'námořní přeprava do Hamburku + silnice' },
  { code: 'XX', name: 'Jiná země', eu: false, km: 0, extra: 0 },
];
export const countryByCode = (c: string) => COUNTRIES.find((x) => x.code === c) ?? COUNTRIES[COUNTRIES.length - 1];

export const CURRENCIES = ['CZK', 'EUR', 'USD', 'GBP', 'CHF', 'PLN', 'SEK', 'DKK', 'NOK', 'HUF', 'JPY'];

/** Kontrolní seznam při nákupu stroje. */
export const CHECKLIST: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: 'Prodejce a doklady',
    items: [
      { key: 'seller', label: 'Prodejce prověřen (obchodní rejstřík, recenze, platné DIČ ve VIES)' },
      { key: 'ownership', label: 'Ověřeno vlastnictví – stroj není zastaven, na leasingu ani kradený' },
      { key: 'serial', label: 'Výrobní číslo na štítku a rámu souhlasí s doklady' },
      { key: 'ce', label: 'CE prohlášení o shodě / štítek CE (u strojů z USA, Japonska často chybí!)' },
      { key: 'history', label: 'Servisní historie, počet majitelů, důvod prodeje' },
    ],
  },
  {
    group: 'Technický stav',
    items: [
      { key: 'inspection', label: 'Osobní prohlídka nebo video prohlídka / nezávislá inspekce' },
      { key: 'engine', label: 'Motor: start za studena, kouřivost, odvětrání klikové skříně, úniky' },
      { key: 'hours', label: 'Motohodiny odpovídají opotřebení (pedály, sedačka, ovladače, čepy)' },
      { key: 'hydraulics', label: 'Hydraulika: síla, rychlost, úniky, stav hadic a válců (pitting)' },
      { key: 'undercarriage', label: 'Podvozek / pneumatiky: % opotřebení, napínáky, kladky, rozety' },
      { key: 'pins', label: 'Čepy a pouzdra, vůle ramene a otoče' },
      { key: 'electrics', label: 'Elektrika, displej, chybové kódy, klimatizace' },
      { key: 'structure', label: 'Rám a výložník bez trhlin a svarů po opravách' },
    ],
  },
  {
    group: 'Obchod a doprava',
    items: [
      { key: 'contract', label: 'Kupní smlouva / proforma: cena, DPH režim, příslušenství, termín' },
      { key: 'payment', label: 'Platba jen na ověřený účet firmy (pozor na podvodné změny účtu v e-mailu)' },
      { key: 'transport', label: 'Doprava objednána, rozměry ověřeny, případně povolení nadrozměru' },
      { key: 'insurance', label: 'Pojištění nákladu, CMR list' },
      { key: 'customs', label: 'Mimo EU: celní deklarace, MRN, doklad o původu (např. pro UK)' },
      { key: 'registration', label: 'Po dovozu: technická prohlídka / registrace, pokud jede po silnici' },
    ],
  },
];
export const CHECKLIST_COUNT = CHECKLIST.reduce((a, g) => a + g.items.length, 0);

/** Kupní cena v CZK. */
export const purchasePriceCzk = (p: Purchase | undefined) =>
  p?.price_foreign ? p.price_foreign * (p.currency === 'CZK' ? 1 : p.exchange_rate || 0) : 0;

export interface Landed {
  purchase: number;
  transport: number;
  customs: number;
  fees: number; // aukce + prohlídka + registrace + ostatní
  service: number; // opravy a příprava ze servisních zakázek
  total: number;
}

/** Skutečné pořizovací náklady stroje (bez DPH). */
export function landedCost(m: Machine, p: Purchase | undefined, serviceCost: number): Landed {
  const purchase = p ? purchasePriceCzk(p) : m.purchase_price ?? 0;
  const transport = p?.transport_cost ?? 0;
  const customs = p?.customs_cost ?? 0;
  const fees = (p?.auction_fee ?? 0) + (p?.inspection_cost ?? 0) + (p?.registration_cost ?? 0) + (p?.other_cost ?? 0);
  return { purchase, transport, customs, fees, service: serviceCost, total: purchase + transport + customs + fees + serviceCost };
}

// ---------- doprava ----------

export interface TransportInput {
  km: number;
  weightKg: number | null;
  widthM: number | null;
  heightM: number | null;
  lengthM: number | null;
  countryExtra: number;
}

export interface TransportEstimate {
  vehicle: string;
  rate: number;
  base: number;
  oversize: string[];
  total: number;
}

export function estimateTransport(i: TransportInput, s: CompanySettings): TransportEstimate {
  const t = (i.weightKg ?? 0) / 1000;
  let vehicle = 'Přívěs / dodávka (do 3,5 t)';
  let rate = s.tr_rate_small;
  let deck = 0.6;
  if (t > 25) {
    vehicle = 'Těžký podvalník (nad 25 t)';
    rate = s.tr_rate_heavy;
    deck = 0.9;
  } else if (t > 12) {
    vehicle = 'Podvalník (12–25 t)';
    rate = s.tr_rate_large;
    deck = 0.9;
  } else if (t > 3.5) {
    vehicle = 'Nákladní auto s plošinou / malý podvalník (3,5–12 t)';
    rate = s.tr_rate_medium;
    deck = 1.0;
  }
  const oversize: string[] = [];
  if (i.widthM && i.widthM > 2.55) oversize.push(`šířka ${i.widthM} m > 2,55 m`);
  if (i.heightM && i.heightM + deck > 4) oversize.push(`výška na voze ≈ ${(i.heightM + deck).toFixed(2)} m > 4 m`);
  if (i.lengthM && i.lengthM > 13.6) oversize.push(`délka nákladu ${i.lengthM} m`);
  if (t > 28) oversize.push(`hmotnost ${t.toFixed(1)} t – souprava překročí 40–44 t`);
  const base = i.km * rate * s.tr_return_factor;
  const total = Math.round((base + s.tr_loading_fee + (oversize.length ? s.tr_oversize_fee : 0) + i.countryExtra) / 100) * 100;
  return { vehicle, rate, base, oversize, total };
}
