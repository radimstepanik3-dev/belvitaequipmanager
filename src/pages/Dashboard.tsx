import { Link } from 'react-router-dom';
import { Plus, Wrench, AlertTriangle, ArrowRight, Users, ShoppingCart, Hourglass, Phone, Tag, CalendarRange } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { useFleet } from '../lib/fleet';
import { BOOKING_TYPE, SERVICE_STATUS, isServiceOpen } from '../lib/domain';
import { LEAD_STATUS, PURCHASE_STATUS } from '../lib/trade';
import { Badge, Card, Empty, PageHeader, Spinner } from '../components/ui';
import { CoverImage } from '../components/Media';
import { Kpi } from './Sales';
import { cls, fmtDate, machineTitle, money, plural, today } from '../lib/util';

export function Dashboard() {
  const f = useFleet();
  if (f.loading) return <Spinner />;
  const t = today();
  const year = t.slice(0, 4);
  const s = f.settings;

  // ---------- prodej ----------
  const forSale = f.machines.filter((m) => m.for_sale && m.ownership === 'vlastni' && m.lifecycle === 'aktivni');
  const askValue = forSale.reduce((a, m) => a + (m.sale_price ?? 0), 0);
  const expProfit = forSale.reduce((a, m) => a + (f.margin(m)?.abs ?? 0), 0);
  const soldYear = f.machines.filter((m) => m.lifecycle === 'prodano' && (m.sold_at ?? '').startsWith(year));
  const revenue = soldYear.reduce((a, m) => a + (m.sold_price ?? 0), 0);
  const profit = soldYear.reduce((a, m) => a + (f.margin(m)?.abs ?? 0), 0);
  const openLeads = f.leads.filter((l) => LEAD_STATUS[l.status].open);
  const dueLeads = openLeads.filter((l) => l.next_contact && l.next_contact <= t).sort((a, b) => (a.next_contact ?? '').localeCompare(b.next_contact ?? ''));
  const aging = forSale
    .map((m) => ({ m, d: f.days(m) }))
    .filter((x) => x.d > s.stock_warn_days)
    .sort((a, b) => b.d - a.d);
  const noPrice = forSale.filter((m) => !m.sale_price);

  // ---------- nákup ----------
  const buying = f.machines.filter((m) => m.lifecycle === 'nakup');
  const inTransit = buying.filter((m) => ['koupeno', 'preprava'].includes(f.purchases.get(m.id)?.status ?? ''));

  // ---------- servis a půjčovna ----------
  const openServices = f.services.filter((x) => isServiceOpen(x.status)).sort((a, b) => a.received_at.localeCompare(b.received_at));
  const in7 = format(addDays(new Date(), 7), 'yyyy-MM-dd');
  const upcoming = f.bookings
    .filter((b) => b.status === 'aktivni' && b.type !== 'rezervace_prodej' && ((b.start_date >= t && b.start_date <= in7) || (b.type === 'pronajem' && b.end_date && b.end_date <= in7)))
    .sort((a, b) => (a.end_date ?? a.start_date).localeCompare(b.end_date ?? b.start_date));
  const overdue = f.machines.filter((m) => f.availability.get(m.id)?.key === 'po_terminu');

  return (
    <>
      <PageHeader
        title="Přehled"
        subtitle={`${plural(forSale.length, 'stroj', 'stroje', 'strojů')} na prodej · ${plural(openLeads.length, 'otevřený zájemce', 'otevření zájemci', 'otevřených zájemců')} · ${buying.length} v nákupu`}
        actions={
          <>
            <Link to="/stroje/novy" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-brand-400">
              <Plus className="h-4 w-4" /> Stroj na prodej
            </Link>
            <Link to="/stroje/novy?nakup=1" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm hover:bg-slate-50">
              <ShoppingCart className="h-4 w-4" /> Nový nákup
            </Link>
            <Link to="/prodej?tab=zajemci" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm hover:bg-slate-50">
              <Users className="h-4 w-4" /> Zájemci
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Na prodej" value={String(forSale.length)} sub={`v hodnotě ${money(askValue)}`} to="/prodej" />
        <Kpi label="Očekávaný zisk ze skladu" value={money(expProfit)} tone="good" sub={noPrice.length ? `${noPrice.length} strojů bez ceny` : undefined} to="/prodej" />
        <Kpi label={`Prodáno ${year}`} value={String(soldYear.length)} sub={`tržby ${money(revenue)}`} to="/prodej?tab=prodane" />
        <Kpi label={`Zisk ${year}`} value={money(profit)} tone={profit < 0 ? 'bad' : 'good'} to="/prodej?tab=prodane" />
      </div>

      {overdue.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <b>Půjčené stroje po termínu vrácení:</b> {overdue.map((m) => machineTitle(m)).join(', ')}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={<span className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-rose-600" /> Komu se ozvat ({dueLeads.length})</span>}
          actions={<More to="/prodej?tab=zajemci" />}
        >
          {dueLeads.length === 0 ? (
            <Empty icon={<Users className="h-7 w-7" />} title="Dnes nikoho nečeká telefonát" />
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {dueLeads.slice(0, 7).map((l) => {
                const m = l.machine_id ? f.machineById.get(l.machine_id) : null;
                return (
                  <li key={l.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{l.company || l.customer_name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {m ? machineTitle(m) : `hledá: ${l.wanted}`} · {LEAD_STATUS[l.status].label}
                        {l.next_contact && l.next_contact < t && <span className="font-semibold text-rose-600"> · od {fmtDate(l.next_contact)}</span>}
                      </div>
                    </div>
                    {l.phone && (
                      <a href={`tel:${l.phone.replace(/\s/g, '')}`} className="rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-500" title={l.phone}>
                        <Phone className="h-4 w-4" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-1.5"><Hourglass className="h-4 w-4 text-amber-600" /> Dlouho skladem (&gt; {s.stock_warn_days} dní)</span>} actions={<More to="/prodej" />}>
          {aging.length === 0 ? (
            <Empty icon={<Tag className="h-7 w-7" />} title="Žádný stroj nestojí příliš dlouho" />
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {aging.slice(0, 6).map(({ m, d }) => {
                const mg = f.margin(m);
                return (
                  <li key={m.id}>
                    <Link to={`/stroje/${m.id}?tab=prodej`} className="flex items-center gap-3 py-2 hover:bg-slate-50">
                      <CoverImage path={f.coverPath(m)} className="h-10 w-14 shrink-0 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{machineTitle(m)}</div>
                        <div className="truncate text-xs text-slate-500">
                          {money(m.sale_price)} {mg && `· marže ${mg.pct.toFixed(0)} %`}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-rose-700">{d} dní</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-1.5"><ShoppingCart className="h-4 w-4 text-teal-600" /> Nákup a cesta do ČR ({buying.length})</span>} actions={<More to="/nakup" />}>
          {buying.length === 0 ? (
            <Empty icon={<ShoppingCart className="h-7 w-7" />} title="Žádný rozpracovaný nákup" />
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {[...inTransit, ...buying.filter((m) => !inTransit.includes(m))].slice(0, 6).map((m) => {
                const p = f.purchases.get(m.id);
                return (
                  <li key={m.id}>
                    <Link to={`/stroje/${m.id}?tab=nakup`} className="flex items-center gap-3 py-2 hover:bg-slate-50">
                      <CoverImage path={f.coverPath(m)} className="h-10 w-14 shrink-0 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{machineTitle(m)}</div>
                        <div className="truncate text-xs text-slate-500">
                          {p?.expected_arrival ? `příjezd ${fmtDate(p.expected_arrival)}` : p?.seller_name || '—'}
                        </div>
                      </div>
                      {p && <Badge className={PURCHASE_STATUS[p.status].color}>{PURCHASE_STATUS[p.status].label.replace(' – čeká na odvoz', '')}</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-1.5"><Wrench className="h-4 w-4" /> Servis a příprava ({openServices.length})</span>} actions={<More to="/servis" />}>
          {openServices.length === 0 ? (
            <Empty icon={<Wrench className="h-7 w-7" />} title="Žádné otevřené zakázky" />
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {openServices.slice(0, 5).map((x) => {
                const m = f.machineById.get(x.machine_id);
                return (
                  <li key={x.id}>
                    <Link to={`/servis/${x.id}`} className="flex items-center gap-3 py-2 hover:bg-slate-50">
                      <CoverImage path={m && f.coverPath(m)} className="h-10 w-14 shrink-0 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m ? machineTitle(m) : '—'}</div>
                        <div className="truncate text-xs text-slate-500">
                          {x.number} · {x.customer_name || 'příprava vlastního stroje'}
                        </div>
                      </div>
                      <Badge className={SERVICE_STATUS[x.status].color}>{SERVICE_STATUS[x.status].label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {upcoming.length > 0 && (
          <Card
            className="lg:col-span-2"
            title={<span className="flex items-center gap-1.5"><CalendarRange className="h-4 w-4" /> Půjčovna – nejbližších 7 dní</span>}
            actions={<More to="/pujcovna?tab=vytizeni" />}
          >
            <ul className="-my-2 grid divide-y divide-slate-100 lg:grid-cols-2 lg:divide-y-0">
              {upcoming.slice(0, 6).map((b) => {
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
          </Card>
        )}
      </div>
    </>
  );
}

const More = ({ to }: { to: string }) => (
  <Link to={to} className={cls('text-sm text-brand-700 hover:underline')}>
    Vše <ArrowRight className="inline h-3.5 w-3.5" />
  </Link>
);
