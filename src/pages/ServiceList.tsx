import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Wrench } from 'lucide-react';
import { useFleet } from '../lib/fleet';
import { SERVICE_FLOW, SERVICE_STATUS, isServiceOpen } from '../lib/domain';
import type { ServiceStatus } from '../lib/types';
import { Badge, Empty, Input, PageHeader, Spinner, Tabs } from '../components/ui';
import { CoverImage } from '../components/Media';
import { cls, fmtDate, machineTitle } from '../lib/util';

type View = 'otevrene' | 'hotove' | 'vse';

export function ServiceList() {
  const f = useFleet();
  const [view, setView] = useState<View>('otevrene');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return f.services
      .filter((s) => (view === 'otevrene' ? isServiceOpen(s.status) : view === 'hotove' ? !isServiceOpen(s.status) : true))
      .filter((s) => {
        if (!n) return true;
        const m = f.machineById.get(s.machine_id);
        return [s.number, s.customer_name, s.fault_description, s.technician, m && machineTitle(m), m?.serial_number]
          .join(' ')
          .toLowerCase()
          .includes(n);
      })
      .sort((a, b) => b.received_at.localeCompare(a.received_at));
  }, [f.services, f.machineById, view, q]);

  if (f.loading) return <Spinner />;

  const counts = new Map<ServiceStatus, number>();
  f.services.forEach((s) => counts.set(s.status, (counts.get(s.status) ?? 0) + 1));

  return (
    <>
      <PageHeader
        title="Servis"
        subtitle="Příjem strojů, průběh oprav, pracovní listy a náhradní díly"
        actions={
          <Link to="/servis/novy" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-brand-400">
            <Plus className="h-4 w-4" /> Příjem stroje
          </Link>
        }
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {SERVICE_FLOW.slice(0, 5).map((s) => (
          <div key={s} className="min-w-[120px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-xs text-slate-500">{SERVICE_STATUS[s].label}</div>
            <div className="text-2xl font-bold">{counts.get(s) ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <Tabs
          tabs={[
            { id: 'otevrene', label: 'Rozpracované' },
            { id: 'hotove', label: 'Hotové / předané' },
            { id: 'vse', label: 'Vše' },
          ]}
          value={view}
          onChange={setView}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-9" placeholder="Hledat zakázku…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {list.length === 0 ? (
        <Empty icon={<Wrench className="h-8 w-8" />} title="Žádné zakázky" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => {
            const m = f.machineById.get(s.machine_id);
            const late = s.estimated_completion && isServiceOpen(s.status) && s.estimated_completion < new Date().toISOString().slice(0, 10);
            return (
              <Link key={s.id} to={`/servis/${s.id}`} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-brand-400">
                <CoverImage path={m && f.coverPath(m)} className="h-20 w-24 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-500">{s.number}</span>
                    <Badge className={SERVICE_STATUS[s.status].color}>{SERVICE_STATUS[s.status].label}</Badge>
                  </div>
                  <div className="truncate font-semibold text-slate-900">{m ? machineTitle(m) : '—'}</div>
                  <div className="truncate text-xs text-slate-600">{s.customer_name || 'Vlastní stroj'}</div>
                  <div className="truncate text-xs text-slate-500">{s.fault_description}</div>
                  <div className={cls('mt-1 text-xs', late ? 'font-semibold text-rose-600' : 'text-slate-500')}>
                    Přijato {fmtDate(s.received_at)}
                    {s.estimated_completion && ` · termín ${fmtDate(s.estimated_completion)}`}
                    {s.technician && ` · ${s.technician}`}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
