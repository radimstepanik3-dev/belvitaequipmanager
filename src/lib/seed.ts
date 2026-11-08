import { addDays, format } from 'date-fns';
import { backend } from './backend';
import { DEFAULT_SETTINGS, suggestRates } from './domain';
import type { Machine } from './types';

const d = (offset: number) => format(addDays(new Date(), offset), 'yyyy-MM-dd');

/** Vloží ukázková data pro vyzkoušení aplikace (lokální režim). */
export async function seedDemoData() {
  const base: Omit<Machine, 'id' | 'created_at' | 'updated_at' | 'name' | 'category' | 'brand' | 'model'> = {
    year: null,
    serial_number: '',
    hours: null,
    weight_kg: null,
    power_kw: null,
    condition: 'Dobrý',
    location: 'Areál Brno',
    description: '',
    ownership: 'vlastni',
    customer_name: '',
    lifecycle: 'aktivni',
    for_sale: false,
    sale_price: null,
    purchase_price: null,
    for_rent: false,
    cover_media_id: null,
    ai_data: null,
  };
  const mk = (m: Partial<Machine>) => backend.upsert('machines', { ...base, ...m });

  const m1 = await mk({ name: 'CAT 320 GC', category: 'Pásové rypadlo', brand: 'Caterpillar', model: '320 GC', year: 2019, hours: 6450, weight_kg: 21500, power_kw: 110, serial_number: 'CAT0320GCXYZ01234', for_sale: true, sale_price: 2350000, purchase_price: 2100000, for_rent: true, description: 'Rychloupínák, 3 lžíce, klimatizace, kamera.' });
  const m2 = await mk({ name: 'JCB 3CX Sitemaster', category: 'Rypadlo-nakladač', brand: 'JCB', model: '3CX', year: 2017, hours: 8900, weight_kg: 8070, power_kw: 68, for_rent: true, purchase_price: 1450000 });
  const m3 = await mk({ name: 'Kubota KX019-4', category: 'Minibagr', brand: 'Kubota', model: 'KX019-4', year: 2021, hours: 1870, weight_kg: 1850, power_kw: 11.4, for_rent: true, for_sale: true, sale_price: 590000, purchase_price: 640000 });
  const m4 = await mk({ name: 'Bomag BW 120 AD-5', category: 'Válec', brand: 'Bomag', model: 'BW 120 AD-5', year: 2018, hours: 2300, weight_kg: 2700, power_kw: 24, for_rent: true, purchase_price: 690000 });
  const m5 = await mk({ name: 'Volvo L60H', category: 'Kolový nakladač', brand: 'Volvo', model: 'L60H', year: 2016, hours: 11200, weight_kg: 11500, power_kw: 115, for_sale: true, sale_price: 1690000, condition: 'Opotřebený' });
  const m6 = await mk({ name: 'Manitou MT 1840', category: 'Teleskopický manipulátor', brand: 'Manitou', model: 'MT 1840', year: 2020, hours: 3100, weight_kg: 11800, power_kw: 75, for_rent: true, purchase_price: 2300000 });
  const c1 = await mk({ name: '', category: 'Minibagr', brand: 'Takeuchi', model: 'TB216', year: 2015, hours: 5400, ownership: 'zakaznik', customer_name: 'Zemní práce Novák s.r.o.', serial_number: '216004321' });

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
