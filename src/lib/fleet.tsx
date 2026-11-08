import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTable } from './hooks';
import { machineAvailability, type Availability } from './domain';
import type { Booking, Machine, Media, RentalRate, ServiceOrder } from './types';

interface Fleet {
  loading: boolean;
  machines: Machine[];
  bookings: Booking[];
  services: ServiceOrder[];
  rates: Map<string, RentalRate>;
  photos: Media[];
  mediaById: Map<string, Media>;
  machineById: Map<string, Machine>;
  availability: Map<string, Availability>;
  coverPath: (m: Machine) => string | null;
}

const Ctx = createContext<Fleet | null>(null);

/** Sdílená data o strojích, rezervacích a servisu – načtou se jednou pro celou aplikaci. */
export function FleetProvider({ children }: { children: ReactNode }) {
  const machines = useTable('machines');
  const bookings = useTable('bookings');
  const services = useTable('service_orders');
  const rates = useTable('rental_rates');
  const photos = useTable('media', { kind: 'photo' });

  const value = useMemo<Fleet>(() => {
    const mediaById = new Map(photos.data.map((m) => [m.id, m]));
    const firstPhoto = new Map<string, Media>();
    for (const p of [...photos.data].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (p.machine_id && !p.service_order_id && !firstPhoto.has(p.machine_id)) firstPhoto.set(p.machine_id, p);
    }
    const availability = new Map(machines.data.map((m) => [m.id, machineAvailability(m, bookings.data, services.data)]));
    return {
      loading: machines.loading || bookings.loading || services.loading,
      machines: machines.data,
      bookings: bookings.data,
      services: services.data,
      rates: new Map(rates.data.map((r) => [r.machine_id, r])),
      photos: photos.data,
      mediaById,
      machineById: new Map(machines.data.map((m) => [m.id, m])),
      availability,
      coverPath: (m) => (m.cover_media_id && mediaById.get(m.cover_media_id)?.path) || firstPhoto.get(m.id)?.path || null,
    };
  }, [machines.data, machines.loading, bookings.data, bookings.loading, services.data, services.loading, rates.data, photos.data]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFleet() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFleet mimo FleetProvider');
  return v;
}
