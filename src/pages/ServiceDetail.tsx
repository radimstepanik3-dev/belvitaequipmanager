import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, FileDown, Plus, Trash2, CheckCircle2, HandHelping, Check } from 'lucide-react';
import { backend } from '../lib/backend';
import { useFleet } from '../lib/fleet';
import { useRow, useSettings, useTable } from '../lib/hooks';
import { PART_STATUS, SERVICE_FLOW, SERVICE_STATUS } from '../lib/domain';
import { uploadMedia } from '../lib/media';
import { serviceOrderPdf } from '../lib/pdf';
import type { PartStatus, ServiceOrder, ServicePart, ServiceStage, ServiceStatus, ServiceWork } from '../lib/types';
import { Badge, Button, Card, confirmDelete, Field, Input, PageHeader, Select, Spinner, Textarea, useToast } from '../components/ui';
import { PhotoGrid, PhotoPicker } from '../components/Media';
import { cls, errorMessage, fmtDate, fmtDateTime, machineTitle, money, number, numOrNull, today } from '../lib/util';

export function ServiceDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const f = useFleet();
  const { settings } = useSettings();
  const { row: o, loading } = useRow('service_orders', id);
  const work = useTable('service_work', { service_order_id: id });
  const parts = useTable('service_parts', { service_order_id: id });
  const media = useTable('media', { service_order_id: id });
  const [uploading, setUploading] = useState<ServiceStage | null>(null);

  if (loading || f.loading) return <Spinner />;
  if (!o) return <div>Zakázka nenalezena</div>;
  const m = f.machineById.get(o.machine_id);

  const patch = async (p: Partial<ServiceOrder>, msg?: string) => {
    try {
      await backend.upsert('service_orders', { id, ...p });
      if (msg) toast(msg);
    } catch (e) {
      toast(errorMessage(e), 'err');
    }
  };

  const setStatus = (s: ServiceStatus) => {
    const p: Partial<ServiceOrder> = { status: s };
    if (s === 'hotovo' && !o.completed_at) p.completed_at = new Date().toISOString();
    if (s === 'predano' && !o.handed_over_at) p.handed_over_at = new Date().toISOString();
    patch(p, `Stav: ${SERVICE_STATUS[s].label}`);
  };

  const addPhotos = async (files: File[], stage: ServiceStage) => {
    setUploading(stage);
    try {
      const caption = { prijem: 'Příjem do servisu', prubeh: 'Průběh opravy', dokonceni: 'Dokončená oprava' }[stage];
      for (const file of files) await uploadMedia(file, { machineId: o.machine_id, serviceOrderId: id, kind: 'photo', stage, caption: `${caption} ${o.number}` });
      toast('Fotky nahrány');
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setUploading(null);
    }
  };

  const laborH = work.data.reduce((a, w) => a + (w.hours || 0), 0);
  const laborTotal = laborH * (o.labor_rate || 0);
  const partsTotal = parts.data.reduce((a, p) => a + p.quantity * p.unit_price, 0);
  const total = laborTotal + partsTotal;
  const photos = (s: ServiceStage) => media.data.filter((x) => x.kind === 'photo' && x.stage === s);
  const stepIdx = SERVICE_FLOW.indexOf(o.status);

  const remove = async () => {
    if (!confirmDelete(`zakázku ${o.number}`)) return;
    for (const md of media.data) {
      await backend.removeFile(md.path);
      await backend.remove('media', md.id);
    }
    for (const w of work.data) await backend.remove('service_work', w.id);
    for (const p of parts.data) await backend.remove('service_parts', p.id);
    await backend.remove('service_orders', id);
    toast('Zakázka smazána');
    nav('/servis', { replace: true });
  };

  return (
    <>
      <Link to="/servis" className="mb-2 inline-flex items-center text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft className="h-4 w-4" /> Servis
      </Link>
      <PageHeader
        title={
          <span>
            <span className="font-mono text-slate-500">{o.number}</span> {m ? machineTitle(m) : ''}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={SERVICE_STATUS[o.status].color}>{SERVICE_STATUS[o.status].label}</Badge>
            {m && (
              <Link to={`/stroje/${m.id}`} className="text-brand-700 hover:underline">
                karta stroje
              </Link>
            )}
            <span>{o.customer_name || 'vlastní stroj'}</span>
          </span>
        }
        actions={
          <>
            <Button onClick={() => m && serviceOrderPdf(o, m, work.data, parts.data, settings)}>
              <FileDown className="h-4 w-4" /> PDF pracovní list
            </Button>
            <Button variant="ghost" onClick={remove} title="Smazat zakázku">
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {/* Průběh zakázky */}
      <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <ol className="flex min-w-[640px] items-center">
          {SERVICE_FLOW.map((s, i) => (
            <li key={s} className="flex flex-1 items-center">
              <button
                onClick={() => setStatus(s)}
                className={cls(
                  'flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition hover:bg-slate-100',
                  i <= stepIdx && o.status !== 'zruseno' ? 'font-semibold text-slate-900' : 'text-slate-400',
                )}
              >
                <span
                  className={cls(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
                    i < stepIdx ? 'bg-emerald-500 text-white' : i === stepIdx ? 'bg-brand-500 text-slate-900' : 'bg-slate-200 text-slate-500',
                  )}
                >
                  {i < stepIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                {SERVICE_STATUS[s].label}
              </button>
              {i < SERVICE_FLOW.length - 1 && <span className={cls('mx-1 h-0.5 flex-1', i < stepIdx ? 'bg-emerald-400' : 'bg-slate-200')} />}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="1 · Příjem stroje" actions={<PhotoPicker compact onFiles={(fs) => addPhotos(fs, 'prijem')} busy={uploading === 'prijem'} />}>
            <dl className="mb-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <D l="Přijato" v={fmtDateTime(o.received_at)} />
              <D l="Přijal" v={o.received_by} />
              <D l="Motohodiny" v={o.hours_at_intake != null ? number(o.hours_at_intake, 'mth') : '—'} />
              <D l="Telefon" v={o.customer_phone} />
              <D l="E-mail" v={o.customer_email} />
              <D l="Příslušenství" v={o.accessories} />
            </dl>
            <AutoText label="Popis závady" value={o.fault_description} onSave={(v) => patch({ fault_description: v })} />
            <AutoText label="Stav při příjmu" value={o.intake_condition} onSave={(v) => patch({ intake_condition: v })} rows={2} />
            <div className="mt-3">
              <PhotoGrid photos={photos('prijem')} emptyText="Bez fotek z příjmu" />
            </div>
          </Card>

          <Card title="2 · Diagnostika a průběh opravy" actions={<PhotoPicker compact onFiles={(fs) => addPhotos(fs, 'prubeh')} busy={uploading === 'prubeh'} />}>
            <AutoText label="Diagnostika / zjištěná závada" value={o.diagnosis} onSave={(v) => patch({ diagnosis: v })} />
            <div className="mt-3">
              <PhotoGrid photos={photos('prubeh')} emptyText="Bez fotek z průběhu opravy" />
            </div>
          </Card>

          <WorkLog orderId={id} rows={work.data} defaultTech={o.technician} />
          <PartsList orderId={id} rows={parts.data} />

          <Card title="3 · Dokončení opravy" actions={<PhotoPicker compact onFiles={(fs) => addPhotos(fs, 'dokonceni')} busy={uploading === 'dokonceni'} />}>
            <AutoText label="Provedené práce / doporučení zákazníkovi" value={o.completion_notes} onSave={(v) => patch({ completion_notes: v })} />
            <div className="mt-3">
              <PhotoGrid photos={photos('dokonceni')} emptyText="Bez fotek hotové opravy" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {o.status !== 'hotovo' && o.status !== 'predano' && (
                <Button variant="primary" onClick={() => setStatus('hotovo')}>
                  <CheckCircle2 className="h-4 w-4" /> Oprava dokončena
                </Button>
              )}
              {o.status === 'hotovo' && (
                <Button variant="primary" onClick={() => setStatus('predano')}>
                  <HandHelping className="h-4 w-4" /> Předat zákazníkovi
                </Button>
              )}
              {o.completed_at && <span className="self-center text-sm text-slate-500">Dokončeno {fmtDateTime(o.completed_at)}</span>}
              {o.handed_over_at && <span className="self-center text-sm text-slate-500">· předáno {fmtDateTime(o.handed_over_at)}</span>}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Zakázka">
            <div className="space-y-3">
              <Field label="Stav">
                <Select value={o.status} onChange={(e) => setStatus(e.target.value as ServiceStatus)}>
                  {(Object.keys(SERVICE_STATUS) as ServiceStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {SERVICE_STATUS[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <BlurInput label="Technik" value={o.technician} onSave={(v) => patch({ technician: v })} />
              <Field label="Předpokládané dokončení">
                <Input type="date" value={o.estimated_completion ?? ''} onChange={(e) => patch({ estimated_completion: e.target.value || null })} />
              </Field>
              <BlurInput label="Hodinová sazba (Kč bez DPH)" value={String(o.labor_rate ?? '')} onSave={(v) => patch({ labor_rate: numOrNull(v) ?? 0 })} />
            </div>
          </Card>
          <Card title="Kalkulace">
            <dl className="space-y-1.5 text-sm">
              <Row l={`Práce ${number(laborH)} h × ${money(o.labor_rate)}`} v={money(laborTotal)} />
              <Row l="Náhradní díly" v={money(partsTotal)} />
              <Row l="Celkem bez DPH" v={money(total)} b />
              <Row l={`DPH ${settings.vat_rate} %`} v={money((total * settings.vat_rate) / 100)} />
              <Row l="Celkem s DPH" v={money(total * (1 + settings.vat_rate / 100))} b />
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

const D = ({ l, v }: { l: string; v: string }) => (
  <div>
    <dt className="text-xs text-slate-500">{l}</dt>
    <dd className="text-slate-900">{v || '—'}</dd>
  </div>
);
const Row = ({ l, v, b }: { l: string; v: string; b?: boolean }) => (
  <div className={cls('flex justify-between gap-2', b && 'border-t border-slate-100 pt-1.5 font-semibold')}>
    <dt className="text-slate-600">{l}</dt>
    <dd>{v}</dd>
  </div>
);

/** Textové pole, které se uloží při opuštění (všichni vidí poslední verzi). */
function AutoText({ label, value, onSave, rows = 3 }: { label: string; value: string; onSave: (v: string) => void; rows?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Field label={label} className="mb-2">
      <Textarea rows={rows} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
    </Field>
  );
}
function BlurInput({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Field label={label}>
      <Input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
    </Field>
  );
}

// ---------- pracovní list ----------

function WorkLog({ orderId, rows, defaultTech }: { orderId: string; rows: ServiceWork[]; defaultTech: string }) {
  const toast = useToast();
  const me = backend.currentUser()?.name ?? '';
  const blank = () => ({ date: today(), technician: defaultTech || me, hours: '', description: '' });
  const [n, setN] = useState(blank);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const hours = numOrNull(n.hours);
    if (!n.description || hours == null) return toast('Vyplňte popis a počet hodin', 'err');
    await backend.upsert('service_work', { service_order_id: orderId, date: n.date, technician: n.technician, hours, description: n.description });
    setN(blank());
  };
  const sum = rows.reduce((a, r) => a + r.hours, 0);
  return (
    <Card title={`Pracovní list – ${number(sum)} h`}>
      {rows.length > 0 && (
        <div className="-mx-4 mb-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-1">Datum</th>
                <th className="px-2 py-1">Technik</th>
                <th className="px-2 py-1">Popis práce</th>
                <th className="px-2 py-1 text-right">Hod.</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...rows]
                .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
                .map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-2">{fmtDate(r.date)}</td>
                    <td className="px-2 py-2">{r.technician}</td>
                    <td className="px-2 py-2">{r.description}</td>
                    <td className="px-2 py-2 text-right">{number(r.hours)}</td>
                    <td className="pr-4 text-right">
                      <button className="p-1 text-slate-400 hover:text-rose-600" onClick={async () => confirmDelete('řádek') && backend.remove('service_work', r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[130px_150px_1fr_80px_auto]">
        <Input type="date" value={n.date} onChange={(e) => setN({ ...n, date: e.target.value })} />
        <Input placeholder="Technik" value={n.technician} onChange={(e) => setN({ ...n, technician: e.target.value })} />
        <Input placeholder="Popis provedené práce" value={n.description} onChange={(e) => setN({ ...n, description: e.target.value })} />
        <Input placeholder="Hod." inputMode="decimal" value={n.hours} onChange={(e) => setN({ ...n, hours: e.target.value })} />
        <Button>
          <Plus className="h-4 w-4" /> Zapsat
        </Button>
      </form>
    </Card>
  );
}

// ---------- náhradní díly ----------

function PartsList({ orderId, rows }: { orderId: string; rows: ServicePart[] }) {
  const toast = useToast();
  const blank = () => ({ part_number: '', name: '', quantity: '1', unit: 'ks', unit_price: '', status: 'objednano' as PartStatus });
  const [n, setN] = useState(blank);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!n.name) return toast('Vyplňte název dílu', 'err');
    await backend.upsert('service_parts', {
      service_order_id: orderId,
      part_number: n.part_number,
      name: n.name,
      quantity: numOrNull(n.quantity) ?? 1,
      unit: n.unit,
      unit_price: numOrNull(n.unit_price) ?? 0,
      status: n.status,
    });
    setN(blank());
  };
  const total = rows.reduce((a, p) => a + p.quantity * p.unit_price, 0);
  const waiting = rows.filter((p) => p.status === 'objednano').length;
  return (
    <Card title={`Náhradní díly – ${money(total)}${waiting ? ` · čeká se na ${waiting}` : ''}`}>
      {rows.length > 0 && (
        <div className="-mx-4 mb-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-1">Kat. číslo</th>
                <th className="px-2 py-1">Název</th>
                <th className="px-2 py-1 text-right">Množ.</th>
                <th className="px-2 py-1 text-right">Cena/j.</th>
                <th className="px-2 py-1 text-right">Celkem</th>
                <th className="px-2 py-1">Stav</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-mono text-xs">{p.part_number || '—'}</td>
                  <td className="px-2 py-2">{p.name}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    {number(p.quantity)} {p.unit}
                  </td>
                  <td className="px-2 py-2 text-right">{money(p.unit_price)}</td>
                  <td className="px-2 py-2 text-right">{money(p.quantity * p.unit_price)}</td>
                  <td className="px-2 py-1">
                    <select
                      value={p.status}
                      onChange={(e) => backend.upsert('service_parts', { id: p.id, status: e.target.value as PartStatus })}
                      className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs"
                    >
                      {(Object.keys(PART_STATUS) as PartStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {PART_STATUS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="pr-4 text-right">
                    <button className="p-1 text-slate-400 hover:text-rose-600" onClick={async () => confirmDelete('díl') && backend.remove('service_parts', p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={add} className="grid grid-cols-2 gap-2 sm:grid-cols-[120px_1fr_70px_60px_100px_120px_auto]">
        <Input placeholder="Kat. číslo" value={n.part_number} onChange={(e) => setN({ ...n, part_number: e.target.value })} />
        <Input placeholder="Název dílu" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
        <Input placeholder="Množ." inputMode="decimal" value={n.quantity} onChange={(e) => setN({ ...n, quantity: e.target.value })} />
        <Input placeholder="j." value={n.unit} onChange={(e) => setN({ ...n, unit: e.target.value })} />
        <Input placeholder="Cena/j." inputMode="decimal" value={n.unit_price} onChange={(e) => setN({ ...n, unit_price: e.target.value })} />
        <Select value={n.status} onChange={(e) => setN({ ...n, status: e.target.value as PartStatus })}>
          {(Object.keys(PART_STATUS) as PartStatus[]).map((s) => (
            <option key={s} value={s}>
              {PART_STATUS[s]}
            </option>
          ))}
        </Select>
        <Button>
          <Plus className="h-4 w-4" /> Přidat
        </Button>
      </form>
    </Card>
  );
}
