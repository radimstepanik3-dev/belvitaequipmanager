import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Truck, Calculator } from 'lucide-react';
import { backend } from '../lib/backend';
import { useFleet } from '../lib/fleet';
import {
  CHECKLIST,
  CHECKLIST_COUNT,
  COUNTRIES,
  CURRENCIES,
  PURCHASE_FLOW,
  PURCHASE_SOURCE,
  PURCHASE_STATUS,
  VAT_REGIME,
  countryByCode,
  estimateTransport,
  purchasePriceCzk,
  suggestSalePrice,
} from '../lib/trade';
import type { CompanySettings, Machine, Purchase, PurchaseSource, PurchaseStatus, VatRegime } from '../lib/types';
import { Badge, Button, Card, Checkbox, Field, Input, Select, Textarea, useToast } from './ui';
import { cls, errorMessage, money, number, numOrNull } from '../lib/util';

type PForm = Omit<Purchase, 'created_at' | 'updated_at'>;

export function blankPurchase(machineId: string, s: CompanySettings): PForm {
  return {
    id: machineId,
    machine_id: machineId,
    status: 'vyhlednuto',
    source: 'dealer',
    seller_name: '',
    seller_contact: '',
    seller_vat_id: '',
    country: 'DE',
    city: '',
    listing_url: '',
    purchase_date: null,
    currency: 'EUR',
    price_foreign: null,
    exchange_rate: s.currency_rates.EUR ?? 25,
    vat_regime: 'eu',
    distance_km: countryByCode('DE').km,
    transport_cost: null,
    customs_cost: null,
    auction_fee: null,
    inspection_cost: null,
    registration_cost: null,
    other_cost: null,
    other_note: '',
    expected_arrival: null,
    checklist: {},
    notes: '',
  };
}

