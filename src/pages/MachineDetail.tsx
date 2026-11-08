import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarPlus, Pencil, Trash2, Wrench, Sparkles, ChevronLeft, Plus } from 'lucide-react';
import { backend } from '../lib/backend';
import { useFleet } from '../lib/fleet';
import { useTable } from '../lib/hooks';
import { SERVICE_STATUS } from '../lib/domain';
import { uploadMedia } from '../lib/media';
import type { Media } from '../lib/types';
import { Badge, Button, Card, confirmDelete, Empty, PageHeader, Spinner, Tabs, useToast } from '../components/ui';
import { AvailabilityBadge } from '../components/MachineStatus';
import { CoverImage, DocumentList, DocumentPicker, PhotoGrid, PhotoPicker } from '../components/Media';
import { BookingList, BookingModal, RateEditor } from '../components/Rental';
import { errorMessage, fmtDate, fmtDateTime, machineTitle, money, number } from '../lib/util';

type Tab = 'prehled' | 'fotky' | 'dokumenty' | 'servis' | 'pujcovna';

export function MachineDetail() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const f = useFleet();
  const media = useTable('media', { machine_id: id });
  const [uploading, setUploading] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const tab = (params.get('tab') as Tab) || 'prehled';
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });

  const m = f.machineById.get(id);
  if (f.loading) return <Spinner />;
  if (!m) return <Empty title="Stroj nenalezen" />;

  const photos = media.data.filter((x) => x.kind === 'photo');
  const docs = media.data.filter((x) => x.kind === 'document');
  const services = f.services.filter((s) => s.machine_id === id).sort((a, b) => b.received_at.localeCompare(a.received_at));
  const bookings = f.bookings.filter((b) => b.machine_id === id);
  const rate = f.rates.get(id);
  const av = f.availability.get(id)!;
  const own = m.ownership === 'vlastni';

  const addFiles = async (files: File[], kind: Media['kind']) => {
    setUploading(true);
    try {
      let first: Media | null = null;
      for (const file of files) {
        const md = await uploadMedia(file, { machineId: id, kind });
        first ??= md;
      }
      if (kind === 'photo' && !m.cover_media_id && first) await backend.upsert('machines', { id, cover_media_id: first.id });
      toast(files.length > 1 ? `Nahráno ${files.length} souborů` : 'Nahráno');
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete(`stroj ${machineTitle(m)} včetně fotek, dokumentů, servisní historie a rezervací`)) return;
    try {
      for (const md of media.data) await backend.removeFile(md.path);
      if (backend.mode === 'local') {
        // lokálně nemáme kaskádové mazání jako v databázi
        for (const md of media.data) await backend.remove('media', md.id);
        for (const b of bookings) await backend.remove('bookings', b.id);
        for (const s of services) {
          for (const w of await backend.list('service_work', { service_order_id: s.id })) await backend.remove('service_work', w.id);
          for (const p of await backend.list('service_parts', { service_order_id: s.id })) await backend.remove('service_parts', p.id);
          await backend.remove('service_orders', s.id);
        }
        if (rate) await backend.remove('rental_rates', rate.id);
      }
      await backend.remove('machines', id);
      toast('Stroj smazán');
      nav('/stroje', { replace: true });
    } catch (e) {
      toast(errorMessage(e), 'err');
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'prehled', label: 'Přehled' },
    { id: 'fotky', label: `Fotky (${photos.length})` },
    { id: 'dokumenty', label: `Dokumenty (${docs.length})` },
    { id: 'servis', label: `Servis (${services.length})` },
    ...(own ? [{ id: 'pujcovna' as Tab, label: `Půjčovna a prodej (${bookings.filter((b) => b.status === 'aktivni').length})` }] : []),
  ];

  return (
    <>
      <Link to="/stroje" className="mb-2 inline-flex items-center text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft className="h-4 w-4" /> Stroje
      </Link>
      <PageHeader
        title={machineTitle(m)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <AvailabilityBadge a={av} detail />
            <span>{[m.category, m.brand && m.model && `${m.brand} ${m.model}`, m.year].filter(Boolean).join(' · ')}</span>
          </span>
        }
        actions={
          <>
            {own && m.lifecycle === 'aktivni' && (
              <Button variant="primary" onClick={() => setBookingOpen(true)}>
                <CalendarPlus className="h-4 w-4" /> Půjčit / rezervovat
              </Button>
            )}
            <Link to={`/servis/novy?stroj=${id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm hover:bg-slate-50">
              <Wrench className="h-4 w-4" /> Do servisu
            </Link>
            <Link to={`/stroje/${id}/upravit`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm hover:bg-slate-50">
              <Pencil className="h-4 w-4" /> Upravit
            </Link>
            <Button variant="ghost" onClick={remove} title="Smazat stroj">
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
      />

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'prehled' && (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <button onClick={() => setTab('fotky')} className="block w-full">
              <CoverImage path={f.coverPath(m)} className="aspect-[16/10] w-full rounded-xl" />
            </button>
            {m.description && (
              <Card title="Popis">
                <p className="whitespace-pre-line text-sm text-slate-700">{m.description}</p>
              </Card>
            )}
          </div>
          <div className="space-y-4">
            <Card title="Parametry">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <P l="Značka" v={m.brand} />
                <P l="Typ" v={m.model} />
                <P l="Kategorie" v={m.category} />
                <P l="Rok výroby" v={m.year} />
                <P l="Motohodiny" v={m.hours != null ? number(m.hours, 'mth') : null} />
                <P l="Výrobní číslo" v={m.serial_number} mono />
                <P l="Hmotnost" v={m.weight_kg ? number(m.weight_kg, 'kg') : null} />
                <P l="Výkon" v={m.power_kw ? number(m.power_kw, 'kW') : null} />
                <P l="Stav" v={m.condition} />
                <P l="Umístění" v={m.location} />
                {!own && <P l="Zákazník" v={m.customer_name} />}
              </dl>
            </Card>
            {own && (
              <Card title="Obchod">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <P l="Prodej" v={m.for_sale ? money(m.sale_price) : 'Není na prodej'} />
                  <P l="Pořizovací cena" v={money(m.purchase_price)} />
                  <P l="Půjčovna" v={m.for_rent ? (rate?.price_day ? `${money(rate.price_day)} / den` : 'bez ceníku') : 'Není v půjčovně'} />
                  <P l="Stav evidence" v={{ aktivni: 'Aktivní', prodano: 'Prodáno', vyrazeno: 'Vyřazeno' }[m.lifecycle]} />
                </dl>
              </Card>
            )}
            {m.ai_data && (
              <Card title={<span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-brand-600" />Rozpoznání AI</span>}>
                <div className="text-sm text-slate-700">
                  <b>
                    {m.ai_data.brand} {m.ai_data.model}
                  </b>{' '}
                  · {m.ai_data.category} · jistota {m.ai_data.confidence}
                  {m.ai_data.recognized_at && <div className="text-xs text-slate-500">{fmtDateTime(m.ai_data.recognized_at)}</div>}
                </div>
              </Card>
            )}
            <div className="text-xs text-slate-500">
              Založeno {fmtDateTime(m.created_at)} {m.created_by && `(${m.created_by})`} · upraveno {fmtDateTime(m.updated_at)}{' '}
              {m.updated_by && `(${m.updated_by})`}
            </div>
          </div>
        </div>
      )}

      {tab === 'fotky' && (
        <Card title="Fotky stroje" actions={<PhotoPicker compact onFiles={(fs) => addFiles(fs, 'photo')} busy={uploading} />}>
          <PhotoGrid
            photos={photos}
            coverId={m.cover_media_id}
            onSetCover={(p) => backend.upsert('machines', { id, cover_media_id: p.id })}
          />
          {photos.some((p) => p.service_order_id) && (
            <p className="mt-3 text-xs text-slate-500">Včetně fotek ze servisních zakázek (příjem, průběh a dokončení opravy).</p>
          )}
        </Card>
      )}

      {tab === 'dokumenty' && (
        <Card title="Dokumenty" actions={<DocumentPicker onFiles={(fs) => addFiles(fs, 'document')} busy={uploading} />}>
          <DocumentList docs={docs} />
        </Card>
      )}

      {tab === 'servis' && (
        <Card
          title="Servisní historie"
          actions={
            <Link to={`/servis/novy?stroj=${id}`} className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-sm font-semibold text-slate-900">
              <Plus className="h-4 w-4" /> Nová zakázka
            </Link>
          }
        >
          {services.length === 0 ? (
            <Empty icon={<Wrench className="h-7 w-7" />} title="Zatím žádný servis" />
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {services.map((s) => (
                <li key={s.id}>
                  <Link to={`/servis/${s.id}`} className="flex items-center gap-3 py-3 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {s.number} · {fmtDate(s.received_at)}
                      </div>
                      <div className="truncate text-xs text-slate-500">{s.fault_description || s.diagnosis || '—'}</div>
                    </div>
                    <Badge className={SERVICE_STATUS[s.status].color}>{SERVICE_STATUS[s.status].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'pujcovna' && own && (
        <div className="space-y-4">
          <Card title="Ceník půjčovného">
            <RateEditor machine={m} />
          </Card>
          <Card
            title="Výpůjčky a rezervace"
            actions={
              m.lifecycle === 'aktivni' && (
                <Button size="sm" variant="primary" onClick={() => setBookingOpen(true)}>
                  <Plus className="h-4 w-4" /> Nová
                </Button>
              )
            }
          >
            <BookingList bookings={bookings} showMachine={false} />
          </Card>
        </div>
      )}

      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        machineId={id}
        defaultType={m.for_rent ? 'pronajem' : 'rezervace_prodej'}
      />
    </>
  );
}

function P({ l, v, mono }: { l: string; v: string | number | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{l}</dt>
      <dd className={mono ? 'font-mono text-slate-900' : 'font-medium text-slate-900'}>{v === '' || v == null ? '—' : v}</dd>
    </div>
  );
}
