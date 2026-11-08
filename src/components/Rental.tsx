import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calculator, CalendarPlus, Check, CornerDownLeft, PackageCheck, Pencil, Trash2, X } from 'lucide-react';
import { backend } from '../lib/backend';
import { useFleet } from '../lib/fleet';
import { useSettings } from '../lib/hooks';
import { BOOKING_TYPE, calcRentalPrice, findConflicts, suggestDayFromValue, suggestRates } from '../lib/domain';
import type { Booking, BookingType, Machine, RentalRate } from '../lib/types';
import { Badge, Button, Checkbox, confirmDelete, Empty, Field, Input, Modal, Select, Textarea, useToast } from './ui';
import { cls, errorMessage, fmtDate, machineTitle, money, numOrNull, today } from '../lib/util';

// ============================================================
//  Editor ceníku půjčovného pro jeden stroj (cenotvorba)
// ============================================================

const RATE_FIELDS: { key: keyof RentalRate; label: string }[] = [
  { key: 'price_hour', label: 'Hodina' },
  { key: 'price_day', label: 'Den' },
  { key: 'price_weekend', label: 'Víkend' },
  { key: 'price_week', label: 'Týden' },
  { key: 'price_month', label: 'Měsíc' },
  { key: 'deposit', label: 'Kauce' },
  { key: 'operator_hour', label: 'Obsluha / hod' },
];

