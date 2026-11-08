import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Sparkles, X, Save } from 'lucide-react';
import { backend } from '../lib/backend';
import { useRow, useSettings } from '../lib/hooks';
import { CONDITIONS, EMPTY_MACHINE, LIFECYCLE, type MachineDraft } from '../lib/domain';
import { aiAvailable, recognizeMachine } from '../lib/ai';
import { uploadMedia } from '../lib/media';
import type { AiRecognition } from '../lib/types';
import { Badge, Button, Card, Checkbox, Field, Input, PageHeader, Select, Spinner, Textarea, useToast } from '../components/ui';
import { PhotoPicker } from '../components/Media';
import { errorMessage, numOrNull } from '../lib/util';

type Form = MachineDraft;
const EMPTY = EMPTY_MACHINE;

const CONF: Record<AiRecognition['confidence'], { label: string; color: string }> = {
  vysoka: { label: 'vysoká jistota', color: 'bg-emerald-100 text-emerald-800' },
  stredni: { label: 'střední jistota', color: 'bg-amber-100 text-amber-800' },
  nizka: { label: 'nízká jistota', color: 'bg-rose-100 text-rose-800' },
};

export function MachineForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { settings } = useSettings();
  const { row, loading } = useRow('machines', id);
  const [form, setForm] = useState<Form>(() => ({
    ...EMPTY,
    ownership: params.get('zakaznik') ? 'zakaznik' : 'vlastni',
    for_sale: !params.get('zakaznik'),
    lifecycle: params.get('nakup') ? 'nakup' : 'aktivni',
  }));
  const [files, setFiles] = useState<File[]>([]);
  const [ai, setAi] = useState<AiRecognition | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      const { id: _i, created_at: _c, updated_at: _u, ...rest } = row;
      setForm({ ...EMPTY, ...rest });
      setAi(row.ai_data);
    }
  }, [row]);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: keyof Form) => ({
    value: (form[k] as number | null) ?? '',
    inputMode: 'decimal' as const,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, numOrNull(e.target.value) as never),
  });
  const txt = (k: keyof Form) => ({
    value: (form[k] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never),
  });

  const runAi = async () => {
    setAiBusy(true);
    try {
      const r = await recognizeMachine(files, settings.categories);
      setAi(r);
      toast('Stroj rozpoznán – zkontrolujte a převezměte údaje');
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setAiBusy(false);
    }
  };

  const applyAi = () => {
    if (!ai) return;
    const year = ai.year_from && ai.year_to && ai.year_from === ai.year_to ? ai.year_from : form.year;
    const extra = [
      ai.year_from && ai.year_from !== ai.year_to && `Odhad roku výroby (AI): ${ai.year_from}–${ai.year_to ?? '?'}`,
      ai.visible_condition && `Stav dle fotek: ${ai.visible_condition}`,
      ai.notes,
    ]
      .filter(Boolean)
      .join('\n');
    setForm((f) => ({
      ...f,
      category: settings.categories.includes(ai.category) ? ai.category : f.category || ai.category,
      brand: ai.brand || f.brand,
      model: ai.model || f.model,
      name: f.name || [ai.brand, ai.model].filter(Boolean).join(' '),
      year,
      weight_kg: ai.weight_kg ?? f.weight_kg,
      power_kw: ai.power_kw ?? f.power_kw,
      transport_length_m: ai.transport_length_m ?? f.transport_length_m,
      transport_width_m: ai.transport_width_m ?? f.transport_width_m,
      transport_height_m: ai.transport_height_m ?? f.transport_height_m,
      serial_number: ai.serial_number || f.serial_number,
      description: f.description.includes(extra) ? f.description : [f.description, extra].filter(Boolean).join('\n\n'),
      ai_data: ai,
    }));
    toast('Údaje převzaty do formuláře');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.brand && !form.name && !form.model) return toast('Vyplňte alespoň název nebo značku stroje.', 'err');
    setSaving(true);
    try {
      const m = await backend.upsert('machines', { ...form, ...(id ? { id } : {}) });
      let firstId: string | null = null;
      for (const f of files) {
        const media = await uploadMedia(f, { machineId: m.id, kind: 'photo' });
        firstId ??= media.id;
      }
      if (!m.cover_media_id && firstId) await backend.upsert('machines', { id: m.id, cover_media_id: firstId });
      toast(id ? 'Uloženo' : 'Stroj založen');
      nav(`/stroje/${m.id}${!id && m.lifecycle === 'nakup' ? '?tab=nakup' : ''}`, { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'err');
    } finally {
      setSaving(false);
    }
  };

  if (id && loading) return <Spinner />;
  const aiState = aiAvailable();
  const cats = settings.categories.includes(form.category) || !form.category ? settings.categories : [form.category, ...settings.categories];

  return (
    <form onSubmit={save} className="space-y-4">
      <PageHeader
        title={id ? 'Upravit stroj' : form.lifecycle === 'nakup' ? 'Nový nákup stroje' : 'Nový stroj'}
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => nav(-1)}>
              Zrušit
            </Button>
            <Button variant="primary" busy={saving}>
              <Save className="h-4 w-4" /> Uložit
            </Button>
          </>
        }
      />

      <Card title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-600" /> Fotky a rozpoznání pomocí AI</span>}>
        <p className="mb-3 text-sm text-slate-600">
          Vyfoťte stroj (ideálně celý z boku + detail typového štítku) nebo vyberte fotky z galerie. AI rozpozná druh stroje, značku, typ a
          odhadne rok výroby.
        </p>
        <PhotoPicker onFiles={(fs) => setFiles((x) => [...x, ...fs])} />
        {files.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {previews.map((u, i) => (
              <div key={u} className="relative aspect-square overflow-hidden rounded-lg bg-slate-200">
                <img src={u} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={runAi} busy={aiBusy} disabled={!files.length || !aiState.ok} className="border-brand-400 bg-brand-50">
            <Sparkles className="h-4 w-4 text-brand-600" /> {aiBusy ? 'Rozpoznávám…' : 'Rozpoznat stroj z fotek'}
          </Button>
          {!aiState.ok && <span className="text-xs text-slate-500">{aiState.reason}</span>}
          {id && files.length === 0 && <span className="text-xs text-slate-500">Další fotky lze přidávat i v detailu stroje.</span>}
        </div>

        {ai && (
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-lg font-semibold text-slate-900">
                {ai.brand} {ai.model}
              </div>
              <Badge className={CONF[ai.confidence].color}>{CONF[ai.confidence].label}</Badge>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <Dt label="Kategorie" v={ai.category} />
              <Dt label="Rok výroby" v={ai.year_from ? (ai.year_to && ai.year_to !== ai.year_from ? `${ai.year_from}–${ai.year_to}` : String(ai.year_from)) : '—'} />
              <Dt label="Hmotnost" v={ai.weight_kg ? `${ai.weight_kg.toLocaleString('cs')} kg` : '—'} />
              <Dt label="Výkon" v={ai.power_kw ? `${ai.power_kw} kW` : '—'} />
              {ai.serial_number && <Dt label="Výr. číslo" v={ai.serial_number} />}
            </dl>
            {ai.visible_condition && <p className="mt-2 text-sm text-slate-700"><b>Stav:</b> {ai.visible_condition}</p>}
            {ai.notes && <p className="mt-1 text-sm text-slate-700"><b>Poznámky:</b> {ai.notes}</p>}
            <Button type="button" variant="primary" size="sm" className="mt-3" onClick={applyAi}>
              Převzít údaje do formuláře
            </Button>
          </div>
        )}
      </Card>

      <Card title="Základní údaje">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Název (jak ho znáte ve firmě)" className="sm:col-span-2">
            <Input {...txt('name')} placeholder="např. CAT 320 – žlutý s rychloupínákem" />
          </Field>
          <Field label="Kategorie">
            <Select {...txt('category')}>
              <option value="">— vyberte —</option>
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Stav">
            <Select {...txt('condition')}>
              <option value="">—</option>
              {CONDITIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Značka">
            <Input {...txt('brand')} list="brands" />
          </Field>
          <Field label="Typ / model">
            <Input {...txt('model')} />
          </Field>
          <Field label="Rok výroby">
            <Input {...num('year')} inputMode="numeric" />
          </Field>
          <Field label="Motohodiny">
            <Input {...num('hours')} />
          </Field>
          <Field label="Výrobní číslo / VIN">
            <Input {...txt('serial_number')} />
          </Field>
          <Field label="Provozní hmotnost (kg)">
            <Input {...num('weight_kg')} />
          </Field>
          <Field label="Výkon (kW)">
            <Input {...num('power_kw')} />
          </Field>
          <Field label="Umístění">
            <Input {...txt('location')} placeholder="areál, stavba…" />
          </Field>
          <Field label="Přepravní délka (m)">
            <Input {...num('transport_length_m')} />
          </Field>
          <Field label="Přepravní šířka (m)">
            <Input {...num('transport_width_m')} />
          </Field>
          <Field label="Přepravní výška (m)">
            <Input {...num('transport_height_m')} />
          </Field>
          <Field label="Popis, výbava, poznámky" className="sm:col-span-2 lg:col-span-4">
            <Textarea rows={4} {...txt('description')} />
          </Field>
        </div>
        <datalist id="brands">
          {['Caterpillar', 'Komatsu', 'Volvo', 'JCB', 'Liebherr', 'Hitachi', 'Develon', 'Doosan', 'Hyundai', 'Kubota', 'Takeuchi', 'Yanmar', 'Bobcat', 'Case', 'New Holland', 'Wacker Neuson', 'Kramer', 'Manitou', 'Merlo', 'Bomag', 'Hamm', 'Dynapac', 'Ammann', 'Mecalac', 'Sany', 'JLG', 'Genie', 'Haulotte'].map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </Card>

      <Card title="Vlastnictví a obchod">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Vlastník">
            <Select {...txt('ownership')}>
              <option value="vlastni">Náš stroj</option>
              <option value="zakaznik">Stroj zákazníka (servis)</option>
            </Select>
          </Field>
          {form.ownership === 'zakaznik' ? (
            <Field label="Zákazník" className="sm:col-span-3">
              <Input {...txt('customer_name')} />
            </Field>
          ) : (
            <>
              <Field label="Stav evidence">
                <Select {...txt('lifecycle')}>
                  {Object.entries(LIFECYCLE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Pořizovací cena (Kč bez DPH)" hint="Podrobný nákup s dopravou a clem v záložce Nákup a náklady">
                <Input {...num('purchase_price')} />
              </Field>
              <div />
              <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:col-span-2">
                <Checkbox checked={form.for_sale} onChange={(v) => set('for_sale', v)} label="Nabízíme k prodeji" />
                {form.for_sale && (
                  <Field label="Nabídková cena bez DPH (Kč)" hint="Návrh ceny podle nákladů a marže najdete v záložce Prodej">
                    <Input {...num('sale_price')} />
                  </Field>
                )}
              </div>
              <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:col-span-2">
                <Checkbox checked={form.for_rent} onChange={(v) => set('for_rent', v)} label="Zařazen v půjčovně" />
                {form.for_rent && <span className="text-xs text-slate-500">Ceník půjčovného nastavíte v detailu stroje → Půjčovna.</span>}
              </div>
            </>
          )}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => nav(-1)}>
          Zrušit
        </Button>
        <Button variant="primary" busy={saving}>
          <Save className="h-4 w-4" /> Uložit stroj
        </Button>
      </div>
    </form>
  );
}

const Dt = ({ label, v }: { label: string; v: string }) => (
  <div>
    <dt className="text-xs text-slate-500">{label}</dt>
    <dd className="font-medium text-slate-900">{v}</dd>
  </div>
);
