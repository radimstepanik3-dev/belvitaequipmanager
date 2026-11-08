import { differenceInCalendarDays, max as maxDate, min as minDate, parseISO } from 'date-fns';
import type {
  Booking,
  BookingType,
  CompanySettings,
  Machine,
  PartStatus,
  RentalRate,
  ServiceOrder,
  ServiceStatus,
} from './types';
import { today } from './util';

// ---------- číselníky ----------

export const DEFAULT_CATEGORIES = [
  'Pásové rypadlo',
  'Kolové rypadlo',
  'Minibagr',
  'Rypadlo-nakladač',
  'Kolový nakladač',
  'Smykový nakladač',
  'Teleskopický manipulátor',
  'Dozer',
  'Grejdr',
  'Válec',
  'Vibrační deska',
  'Dumper',
  'Nákladní automobil',
  'Jeřáb',
  'Pracovní plošina',
  'Vysokozdvižný vozík',
  'Kompresor',
  'Elektrocentrála',
  'Přídavné zařízení',
  'Ostatní',
];

export const CONDITIONS = ['Nový', 'Jako nový', 'Velmi dobrý', 'Dobrý', 'Opotřebený', 'Na opravu', 'Na díly'];

export const SERVICE_STATUS: Record<ServiceStatus, { label: string; color: string }> = {
  prijato: { label: 'Přijato', color: 'bg-sky-100 text-sky-800' },
  diagnostika: { label: 'Diagnostika', color: 'bg-indigo-100 text-indigo-800' },
  ceka_na_dily: { label: 'Čeká na díly', color: 'bg-orange-100 text-orange-800' },
  v_oprave: { label: 'V opravě', color: 'bg-amber-100 text-amber-800' },
  hotovo: { label: 'Hotovo', color: 'bg-emerald-100 text-emerald-800' },
  predano: { label: 'Předáno', color: 'bg-slate-200 text-slate-700' },
  zruseno: { label: 'Zrušeno', color: 'bg-rose-100 text-rose-700' },
};
export const SERVICE_FLOW: ServiceStatus[] = ['prijato', 'diagnostika', 'ceka_na_dily', 'v_oprave', 'hotovo', 'predano'];
export const isServiceOpen = (s: ServiceStatus) => !['hotovo', 'predano', 'zruseno'].includes(s);

export const PART_STATUS: Record<PartStatus, string> = {
  objednano: 'Objednáno',
  skladem: 'Skladem',
  pouzito: 'Použito',
};

export const BOOKING_TYPE: Record<BookingType, { label: string; color: string; bar: string }> = {
  pronajem: { label: 'Pronájem', color: 'bg-rose-100 text-rose-800', bar: 'bg-rose-500' },
  rezervace_pronajem: { label: 'Rezervace k pronájmu', color: 'bg-violet-100 text-violet-800', bar: 'bg-violet-500' },
  rezervace_prodej: { label: 'Rezervace k prodeji', color: 'bg-blue-100 text-blue-800', bar: 'bg-blue-500' },
  prodej: { label: 'Prodej', color: 'bg-slate-200 text-slate-800', bar: 'bg-slate-600' },
};

// ---------- stav stroje ----------

export type AvailabilityKey =
  | 'nakup'
  | 'volny'
  | 'pujceno'
  | 'po_terminu'
  | 'rez_pronajem'
  | 'rez_prodej'
  | 'v_servisu'
  | 'prodano'
  | 'vyrazeno'
  | 'zakaznik';

