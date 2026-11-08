import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, Pencil, Trash2, Plus, ChevronRight, Sparkles, Copy, FileDown, BadgeCheck, Users, CalendarClock } from 'lucide-react';
import { backend } from '../lib/backend';
import { useFleet } from '../lib/fleet';
import { LEAD_FLOW, LEAD_SOURCES, LEAD_STATUS, suggestSalePrice } from '../lib/trade';
import { aiAvailable, generateListing } from '../lib/ai';
import { salesSheetPdf } from '../lib/pdf';
import type { Lead, LeadStatus, Machine } from '../lib/types';
import { Badge, Button, Card, confirmDelete, Empty, Field, Input, Modal, Select, Tabs, Textarea, useToast } from './ui';
import { cls, errorMessage, fmtDate, machineTitle, money, numOrNull, today } from '../lib/util';

// ============================================================
//  Zájemce / poptávka
// ============================================================

type LForm = Omit<Lead, 'id' | 'created_at' | 'updated_at'> & { id?: string };

export function LeadModal({ open, onClose, lead, machineId }: { open: boolean; onClose: () => void; lead?: Lead | null; machineId?: string | null }) {
  const f = useFleet();
  const toast = useToast();
  const blank = (): LForm => ({
    machine_id: machineId ?? null,
    wanted: '',
    customer_name: '',
    company: '',
    phone: '',
    email: '',
    source: 'Telefon',
    status: 'novy',
    offered_price: null,
    next_contact: today(),
    note: '',
  });
  const [l, setL] = useState<LForm>(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setL(lead ? { ...lead } : blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead, machineId]);
  const set = <K extends keyof LForm>(k: K, v: LForm[K]) => setL((x) => ({ ...x, [k]: v }));
  const forSale = f.machines.filter((m) => m.ownership === 'vlastni' && (m.lifecycle === 'aktivni' || m.lifecycle === 'nakup')).sort((a, b) => machineTitle(a).localeCompare(machineTitle(b), 'cs'));

  const save = async () => {
    if (!l.customer_name && !l.company && !l.phone) return toast('Vyplňte jméno, firmu nebo telefon', 'err');
    if (!l.machine_id && !l.wanted) return toast('Vyberte stroj, nebo popište, co zákazník hledá', 'err');
    setBusy(true);
    try {
      await backend.upsert('leads', l);
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
      title={lead ? 'Upravit zájemce' : 'Nový zájemce / poptávka'}
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
        <Field label="O jaký stroj má zájem" className="sm:col-span-2">
          <Select value={l.machine_id ?? ''} onChange={(e) => set('machine_id', e.target.value || null)}>
            <option value="">— obecná poptávka (hledá stroj, který nemáme) —</option>
            {forSale.map((m) => (
              <option key={m.id} value={m.id}>
                {machineTitle(m)} {m.sale_price ? `· ${money(m.sale_price)}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        {!l.machine_id && (
          <Field label="Co hledá" className="sm:col-span-2">
            <Textarea rows={2} value={l.wanted} onChange={(e) => set('wanted', e.target.value)} placeholder="např. pásové rypadlo 18–22 t, max. 8 000 mth, rozpočet do 1,8 mil." />
          </Field>
        )}
        <Field label="Firma">
          <Input value={l.company} onChange={(e) => set('company', e.target.value)} />
        </Field>
        <Field label="Jméno">
          <Input value={l.customer_name} onChange={(e) => set('customer_name', e.target.value)} />
        </Field>
        <Field label="Telefon">
          <Input type="tel" value={l.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={l.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Odkud přišel">
          <Select value={l.source} onChange={(e) => set('source', e.target.value)}>
            {LEAD_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Stav">
          <Select value={l.status} onChange={(e) => set('status', e.target.value as LeadStatus)}>
            {(Object.keys(LEAD_STATUS) as LeadStatus[]).map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nabídnutá / požadovaná cena (Kč bez DPH)">
          <Input inputMode="decimal" value={l.offered_price ?? ''} onChange={(e) => set('offered_price', numOrNull(e.target.value))} />
        </Field>
        <Field label="Další kontakt">
          <Input type="date" value={l.next_contact ?? ''} onChange={(e) => set('next_contact', e.target.value || null)} />
        </Field>
        <Field label="Poznámka" className="sm:col-span-2">
          <Textarea rows={3} value={l.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function LeadList({ leads, showMachine = true, emptyText = 'Žádní zájemci' }: { leads: Lead[]; showMachine?: boolean; emptyText?: string }) {
  const f = useFleet();
  const toast = useToast();
  const [edit, setEdit] = useState<Lead | null>(null);
  const t = today();
  if (!leads.length) return <Empty icon={<Users className="h-7 w-7" />} title={emptyText} />;

  const sorted = [...leads].sort((a, b) => {
    const o = (x: Lead) => (LEAD_STATUS[x.status].open ? 0 : 1);
    return o(a) - o(b) || (a.next_contact ?? '9999').localeCompare(b.next_contact ?? '9999') || b.created_at.localeCompare(a.created_at);
  });

  const advance = async (l: Lead) => {
    const i = LEAD_FLOW.indexOf(l.status);
    const next = LEAD_FLOW[i + 1];
    if (!next) return;
    await backend.upsert('leads', { id: l.id, status: next });
    toast(`Stav: ${LEAD_STATUS[next].label}`);
  };

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {sorted.map((l) => {
          const m = l.machine_id ? f.machineById.get(l.machine_id) : null;
          const due = LEAD_STATUS[l.status].open && l.next_contact && l.next_contact <= t;
          return (
            <li key={l.id} className={cls('flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3', !LEAD_STATUS[l.status].open && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{l.company || l.customer_name || l.phone}</span>
                  {l.company && l.customer_name && <span className="text-sm text-slate-600">{l.customer_name}</span>}
                  <Badge className={LEAD_STATUS[l.status].color}>{LEAD_STATUS[l.status].label}</Badge>
                  {due && (
                    <Badge className="bg-rose-600 text-white">
                      <CalendarClock className="h-3 w-3" /> {l.next_contact === t ? 'Ozvat se dnes' : `Ozvat se (${fmtDate(l.next_contact)})`}
                    </Badge>
                  )}
                </div>
                {(showMachine || l.offered_price != null) && (
                  <div className="mt-0.5 text-sm text-slate-600">
                    {showMachine && m && (
                      <Link to={`/stroje/${m.id}?tab=prodej`} className="font-medium text-brand-700 hover:underline">
                        {machineTitle(m)}
                      </Link>
                    )}
                    {showMachine && !m && <span className="italic">Hledá: {l.wanted}</span>}
                    {l.offered_price != null && <span>{showMachine ? ' · ' : ''}nabízí {money(l.offered_price)}</span>}
                  </div>
                )}
                <div className="text-xs text-slate-500">
                  {l.source} · {fmtDate(l.created_at)}
                  {!due && l.next_contact && LEAD_STATUS[l.status].open && ` · další kontakt ${fmtDate(l.next_contact)}`}
                  {l.note && ` · ${l.note}`}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {l.phone && (
                  <a href={`tel:${l.phone.replace(/\s/g, '')}`} className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-50" title={l.phone}>
                    <Phone className="h-4 w-4" />
                  </a>
                )}
                {l.email && (
                  <a href={`mailto:${l.email}`} className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-50" title={l.email}>
                    <Mail className="h-4 w-4" />
                  </a>
                )}
                {LEAD_STATUS[l.status].open && LEAD_FLOW.indexOf(l.status) < LEAD_FLOW.length - 1 && (
                  <Button size="sm" onClick={() => advance(l)} title="Posunout do dalšího stavu">
                    {LEAD_STATUS[LEAD_FLOW[LEAD_FLOW.indexOf(l.status) + 1]].label} <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEdit(l)} title="Upravit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" title="Smazat" onClick={async () => confirmDelete('zájemce') && (await backend.remove('leads', l.id), toast('Smazáno'))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <LeadModal open={!!edit} lead={edit} onClose={() => setEdit(null)} />
    </>
  );
}

// ============================================================
//  Záznam prodeje
// ============================================================

export function SoldModal({ open, onClose, machine }: { open: boolean; onClose: () => void; machine: Machine }) {
  const f = useFleet();
  const toast = useToast();
  const leads = f.leads.filter((l) => l.machine_id === machine.id && LEAD_STATUS[l.status].open);
  const [price, setPrice] = useState<number | null>(machine.sale_price);
  const [date, setDate] = useState(today());
  const [buyer, setBuyer] = useState('');
  const [leadId, setLeadId] = useState('');
  const [busy, setBusy] = useState(false);
  const landed = f.landed(machine).total;

  useEffect(() => {
    if (!open) return;
    const res = f.bookings.find((b) => b.machine_id === machine.id && b.type === 'rezervace_prodej' && b.status === 'aktivni');
    setPrice(res?.price_total ?? machine.sale_price);
    setBuyer(res ? res.customer_company || res.customer_name : '');
    setDate(today());
    setLeadId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    if (!price) return toast('Zadejte prodejní cenu', 'err');
    setBusy(true);
    try {
      await backend.upsert('machines', {
        id: machine.id,
        lifecycle: 'prodano',
        for_sale: false,
        for_rent: false,
        sold_price: price,
        sold_at: date,
        buyer_name: buyer,
      });
      for (const l of leads) await backend.upsert('leads', { id: l.id, status: l.id === leadId ? 'vyhrano' : 'ztraceno' });
      for (const b of f.bookings.filter((b) => b.machine_id === machine.id && b.status === 'aktivni' && b.type === 'rezervace_prodej')) {
        await backend.upsert('bookings', { id: b.id, type: 'prodej', status: 'dokonceno', price_total: price });
      }
      toast('Stroj prodán 🎉');
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
      title={`Prodej – ${machineTitle(machine)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button variant="primary" onClick={save} busy={busy}>
            <BadgeCheck className="h-4 w-4" /> Potvrdit prodej
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {leads.length > 0 && (
          <Field label="Kupec ze zájemců" className="sm:col-span-2">
            <Select
              value={leadId}
              onChange={(e) => {
                setLeadId(e.target.value);
                const l = leads.find((x) => x.id === e.target.value);
                if (l) {
                  setBuyer(l.company || l.customer_name);
                  if (l.offered_price) setPrice(l.offered_price);
                }
              }}
            >
              <option value="">— jiný kupec —</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.company || l.customer_name} {l.offered_price ? `· ${money(l.offered_price)}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Kupec">
          <Input value={buyer} onChange={(e) => setBuyer(e.target.value)} />
        </Field>
        <Field label="Datum prodeje">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Prodejní cena bez DPH (Kč)" className="sm:col-span-2">
          <Input inputMode="decimal" value={price ?? ''} onChange={(e) => setPrice(numOrNull(e.target.value))} />
        </Field>
      </div>
      {price != null && landed > 0 && (
        <div className={cls('mt-3 rounded-lg p-3 text-sm', price - landed >= 0 ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900')}>
          Náklady {money(landed)} → zisk <b>{money(price - landed)}</b> ({(((price - landed) / landed) * 100).toFixed(1)} %)
        </div>
      )}
      {leads.length > 0 && <p className="mt-2 text-xs text-slate-500">Ostatní otevření zájemci o tento stroj se označí jako „Nekoupil“.</p>}
    </Modal>
  );
}

// ============================================================
//  Panel Prodej v kartě stroje
// ============================================================

export function SalesPanel({ machine: m, photoBlobs }: { machine: Machine; photoBlobs: () => Promise<Blob[]> }) {
  const f = useFleet();
  const toast = useToast();
  const s = f.settings;
  const L = f.landed(m);
  const mg = f.margin(m);
  const days = f.days(m);
  const suggested = L.total ? suggestSalePrice(L.total, s) : null;
  const leads = f.leads.filter((l) => l.machine_id === m.id);
  const [price, setPrice] = useState<number | null>(m.sale_price);
  const [leadOpen, setLeadOpen] = useState(false);
  const [soldOpen, setSoldOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  useEffect(() => setPrice(m.sale_price), [m.sale_price]);
  const sold = m.lifecycle === 'prodano';

  const savePrice = async (v: number | null) => {
    await backend.upsert('machines', { id: m.id, sale_price: v, for_sale: v ? true : m.for_sale });
    toast('Cena uložena');
  };

  const pdf = async (withVat: boolean) => {
    setPdfBusy(true);
    try {
      const media = (await backend.list('media', { machine_id: m.id })).filter((x) => x.kind === 'photo' && !x.service_order_id);
      await salesSheetPdf(m, media, s, { withVat, coverId: m.cover_media_id });
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setPdfBusy(false);
    }
  };

  const vatK = 1 + s.vat_rate / 100;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card
        title={sold ? 'Prodáno' : 'Cena a marže'}
        actions={
          !sold && (
            <Button size="sm" variant="primary" onClick={() => setSoldOpen(true)}>
              <BadgeCheck className="h-4 w-4" /> Prodáno
            </Button>
          )
        }
      >
        {sold ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Kv l="Prodejní cena" v={money(m.sold_price)} big />
            <Kv l="Zisk" v={mg ? `${money(mg.abs)} (${mg.pct.toFixed(1)} %)` : '—'} big tone={mg && mg.abs < 0 ? 'bad' : 'good'} />
            <Kv l="Kupec" v={m.buyer_name || '—'} />
            <Kv l="Datum" v={fmtDate(m.sold_at)} />
            <Kv l="Doba prodeje" v={`${days} dní`} />
            <Kv l="Náklady celkem" v={money(L.total)} />
          </dl>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-start gap-2">
              <Field label="Nabídková cena bez DPH (Kč)" className="min-w-[180px] flex-1" hint={price ? `s DPH ${money(Math.round(price * vatK))}` : undefined}>
                <Input inputMode="decimal" value={price ?? ''} onChange={(e) => setPrice(numOrNull(e.target.value))} onBlur={() => price !== m.sale_price && savePrice(price)} />
              </Field>
              {suggested && suggested !== m.sale_price && (
                <Button size="sm" className="mt-[22px]" onClick={() => (setPrice(suggested), savePrice(suggested))} title={`náklady + ${s.target_margin_pct} %`}>
                  Navrhnout {money(suggested)}
                </Button>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Kv l="Náklady celkem" v={L.total ? money(L.total) : 'nevyplněno'} />
              <Kv l="Očekávaný zisk" v={mg ? money(mg.abs) : '—'} tone={mg ? (mg.abs < 0 ? 'bad' : 'good') : undefined} />
              <Kv l="Marže" v={mg ? `${mg.pct.toFixed(1)} %` : '—'} tone={mg ? (mg.pct < s.target_margin_pct / 2 ? 'bad' : 'good') : undefined} />
              <Kv l="Skladem" v={`${days} dní`} tone={days > s.stock_warn_days ? 'bad' : undefined} />
              <Kv l="Zájemci" v={String(leads.filter((l) => LEAD_STATUS[l.status].open).length)} />
              <Kv l="Cílová marže" v={`${s.target_margin_pct} %`} />
            </dl>
            {L.total > 0 && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                Náklady: nákup {money(L.purchase)}
                {L.transport > 0 && ` + doprava ${money(L.transport)}`}
                {L.customs > 0 && ` + clo ${money(L.customs)}`}
                {L.fees > 0 && ` + poplatky ${money(L.fees)}`}
                {L.service > 0 && ` + opravy/příprava ${money(L.service)}`}
                {' · '}
                <Link to={`/stroje/${m.id}?tab=nakup`} className="text-brand-700 underline">
                  upravit
                </Link>
              </div>
            )}
            {!L.total && (
              <p className="text-xs text-amber-700">
                Vyplňte nákupní cenu a náklady v záložce{' '}
                <Link to={`/stroje/${m.id}?tab=nakup`} className="underline">
                  Nákup a náklady
                </Link>
                , aby aplikace spočítala zisk.
              </p>
            )}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <Button size="sm" onClick={() => pdf(false)} busy={pdfBusy}>
            <FileDown className="h-4 w-4" /> Prodejní list PDF
          </Button>
          <Button size="sm" variant="ghost" onClick={() => pdf(true)} disabled={pdfBusy}>
            PDF s DPH
          </Button>
        </div>
      </Card>

      <ListingCard machine={m} photoBlobs={photoBlobs} />

      <Card
        className="lg:col-span-2"
        title={`Zájemci o tento stroj (${leads.length})`}
        actions={
          <Button size="sm" variant="primary" onClick={() => setLeadOpen(true)}>
            <Plus className="h-4 w-4" /> Zájemce
          </Button>
        }
      >
        <LeadList leads={leads} showMachine={false} emptyText="Zatím žádní zájemci" />
      </Card>

      <LeadModal open={leadOpen} onClose={() => setLeadOpen(false)} machineId={m.id} />
      <SoldModal open={soldOpen} onClose={() => setSoldOpen(false)} machine={m} />
    </div>
  );
}

function Kv({ l, v, big, tone }: { l: string; v: string; big?: boolean; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{l}</dt>
      <dd className={cls('font-semibold', big ? 'text-lg' : '', tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-slate-900')}>{v}</dd>
    </div>
  );
}

// ---------- AI inzerát ----------

function ListingCard({ machine: m, photoBlobs }: { machine: Machine; photoBlobs: () => Promise<Blob[]> }) {
  const f = useFleet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<'cs' | 'en' | 'de'>('cs');
  const L = m.listing;
  const ai = aiAvailable();

  const gen = async () => {
    setBusy(true);
    try {
      const listing = await generateListing(m, await photoBlobs(), f.settings);
      await backend.upsert('machines', { id: m.id, listing });
      toast('Inzerát vytvořen');
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const text = L ? (lang === 'cs' ? L.text_cs : lang === 'en' ? L.text_en : L.text_de) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${L?.title}\n\n${text}`);
      toast('Zkopírováno – vložte do inzertního portálu');
    } catch {
      toast('Kopírování se nepodařilo', 'err');
    }
  };

  return (
    <Card
      title={<span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-brand-600" /> Inzerát</span>}
      actions={
        <Button size="sm" onClick={gen} busy={busy} disabled={!ai.ok}>
          <Sparkles className="h-4 w-4 text-brand-600" /> {L ? 'Napsat znovu' : 'Napsat inzerát (AI)'}
        </Button>
      }
    >
      {!L ? (
        <p className="text-sm text-slate-600">
          AI napíše prodejní inzerát česky, anglicky a německy z údajů o stroji a fotek – připravený pro Mascus, Machineryline, Bazoš nebo váš web.
          {!ai.ok && <span className="mt-1 block text-xs text-amber-700">{ai.reason}</span>}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="font-semibold text-slate-900">{L.title}</div>
          {L.highlights?.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {L.highlights.map((h) => (
                <li key={h} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                  {h}
                </li>
              ))}
            </ul>
          )}
          <Tabs
            tabs={[
              { id: 'cs', label: 'Česky' },
              { id: 'en', label: 'English' },
              { id: 'de', label: 'Deutsch' },
            ]}
            value={lang}
            onChange={setLang}
          />
          <p className="max-h-64 overflow-y-auto whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{text}</p>
          <Button size="sm" onClick={copy}>
            <Copy className="h-4 w-4" /> Kopírovat
          </Button>
        </div>
      )}
    </Card>
  );
}
