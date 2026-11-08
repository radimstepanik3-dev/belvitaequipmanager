import { useEffect, useState } from 'react';
import { Cloud, Download, HardDrive, LogOut, Upload, Database, RefreshCw } from 'lucide-react';
import { loadCnbRates } from '../lib/ai';
import { CURRENCIES } from '../lib/trade';
import { backend, cloud, isCloud, local } from '../lib/backend';
import { useSettings } from '../lib/hooks';
import { getLocalAiKey, getLocalUserName, getSupabaseConfig, setLocalAiKey, setLocalUserName, setSupabaseConfig } from '../lib/config';
import { seedDemoData } from '../lib/seed';
import type { CompanySettings } from '../lib/types';
import { Button, Card, Field, Input, PageHeader, Textarea, useToast } from '../components/ui';
import { downloadBlob, errorMessage, numOrNull, today } from '../lib/util';

export function SettingsPage() {
  const { settings, save } = useSettings();
  const toast = useToast();
  const [s, setS] = useState<CompanySettings>(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setS(settings), [settings]);

  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof CompanySettings) => ({ value: String(s[k] ?? ''), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never) });
  const num = (k: keyof CompanySettings) => ({
    value: String(s[k] ?? ''),
    inputMode: 'decimal' as const,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, (numOrNull(e.target.value) ?? 0) as never),
  });

  const [ratesBusy, setRatesBusy] = useState(false);
  const loadRates = async () => {
    setRatesBusy(true);
    try {
      const r = await loadCnbRates();
      const next = { ...s, currency_rates: { ...s.currency_rates, ...Object.fromEntries(CURRENCIES.filter((c) => r.rates[c]).map((c) => [c, Math.round(r.rates[c] * 10000) / 10000])) }, rates_date: r.date };
      setS(next);
      await save(next);
      toast(`Kurzy ČNB načteny (${r.date})`);
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setRatesBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await save(s);
      toast('Nastavení uloženo');
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Nastavení" actions={<Button variant="primary" onClick={submit} busy={busy}>Uložit nastavení</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Firma (hlavička PDF)">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Název firmy" className="sm:col-span-2">
              <Input {...txt('company_name')} />
            </Field>
            <Field label="Adresa" className="sm:col-span-2">
              <Input {...txt('address')} />
            </Field>
            <Field label="IČO">
              <Input {...txt('ico')} />
            </Field>
            <Field label="DIČ">
              <Input {...txt('dic')} />
            </Field>
            <Field label="Telefon">
              <Input {...txt('phone')} />
            </Field>
            <Field label="E-mail">
              <Input {...txt('email')} />
            </Field>
            <Field label="Web">
              <Input {...txt('web')} />
            </Field>
            <Field label="DPH (%)">
              <Input {...num('vat_rate')} />
            </Field>
            <Field label="Výchozí hodinová sazba servisu (Kč)">
              <Input {...num('default_labor_rate')} />
            </Field>
          </div>
        </Card>

        <Card title="Cenotvorba půjčovny">
          <p className="mb-3 text-sm text-slate-600">
            Z denní ceny se automaticky dopočítají ostatní sazby (násobek denní ceny). Denní cenu lze navrhnout z hodnoty stroje.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Hodina (× den)">
              <Input {...num('coef_hour')} />
            </Field>
            <Field label="Víkend (× den)">
              <Input {...num('coef_weekend')} />
            </Field>
            <Field label="Týden (× den)">
              <Input {...num('coef_week')} />
            </Field>
            <Field label="Měsíc (× den)">
              <Input {...num('coef_month')} />
            </Field>
            <Field label="Kauce (× den)">
              <Input {...num('coef_deposit')} />
            </Field>
            <Field label="Den = % z hodnoty stroje">
              <Input {...num('daily_pct_of_value')} />
            </Field>
            <Field label="Nadpis ceníku" className="col-span-2 sm:col-span-3">
              <Input {...txt('pricelist_title')} />
            </Field>
            <Field label="Podmínky pronájmu (v PDF ceníku)" className="col-span-2 sm:col-span-3">
              <Textarea rows={4} {...txt('pricelist_terms')} />
            </Field>
          </div>
        </Card>

        <Card title="Prodej a nákup">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Cílová marže (%)" hint="pro návrh prodejní ceny">
              <Input {...num('target_margin_pct')} />
            </Field>
            <Field label="Upozornit po dnech skladem">
              <Input {...num('stock_warn_days')} />
            </Field>
            <Field label="Sídlo / cíl dopravy">
              <Input {...txt('base_city')} />
            </Field>
          </div>
          <div className="mt-4 mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-slate-600">
              Kurzy měn (Kč za 1 jednotku){s.rates_date && <span className="text-slate-400"> · ČNB {s.rates_date}</span>}
            </div>
            <Button size="sm" onClick={loadRates} busy={ratesBusy}>
              <RefreshCw className="h-4 w-4" /> Načíst kurzy ČNB
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {CURRENCIES.filter((c) => c !== 'CZK').map((c) => (
              <Field key={c} label={c}>
                <Input
                  inputMode="decimal"
                  value={s.currency_rates[c] ?? ''}
                  onChange={(e) => set('currency_rates', { ...s.currency_rates, [c]: numOrNull(e.target.value) ?? 0 })}
                />
              </Field>
            ))}
          </div>
        </Card>

        <Card title="Doprava – sazby pro odhad ceny">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="do 3,5 t (Kč/km)">
              <Input {...num('tr_rate_small')} />
            </Field>
            <Field label="3,5–12 t (Kč/km)">
              <Input {...num('tr_rate_medium')} />
            </Field>
            <Field label="12–25 t (Kč/km)">
              <Input {...num('tr_rate_large')} />
            </Field>
            <Field label="nad 25 t (Kč/km)">
              <Input {...num('tr_rate_heavy')} />
            </Field>
            <Field label="Násobek (přistavení / cesta zpět)">
              <Input {...num('tr_return_factor')} />
            </Field>
            <Field label="Nakládka / vykládka (Kč)">
              <Input {...num('tr_loading_fee')} />
            </Field>
            <Field label="Příplatek nadrozměr (Kč)">
              <Input {...num('tr_oversize_fee')} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">Upravte podle cen, které vám skutečně účtují vaši dopravci – odhady pak budou přesnější.</p>
        </Card>

        <Card title="Kategorie strojů">
          <Field label="Jedna kategorie na řádek">
            <Textarea
              rows={8}
              value={s.categories.join('\n')}
              onChange={(e) => set('categories', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))}
            />
          </Field>
        </Card>

        <ConnectionCard />
      </div>
    </>
  );
}

