import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Truck, LayoutGrid, List } from 'lucide-react';
import { useFleet } from '../lib/fleet';
import { AVAILABILITY, type AvailabilityKey } from '../lib/domain';
import { Badge, Empty, Input, PageHeader, Select, Spinner } from '../components/ui';
import { AvailabilityBadge } from '../components/MachineStatus';
import { CoverImage } from '../components/Media';
import { cls, machineTitle, money, number } from '../lib/util';

type Purpose = '' | 'prodej' | 'pujcovna' | 'zakaznik' | 'nakup' | 'archiv';

export function Machines() {
  const f = useFleet();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('sp.view') as 'grid' | 'list') || 'grid');
  const stav = (params.get('stav') ?? '') as AvailabilityKey | '';
  const cat = params.get('kat') ?? '';
  const purpose = (params.get('ucel') ?? '') as Purpose;

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const categories = useMemo(() => [...new Set(f.machines.map((m) => m.category).filter(Boolean))].sort(), [f.machines]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return f.machines
      .filter((m) => {
        if (purpose === 'archiv') {
          if (m.lifecycle !== 'prodano' && m.lifecycle !== 'vyrazeno') return false;
        } else if (purpose === 'nakup') {
          if (m.lifecycle !== 'nakup') return false;
        } else if (m.lifecycle !== 'aktivni' && stav !== 'prodano') return false;
        if (purpose === 'prodej' && !m.for_sale) return false;
        if (purpose === 'pujcovna' && !m.for_rent) return false;
        if (purpose === 'zakaznik' && m.ownership !== 'zakaznik') return false;
        if (!purpose && m.ownership === 'zakaznik' && !stav) return false; // stroje zákazníků jen ve filtru
        if (cat && m.category !== cat) return false;
        if (stav) {
          const k = f.availability.get(m.id)?.key;
          if (stav === 'pujceno' ? k !== 'pujceno' && k !== 'po_terminu' : k !== stav) return false;
        }
        if (needle) {
          const hay = [m.name, m.brand, m.model, m.serial_number, m.category, m.location, m.customer_name, m.year].join(' ').toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => machineTitle(a).localeCompare(machineTitle(b), 'cs'));
  }, [f.machines, f.availability, q, stav, cat, purpose]);

  if (f.loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Stroje"
        subtitle={`${list.length} z ${f.machines.length}`}
        actions={
          <Link to="/stroje/novy" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-brand-400">
            <Plus className="h-4 w-4" /> Nový stroj
          </Link>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Hledat značku, typ, výr. číslo…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={purpose} onChange={(e) => setParam('ucel', e.target.value)}>
          <option value="">Všechny vlastní</option>
          <option value="prodej">Na prodej</option>
          <option value="pujcovna">V půjčovně</option>
          <option value="nakup">V nákupu / na cestě</option>
          <option value="zakaznik">Stroje zákazníků</option>
          <option value="archiv">Prodané / vyřazené</option>
        </Select>
        <Select value={stav} onChange={(e) => setParam('stav', e.target.value)}>
          <option value="">Jakýkoli stav</option>
          {(Object.keys(AVAILABILITY) as AvailabilityKey[]).map((k) => (
            <option key={k} value={k}>
              {AVAILABILITY[k].label}
            </option>
          ))}
        </Select>
        <Select value={cat} onChange={(e) => setParam('kat', e.target.value)}>
          <option value="">Všechny kategorie</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <div className="hidden gap-1 rounded-lg border border-slate-300 bg-white p-1 lg:flex">
          {(['grid', 'list'] as const).map((v) => (
            <button
              key={v}
              onClick={() => (setView(v), localStorage.setItem('sp.view', v))}
              className={cls('rounded-md p-1.5', view === v ? 'bg-slate-200' : 'text-slate-500')}
              title={v === 'grid' ? 'Dlaždice' : 'Tabulka'}
            >
              {v === 'grid' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <Empty icon={<Truck className="h-8 w-8" />} title="Žádné stroje neodpovídají filtru">
          <Link to="/stroje/novy" className="text-brand-700 underline">
            Přidat stroj
          </Link>
        </Empty>
      ) : view === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((m) => (
            <Link key={m.id} to={`/stroje/${m.id}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-400 hover:shadow">
              <CoverImage path={f.coverPath(m)} className="aspect-[4/3] w-full" />
              <div className="space-y-1.5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">{machineTitle(m)}</div>
                    <div className="truncate text-xs text-slate-500">
                      {[m.category, m.year, m.hours != null && number(m.hours, 'mth')].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
                <AvailabilityBadge a={f.availability.get(m.id)!} />
                <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
                  {m.for_sale && <Badge className="bg-slate-100 text-slate-700">Prodej {m.sale_price ? money(m.sale_price) : ''}</Badge>}
                  {m.for_rent && (
                    <Badge className="bg-slate-100 text-slate-700">
                      Půjčovna {f.rates.get(m.id)?.price_day ? `${money(f.rates.get(m.id)!.price_day)}/den` : ''}
                    </Badge>
                  )}
                  {m.ownership === 'zakaznik' && <Badge className="bg-cyan-50 text-cyan-800">{m.customer_name || 'Zákazník'}</Badge>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Stroj</th>
                <th className="px-3 py-2">Kategorie</th>
                <th className="px-3 py-2">Rok</th>
                <th className="px-3 py-2 text-right">Mth</th>
                <th className="px-3 py-2">Výr. číslo</th>
                <th className="px-3 py-2">Stav</th>
                <th className="px-3 py-2 text-right">Prodej</th>
                <th className="px-3 py-2 text-right">Den</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link to={`/stroje/${m.id}`} className="flex items-center gap-2 font-medium text-slate-900 hover:text-brand-700">
                      <CoverImage path={f.coverPath(m)} className="h-8 w-11 shrink-0 rounded" />
                      {machineTitle(m)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{m.category}</td>
                  <td className="px-3 py-2">{m.year ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{number(m.hours)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{m.serial_number || '—'}</td>
                  <td className="px-3 py-2">
                    <AvailabilityBadge a={f.availability.get(m.id)!} />
                  </td>
                  <td className="px-3 py-2 text-right">{m.for_sale ? money(m.sale_price) : '—'}</td>
                  <td className="px-3 py-2 text-right">{m.for_rent ? money(f.rates.get(m.id)?.price_day) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
