import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { addDays, differenceInCalendarDays, format, isWeekend, parseISO, startOfDay } from 'date-fns';
import { cs } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, FileDown, Pencil, Plus, CalendarRange } from 'lucide-react';
import { useFleet } from '../lib/fleet';
import { useSettings } from '../lib/hooks';
import { BOOKING_TYPE, rentedDays } from '../lib/domain';
import { priceListPdf, type PriceListOptions } from '../lib/pdf';
import type { Machine } from '../lib/types';
import { Button, Card, Checkbox, Empty, Modal, PageHeader, Select, Spinner, Tabs, useToast } from '../components/ui';
import { AvailabilityBadge } from '../components/MachineStatus';
import { BookingList, BookingModal, RateEditor } from '../components/Rental';
import { CoverImage } from '../components/Media';
import { cls, errorMessage, isoDay, machineTitle, money } from '../lib/util';

type Tab = 'cenik' | 'rezervace' | 'vytizeni';

export function Rental() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'cenik';
  const f = useFleet();
  const [newOpen, setNewOpen] = useState(params.get('nova') === '1');

  if (f.loading) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Půjčovna"
        subtitle="Ceník, výpůjčky, rezervace a vytížení strojů"
        actions={
          <Button variant="primary" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> Půjčit / rezervovat
          </Button>
        }
      />
      <Tabs
        tabs={[
          { id: 'cenik', label: 'Ceník' },
          { id: 'rezervace', label: 'Výpůjčky a rezervace' },
          { id: 'vytizeni', label: 'Vytížení' },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
      />
      {tab === 'cenik' && <PriceList />}
      {tab === 'rezervace' && <Bookings />}
      {tab === 'vytizeni' && <Occupancy />}
      <BookingModal
        open={newOpen}
        onClose={() => {
          setNewOpen(false);
          if (params.get('nova')) setParams({ tab }, { replace: true });
        }}
      />
    </>
  );
}

// ============================================================
//  CENÍK
// ============================================================