export function RateEditor({ machine, onSaved }: { machine: Machine; onSaved?: () => void }) {
  const { rates } = useFleet();
  const { settings } = useSettings();
  const toast = useToast();
  const existing = rates.get(machine.id);
  const [r, setR] = useState<Partial<RentalRate>>({ in_pricelist: true, note: '', ...existing });
  const [busy, setBusy] = useState(false);
  useEffect(() => setR({ in_pricelist: true, note: '', ...existing }), [existing]);

  const fromValue = suggestDayFromValue(machine, settings);
  const vatK = 1 + settings.vat_rate / 100;

  const recalc = (day: number) => setR((x) => ({ ...x, ...suggestRates(day, settings) }));

  const save = async () => {
    setBusy(true);
    try {
      await backend.upsert('rental_rates', { ...r, id: machine.id, machine_id: machine.id });
      if (!machine.for_rent) await backend.upsert('machines', { id: machine.id, for_rent: true });
      toast('Ceník uložen');
      onSaved?.();
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RATE_FIELDS.map((f) => (
          <Field key={f.key} label={`${f.label} (Kč bez DPH)`} hint={r[f.key] ? `s DPH ${money(Math.round((r[f.key] as number) * vatK))}` : undefined}>
            <Input
              inputMode="decimal"
              value={(r[f.key] as number | null) ?? ''}
              onChange={(e) => setR((x) => ({ ...x, [f.key]: numOrNull(e.target.value) }))}
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
        <Calculator className="h-4 w-4 text-slate-500" />
        <span className="text-slate-600">Cenotvorba:</span>
        <Button size="sm" type="button" disabled={!r.price_day} onClick={() => recalc(r.price_day!)}>
          Dopočítat z denní ceny
        </Button>
        {fromValue && (
          <Button size="sm" type="button" onClick={() => recalc(fromValue)}>
            Navrhnout z hodnoty stroje ({money(fromValue)}/den)
          </Button>
        )}
        <span className="text-xs text-slate-500">
          koeficienty: víkend ×{settings.coef_weekend}, týden ×{settings.coef_week}, měsíc ×{settings.coef_month}, kauce ×{settings.coef_deposit} (lze změnit v Nastavení)
        </span>
      </div>
      <Field label="Poznámka v ceníku">
        <Input value={r.note ?? ''} onChange={(e) => setR((x) => ({ ...x, note: e.target.value }))} placeholder="např. vč. 3 lžic a rychloupínáku" />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Checkbox checked={r.in_pricelist ?? true} onChange={(v) => setR((x) => ({ ...x, in_pricelist: v }))} label="Zobrazit v PDF ceníku" />
        <Button variant="primary" onClick={save} busy={busy}>
          Uložit ceník
        </Button>
      </div>
    </div>
  );
}

// ============================================================
//  Formulář výpůjčky / rezervace
// ============================================================

type BForm = Omit<Booking, 'id' | 'created_at' | 'updated_at'> & { id?: string };

export function BookingModal({
  open,
  onClose,
  machineId,
  booking,
  defaultType = 'pronajem',
}: {
  open: boolean;
  onClose: () => void;
  machineId?: string;
  booking?: Booking | null;
  defaultType?: BookingType;
}) {
  const f = useFleet();
  const toast = useToast();
  const blank = (): BForm => ({
    machine_id: machineId ?? '',
    type: defaultType,
    status: 'aktivni',
    customer_name: '',
    customer_company: '',
    customer_phone: '',
    start_date: today(),
    end_date: null,
    price_total: null,
    deposit: null,
    note: '',
  });
  const [b, setB] = useState<BForm>(blank);
  const [priceTouched, setPriceTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setB(booking ? { ...booking } : blank());
      setPriceTouched(!!booking);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, booking, machineId, defaultType]);

  const machine = f.machineById.get(b.machine_id);
  const rate = f.rates.get(b.machine_id);
  const isRent = b.type === 'pronajem' || b.type === 'rezervace_pronajem';
  const auto = isRent ? calcRentalPrice(rate, b.start_date, b.end_date) : machine?.sale_price ?? null;

  useEffect(() => {
    if (!priceTouched) setB((x) => ({ ...x, price_total: auto, deposit: x.deposit ?? (isRent ? rate?.deposit ?? null : null) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, priceTouched]);

  const conflicts = useMemo(() => (b.machine_id ? findConflicts({ ...b, id: b.id ?? '' }, f.bookings) : []), [b, f.bookings]);
  const candidates = f.machines
    .filter((m) => m.ownership === 'vlastni' && m.lifecycle === 'aktivni' && (isRent ? m.for_rent : m.for_sale || b.type !== 'rezervace_prodej'))
    .sort((a, c) => machineTitle(a).localeCompare(machineTitle(c), 'cs'));

  const set = <K extends keyof BForm>(k: K, v: BForm[K]) => setB((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (!b.machine_id) return toast('Vyberte stroj', 'err');
    if (!b.customer_name && !b.customer_company) return toast('Vyplňte zákazníka', 'err');
    if (isRent && !b.end_date) return toast('Vyplňte datum vrácení', 'err');
    if (b.end_date && b.end_date < b.start_date) return toast('Datum do je před datem od', 'err');
    if (conflicts.length && !confirm('Stroj je v tomto termínu již půjčen/rezervován. Přesto uložit?')) return;
    setBusy(true);
    try {
      await backend.upsert('bookings', b);
      if (b.type === 'prodej' && b.status !== 'zruseno') {
        await backend.upsert('machines', { id: b.machine_id, lifecycle: 'prodano', for_sale: false, for_rent: false });
      }
      toast('Uloženo');
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={booking ? 'Upravit záznam' : 'Půjčit / rezervovat stroj'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button variant="primary" onClick={save} busy={busy}>
            Uložit
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Typ" className="sm:col-span-2">
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(BOOKING_TYPE) as BookingType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => (set('type', t), setPriceTouched(false))}
                className={cls(
                  'rounded-lg border px-2 py-2 text-sm',
                  b.type === t ? 'border-brand-500 bg-brand-50 font-semibold text-slate-900' : 'border-slate-300 text-slate-600',
                )}
              >
                {BOOKING_TYPE[t].label}
              </button>
            ))}
          </div>
        </Field>
        {!machineId && (
          <Field label="Stroj" className="sm:col-span-2">
            <Select value={b.machine_id} onChange={(e) => (set('machine_id', e.target.value), setPriceTouched(false))}>
              <option value="">— vyberte stroj —</option>
              {candidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {machineTitle(m)} {m.serial_number ? `(${m.serial_number})` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Firma">
          <Input value={b.customer_company} onChange={(e) => set('customer_company', e.target.value)} />
        </Field>
        <Field label="Kontaktní osoba">
          <Input value={b.customer_name} onChange={(e) => set('customer_name', e.target.value)} />
        </Field>
        <Field label="Telefon">
          <Input type="tel" value={b.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} />
        </Field>
        <div />
        <Field label={isRent ? 'Od' : 'Datum'}>
          <Input type="date" value={b.start_date} onChange={(e) => set('start_date', e.target.value)} />
        </Field>
        <Field label={isRent ? 'Do (vrácení)' : 'Platnost rezervace do'}>
          <Input type="date" value={b.end_date ?? ''} onChange={(e) => set('end_date', e.target.value || null)} />
        </Field>
        <Field label={isRent ? 'Cena pronájmu bez DPH' : 'Cena bez DPH'} hint={auto != null && isRent ? `dle ceníku ${money(auto)}` : undefined}>
          <Input
            inputMode="decimal"
            value={b.price_total ?? ''}
            onChange={(e) => (setPriceTouched(true), set('price_total', numOrNull(e.target.value)))}
          />
        </Field>
        <Field label={isRent ? 'Kauce' : 'Záloha'}>
          <Input inputMode="decimal" value={b.deposit ?? ''} onChange={(e) => set('deposit', numOrNull(e.target.value))} />
        </Field>
        <Field label="Poznámka" className="sm:col-span-2">
          <Textarea rows={2} value={b.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
        {booking && (
          <Field label="Stav">
            <Select value={b.status} onChange={(e) => set('status', e.target.value as Booking['status'])}>
              <option value="aktivni">Aktivní</option>
              <option value="dokonceno">Dokončeno</option>
              <option value="zruseno">Zrušeno</option>
            </Select>
          </Field>
        )}
      </div>
      {isRent && b.machine_id && !rate?.price_day && (
        <p className="mt-3 text-xs text-amber-700">Stroj nemá nastavený ceník – cenu zadejte ručně nebo doplňte ceník.</p>
      )}
      {conflicts.length > 0 && (
        <div className="mt-3 flex gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            Kolize termínu:{' '}
            {conflicts.map((c) => `${BOOKING_TYPE[c.type].label} ${fmtDate(c.start_date)}–${fmtDate(c.end_date)} (${c.customer_company || c.customer_name})`).join('; ')}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ============================================================
//  Seznam výpůjček / rezervací s rychlými akcemi
// ============================================================

export function BookingList({ bookings, showMachine = true }: { bookings: Booking[]; showMachine?: boolean }) {
  const f = useFleet();
  const toast = useToast();
  const [edit, setEdit] = useState<Booking | null>(null);
  const t = today();

  const act = async (b: Booking, patch: Partial<Booking>, msg: string, machinePatch?: Partial<Machine>) => {
    try {
      await backend.upsert('bookings', { id: b.id, ...patch });
      if (machinePatch) await backend.upsert('machines', { id: b.machine_id, ...machinePatch });
      toast(msg);
    } catch (e) {
      toast(errorMessage(e), 'err');
    }
  };

  if (!bookings.length) return <Empty icon={<CalendarPlus className="h-8 w-8" />} title="Žádné záznamy" />;

  const sorted = [...bookings].sort((a, b) => {
    const ord = (x: Booking) => (x.status === 'aktivni' ? 0 : 1);
    return ord(a) - ord(b) || b.start_date.localeCompare(a.start_date);
  });

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {sorted.map((b) => {
          const m = f.machineById.get(b.machine_id);
          const overdue = b.status === 'aktivni' && b.type === 'pronajem' && b.end_date && b.end_date < t;
          const running = b.status === 'aktivni' && b.type === 'pronajem' && b.start_date <= t;
          return (
            <li key={b.id} className={cls('flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3', b.status !== 'aktivni' && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={BOOKING_TYPE[b.type].color}>{BOOKING_TYPE[b.type].label}</Badge>
                  {running && !overdue && <Badge className="bg-rose-600 text-white">Probíhá</Badge>}
                  {overdue && <Badge className="bg-red-700 text-white">Po termínu</Badge>}
                  {b.status === 'dokonceno' && <Badge className="bg-slate-200 text-slate-700">Dokončeno</Badge>}
                  {b.status === 'zruseno' && <Badge className="bg-slate-200 text-slate-700">Zrušeno</Badge>}
                  {showMachine && m && (
                    <Link to={`/stroje/${m.id}`} className="truncate text-sm font-semibold text-slate-900 hover:text-brand-700">
                      {machineTitle(m)}
                    </Link>
                  )}
                </div>
                <div className="mt-0.5 text-sm text-slate-600">
                  {[b.customer_company, b.customer_name, b.customer_phone].filter(Boolean).join(' · ')}
                </div>
                <div className="text-xs text-slate-500">
                  {fmtDate(b.start_date)}
                  {b.end_date && ` – ${fmtDate(b.end_date)}`}
                  {b.price_total != null && ` · ${money(b.price_total)}`}
                  {b.deposit != null && ` · kauce/záloha ${money(b.deposit)}`}
                  {b.note && ` · ${b.note}`}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {b.status === 'aktivni' && b.type === 'rezervace_pronajem' && (
                  <Button size="sm" onClick={() => act(b, { type: 'pronajem', start_date: b.start_date > t ? t : b.start_date }, 'Stroj vydán zákazníkovi')}>
                    <PackageCheck className="h-4 w-4" /> Vydat
                  </Button>
                )}
                {running && (
                  <Button size="sm" onClick={() => act(b, { status: 'dokonceno', end_date: b.end_date && b.end_date < t ? b.end_date : t }, 'Stroj vrácen')}>
                    <CornerDownLeft className="h-4 w-4" /> Vráceno
                  </Button>
                )}
                {b.status === 'aktivni' && b.type === 'rezervace_prodej' && (
                  <Button
                    size="sm"
                    onClick={() =>
                      confirm('Označit stroj jako prodaný?') &&
                      act(b, { type: 'prodej', status: 'dokonceno', end_date: t }, 'Stroj prodán', { lifecycle: 'prodano', for_sale: false, for_rent: false })
                    }
                  >
                    <Check className="h-4 w-4" /> Prodáno
                  </Button>
                )}
                {b.status === 'aktivni' && (
                  <Button size="sm" variant="ghost" title="Zrušit" onClick={() => confirm('Zrušit tento záznam?') && act(b, { status: 'zruseno' }, 'Zrušeno')}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" title="Upravit" onClick={() => setEdit(b)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title="Smazat"
                  onClick={async () => confirmDelete('záznam') && (await backend.remove('bookings', b.id), toast('Smazáno'))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <BookingModal open={!!edit} booking={edit} machineId={edit?.machine_id} onClose={() => setEdit(null)} />
    </>
  );
}
