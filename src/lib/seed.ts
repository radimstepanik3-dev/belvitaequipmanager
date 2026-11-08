import { addDays, format } from 'date-fns';
import { backend } from './backend';
import { DEFAULT_SETTINGS, EMPTY_MACHINE, suggestRates } from './domain';
import type { Machine } from './types';

const d = (offset: number) => format(addDays(new Date(), offset), 'yyyy-MM-dd');

/** Vloží ukázková data pro vyzkoušení aplikace (lokální režim). */
export async function seedDemoData() {
  const base = { ...EMPTY_MACHINE, condition: 'Dobrý', location: 'Areál Brno', for_sale: false };
  const mk = (m: Partial<Machine>) => backend.upsert('machines', { ...base, ...m });

  const m1 = await mk({ name: 'CAT 320 GC', category: 'Pásové rypadlo', brand: 'Caterpillar', model: '320 GC', year: 2019, hours: 6450, weight_kg: 21500, power_kw: 110, serial_number: 'CAT0320GCXYZ01234', for_sale: true, sale_price: 2350000, for_rent: true, transport_length_m: 9.5, transport_width_m: 2.98, transport_height_m: 2.95, description: 'Rychloupínák, 3 lžíce, klimatizace, kamera.' });
  const m2 = await mk({ name: 'JCB 3CX Sitemaster', category: 'Rypadlo-nakladač', brand: 'JCB', model: '3CX', year: 2017, hours: 8900, weight_kg: 8070, power_kw: 68, for_rent: true, purchase_price: 1450000 });
  const m3 = await mk({ name: 'Kubota KX019-4', category: 'Minibagr', brand: 'Kubota', model: 'KX019-4', year: 2021, hours: 1870, weight_kg: 1850, power_kw: 11.4, for_rent: true, for_sale: true, sale_price: 590000, purchase_price: 640000 });
  const m4 = await mk({ name: 'Bomag BW 120 AD-5', category: 'Válec', brand: 'Bomag', model: 'BW 120 AD-5', year: 2018, hours: 2300, weight_kg: 2700, power_kw: 24, for_rent: true, purchase_price: 690000 });
  const m5 = await mk({ name: 'Volvo L60H', category: 'Kolový nakladač', brand: 'Volvo', model: 'L60H', year: 2016, hours: 11200, weight_kg: 11500, power_kw: 115, for_sale: true, sale_price: 1690000, condition: 'Opotřebený', transport_length_m: 7.3, transport_width_m: 2.5, transport_height_m: 3.3 });
  const m6 = await mk({ name: 'Manitou MT 1840', category: 'Teleskopický manipulátor', brand: 'Manitou', model: 'MT 1840', year: 2020, hours: 3100, weight_kg: 11800, power_kw: 75, for_rent: true, purchase_price: 2300000 });
  const c1 = await mk({ name: '', category: 'Minibagr', brand: 'Takeuchi', model: 'TB216', year: 2015, hours: 5400, ownership: 'zakaznik', customer_name: 'Zemní práce Novák s.r.o.', serial_number: '216004321' });

  // ---------- prodej a nákup ----------
  const m7 = await mk({ name: 'Komatsu PC88MR-10', category: 'Kolové rypadlo', brand: 'Komatsu', model: 'PC88MR-10', year: 2018, hours: 5200, weight_kg: 8900, power_kw: 50, lifecycle: 'prodano', sold_price: 1290000, sold_at: d(-40), buyer_name: 'Výkopy Hanák s.r.o.' });
  const m8 = await mk({ name: 'JCB 4CX', category: 'Rypadlo-nakladač', brand: 'JCB', model: '4CX', year: 2016, hours: 9800, weight_kg: 8800, power_kw: 74, lifecycle: 'prodano', sold_price: 1180000, sold_at: d(-12), buyer_name: 'Obec Lipůvka' });
  const m9 = await mk({ name: 'Liebherr R 920 Compact', category: 'Pásové rypadlo', brand: 'Liebherr', model: 'R 920 Compact', year: 2017, hours: 8100, weight_kg: 22000, power_kw: 110, lifecycle: 'nakup', for_sale: true, transport_length_m: 9.2, transport_width_m: 2.99, transport_height_m: 3.1 });
  const m10 = await mk({ name: 'Hitachi ZX135US-6', category: 'Pásové rypadlo', brand: 'Hitachi', model: 'ZX135US-6', year: 2019, hours: 4300, weight_kg: 14200, power_kw: 72, lifecycle: 'nakup', for_sale: true, sale_price: 1890000, transport_length_m: 7.4, transport_width_m: 2.49, transport_height_m: 2.85 });
  const m11 = await mk({ name: 'Bobcat S450', category: 'Smykový nakladač', brand: 'Bobcat', model: 'S450', year: 2020, hours: 1450, weight_kg: 2600, power_kw: 36, for_sale: true, sale_price: 645000, condition: 'Velmi dobrý' });

  const pur = (m: Machine, p: Record<string, unknown>) =>
    backend.upsert('purchases', {
      id: m.id, machine_id: m.id, status: 'dorazilo', source: 'dealer', seller_name: '', seller_contact: '', seller_vat_id: '', country: 'DE', city: '',
      listing_url: '', purchase_date: null, currency: 'EUR', price_foreign: null, exchange_rate: 25, vat_regime: 'eu', distance_km: 600,
      transport_cost: null, customs_cost: null, auction_fee: null, inspection_cost: null, registration_cost: null, other_cost: null, other_note: '',
      expected_arrival: null, checklist: {}, notes: '', ...p,
    });
  await pur(m1, { seller_name: 'Baumaschinen Huber GmbH', city: 'Regensburg', purchase_date: d(-75), price_foreign: 81000, exchange_rate: 25.1, distance_km: 420, transport_cost: 31000, inspection_cost: 6500, checklist: { seller: true, ownership: true, serial: true, ce: true, inspection: true, engine: true, contract: true, payment: true, transport: true } });
  await pur(m5, { seller_name: 'Veiling (aukce)', source: 'aukce', country: 'NL', city: 'Zwolle', purchase_date: d(-210), price_foreign: 49000, exchange_rate: 24.9, distance_km: 950, transport_cost: 42000, auction_fee: 146000, checklist: { seller: true, serial: true } });
  await pur(m3, { seller_name: 'Půjčovna Jih s.r.o.', country: 'CZ', city: 'Jihlava', currency: 'CZK', price_foreign: 455000, exchange_rate: 1, vat_regime: 'cz', purchase_date: d(-150), transport_cost: 4500, distance_km: 90 });
  await pur(m11, { seller_name: 'Stavitelství Gregor', country: 'SK', city: 'Žilina', price_foreign: 21500, exchange_rate: 25.1, purchase_date: d(-30), transport_cost: 9800, distance_km: 280 });
  await pur(m7, { seller_name: 'Kiesel Leasing', source: 'leasing', city: 'Leipzig', price_foreign: 41000, exchange_rate: 25.2, purchase_date: d(-130), transport_cost: 26000, distance_km: 330 });
  await pur(m8, { seller_name: 'Plant Sales Ltd', country: 'GB', city: 'Leeds', vat_regime: 'import', currency: 'GBP', price_foreign: 26500, exchange_rate: 29.3, purchase_date: d(-95), transport_cost: 58000, other_cost: 9500, other_note: 'celní deklarant', distance_km: 1550 });
  await pur(m9, { status: 'vyjednavani', seller_name: 'Liebherr-Mietpartner', city: 'Augsburg', listing_url: 'https://www.mascus.cz/', price_foreign: 79000, exchange_rate: 25.1, distance_km: 480, notes: 'Prodejce nabízí 79 000 EUR, zkusit 74 000. Video prohlídka domluvena na čtvrtek.', checklist: { seller: true, serial: true } });
  await pur(m10, { status: 'preprava', seller_name: 'Hire Station', country: 'GB', city: 'Birmingham', vat_regime: 'import', currency: 'GBP', price_foreign: 46000, exchange_rate: 29.3, purchase_date: d(-6), expected_arrival: d(5), distance_km: 1500, transport_cost: 61000, other_cost: 9500, other_note: 'celní deklarant', checklist: { seller: true, ownership: true, serial: true, ce: true, inspection: true, engine: true, hydraulics: true, undercarriage: true, contract: true, payment: true, transport: true, insurance: true, customs: true } });

  const lead = (l: Record<string, unknown>) =>
    backend.upsert('leads', { machine_id: null, wanted: '', customer_name: '', company: '', phone: '', email: '', source: 'Telefon', status: 'novy', offered_price: null, next_contact: null, note: '', ...l });
  await lead({ machine_id: m1.id, company: 'Zemní práce Kos', customer_name: 'Petr Kos', phone: '+420 731 222 333', source: 'Mascus', status: 'prohlidka', next_contact: d(0), note: 'Prohlídka v pátek, chce i 2. lžíci' });
  await lead({ machine_id: m1.id, company: 'Bau-Team Wien', customer_name: 'Herr Gruber', email: 'gruber@example.at', source: 'Machineryline', status: 'nabidka', offered_price: 2200000, next_contact: d(-1) });
  await lead({ machine_id: m5.id, company: 'AGRO Hodonín', customer_name: 'p. Malý', phone: '+420 602 444 555', source: 'Stávající zákazník', status: 'vyjednavani', offered_price: 1650000, next_contact: d(2), note: 'Záloha 100 000 Kč uhrazena' });
  await lead({ machine_id: m11.id, customer_name: 'Tomáš Vrba', phone: '+420 777 888 999', source: 'Bazoš', status: 'novy', next_contact: d(0) });
  await lead({ wanted: 'Pásové rypadlo 20–25 t s rychloupínákem, do 8 000 mth, rozpočet do 2,4 mil. Kč', company: 'Silnice Vysočina', customer_name: 'Ing. Bárta', phone: '+420 603 111 000', source: 'Doporučení', status: 'kontaktovan', next_contact: d(7) });
  await lead({ wanted: 'Minibagr 2,5–3 t, nejlépe Kubota nebo Takeuchi', customer_name: 'Jan Říha', phone: '+420 608 000 111', source: 'Vlastní web', status: 'novy' });

  const s = DEFAULT_SETTINGS;
  const rate = (m: Machine, day: number, note = '') =>
    backend.upsert('rental_rates', { id: m.id, machine_id: m.id, ...suggestRates(day, s), operator_hour: 650, note, in_pricelist: true });
  await rate(m1, 7500, 'vč. 3 lžic a rychloupínáku');
  await rate(m2, 4200);
  await rate(m3, 1900, 'vč. přívěsu');
  await rate(m4, 2400);
  await rate(m6, 5200);

  await backend.upsert('bookings', { machine_id: m2.id, type: 'pronajem', status: 'aktivni', customer_company: 'Stavby Morava a.s.', customer_name: 'Ing. Dvořák', customer_phone: '+420 777 111 222', start_date: d(-5), end_date: d(4), price_total: 37800, deposit: 12600, note: '' });
  await backend.upsert('bookings', { machine_id: m3.id, type: 'rezervace_pronajem', status: 'aktivni', customer_company: '', customer_name: 'Petr Svoboda', customer_phone: '+420 603 333 444', start_date: d(3), end_date: d(6), price_total: 7600, deposit: 5500, note: 'Doprava na stavbu Kuřim' });
  await backend.upsert('bookings', { machine_id: m5.id, type: 'rezervace_prodej', status: 'aktivni', customer_company: 'AGRO Hodonín', customer_name: 'p. Malý', customer_phone: '', start_date: d(-1), end_date: d(10), price_total: 1650000, deposit: 100000, note: 'Záloha uhrazena' });
  await backend.upsert('bookings', { machine_id: m1.id, type: 'pronajem', status: 'dokonceno', customer_company: 'Silnice Brno', customer_name: '', customer_phone: '', start_date: d(-20), end_date: d(-9), price_total: 61000, deposit: null, note: '' });
  await backend.upsert('bookings', { machine_id: m6.id, type: 'pronajem', status: 'aktivni', customer_company: 'Haly Pro s.r.o.', customer_name: '', customer_phone: '', start_date: d(-12), end_date: d(-1), price_total: 52000, deposit: 15600, note: '' });

  const so = await backend.upsert('service_orders', {
    number: `S${new Date().getFullYear()}-0001`,
    machine_id: c1.id,
    status: 'ceka_na_dily',
    customer_name: 'Zemní práce Novák s.r.o.',
    customer_phone: '+420 608 555 666',
    customer_email: 'novak@example.cz',
    received_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    received_by: 'Jan Servisák',
    hours_at_intake: 5400,
    fault_description: 'Únik hydraulického oleje u pojezdu, slabý výkon pojezdu vlevo.',
    intake_condition: 'Poškrábaná kabina, prasklé zrcátko.',
    accessories: 'Klíče, svahovací lžíce',
    technician: 'Martin',
    estimated_completion: d(4),
    diagnosis: 'Netěsnost hydromotoru pojezdu L, opotřebené těsnicí kroužky.',
    labor_rate: 950,
    completed_at: null,
    completion_notes: '',
    handed_over_at: null,
  });
  await backend.upsert('service_work', { service_order_id: so.id, date: d(-2), technician: 'Martin', hours: 2.5, description: 'Diagnostika, demontáž krytu pojezdu' });
  await backend.upsert('service_parts', { service_order_id: so.id, part_number: '05411-00500', name: 'Sada těsnění hydromotoru', quantity: 1, unit: 'ks', unit_price: 4890, status: 'objednano' });
  await backend.upsert('service_parts', { service_order_id: so.id, part_number: 'HYD-46', name: 'Hydraulický olej HV46', quantity: 20, unit: 'l', unit_price: 89, status: 'skladem' });

  await backend.upsert('service_orders', {
    number: `S${new Date().getFullYear()}-0002`,
    machine_id: m4.id,
    status: 'v_oprave',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    received_at: new Date(Date.now() - 86400000).toISOString(),
    received_by: 'Jan Servisák',
    hours_at_intake: 2300,
    fault_description: 'Pravidelný servis 2 500 mth + kontrola vibrace.',
    intake_condition: '',
    accessories: '',
    technician: 'Martin',
    estimated_completion: d(1),
    diagnosis: '',
    labor_rate: 950,
    completed_at: null,
    completion_notes: '',
    handed_over_at: null,
  });
}