export const AVAILABILITY: Record<AvailabilityKey, { label: string; color: string; dot: string }> = {
  nakup: { label: 'Nákup / na cestě', color: 'bg-teal-100 text-teal-800', dot: 'bg-teal-500' },
  volny: { label: 'Volný', color: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  pujceno: { label: 'Půjčeno', color: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
  po_terminu: { label: 'Půjčeno – po termínu', color: 'bg-red-200 text-red-900', dot: 'bg-red-700' },
  rez_pronajem: { label: 'Rezervováno k pronájmu', color: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500' },
  rez_prodej: { label: 'Rezervováno k prodeji', color: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  v_servisu: { label: 'V servisu', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  prodano: { label: 'Prodáno', color: 'bg-slate-200 text-slate-700', dot: 'bg-slate-500' },
  vyrazeno: { label: 'Vyřazeno', color: 'bg-slate-200 text-slate-500', dot: 'bg-slate-400' },
  zakaznik: { label: 'Stroj zákazníka', color: 'bg-cyan-100 text-cyan-800', dot: 'bg-cyan-500' },
};

export interface Availability {
  key: AvailabilityKey;
  booking?: Booking;
  service?: ServiceOrder;
}

/**
 * Aktuální stav stroje. Pořadí priorit:
 * prodáno > v servisu > půjčeno > rezervace k prodeji > rezervace k pronájmu > volný.
 */
export function machineAvailability(m: Machine, bookings: Booking[], services: ServiceOrder[]): Availability {
  if (m.lifecycle === 'prodano') return { key: 'prodano' };
  if (m.lifecycle === 'vyrazeno') return { key: 'vyrazeno' };
  if (m.lifecycle === 'nakup') return { key: 'nakup' };
  const t = today();
  const service = services.find((s) => s.machine_id === m.id && isServiceOpen(s.status));
  if (service) return { key: 'v_servisu', service };
  if (m.ownership === 'zakaznik') return { key: 'zakaznik' };

  const active = bookings.filter((b) => b.machine_id === m.id && b.status === 'aktivni');
  const rental = active.find((b) => b.type === 'pronajem' && b.start_date <= t);
  if (rental) return { key: rental.end_date && rental.end_date < t ? 'po_terminu' : 'pujceno', booking: rental };
  const saleRes = active.find((b) => b.type === 'rezervace_prodej');
  if (saleRes) return { key: 'rez_prodej', booking: saleRes };
  const rentRes = active
    .filter((b) => b.type === 'rezervace_pronajem' || (b.type === 'pronajem' && b.start_date > t))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  if (rentRes) return { key: 'rez_pronajem', booking: rentRes };
  return { key: 'volny' };
}

/** Kolize termínu s jinou aktivní výpůjčkou / rezervací pronájmu. */
export function findConflicts(b: Pick<Booking, 'id' | 'machine_id' | 'start_date' | 'end_date' | 'type'>, all: Booking[]) {
  if (b.type === 'rezervace_prodej' || b.type === 'prodej') return [];
  const s = b.start_date;
  const e = b.end_date ?? '9999-12-31';
  return all.filter(
    (o) =>
      o.id !== b.id &&
      o.machine_id === b.machine_id &&
      o.status === 'aktivni' &&
      (o.type === 'pronajem' || o.type === 'rezervace_pronajem') &&
      o.start_date <= e &&
      (o.end_date ?? '9999-12-31') >= s,
  );
}

/** Počet dní, kdy byl stroj v daném období půjčen (pronájem, nezrušený). */
export function rentedDays(machineId: string, bookings: Booking[], from: Date, to: Date): number {
  const days = new Set<number>();
  for (const b of bookings) {
    if (b.machine_id !== machineId || b.type !== 'pronajem' || b.status === 'zruseno') continue;
    const s = maxDate([parseISO(b.start_date), from]);
    const e = minDate([parseISO(b.end_date ?? today()), to]);
    const n = differenceInCalendarDays(e, s);
    for (let i = 0; i <= n; i++) days.add(differenceInCalendarDays(s, from) + i);
  }
  return days.size;
}

// ---------- cenotvorba ----------

export const DEFAULT_SETTINGS: CompanySettings = {
  company_name: 'Moje firma s.r.o.',
  address: '',
  ico: '',
  dic: '',
  phone: '',
  email: '',
  web: '',
  vat_rate: 21,
  default_labor_rate: 950,
  pricelist_title: 'Ceník půjčovny stavebních strojů',
  pricelist_terms:
    'Ceny jsou uvedeny bez DPH. Víkend = pátek 12:00 až pondělí 8:00. Cena zahrnuje 8 motohodin/den, ' +
    'každá další motohodina je účtována dle hodinové sazby. Pohonné hmoty nejsou v ceně, stroj se vrací natankovaný. ' +
    'Doprava dle vzdálenosti. Při převzetí je vyžadována vratná kauce.',
  coef_hour: 0.18,
  coef_weekend: 1.6,
  coef_week: 5,
  coef_month: 18,
  coef_deposit: 3,
  daily_pct_of_value: 0.35,
  categories: DEFAULT_CATEGORIES,
  target_margin_pct: 15,
  stock_warn_days: 120,
  // orientační kurzy – aktualizujte tlačítkem „Načíst kurzy ČNB“ v Nastavení
  currency_rates: { CZK: 1, EUR: 25, USD: 23, GBP: 29, CHF: 26, PLN: 5.8, SEK: 2.2, DKK: 3.35, NOK: 2.1, HUF: 0.064, JPY: 0.15 },
  rates_date: '',
  base_city: 'Brno',
  tr_rate_small: 30,
  tr_rate_medium: 45,
  tr_rate_large: 60,
  tr_rate_heavy: 80,
  tr_return_factor: 1.3,
  tr_loading_fee: 2500,
  tr_oversize_fee: 9000,
};

const round = (v: number, step = 10) => Math.round(v / step) * step;

/** Navrhne kompletní ceník z denní sazby podle koeficientů z nastavení. */
export function suggestRates(dayPrice: number, s: CompanySettings): Partial<RentalRate> {
  return {
    price_day: round(dayPrice),
    price_hour: round(dayPrice * s.coef_hour),
    price_weekend: round(dayPrice * s.coef_weekend),
    price_week: round(dayPrice * s.coef_week, 50),
    price_month: round(dayPrice * s.coef_month, 100),
    deposit: round(dayPrice * s.coef_deposit, 500),
  };
}

/** Denní sazba odvozená z hodnoty stroje (pořizovací, jinak prodejní cena). */
export function suggestDayFromValue(m: Machine, s: CompanySettings): number | null {
  const value = m.purchase_price ?? m.sale_price;
  if (!value) return null;
  return round((value * s.daily_pct_of_value) / 100);
}

/** Výpočet ceny výpůjčky dle počtu dní a ceníku (nejvýhodnější kombinace měsíc/týden/den). */
export function calcRentalPrice(rate: RentalRate | undefined, start: string, end: string | null): number | null {
  if (!rate || !end) return null;
  const days = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
  if (days <= 0) return null;
  const d = rate.price_day ?? 0;
  const w = rate.price_week ?? d * 7;
  const mo = rate.price_month ?? w * 4.3;
  if (!d) return null;
  let rest = days;
  let total = 0;
  const months = Math.floor(rest / 30);
  total += months * mo;
  rest -= months * 30;
  const weeks = Math.floor(rest / 7);
  total += weeks * w;
  rest -= weeks * 7;
  total += Math.min(rest * d, w); // pokud jsou dny dražší než týden, účtuj týden
  return Math.round(total);
}

// ---------- servis ----------

export function nextServiceNumber(existing: ServiceOrder[]): string {
  const year = new Date().getFullYear();
  const prefix = `S${year}-`;
  const max = existing
    .map((o) => (o.number?.startsWith(prefix) ? Number(o.number.slice(prefix.length)) : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

// ---------- šablona nového stroje ----------

import type { Machine as M } from './types';
export type MachineDraft = Omit<M, 'id' | 'created_at' | 'updated_at'>;

export const EMPTY_MACHINE: MachineDraft = {
  name: '',
  category: '',
  brand: '',
  model: '',
  year: null,
  serial_number: '',
  hours: null,
  weight_kg: null,
  power_kw: null,
  condition: '',
  location: '',
  description: '',
  ownership: 'vlastni',
  customer_name: '',
  lifecycle: 'aktivni',
  for_sale: true,
  sale_price: null,
  purchase_price: null,
  for_rent: false,
  cover_media_id: null,
  ai_data: null,
  transport_length_m: null,
  transport_width_m: null,
  transport_height_m: null,
  sold_price: null,
  sold_at: null,
  buyer_name: '',
  listing: null,
};

export const LIFECYCLE: Record<M['lifecycle'], string> = {
  nakup: 'Nákup / na cestě',
  aktivni: 'Skladem',
  prodano: 'Prodáno',
  vyrazeno: 'Vyřazeno',
};
