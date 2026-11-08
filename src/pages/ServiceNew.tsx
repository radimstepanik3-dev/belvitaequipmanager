import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Save, Sparkles, X } from 'lucide-react';
import { format } from 'date-fns';
import { backend } from '../lib/backend';
import { useFleet } from '../lib/fleet';
import { useSettings } from '../lib/hooks';
import { EMPTY_MACHINE, nextServiceNumber } from '../lib/domain';
import { aiAvailable, recognizeMachine } from '../lib/ai';
import { uploadMedia } from '../lib/media';
import type { Machine, ServiceOrder } from '../lib/types';
import { Button, Card, Field, Input, PageHeader, Select, Textarea, useToast } from '../components/ui';
import { PhotoPicker } from '../components/Media';
import { errorMessage, machineTitle, numOrNull } from '../lib/util';

export function ServiceNew() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const f = useFleet();
  const { settings } = useSettings();
  const user = backend.currentUser();

  const [machineId, setMachineId] = useState(params.get('stroj') ?? '');
  const [newMachine, setNewMachine] = useState(!params.get('stroj'));
  const [nm, setNm] = useState({ category: '', brand: '', model: '', serial_number: '', year: '' });
  const [o, setO] = useState<Partial<ServiceOrder>>({
    status: 'prijato',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    received_at: new Date().toISOString(),
    received_by: user?.name ?? '',
    hours_at_intake: null,
    fault_description: '',
    intake_condition: '',
    accessories: '',
    technician: '',
    estimated_completion: null,
    diagnosis: '',
    completion_notes: '',
    completed_at: null,
    handed_over_at: null,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => setO((x) => ({ ...x, labor_rate: x.labor_rate ?? settings.default_labor_rate })), [settings.default_labor_rate]);

  const machine = f.machineById.get(machineId);
  useEffect(() => {
    if (machine) {
      setNewMachine(false);
      setO((x) => ({
        ...x,
        customer_name: x.customer_name || (machine.ownership === 'zakaznik' ? machine.customer_name : ''),
        hours_at_intake: x.hours_at_intake ?? machine.hours,
      }));
    }
  }, [machine]);

  const previews = useMemo(() => files.map((x) => URL.createObjectURL(x)), [files]);
  const machines = f.machines
    .filter((m) => m.lifecycle === 'aktivni')
    .sort((a, b) => machineTitle(a).localeCompare(machineTitle(b), 'cs'));

  const set = <K extends keyof ServiceOrder>(k: K, v: ServiceOrder[K]) => setO((x) => ({ ...x, [k]: v }));

  const runAi = async () => {
    setAiBusy(true);
    try {
      const r = await recognizeMachine(files, settings.categories);
      setNm({
        category: r.category,
        brand: r.brand,
        model: r.model,
        serial_number: r.serial_number ?? nm.serial_number,
        year: r.year_from && r.year_from === r.year_to ? String(r.year_from) : nm.year,
      });
      if (r.visible_condition) setO((x) => ({ ...x, intake_condition: x.intake_condition || r.visible_condition }));
      toast(`Rozpoznáno: ${r.brand} ${r.model}`);
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setAiBusy(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMachine && !machineId) return toast('Vyberte stroj', 'err');
    if (newMachine && !nm.brand && !nm.model) return toast('Vyplňte značku nebo typ stroje', 'err');
    setBusy(true);
    try {
      let mId = machineId;
      if (newMachine) {
        const m = await backend.upsert('machines', {
          ...EMPTY_MACHINE,
          name: '',
          category: nm.category,
          brand: nm.brand,
          model: nm.model,
          serial_number: nm.serial_number,
          year: numOrNull(nm.year),
          hours: o.hours_at_intake ?? null,
          weight_kg: null,
          power_kw: null,
          condition: '',
          location: '',
          description: '',
          ownership: 'zakaznik',
          customer_name: o.customer_name ?? '',
          lifecycle: 'aktivni',
          for_sale: false,
          for_rent: false,
          sale_price: null,
          purchase_price: null,
          cover_media_id: null,
          ai_data: null,
        } satisfies Partial<Machine>);
        mId = m.id;
      } else if (machine && o.hours_at_intake != null && (machine.hours ?? 0) < o.hours_at_intake) {
        await backend.upsert('machines', { id: mId, hours: o.hours_at_intake });
      }
      const existing = await backend.list('service_orders');
      const order = await backend.upsert('service_orders', { ...o, machine_id: mId, number: nextServiceNumber(existing) });
      let firstPhoto: string | null = null;
      for (const file of files) {
        const md = await uploadMedia(file, { machineId: mId, serviceOrderId: order.id, kind: 'photo', stage: 'prijem', caption: 'Příjem do servisu' });
        firstPhoto ??= md.id;
      }
      if (newMachine && firstPhoto) await backend.upsert('machines', { id: mId, cover_media_id: firstPhoto });
      toast(`Zakázka ${order.number} založena`);
      nav(`/servis/${order.id}`, { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'err');
    } finally {
      setBusy(false);
    }
  };

  const localDT = o.received_at ? format(new Date(o.received_at), "yyyy-MM-dd'T'HH:mm") : '';

  return (
    <form onSubmit={save} className="space-y-4">
      <PageHeader
        title="Příjem stroje do servisu"
        actions={
          <Button variant="primary" busy={busy}>
            <Save className="h-4 w-4" /> Založit zakázku
          </Button>
        }
      />

      <Card title="Stroj">
        <div className="mb-3 flex gap-2">
          <Button type="button" size="sm" variant={!newMachine ? 'primary' : 'secondary'} onClick={() => setNewMachine(false)}>
            Stroj z evidence
          </Button>
          <Button type="button" size="sm" variant={newMachine ? 'primary' : 'secondary'} onClick={() => (setNewMachine(true), setMachineId(''))}>
            Nový stroj zákazníka
          </Button>
        </div>
        {!newMachine ? (
          <Field label="Stroj">
            <Select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
              <option value="">— vyberte —</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {machineTitle(m)}
                  {m.serial_number && ` · ${m.serial_number}`}
                  {m.ownership === 'zakaznik' ? ` · zákazník ${m.customer_name}` : ' · náš stroj'}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Kategorie">
              <Select value={nm.category} onChange={(e) => setNm({ ...nm, category: e.target.value })}>
                <option value="">—</option>
                {[...new Set([nm.category, ...settings.categories].filter(Boolean))].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Značka">
              <Input value={nm.brand} onChange={(e) => setNm({ ...nm, brand: e.target.value })} />
            </Field>
            <Field label="Typ">
              <Input value={nm.model} onChange={(e) => setNm({ ...nm, model: e.target.value })} />
            </Field>
            <Field label="Výrobní číslo">
              <Input value={nm.serial_number} onChange={(e) => setNm({ ...nm, serial_number: e.target.value })} />
            </Field>
            <Field label="Rok výroby">
              <Input inputMode="numeric" value={nm.year} onChange={(e) => setNm({ ...nm, year: e.target.value })} />
            </Field>
          </div>
        )}
      </Card>

      <Card title="Fotodokumentace při příjmu">
        <p className="mb-3 text-sm text-slate-600">Vyfoťte stroj ze všech stran, poškození, stav motohodin a typový štítek.</p>
        <div className="flex flex-wrap gap-2">
          <PhotoPicker onFiles={(fs) => setFiles((x) => [...x, ...fs])} />
          {newMachine && (
            <Button type="button" onClick={runAi} busy={aiBusy} disabled={!files.length || !aiAvailable().ok}>
              <Sparkles className="h-4 w-4 text-brand-600" /> Rozpoznat stroj (AI)
            </Button>
          )}
        </div>
        {files.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {previews.map((u, i) => (
              <div key={u} className="relative aspect-square overflow-hidden rounded-lg bg-slate-200">
                <img src={u} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Zákazník a příjem">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Zákazník (jméno / firma)">
            <Input value={o.customer_name} onChange={(e) => set('customer_name', e.target.value)} placeholder="prázdné = vlastní stroj" />
          </Field>
          <Field label="Telefon">
            <Input type="tel" value={o.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={o.customer_email} onChange={(e) => set('customer_email', e.target.value)} />
          </Field>
          <Field label="Datum a čas příjmu">
            <Input type="datetime-local" value={localDT} onChange={(e) => set('received_at', e.target.value ? new Date(e.target.value).toISOString() : new Date().toISOString())} />
          </Field>
          <Field label="Přijal">
            <Input value={o.received_by} onChange={(e) => set('received_by', e.target.value)} />
          </Field>
          <Field label="Motohodiny při příjmu">
            <Input inputMode="decimal" value={o.hours_at_intake ?? ''} onChange={(e) => set('hours_at_intake', numOrNull(e.target.value))} />
          </Field>
          <Field label="Popis závady / požadavek zákazníka" className="sm:col-span-2 lg:col-span-3">
            <Textarea value={o.fault_description} onChange={(e) => set('fault_description', e.target.value)} />
          </Field>
          <Field label="Stav stroje při příjmu (poškození, chybějící díly…)" className="sm:col-span-2">
            <Textarea rows={2} value={o.intake_condition} onChange={(e) => set('intake_condition', e.target.value)} />
          </Field>
          <Field label="Předané příslušenství">
            <Textarea rows={2} value={o.accessories} onChange={(e) => set('accessories', e.target.value)} placeholder="klíče, lžíce, doklady…" />
          </Field>
          <Field label="Přidělený technik">
            <Input value={o.technician} onChange={(e) => set('technician', e.target.value)} />
          </Field>
          <Field label="Předpokládané dokončení">
            <Input type="date" value={o.estimated_completion ?? ''} onChange={(e) => set('estimated_completion', e.target.value || null)} />
          </Field>
          <Field label="Hodinová sazba práce (Kč bez DPH)">
            <Input inputMode="decimal" value={o.labor_rate ?? ''} onChange={(e) => set('labor_rate', numOrNull(e.target.value) ?? 0)} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" busy={busy}>
          <Save className="h-4 w-4" /> Založit zakázku
        </Button>
      </div>
    </form>
  );
}
