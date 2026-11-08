import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSettings, useTable } from './hooks';
import { machineAvailability, type Availability } from './domain';
import { landedCost, margin, stockDays, type Landed } from './trade';
import type { Booking, CompanySettings, Lead, Machine, Media, Purchase, RentalRate, ServiceOrder } from './types';

interface Fleet {
  loading: boolean;
  settings: CompanySettings;
  machines: Machine[];
  bookings: Booking[];
  services: ServiceOrder[];
  rates: Map<string, RentalRate>;
  purchases: Map<string, Purchase>;
  leads: Lead[];
  photos: Media[];
  mediaById: Map<string, Media>;
  machineById: Map<string, Machine>;
  availability: Map<string, Availability>;
  /** náklady na opravy/přípravu vlastních strojů ze servisu (bez DPH) */
  serviceCost: Map<string, number>;
  landed: (m: Machine) => Landed;
  margin: (m: Machine) => { abs: number; pct: number } | null;
  days: (m: Machine) => number;
  coverPath: (m: Machine) => string | null;
}

const Ctx = createContext<Fleet | null>(null);

/** Sdílená data o strojích, obchodu, rezervacích a servisu – načtou se jednou pro celou aplikaci. */
export function FleetProvider({ children }: { children: ReactNode }) {
  const machines = useTable('machines');
  const bookings = useTable('bookings');
  const services = useTable('service_orders');
  const work = useTable('service_work');
  const parts = useTable('service_parts');
  const rates = useTable('rental_rates');
  const purchases = useTable('purchases');
  const leads = useTable('leads');
  const photos = useTable('media', { kind: 'photo' });
  const { settings } = useSettings();

  const value = useMemo<Fleet>(() => {
    const mediaById = new Map(photos.data.map((m) => [m.id, m]));
    const firstPhoto = new Map<string, Media>();
    for (const p of [...photos.data].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (p.machine_id && !p.service_order_id && !firstPhoto.has(p.machine_id)) firstPhoto.set(p.machine_id, p);
    }
    const availability = new Map(machines.data.map((m) => [m.id, machineAvailability(m, bookings.data, services.data)]));
    const machineById = new Map(machines.data.map((m) => [m.id, m]));
    const purchaseMap = new Map(purchases.data.map((p) => [p.machine_id, p]));

    // servisní náklady počítáme jen u vlastních strojů (oprava před prodejem)
    const serviceCost = new Map<string, number>();
    for (const o of services.data) {
      const m = machineById.get(o.machine_id);
      if (!m || m.ownership !== 'vlastni' || o.status === 'zruseno') continue;
      const hours = work.data.filter((w) => w.service_order_id === o.id).reduce((a, w) => a + w.hours, 0);
      const partsSum = parts.data.filter((p) => p.service_order_id === o.id).reduce((a, p) => a + p.quantity * p.unit_price, 0);
      serviceCost.set(m.id, (serviceCost.get(m.id) ?? 0) + hours * (o.labor_rate || 0) + partsSum);
    }

    const landed = (m: Machine) => landedCost(m, purchaseMap.get(m.id), serviceCost.get(m.id) ?? 0);

    return {
      loading: machines.loading || bookings.loading || services.loading || purchases.loading || leads.loading,
      settings,
      machines: machines.data,
      bookings: bookings.data,
      services: services.data,
      rates: new Map(rates.data.map((r) => [r.machine_id, r])),
      purchases: purchaseMap,
      leads: leads.data,
      photos: photos.data,
      mediaById,
      machineById,
      availability,
      serviceCost,
      landed,
      margin: (m) => margin(m.lifecycle === 'prodano' ? m.sold_price : m.sale_price, landed(m).total),
      days: (m) => stockDays(m, purchaseMap.get(m.id)),
      coverPath: (m) => (m.cover_media_id && mediaById.get(m.cover_media_id)?.path) || firstPhoto.get(m.id)?.path || null,
    };
  }, [
    machines.data,
    machines.loading,
    bookings.data,
    bookings.loading,
    services.data,
    services.loading,
    work.data,
    parts.data,
    rates.data,
    purchases.data,
    purchases.loading,
    leads.data,
    leads.loading,
    photos.data,
    settings,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFleet() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFleet mimo FleetProvider');
  return v;
}