/** Panel „Nákup a náklady“ v kartě stroje. */
export function PurchasePanel({ machine: m }: { machine: Machine }) {
  const f = useFleet();
  const s = f.settings;
  const toast = useToast();
  const existing = f.purchases.get(m.id);
  const [p, setP] = useState<PForm>(() => existing ?? { ...blankPurchase(m.id, s), status: m.lifecycle === 'nakup' ? 'vyhlednuto' : 'dorazilo' });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (existing && !dirty) setP(existing);
  }, [existing, dirty]);

  const set = <K extends keyof PForm>(k: K, v: PForm[K]) => {
    setDirty(true);
    setP((x) => ({ ...x, [k]: v }));
  };
  const num = (k: keyof PForm) => ({
    inputMode: 'decimal' as const,
    value: (p[k] as number | null) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, numOrNull(e.target.value) as never),
  });

  const country = countryByCode(p.country);
  const priceCzk = purchasePriceCzk(p as Purchase);
  const service = f.serviceCost.get(m.id) ?? 0;
  const total =
    priceCzk + (p.transport_cost ?? 0) + (p.customs_cost ?? 0) + (p.auction_fee ?? 0) + (p.inspection_cost ?? 0) + (p.registration_cost ?? 0) + (p.other_cost ?? 0) + service;
  const done = Object.values(p.checklist).filter(Boolean).length;

  const save = async (patch?: Partial<PForm>) => {
    const next = { ...p, ...patch };
    setBusy(true);
    try {
      await backend.upsert('purchases', next);
      // stav nákupu ovlivňuje evidenci stroje
      if (next.status === 'dorazilo' && m.lifecycle === 'nakup') await backend.upsert('machines', { id: m.id, lifecycle: 'aktivni' });
      if (patch?.status && patch.status !== 'dorazilo' && patch.status !== 'nekoupeno' && m.lifecycle === 'aktivni') {
        await backend.upsert('machines', { id: m.id, lifecycle: 'nakup' });
      }
      if (next.status === 'nekoupeno' && m.lifecycle === 'nakup') await backend.upsert('machines', { id: m.id, lifecycle: 'vyrazeno', for_sale: false });
      setP(next);
      setDirty(false);
      toast(patch?.status ? `Stav nákupu: ${PURCHASE_STATUS[patch.status].label}` : 'Nákup uložen');
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const stepIdx = PURCHASE_FLOW.indexOf(p.status);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <ol className="flex min-w-[680px] items-center">
          {PURCHASE_FLOW.map((st, i) => (
            <li key={st} className="flex flex-1 items-center">
              <button
                onClick={() => save({ status: st, ...(st === 'koupeno' && !p.purchase_date ? { purchase_date: new Date().toISOString().slice(0, 10) } : {}) })}
                className={cls('flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-100', i <= stepIdx ? 'font-semibold text-slate-900' : 'text-slate-400')}
              >
                <span
                  className={cls(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
                    i < stepIdx ? 'bg-emerald-500 text-white' : i === stepIdx ? 'bg-brand-500 text-slate-900' : 'bg-slate-200 text-slate-500',
                  )}
                >
                  {i < stepIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                {PURCHASE_STATUS[st].label.replace(' – čeká na odvoz', '')}
              </button>
              {i < PURCHASE_FLOW.length - 1 && <span className={cls('mx-1 h-0.5 flex-1', i < stepIdx ? 'bg-emerald-400' : 'bg-slate-200')} />}
            </li>
          ))}
        </ol>
        {p.status === 'nekoupeno' && <p className="mt-2 text-sm text-rose-700">Nákup se neuskutečnil.</p>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card title="Prodejce a nabídka">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Typ prodejce">
                <Select value={p.source} onChange={(e) => set('source', e.target.value as PurchaseSource)}>
                  {Object.entries(PURCHASE_SOURCE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Prodejce (firma / jméno)">
                <Input value={p.seller_name} onChange={(e) => set('seller_name', e.target.value)} />
              </Field>
              <Field label="Kontakt">
                <Input value={p.seller_contact} onChange={(e) => set('seller_contact', e.target.value)} placeholder="telefon, e-mail" />
              </Field>
              <Field label="Země">
                <Select
                  value={p.country}
                  onChange={(e) => {
                    const c = countryByCode(e.target.value);
                    set('country', c.code);
                    if (c.km) set('distance_km', c.km);
                    set('vat_regime', c.code === 'CZ' ? 'cz' : c.eu ? 'eu' : 'import');
                  }}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                      {!c.eu ? ' (mimo EU)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Město / místo nakládky">
                <Input value={p.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field label="DIČ / VAT ID prodejce" hint={p.vat_regime === 'eu' ? 'ověřte v systému VIES' : undefined}>
                <Input value={p.seller_vat_id} onChange={(e) => set('seller_vat_id', e.target.value)} placeholder="DE123456789" />
              </Field>
              <Field label="Odkaz na inzerát / aukci" className="sm:col-span-2">
                <div className="flex gap-2">
                  <Input value={p.listing_url} onChange={(e) => set('listing_url', e.target.value)} placeholder="https://…" />
                  {/^https?:\/\//.test(p.listing_url) && (
                    <a href={p.listing_url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </Field>
              <Field label="Datum nákupu">
                <Input type="date" value={p.purchase_date ?? ''} onChange={(e) => set('purchase_date', e.target.value || null)} />
              </Field>
            </div>
            {!country.eu && country.code !== 'XX' && (
              <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <div>
                  <b>{country.name} je mimo EU</b> – nutné celní řízení (vývozní a dovozní deklarace), DPH při dovozu, případně clo. Ověřte, že stroj má
                  CE označení. {country.note}
                </div>
              </div>
            )}
          </Card>

          <Card title="Cena a daňový režim">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Daňový režim" className="sm:col-span-2 lg:col-span-4" hint={VAT_REGIME[p.vat_regime].hint}>
                <Select value={p.vat_regime} onChange={(e) => set('vat_regime', e.target.value as VatRegime)}>
                  {Object.entries(VAT_REGIME).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Měna">
                <Select
                  value={p.currency}
                  onChange={(e) => {
                    set('currency', e.target.value);
                    set('exchange_rate', s.currency_rates[e.target.value] ?? 1);
                  }}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label={`Kupní cena (${p.currency})`}>
                <Input {...num('price_foreign')} />
              </Field>
              {p.currency !== 'CZK' && (
                <Field label="Kurz (Kč)" hint={s.rates_date ? `ČNB ${s.rates_date}` : 'orientační – aktualizujte v Nastavení'}>
                  <Input {...num('exchange_rate')} />
                </Field>
              )}
              <Field label="Kupní cena v Kč">
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold">{money(priceCzk)}</div>
              </Field>
            </div>
          </Card>

          <Card title={<span className="flex items-center gap-1.5"><Truck className="h-4 w-4" /> Doprava do ČR a další náklady (Kč bez DPH)</span>}>
            <TransportCalculator
              km={p.distance_km}
              onKm={(v) => set('distance_km', v)}
              machine={m}
              countryExtra={country.extra}
              onUse={(v) => set('transport_cost', v)}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Doprava (skutečná / dle nabídky)">
                <Input {...num('transport_cost')} />
              </Field>
              <Field label="Clo" hint={p.vat_regime === 'import' ? 'stavební stroje (HS 8429/8430) mají často 0 %, ověřte v TARIC' : undefined}>
                <Input {...num('customs_cost')} />
              </Field>
              <Field label="Aukční poplatek / provize">
                <Input {...num('auction_fee')} />
              </Field>
              <Field label="Prohlídka / inspekce / cesta">
                <Input {...num('inspection_cost')} />
              </Field>
              <Field label="Registrace, STK, doklady">
                <Input {...num('registration_cost')} />
              </Field>
              <Field label="Ostatní">
                <Input {...num('other_cost')} />
              </Field>
              <Field label="Ostatní – popis">
                <Input value={p.other_note} onChange={(e) => set('other_note', e.target.value)} />
              </Field>
              <Field label="Předpokládaný příjezd">
                <Input type="date" value={p.expected_arrival ?? ''} onChange={(e) => set('expected_arrival', e.target.value || null)} />
              </Field>
            </div>
          </Card>

          <Card title="Poznámky k nákupu">
            <Textarea rows={3} value={p.notes} onChange={(e) => set('notes', e.target.value)} placeholder="výsledek prohlídky, vyjednaná cena, domluva s prodejcem…" />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Pořizovací náklady">
            <dl className="space-y-1.5 text-sm">
              <Row l="Kupní cena" v={money(priceCzk)} />
              <Row l="Doprava" v={money(p.transport_cost ?? 0)} />
              <Row l="Clo" v={money(p.customs_cost ?? 0)} />
              <Row l="Poplatky, prohlídka, registrace, ostatní" v={money((p.auction_fee ?? 0) + (p.inspection_cost ?? 0) + (p.registration_cost ?? 0) + (p.other_cost ?? 0))} />
              <Row l="Opravy a příprava (servis)" v={money(service)} />
              <Row l="Celkem" v={money(total)} b />
              {total > 0 && <Row l={`Návrh ceny (+${s.target_margin_pct} %)`} v={money(suggestSalePrice(total, s))} />}
              {m.sale_price != null && total > 0 && <Row l="Aktuální nabídková cena" v={`${money(m.sale_price)} (${(((m.sale_price - total) / total) * 100).toFixed(1)} %)`} />}
            </dl>
            <Button variant="primary" className="mt-4 w-full" onClick={() => save()} busy={busy} disabled={!dirty && !!existing}>
              {existing ? (dirty ? 'Uložit změny' : 'Uloženo') : 'Založit nákupní kartu'}
            </Button>
          </Card>

          <Card title={`Kontrola při nákupu ${done}/${CHECKLIST_COUNT}`}>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / CHECKLIST_COUNT) * 100}%` }} />
            </div>
            <div className="space-y-3">
              {CHECKLIST.map((g) => (
                <div key={g.group}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.group}</div>
                  <div className="space-y-1.5">
                    {g.items.map((it) => (
                      <Checkbox
                        key={it.key}
                        checked={!!p.checklist[it.key]}
                        onChange={(v) => set('checklist', { ...p.checklist, [it.key]: v })}
                        label={<span className={cls('text-sm', p.checklist[it.key] && 'text-slate-400 line-through')}>{it.label}</span>}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

const Row = ({ l, v, b }: { l: string; v: string; b?: boolean }) => (
  <div className={cls('flex justify-between gap-2', b && 'border-t border-slate-100 pt-1.5 text-base font-semibold')}>
    <dt className="text-slate-600">{l}</dt>
    <dd className="text-right">{v}</dd>
  </div>
);

// ============================================================
//  Kalkulačka dopravy
// ============================================================

export function TransportCalculator({
  machine,
  km,
  onKm,
  countryExtra = 0,
  onUse,
}: {
  machine?: Partial<Machine>;
  km: number | null;
  onKm: (v: number | null) => void;
  countryExtra?: number;
  onUse?: (v: number) => void;
}) {
  const { settings } = useFleet();
  const [w, setW] = useState<number | null>(machine?.weight_kg ?? null);
  const [dims, setDims] = useState({
    l: machine?.transport_length_m ?? null,
    wi: machine?.transport_width_m ?? null,
    h: machine?.transport_height_m ?? null,
  });
  const [extra, setExtra] = useState(countryExtra);
  useEffect(() => setExtra(countryExtra), [countryExtra]);

  const est = useMemo(
    () => estimateTransport({ km: km ?? 0, weightKg: w, widthM: dims.wi, heightM: dims.h, lengthM: dims.l, countryExtra: extra }, settings),
    [km, w, dims, extra, settings],
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        <Calculator className="h-4 w-4" /> Odhad ceny dopravy
      </div>
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Field label={`Vzdálenost (km do ${settings.base_city || 'ČR'})`}>
          <Input inputMode="decimal" value={km ?? ''} onChange={(e) => onKm(numOrNull(e.target.value))} />
        </Field>
        <Field label="Hmotnost (kg)">
          <Input inputMode="decimal" value={w ?? ''} onChange={(e) => setW(numOrNull(e.target.value))} />
        </Field>
        <Field label="Délka (m)">
          <Input inputMode="decimal" value={dims.l ?? ''} onChange={(e) => setDims({ ...dims, l: numOrNull(e.target.value) })} />
        </Field>
        <Field label="Šířka (m)">
          <Input inputMode="decimal" value={dims.wi ?? ''} onChange={(e) => setDims({ ...dims, wi: numOrNull(e.target.value) })} />
        </Field>
        <Field label="Výška (m)">
          <Input inputMode="decimal" value={dims.h ?? ''} onChange={(e) => setDims({ ...dims, h: numOrNull(e.target.value) })} />
        </Field>
        <Field label="Trajekt / moře / mýto">
          <Input inputMode="decimal" value={extra || ''} onChange={(e) => setExtra(numOrNull(e.target.value) ?? 0)} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="text-slate-600">
            {est.vehicle} · {number(est.rate)} Kč/km × {number(km ?? 0)} km × {settings.tr_return_factor}
          </div>
          <div className="text-lg font-bold text-slate-900">≈ {money(est.total)}</div>
        </div>
        {onUse && (
          <Button size="sm" onClick={() => onUse(est.total)} disabled={!km}>
            Použít jako cenu dopravy
          </Button>
        )}
      </div>
      {est.oversize.length > 0 && (
        <div className="mt-2 flex gap-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <b>Nadrozměrná / nadměrná přeprava:</b> {est.oversize.join(', ')}. Je nutné povolení v každé tranzitní zemi, případně doprovodné vozidlo –
            počítejte s vyšší cenou a delším termínem. Zvažte demontáž (lžíce, protizávaží, kabina).
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Orientační odhad podle sazeb v Nastavení. Skutečnou cenu si vždy vyžádejte od dopravce (např. přes Timocom, Trans.eu nebo smluvního spediťáka).
      </p>
    </div>
  );
}

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return <Badge className={PURCHASE_STATUS[status].color}>{PURCHASE_STATUS[status].label}</Badge>;
}
