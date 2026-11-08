import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileDown, Plus, Tag, TrendingUp, Search } from 'lucide-react';
import { useFleet } from '../lib/fleet';
import { LEAD_STATUS } from '../lib/trade';
import { salesCatalogPdf } from '../lib/pdf';
import { Button, Card, Checkbox, Empty, Input, Modal, PageHeader, Select, Spinner, Tabs, useToast } from '../components/ui';
import { AvailabilityBadge } from '../components/MachineStatus';
import { CoverImage } from '../components/Media';
import { LeadList, LeadModal } from '../components/Sales';
import { cls, errorMessage, fmtDate, machineTitle, money, number, plural } from '../lib/util';
import type { Machine } from '../lib/types';

type Tab = 'nabidka' | 'zajemci' | 'prodane';
type Sort = 'days' | 'margin' | 'price' | 'name';

export function Sales() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'nabidka';
  const f = useFleet();
  const [leadOpen, setLeadOpen] = useState(false);
  if (f.loading) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Prodej strojů"
        subtitle="Nabídka, zájemci, prodeje a zisk"
        actions={
          <>
            <Button variant="primary" onClick={() => setLeadOpen(true)}>
              <Plus className="h-4 w-4" /> Zájemce / poptávka
            </Button>
            <Link to="/stroje/novy" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm hover:bg-slate-50">
              <Tag className="h-4 w-4" /> Stroj na prodej
            </Link>
          </>
        }
      />
      <Tabs
        tabs={[
          { id: 'nabidka', label: 'Nabídka' },
          { id: 'zajemci', label: `Zájemci (${f.leads.filter((l) => LEAD_STATUS[l.status].open).length})` },
          { id: 'prodane', label: 'Prodané' },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
      />
      {tab === 'nabidka' && <Offer />}
      {tab === 'zajemci' && <Leads />}
      {tab === 'prodane' && <Sold />}
      <LeadModal open={leadOpen} onClose={() => setLeadOpen(false)} />
    </>
  );
}

