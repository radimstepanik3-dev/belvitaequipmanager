import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Plus, ShoppingCart } from 'lucide-react';
import { useFleet } from '../lib/fleet';
import { CHECKLIST_COUNT, COUNTRIES, LEAD_STATUS, countryByCode, purchasePriceCzk } from '../lib/trade';
import { Card, Empty, Field, PageHeader, Select, Spinner, Tabs } from '../components/ui';
import { CoverImage } from '../components/Media';
import { PurchaseStatusBadge, TransportCalculator } from '../components/Purchase';
import { LeadList } from '../components/Sales';
import { fmtDate, machineTitle, money } from '../lib/util';

type Tab = 'nakupy' | 'poptavky' | 'doprava';

export function Purchases() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'nakupy';
  const f = useFleet();
  if (f.loading) return <Spinner />;
  const demands = f.leads.filter((l) => !l.machine_id && LEAD_STATUS[l.status].open);
  return (
    <>
      <PageHeader
        title="Nákup a dovoz"
        subtitle="Vyhlédnuté stroje, rozpracované nákupy, doprava do ČR"
        actions={
          <>
            <Link to="/stroje/novy?nakup=1" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-brand-400">
              <Plus className="h-4 w-4" /> Nový nákup
            </Link>
            <Link to="/pruvodce" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm hover:bg-slate-50">
              <BookOpen className="h-4 w-4" /> Průvodce nákupem
            </Link>
          </>
        }
      />
      <Tabs
        tabs={[
          { id: 'nakupy', label: 'Rozpracované nákupy' },
          { id: 'poptavky', label: `Co zákazníci hledají (${demands.length})` },
          { id: 'doprava', label: 'Kalkulačka dopravy' },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
      />
      {tab === 'nakupy' && <Ongoing />}
      {tab === 'poptavky' && (
        <Card title="Obecné poptávky zákazníků">
          <p className="mb-3 text-sm text-slate-600">Zákazníci, kteří hledají stroj, jaký zrovna nemáte – tip, co nakoupit. Poptávky zadáte v sekci Prodej → Zájemce.</p>
          <LeadList leads={demands} emptyText="Žádné otevřené poptávky" />
        </Card>
      )}
      {tab === 'doprava' && <TransportTab />}
    </>
  );
}

function Ongoing() {
  const f = useFleet();
  const list = f.machines
    .filter((m) => m.lifecycle === 'nakup')
    .sort((a, b) => (f.purchases.get(b.id)?.updated_at ?? b.updated_at).localeCompare(f.purchases.get(a.id)?.updated_at ?? a.updated_at));
  const arrived = f.machines
    .filter((m) => {
      const p = f.purchases.get(m.id);
      return m.lifecycle !== 'nakup' && p?.status === 'dorazilo' && p.purchase_date && p.purchase_date >= new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    })
    .slice(0, 10);

  const Item = ({ id }: { id: string }) => {
    const m = f.machineById.get(id)!;
    const p = f.purchases.get(id);
    const c = p ? countryByCode(p.country) : null;
    const done = p ? Object.values(p.checklist).filter(Boolean).length : 0;
    return (
      <li>
        <Link to={`/stroje/${m.id}?tab=nakup`} className="flex flex-col gap-3 py-3 hover:bg-slate-50 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <CoverImage path={f.coverPath(m)} className="h-14 w-20 shrink-0 rounded-lg" />
            <div className="min-w-0">
              <div className="truncate font-semibold">{machineTitle(m)}</div>
              <div className="truncate text-xs text-slate-500">
                {[c?.name, p?.city, p?.seller_name].filter(Boolean).join(' · ') || 'nákupní karta nevyplněna'}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p ? <PurchaseStatusBadge status={p.status} /> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">bez nákupní karty</span>}
                {c && !c.eu && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">mimo EU</span>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right text-sm sm:w-[360px]">
            <div>
              <div className="text-[11px] text-slate-500">Cena</div>
              <div className="font-semibold">{p?.price_foreign ? `${p.price_foreign.toLocaleString('cs')} ${p.currency}` : '—'}</div>
              {p?.price_foreign && p.currency !== 'CZK' ? <div className="text-xs text-slate-500">{money(purchasePriceCzk(p))}</div> : null}
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Náklady celkem</div>
              <div>{money(f.landed(m).total)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">{p?.expected_arrival ? 'Příjezd' : 'Kontrola'}</div>
              <div>{p?.expected_arrival ? fmtDate(p.expected_arrival) : `${done}/${CHECKLIST_COUNT}`}</div>
            </div>
          </div>
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <Card title={`Rozpracované nákupy (${list.length})`}>
        {list.length === 0 ? (
          <Empty icon={<ShoppingCart className="h-8 w-8" />} title="Žádné rozpracované nákupy">
            <Link to="/stroje/novy?nakup=1" className="text-brand-700 underline">
              Založit vyhlédnutý stroj
            </Link>{' '}
            – AI ho rozpozná z fotek z inzerátu.
          </Empty>
        ) : (
          <ul className="-my-2 divide-y divide-slate-100">
            {list.map((m) => (
              <Item key={m.id} id={m.id} />
            ))}
          </ul>
        )}
      </Card>
      {arrived.length > 0 && (
        <Card title="Nedávno dorazilo (90 dní)">
          <ul className="-my-2 divide-y divide-slate-100">
            {arrived.map((m) => (
              <Item key={m.id} id={m.id} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function TransportTab() {
  const [code, setCode] = useState('DE');
  const c = countryByCode(code);
  const [km, setKm] = useState<number | null>(c.km);
  const [machineId, setMachineId] = useState('');
  const f = useFleet();
  const m = f.machineById.get(machineId);
  return (
    <Card title="Kalkulačka dopravy do ČR">
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="Odkud">
          <Select
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setKm(countryByCode(e.target.value).km || km);
            }}
          >
            {COUNTRIES.map((x) => (
              <option key={x.code} value={x.code}>
                {x.name}
                {!x.eu ? ' (mimo EU)' : ''}
                {x.km ? ` – cca ${x.km} km` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stroj (předvyplní hmotnost a rozměry)">
          <Select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">— zadám ručně —</option>
            {f.machines
              .filter((x) => x.ownership === 'vlastni' && x.lifecycle !== 'prodano')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {machineTitle(x)}
                </option>
              ))}
          </Select>
        </Field>
      </div>
      {c.note && <p className="mb-3 text-sm text-amber-800">{c.note}</p>}
      <TransportCalculator key={machineId + code} machine={m} km={km} onKm={setKm} countryExtra={c.extra} />
      <p className="mt-3 text-xs text-slate-500">
        Vzdálenosti jsou orientační (střed země → střed ČR). Pro přesnou trasu zadejte km z plánovače tras.
      </p>
    </Card>
  );
}