function PriceList() {
  const f = useFleet();
  const { settings } = useSettings();
  const toast = useToast();
  const [edit, setEdit] = useState<Machine | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opt, setOpt] = useState<PriceListOptions>({
    withVat: false,
    withPhotos: true,
    columns: { hour: false, day: true, weekend: true, week: true, month: true, deposit: true, operator: false },
  });

  const rentMachines = f.machines
    .filter((m) => m.for_rent && m.lifecycle === 'aktivni' && m.ownership === 'vlastni')
    .sort((a, b) => (a.category || '').localeCompare(b.category || '', 'cs') || machineTitle(a).localeCompare(machineTitle(b), 'cs'));
  const inPdf = rentMachines.filter((m) => f.rates.get(m.id)?.in_pricelist !== false && f.rates.get(m.id)?.price_day);

  const exportPdf = async () => {
    setBusy(true);
    try {
      await priceListPdf(inPdf, f.rates, f.mediaById, settings, opt);
      setPdfOpen(false);
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const colLabels: Record<keyof PriceListOptions['columns'], string> = {
    hour: 'Hodina',
    day: 'Den',
    weekend: 'Víkend',
    week: 'Týden',
    month: 'Měsíc',
    deposit: 'Kauce',
    operator: 'Obsluha / hod',
  };

  return (
    <Card
      title={`Stroje v půjčovně (${rentMachines.length})`}
      actions={
        <Button variant="primary" size="sm" onClick={() => setPdfOpen(true)} disabled={!inPdf.length}>
          <FileDown className="h-4 w-4" /> Ceník PDF
        </Button>
      }
    >
      {rentMachines.length === 0 ? (
        <Empty icon={<CalendarRange className="h-8 w-8" />} title="Žádný stroj není zařazen v půjčovně">
          V kartě stroje zaškrtněte „Zařazen v půjčovně“.
        </Empty>
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Stroj</th>
                <th className="px-2 py-2">Stav</th>
                <th className="px-2 py-2 text-right">Hodina</th>
                <th className="px-2 py-2 text-right">Den</th>
                <th className="px-2 py-2 text-right">Víkend</th>
                <th className="px-2 py-2 text-right">Týden</th>
                <th className="px-2 py-2 text-right">Měsíc</th>
                <th className="px-2 py-2 text-right">Kauce</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rentMachines.map((m) => {
                const r = f.rates.get(m.id);
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link to={`/stroje/${m.id}?tab=pujcovna`} className="flex items-center gap-2 font-medium hover:text-brand-700">
                        <CoverImage path={f.coverPath(m)} className="h-9 w-12 shrink-0 rounded" />
                        <span>
                          {machineTitle(m)}
                          <span className="block text-xs font-normal text-slate-500">
                            {m.category}
                            {r?.in_pricelist === false && ' · skryto v PDF'}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <AvailabilityBadge a={f.availability.get(m.id)!} />
                    </td>
                    {(['price_hour', 'price_day', 'price_weekend', 'price_week', 'price_month', 'deposit'] as const).map((k) => (
                      <td key={k} className={cls('whitespace-nowrap px-2 py-2 text-right', k === 'price_day' && 'font-semibold')}>
                        {money(r?.[k])}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEdit(m)}>
                        <Pencil className="h-4 w-4" /> Upravit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Ceny bez DPH. Koeficienty cenotvorby, DPH, hlavičku a podmínky ceníku upravíte v Nastavení.</p>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Ceník – ${machineTitle(edit)}` : ''} wide>
        {edit && <RateEditor machine={edit} onSaved={() => setEdit(null)} />}
      </Modal>

      <Modal
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        title="Export ceníku do PDF"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPdfOpen(false)}>
              Zrušit
            </Button>
            <Button variant="primary" onClick={exportPdf} busy={busy}>
              <FileDown className="h-4 w-4" /> Stáhnout PDF
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Do ceníku se zařadí {inPdf.length} strojů s vyplněnou denní cenou.</p>
          <Checkbox checked={opt.withVat} onChange={(v) => setOpt({ ...opt, withVat: v })} label={`Ceny včetně DPH (${settings.vat_rate} %)`} />
          <Checkbox checked={opt.withPhotos} onChange={(v) => setOpt({ ...opt, withPhotos: v })} label="S fotkami strojů" />
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">Sloupce</div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(colLabels) as (keyof PriceListOptions['columns'])[]).map((k) => (
                <Checkbox key={k} checked={opt.columns[k]} onChange={(v) => setOpt({ ...opt, columns: { ...opt.columns, [k]: v } })} label={colLabels[k]} />
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

// ============================================================
//  VÝPŮJČKY A REZERVACE
// ============================================================

function Bookings() {
  const f = useFleet();
  const [filter, setFilter] = useState<'aktivni' | 'vse'>('aktivni');
  const list = f.bookings.filter((b) => (filter === 'aktivni' ? b.status === 'aktivni' : true));
  return (
    <Card
      title="Výpůjčky a rezervace"
      actions={
        <Select value={filter} onChange={(e) => setFilter(e.target.value as 'aktivni' | 'vse')} className="!py-1">
          <option value="aktivni">Aktivní</option>
          <option value="vse">Vše včetně historie</option>
        </Select>
      }
    >
      <BookingList bookings={list} />
    </Card>
  );
}

// ============================================================
//  VYTÍŽENÍ – časová osa
// ============================================================

function Occupancy() {
  const f = useFleet();
  const [span, setSpan] = useState(31);
  const [start, setStart] = useState(() => addDays(startOfDay(new Date()), -7));
  const [group, setGroup] = useState<'pujcovna' | 'vse'>('pujcovna');
  const days = useMemo(() => Array.from({ length: span }, (_, i) => addDays(start, i)), [start, span]);
  const end = days[days.length - 1];
  const todayIdx = differenceInCalendarDays(startOfDay(new Date()), start);

  const machines = f.machines
    .filter((m) => m.ownership === 'vlastni' && m.lifecycle === 'aktivni' && (group === 'vse' || m.for_rent))
    .sort((a, b) => machineTitle(a).localeCompare(machineTitle(b), 'cs'));

  const util = (id: string) => Math.round((rentedDays(id, f.bookings, start, end) / span) * 100);
  const avg = machines.length ? Math.round(machines.reduce((a, m) => a + util(m.id), 0) / machines.length) : 0;
  const colW = span > 45 ? 14 : 26;

  return (
    <Card
      title={`Vytížení ${format(start, 'd. M.', { locale: cs })} – ${format(end, 'd. M. yyyy', { locale: cs })} · průměr ${avg} %`}
      actions={
        <>
          <Select value={group} onChange={(e) => setGroup(e.target.value as 'pujcovna' | 'vse')} className="!w-auto !py-1">
            <option value="pujcovna">Stroje v půjčovně</option>
            <option value="vse">Všechny vlastní stroje</option>
          </Select>
          <Select value={span} onChange={(e) => setSpan(Number(e.target.value))} className="!w-auto !py-1">
            <option value={14}>14 dní</option>
            <option value={31}>31 dní</option>
            <option value={62}>2 měsíce</option>
            <option value={92}>3 měsíce</option>
          </Select>
          <div className="flex">
            <Button size="sm" variant="ghost" onClick={() => setStart(addDays(start, -Math.round(span / 2)))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStart(addDays(startOfDay(new Date()), -7))}>
              Dnes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStart(addDays(start, Math.round(span / 2)))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      }
    >
      {machines.length === 0 ? (
        <Empty title="Žádné stroje" />
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <div style={{ minWidth: 220 + 60 + colW * span }} className="px-4">
            {/* hlavička dnů */}
            <div className="flex border-b border-slate-200 text-[10px] text-slate-500">
              <div className="sticky left-0 z-10 w-[220px] shrink-0 bg-white" />
              <div className="w-[60px] shrink-0 text-right pr-2 font-medium">Vytížení</div>
              {days.map((d, i) => (
                <div
                  key={i}
                  style={{ width: colW }}
                  className={cls('shrink-0 py-1 text-center', isWeekend(d) && 'bg-slate-50', i === todayIdx && 'bg-brand-100 font-bold text-slate-900')}
                >
                  {colW > 20 || d.getDate() % 2 === 1 ? d.getDate() : ''}
                  {colW > 20 && <div>{format(d, 'EEEEEE', { locale: cs })}</div>}
                </div>
              ))}
            </div>
            {machines.map((m) => {
              const bs = f.bookings.filter(
                (b) => b.machine_id === m.id && b.status !== 'zruseno' && b.type !== 'prodej' && b.start_date <= isoDay(end) && (b.end_date ?? '9999') >= isoDay(start),
              );
              const u = util(m.id);
              return (
                <div key={m.id} className="flex items-center border-b border-slate-100">
                  <Link to={`/stroje/${m.id}?tab=pujcovna`} className="sticky left-0 z-10 w-[220px] shrink-0 truncate bg-white py-2 pr-2 text-sm font-medium hover:text-brand-700">
                    {machineTitle(m)}
                  </Link>
                  <div className="w-[60px] shrink-0 pr-2 text-right text-xs">
                    <span className={cls('font-semibold', u >= 70 ? 'text-emerald-700' : u >= 30 ? 'text-amber-700' : 'text-slate-500')}>{u} %</span>
                  </div>
                  <div className="relative h-9 shrink-0" style={{ width: colW * span }}>
                    {days.map((d, i) => (
                      <div key={i} style={{ left: i * colW, width: colW }} className={cls('absolute inset-y-0', isWeekend(d) && 'bg-slate-50', i === todayIdx && 'bg-brand-50')} />
                    ))}
                    {bs.map((b) => {
                      const s = Math.max(0, differenceInCalendarDays(parseISO(b.start_date), start));
                      const e = Math.min(span - 1, differenceInCalendarDays(parseISO(b.end_date ?? isoDay(end)), start));
                      const done = b.status === 'dokonceno';
                      return (
                        <div
                          key={b.id}
                          title={`${BOOKING_TYPE[b.type].label}: ${b.customer_company || b.customer_name} (${b.start_date} – ${b.end_date ?? '…'})${b.price_total ? ' · ' + money(b.price_total) : ''}`}
                          style={{ left: s * colW + 1, width: (e - s + 1) * colW - 2 }}
                          className={cls('absolute inset-y-1.5 truncate rounded px-1.5 text-[11px] leading-6 text-white', BOOKING_TYPE[b.type].bar, done && 'opacity-50')}
                        >
                          {b.customer_company || b.customer_name}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
        {(['pronajem', 'rezervace_pronajem', 'rezervace_prodej'] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cls('h-3 w-3 rounded', BOOKING_TYPE[t].bar)} /> {BOOKING_TYPE[t].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-rose-500 opacity-50" /> Ukončený pronájem
        </span>
      </div>
    </Card>
  );
}