function Offer() {
  const f = useFleet();
  const toast = useToast();
  const [sort, setSort] = useState<Sort>('days');
  const [q, setQ] = useState('');
  const [pdfOpen, setPdfOpen] = useState(false);
  const [withVat, setWithVat] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const rows = f.machines.filter(
      (m) =>
        m.for_sale &&
        m.ownership === 'vlastni' &&
        (m.lifecycle === 'aktivni' || m.lifecycle === 'nakup') &&
        (!n || [m.name, m.brand, m.model, m.category, m.year].join(' ').toLowerCase().includes(n)),
    );
    const key: Record<Sort, (m: Machine) => number | string> = {
      days: (m) => -f.days(m),
      margin: (m) => -(f.margin(m)?.pct ?? -999),
      price: (m) => -(m.sale_price ?? 0),
      name: (m) => machineTitle(m),
    };
    return rows.sort((a, b) => {
      const ka = key[sort](a);
      const kb = key[sort](b);
      return typeof ka === 'string' ? ka.localeCompare(kb as string, 'cs') : (ka as number) - (kb as number);
    });
  }, [f, sort, q]);

  const sumPrice = list.reduce((a, m) => a + (m.sale_price ?? 0), 0);
  const sumCost = list.reduce((a, m) => a + f.landed(m).total, 0);
  const sumProfit = list.reduce((a, m) => a + (f.margin(m)?.abs ?? 0), 0);
  const warn = f.settings.stock_warn_days;

  const exportPdf = async () => {
    setBusy(true);
    try {
      await salesCatalogPdf(
        list.filter((m) => m.lifecycle === 'aktivni'),
        f.coverPath,
        f.settings,
        { withVat },
      );
      setPdfOpen(false);
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Strojů na prodej" value={String(list.length)} />
        <Kpi label="Nabídková hodnota" value={money(sumPrice)} />
        <Kpi label="Pořizovací náklady" value={money(sumCost)} />
        <Kpi label="Očekávaný zisk" value={money(sumProfit)} tone="good" />
      </div>
      <Card
        title="Stroje v nabídce"
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
              <Input className="!py-1 pl-8" placeholder="Hledat…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="!w-auto !py-1">
              <option value="days">Nejdéle skladem</option>
              <option value="margin">Nejvyšší marže</option>
              <option value="price">Nejvyšší cena</option>
              <option value="name">Podle názvu</option>
            </Select>
            <Button size="sm" onClick={() => setPdfOpen(true)} disabled={!list.length}>
              <FileDown className="h-4 w-4" /> Katalog PDF
            </Button>
          </>
        }
      >
        {list.length === 0 ? (
          <Empty icon={<Tag className="h-8 w-8" />} title="Žádný stroj na prodej">
            U stroje zaškrtněte „Nabízíme k prodeji“.
          </Empty>
        ) : (
          <ul className="-my-2 divide-y divide-slate-100">
            {list.map((m) => {
              const mg = f.margin(m);
              const L = f.landed(m);
              const days = f.days(m);
              const leads = f.leads.filter((l) => l.machine_id === m.id && LEAD_STATUS[l.status].open).length;
              return (
                <li key={m.id}>
                  <Link to={`/stroje/${m.id}?tab=prodej`} className="flex flex-col gap-3 py-3 hover:bg-slate-50 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <CoverImage path={f.coverPath(m)} className="h-16 w-20 shrink-0 rounded-lg" />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">{machineTitle(m)}</div>
                        <div className="truncate text-xs text-slate-500">{[m.category, m.year, m.hours != null && number(m.hours, 'mth')].filter(Boolean).join(' · ')}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <AvailabilityBadge a={f.availability.get(m.id)!} />
                          {leads > 0 && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">{plural(leads, 'zájemce', 'zájemci', 'zájemců')}</span>}
                          {!m.listing && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">bez inzerátu</span>}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-right text-sm sm:w-[440px]">
                      <Stat l="Cena" v={m.sale_price ? money(m.sale_price) : '—'} b />
                      <Stat l="Náklady" v={L.total ? money(L.total) : '—'} />
                      <Stat l="Marže" v={mg ? `${mg.pct.toFixed(0)} %` : '—'} tone={mg ? (mg.abs < 0 ? 'bad' : 'good') : undefined} />
                      <Stat l="Skladem" v={`${days} d`} tone={days > warn ? 'bad' : undefined} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Modal
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        title="Katalog strojů na prodej (PDF)"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPdfOpen(false)}>
              Zrušit
            </Button>
            <Button variant="primary" onClick={exportPdf} busy={busy}>
              <FileDown className="h-4 w-4" /> Stáhnout
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">Katalog obsahuje stroje skladem z aktuálního výběru, s hlavní fotkou, parametry a cenou – vhodný k rozeslání zákazníkům.</p>
        <Checkbox checked={withVat} onChange={setWithVat} label={`Ceny včetně DPH (${f.settings.vat_rate} %)`} />
      </Modal>
    </>
  );
}

function Leads() {
  const f = useFleet();
  const [filter, setFilter] = useState<'open' | 'due' | 'demand' | 'all'>('open');
  const t = new Date().toISOString().slice(0, 10);
  const list = f.leads.filter((l) => {
    if (filter === 'all') return true;
    if (!LEAD_STATUS[l.status].open) return false;
    if (filter === 'due') return !!l.next_contact && l.next_contact <= t;
    if (filter === 'demand') return !l.machine_id;
    return true;
  });
  return (
    <Card
      title="Zájemci a poptávky"
      actions={
        <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="!w-auto !py-1">
          <option value="open">Otevření</option>
          <option value="due">K akci dnes</option>
          <option value="demand">Obecné poptávky (hledají stroj)</option>
          <option value="all">Vše včetně uzavřených</option>
        </Select>
      }
    >
      <LeadList leads={list} />
    </Card>
  );
}

function Sold() {
  const f = useFleet();
  const years = [...new Set(f.machines.filter((m) => m.lifecycle === 'prodano' && m.sold_at).map((m) => m.sold_at!.slice(0, 4)))].sort().reverse();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const list = f.machines
    .filter((m) => m.lifecycle === 'prodano' && (year === 'vse' || (m.sold_at ?? '').startsWith(year)))
    .sort((a, b) => (b.sold_at ?? '').localeCompare(a.sold_at ?? ''));
  const revenue = list.reduce((a, m) => a + (m.sold_price ?? 0), 0);
  const profit = list.reduce((a, m) => a + (f.margin(m)?.abs ?? 0), 0);
  const avgDays = list.length ? Math.round(list.reduce((a, m) => a + f.days(m), 0) / list.length) : 0;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Prodáno strojů" value={String(list.length)} />
        <Kpi label="Tržby bez DPH" value={money(revenue)} />
        <Kpi label="Zisk" value={money(profit)} tone={profit < 0 ? 'bad' : 'good'} />
        <Kpi label="Průměrná doba prodeje" value={`${avgDays} dní`} />
      </div>
      <Card
        title={<span className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4" /> Prodané stroje</span>}
        actions={
          <Select value={year} onChange={(e) => setYear(e.target.value)} className="!w-auto !py-1">
            {[...new Set([String(new Date().getFullYear()), ...years])].map((y) => (
              <option key={y}>{y}</option>
            ))}
            <option value="vse">Vše</option>
          </Select>
        }
      >
        {list.length === 0 ? (
          <Empty title="V tomto období nic prodáno" />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Stroj</th>
                  <th className="px-2 py-2">Datum</th>
                  <th className="px-2 py-2">Kupec</th>
                  <th className="px-2 py-2 text-right">Cena</th>
                  <th className="px-2 py-2 text-right">Náklady</th>
                  <th className="px-2 py-2 text-right">Zisk</th>
                  <th className="px-4 py-2 text-right">Dní</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((m) => {
                  const mg = f.margin(m);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <Link to={`/stroje/${m.id}?tab=prodej`} className="font-medium hover:text-brand-700">
                          {machineTitle(m)}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">{fmtDate(m.sold_at)}</td>
                      <td className="px-2 py-2">{m.buyer_name || '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">{money(m.sold_price)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{money(f.landed(m).total)}</td>
                      <td className={cls('whitespace-nowrap px-2 py-2 text-right font-semibold', mg && mg.abs < 0 ? 'text-rose-700' : 'text-emerald-700')}>
                        {mg ? `${money(mg.abs)} (${mg.pct.toFixed(0)} %)` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">{f.days(m)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export function Kpi({ label, value, tone, sub, to }: { label: string; value: string; tone?: 'good' | 'bad'; sub?: string; to?: string }) {
  const inner = (
    <>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={cls('mt-1 truncate text-xl font-bold sm:text-2xl', tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-slate-900')}>{value}</div>
      {sub && <div className="truncate text-xs text-slate-500">{sub}</div>}
    </>
  );
  const cl = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';
  return to ? (
    <Link to={to} className={cls(cl, 'transition hover:border-brand-400')}>
      {inner}
    </Link>
  ) : (
    <div className={cl}>{inner}</div>
  );
}

const Stat = ({ l, v, b, tone }: { l: string; v: string; b?: boolean; tone?: 'good' | 'bad' }) => (
  <div>
    <div className="text-[11px] text-slate-500">{l}</div>
    <div className={cls('whitespace-nowrap', b && 'font-semibold', tone === 'good' && 'text-emerald-700', tone === 'bad' && 'font-semibold text-rose-700')}>{v}</div>
  </div>
);