function ConnectionCard() {
  const toast = useToast();
  const cfg = getSupabaseConfig();
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.key ?? '');
  const [aiKey, setAiKey] = useState(getLocalAiKey());
  const [name, setName] = useState(getLocalUserName());
  const user = backend.currentUser();

  const connect = () => {
    if (!url.startsWith('https://') || key.length < 20) return toast('Zadejte platnou URL projektu a anon klíč', 'err');
    setSupabaseConfig(url, key);
    location.reload();
  };

  const importBackup = (file: File) => {
    if (!local || !confirm('Import přepíše všechna lokální data. Pokračovat?')) return;
    file.text().then((t) => local!.importAll(t).then(() => toast('Data obnovena'), (e) => toast(errorMessage(e), 'err')));
  };

  return (
    <Card title={<span className="flex items-center gap-2">{isCloud ? <Cloud className="h-4 w-4 text-emerald-600" /> : <HardDrive className="h-4 w-4 text-amber-600" />} Připojení a data</span>}>
      {isCloud ? (
        <div className="space-y-3 text-sm">
          <p className="text-slate-700">
            Připojeno ke cloudu – data, fotky a dokumenty sdílí celý tým v reálném čase. Přihlášen: <b>{user?.name}</b> ({user?.email})
          </p>
          <p className="break-all text-xs text-slate-500">{cfg?.url}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => cloud!.client.auth.signOut().then(() => location.reload())}>
              <LogOut className="h-4 w-4" /> Odhlásit
            </Button>
            {localStorage.getItem('sp.supabase.url') && (
              <Button variant="ghost" onClick={() => confirm('Odpojit cloud na tomto zařízení?') && (setSupabaseConfig('', ''), location.reload())}>
                Odpojit cloud
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
            Aplikace běží v <b>lokálním režimu</b> – data jsou uložena jen v tomto zařízení. Pro sdílení s týmem připojte cloud (Supabase) – postup je v
            README.
          </p>
          <div className="grid gap-3">
            <Field label="Vaše jméno (zapisuje se k záznamům)">
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setLocalUserName(name)} />
            </Field>
            <Field label="Anthropic API klíč pro AI – rozpoznávání strojů a inzeráty (jen lokální režim)" hint="V cloudu je klíč bezpečně uložen na serveru.">
              <Input type="password" value={aiKey} onChange={(e) => setAiKey(e.target.value)} onBlur={() => (setLocalAiKey(aiKey), toast('Uloženo'))} placeholder="sk-ant-…" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={async () => downloadBlob(await local!.exportAll(), `strojpark-zaloha-${today()}.json`)}>
              <Download className="h-4 w-4" /> Záloha dat
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm hover:bg-slate-50">
              <Upload className="h-4 w-4" /> Obnovit ze zálohy
              <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
            </label>
            <Button onClick={async () => (await seedDemoData(), toast('Ukázková data vložena'))}>
              <Database className="h-4 w-4" /> Vložit ukázková data
            </Button>
          </div>
          <hr />
          <div className="grid gap-3">
            <div className="font-medium text-slate-800">Připojit cloud (Supabase)</div>
            <Field label="Project URL">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
            </Field>
            <Field label="Anon public key">
              <Input value={key} onChange={(e) => setKey(e.target.value)} />
            </Field>
            <div>
              <Button variant="primary" onClick={connect}>
                <Cloud className="h-4 w-4" /> Připojit
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
