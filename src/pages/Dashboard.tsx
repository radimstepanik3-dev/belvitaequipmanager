import { Link } from 'react-router-dom';
import { Plus, Wrench, CalendarPlus, AlertTriangle, Truck, ArrowRight } from 'lucide-react';
import { useFleet } from '../lib/fleet';
import { AVAILABILITY, BOOKING_TYPE, SERVICE_STATUS, isServiceOpen, type AvailabilityKey } from '../lib/domain';
import { Badge, Card, Empty, PageHeader, Spinner } from '../components/ui';
import { fmtDate, machineTitle, today } from '../lib/util';
import { addDays, format } from 'date-fns';
import { CoverImage } from '../components/Media';

export function Dashboard() {
  const f = useFleet();
  if (f.loading) return <Spinner />;

  const own = f.machines.filter((m) => m.ownership === 'vlastni' && m.lifecycle === 'aktivni');
  const counts = new Map<AvailabilityKey, number>();
  for (const m of own) {
    const k = f.availability.get(m.id)!.key;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const openServices = f.services.filter((s) => isServiceOpen(s.status)).sort((a, b) => a.received_at.localeCompare(b.received_at));
  const t = today();
  const in7 = format(addDays(new Date(), 7), 'yyyy-MM-dd');
  const upcoming = f.bookings
    .filter(
      (b) =>
        b.status === 'aktivni' &&
        ((b.start_date >= t && b.start_date <= in7) || (b.type === 'pronajem' && b.end_date && b.end_date <= in7)),
    )
    .sort((a, b) => (a.end_date ?? a.start_date).localeCompare(b.end_date ?? b.start_date));
  const overdue = own.filter((m) => f.availability.get(m.id)!.key === 'po_terminu');

  const tiles: { key: AvailabilityKey; to: string }[] = [
    { key: 'volny', to: '/stroje?stav=volny' },
    { key: 'pujceno', to: '/stroje?stav=pujceno' },
    { key: 'rez_pronajem', to: '/stroje?stav=rez_pronajem' },
    { key: 'rez_prodej', to: '/stroje?stav=rez_prodej' },
    { key: 'v_servisu', to: '/stroje?stav=v_servisu' },
  ];

  return (
    <>
      <PageHeader
        title="Přehled"
        subtitle={`${own.length} vlastních strojů · ${own.filter((m) => m.for_sale).length} na prodej · ${own.filter((m) => m.for_rent).length} v půjčovně`}
        actions={
          <>
            <Link to="/stroje/novy" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-brand-400">
              <Plus className="h-4 w-4" /> Nový stroj
            </Link>
            <Link to="/servis/novy" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm hover:bg-slate-50">
              <Wrench className="h-4 w-4" /> Příjem do servisu
            </Link>
            <Link to="/pujcovna?tab=rezervace&nova=1" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm hover:bg-slate-50">
              <CalendarPlus className="h-4 w-4" /> Půjčit / rezervovat
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.key} to={t.to} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-400">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className={`h-2 w-2 rounded-full ${AVAILABILITY[t.key].dot}`} />
              {AVAILABILITY[t.key].label}
            </div>
            <div className="mt-1 text-3xl font-bold text-slate-900">
              {(counts.get(t.key) ?? 0) + (t.key === 'pujceno' ? counts.get('po_terminu') ?? 0 : 0)}
            </div>
          </Link>
        ))}
      </div>

      {overdue.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <b>Po termínu vrácení:</b> {overdue.map((m) => machineTitle(m)).join(', ')}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={`Rozpracovaný servis (${openServices.length})`}
          actions={
            <Link to="/servis" className="text-sm text-brand-700 hover:underline">
              Vše <ArrowRight className="inline h-3.5 w-3.5" />
            </Link>
          }
        >
          {openServices.length === 0 ? (
            <Empty icon={<Wrench className="h-7 w-7" />} title="Žádné otevřené zakázky" />
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {openServices.slice(0, 8).map((s) => {
                const m = f.machineById.get(s.machine_id);
                return (
                  <li key={s.id}>
                    <Link to={`/servis/${s.id}`} className="flex items-center gap-3 py-2 hover:bg-slate-50">
                      <CoverImage path={m && f.coverPath(m)} className="h-10 w-14 shrink-0 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m ? machineTitle(m) : '—'}</div>
                        <div className="truncate text-xs text-slate-500">
                          {s.number} · {s.customer_name || 'vlastní stroj'} · přijato {fmtDate(s.received_at)}
                        </div>
                      </div>
                      <Badge className={SERVICE_STATUS[s.status].color}>{SERVICE_STATUS[s.status].label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Půjčovna – nejbližších 7 dní"
          actions={
            <Link to="/pujcovna?tab=vytizeni" className="text-sm text-brand-700 hover:underline">
              Vytížení <ArrowRight className="inline h-3.5 w-3.5" />
            </Link>
          }
        >
          {upcoming.length === 0 ? (
            <Empty icon={<Truck className="h-7 w-7" />} title="Žádné výdeje ani vrácení" />
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {upcoming.slice(0, 8).map((b) => {
                const m = f.machineById.get(b.machine_id);
                const isReturn = b.type === 'pronajem' && b.start_date < t;
                return (
                  <li key={b.id}>
                    <Link to={`/stroje/${b.machine_id}?tab=pujcovna`} className="flex items-center gap-3 py-2 hover:bg-slate-50">
                      <div className="w-16 shrink-0 text-center">
                        <div className="text-xs text-slate-500">{isReturn ? 'Vrácení' : 'Výdej'}</div>
                        <div className="text-sm font-semibold">{fmtDate(isReturn ? b.end_date : b.start_date).replace(/ \d{4}$/, '')}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m ? machineTitle(m) : '—'}</div>
                        <div className="truncate text-xs text-slate-500">{b.customer_company || b.customer_name}</div>
                      </div>
                      <Badge className={BOOKING_TYPE[b.type].color}>{BOOKING_TYPE[b.type].label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
