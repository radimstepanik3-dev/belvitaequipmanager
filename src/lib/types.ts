// Datový model aplikace StrojPark. Názvy tabulek a sloupců odpovídají
// Supabase migraci v supabase/migrations/001_init.sql.

export type ID = string;

export interface BaseRow {
  id: ID;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** Vlastní stroj (na prodej / půjčovnu) nebo stroj zákazníka přijatý do servisu. */
export type Ownership = 'vlastni' | 'zakaznik';
/** Životní cyklus vlastního stroje. 'nakup' = vyhlédnutý / kupovaný / na cestě do ČR. */
export type Lifecycle = 'nakup' | 'aktivni' | 'prodano' | 'vyrazeno';

export interface Machine extends BaseRow {
  name: string;
  category: string;
  brand: string;
  model: string;
  year: number | null;
  serial_number: string;
  hours: number | null; // motohodiny
  weight_kg: number | null;
  power_kw: number | null;
  condition: string; // stav: nový / velmi dobrý / dobrý / opotřebený / na díly
  location: string;
  description: string;
  ownership: Ownership;
  customer_name: string; // pokud je stroj zákazníka
  lifecycle: Lifecycle;
  for_sale: boolean;
  sale_price: number | null;
  purchase_price: number | null;
  for_rent: boolean;
  cover_media_id: ID | null;
  ai_data: AiRecognition | null;
  // přepravní rozměry (m)
  transport_length_m: number | null;
  transport_width_m: number | null;
  transport_height_m: number | null;
  // prodej
  sold_price: number | null; // bez DPH
  sold_at: string | null; // yyyy-MM-dd
  buyer_name: string;
  listing: AiListing | null; // texty inzerátu
}

export type PurchaseStatus = 'vyhlednuto' | 'proverovani' | 'vyjednavani' | 'koupeno' | 'preprava' | 'dorazilo' | 'nekoupeno';
export type PurchaseSource = 'dealer' | 'aukce' | 'soukromnik' | 'firma' | 'leasing' | 'protiucet';
/** Daňový režim nákupu. */
export type VatRegime = 'cz' | 'eu' | 'import' | 'margin' | 'neplatce';

/** Nákup stroje včetně dovozu do ČR. id === machine_id */
export interface Purchase extends BaseRow {
  machine_id: ID;
  status: PurchaseStatus;
  source: PurchaseSource;
  seller_name: string;
  seller_contact: string;
  seller_vat_id: string;
  country: string; // ISO kód (DE, NL, …)
  city: string;
  listing_url: string;
  purchase_date: string | null;
  currency: string; // CZK, EUR, …
  price_foreign: number | null; // bez DPH v měně nákupu
  exchange_rate: number; // CZK za 1 jednotku měny
  vat_regime: VatRegime;
  distance_km: number | null;
  transport_cost: number | null;
  customs_cost: number | null;
  auction_fee: number | null;
  inspection_cost: number | null;
  registration_cost: number | null;
  other_cost: number | null;
  other_note: string;
  expected_arrival: string | null;
  checklist: Record<string, boolean>;
  notes: string;
}

export type LeadStatus = 'novy' | 'kontaktovan' | 'prohlidka' | 'nabidka' | 'vyjednavani' | 'vyhrano' | 'ztraceno';

/** Zájemce o koupi konkrétního stroje, nebo obecná poptávka (machine_id = null). */
export interface Lead extends BaseRow {
  machine_id: ID | null;
  wanted: string; // co hledá (u obecné poptávky)
  customer_name: string;
  company: string;
  phone: string;
  email: string;
  source: string;
  status: LeadStatus;
  offered_price: number | null;
  next_contact: string | null; // yyyy-MM-dd
  note: string;
}

export interface AiListing {
  title: string;
  text_cs: string;
  text_en: string;
  text_de: string;
  highlights: string[];
  generated_at?: string;
}

export type MediaKind = 'photo' | 'document';
export type ServiceStage = 'prijem' | 'prubeh' | 'dokonceni';

export interface Media extends BaseRow {
  machine_id: ID | null;
  service_order_id: ID | null;
  kind: MediaKind;
  stage: ServiceStage | null;
  name: string;
  mime: string;
  size: number;
  path: string; // cesta v úložišti
  caption: string;
}

export type ServiceStatus =
  | 'prijato'
  | 'diagnostika'
  | 'ceka_na_dily'
  | 'v_oprave'
  | 'hotovo'
  | 'predano'
  | 'zruseno';

export interface ServiceOrder extends BaseRow {
  number: string;
  machine_id: ID;
  status: ServiceStatus;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  received_at: string; // ISO datum
  received_by: string;
  hours_at_intake: number | null;
  fault_description: string;
  intake_condition: string;
  accessories: string;
  technician: string;
  estimated_completion: string | null;
  diagnosis: string;
  labor_rate: number; // Kč / hod bez DPH
  completed_at: string | null;
  completion_notes: string;
  handed_over_at: string | null;
}

export interface ServiceWork extends BaseRow {
  service_order_id: ID;
  date: string;
  technician: string;
  hours: number;
  description: string;
}

export type PartStatus = 'objednano' | 'skladem' | 'pouzito';

export interface ServicePart extends BaseRow {
  service_order_id: ID;
  part_number: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number; // bez DPH
  status: PartStatus;
}

/** Ceník půjčovného jednoho stroje (bez DPH). id === machine_id */
export interface RentalRate extends BaseRow {
  machine_id: ID;
  price_hour: number | null;
  price_day: number | null;
  price_weekend: number | null;
  price_week: number | null;
  price_month: number | null;
  deposit: number | null;
  operator_hour: number | null; // příplatek za obsluhu / hod
  note: string;
  in_pricelist: boolean;
}

export type BookingType = 'pronajem' | 'rezervace_pronajem' | 'rezervace_prodej' | 'prodej';
export type BookingStatus = 'aktivni' | 'dokonceno' | 'zruseno';

export interface Booking extends BaseRow {
  machine_id: ID;
  type: BookingType;
  status: BookingStatus;
  customer_name: string;
  customer_company: string;
  customer_phone: string;
  start_date: string; // yyyy-MM-dd
  end_date: string | null; // yyyy-MM-dd (u prodeje může chybět)
  price_total: number | null;
  deposit: number | null;
  note: string;
}

export interface CompanySettings {
  company_name: string;
  address: string;
  ico: string;
  dic: string;
  phone: string;
  email: string;
  web: string;
  vat_rate: number; // %
  default_labor_rate: number;
  pricelist_title: string;
  pricelist_terms: string;
  // koeficienty cenotvorby (násobek denní ceny)
  coef_hour: number;
  coef_weekend: number;
  coef_week: number;
  coef_month: number;
  coef_deposit: number;
  // denní cena jako % z pořizovací/prodejní ceny
  daily_pct_of_value: number;
  categories: string[];
  // prodej a nákup
  target_margin_pct: number;
  stock_warn_days: number;
  currency_rates: Record<string, number>; // CZK za 1 jednotku
  rates_date: string;
  base_city: string;
  // doprava – Kč/km dle hmotnostní třídy
  tr_rate_small: number; // do 3,5 t
  tr_rate_medium: number; // do 12 t
  tr_rate_large: number; // do 25 t
  tr_rate_heavy: number; // nad 25 t
  tr_return_factor: number; // násobek za cestu zpět / přistavení
  tr_loading_fee: number;
  tr_oversize_fee: number;
}

export interface SettingsRow extends BaseRow {
  value: CompanySettings;
}

export interface AiRecognition {
  category: string;
  brand: string;
  model: string;
  year_from: number | null;
  year_to: number | null;
  weight_kg: number | null;
  power_kw: number | null;
  serial_number: string | null;
  confidence: 'vysoka' | 'stredni' | 'nizka';
  visible_condition: string;
  notes: string;
  transport_length_m: number | null;
  transport_width_m: number | null;
  transport_height_m: number | null;
  recognized_at?: string;
}

export interface TableMap {
  machines: Machine;
  media: Media;
  service_orders: ServiceOrder;
  service_work: ServiceWork;
  service_parts: ServicePart;
  rental_rates: RentalRate;
  bookings: Booking;
  settings: SettingsRow;
  purchases: Purchase;
  leads: Lead;
}

export type TableName = keyof TableMap;
export const TABLES: TableName[] = [
  'machines',
  'media',
  'service_orders',
  'service_work',
  'service_parts',
  'rental_rates',
  'bookings',
  'settings',
  'purchases',
  'leads',
];
