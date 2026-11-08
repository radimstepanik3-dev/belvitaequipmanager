import { useRef, useState } from 'react';
import { Camera, ImagePlus, FileText, Trash2, Star, Download, ChevronLeft, ChevronRight, X, Upload, Paperclip } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useFileUrl } from '../lib/hooks';
import type { Media } from '../lib/types';
import { deleteMedia, takeNativePhoto } from '../lib/media';
import { Button, confirmDelete, Empty, useToast } from './ui';
import { cls, errorMessage, fmtDateTime } from '../lib/util';

/**
 * Tlačítka "Vyfotit" a "Z galerie". Na mobilu "Vyfotit" otevře přímo fotoaparát,
 * "Z galerie" umožní vybrat více fotek najednou.
 */
export function PhotoPicker({ onFiles, busy, compact }: { onFiles: (files: File[]) => void; busy?: boolean; compact?: boolean }) {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const handle = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) onFiles(files);
  };

  const takePhoto = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const f = await takeNativePhoto();
        if (f) onFiles([f]);
      } catch (e) {
        const msg = errorMessage(e);
        if (!/cancel/i.test(msg)) toast(msg, 'err');
      }
    } else cam.current?.click();
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="primary" onClick={takePhoto} busy={busy} size={compact ? 'sm' : 'md'}>
        <Camera className="h-4 w-4" /> Vyfotit
      </Button>
      <Button type="button" onClick={() => gal.current?.click()} disabled={busy} size={compact ? 'sm' : 'md'}>
        <ImagePlus className="h-4 w-4" /> Z galerie
      </Button>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (handle(e.target.files), (e.target.value = ''))} />
      <input ref={gal} type="file" accept="image/*" multiple hidden onChange={(e) => (handle(e.target.files), (e.target.value = ''))} />
    </div>
  );
}

export function DocumentPicker({ onFiles, busy }: { onFiles: (files: File[]) => void; busy?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button type="button" onClick={() => ref.current?.click()} busy={busy}>
        <Paperclip className="h-4 w-4" /> Přidat dokument
      </Button>
      <input
        ref={ref}
        type="file"
        multiple
        hidden
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.heic,.zip"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
    </>
  );
}

function Thumb({ m, onClick, isCover }: { m: Media; onClick: () => void; isCover?: boolean }) {
  const url = useFileUrl(m.path);
  return (
    <button onClick={onClick} className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-200">
      {url && <img src={url} alt={m.caption || m.name} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />}
      {isCover && (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-500 p-1 text-slate-900">
          <Star className="h-3 w-3" fill="currentColor" />
        </span>
      )}
      {m.caption && <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-2 py-0.5 text-left text-xs text-white">{m.caption}</span>}
    </button>
  );
}

export function PhotoGrid({
  photos,
  coverId,
  onSetCover,
  emptyText = 'Zatím žádné fotky',
}: {
  photos: Media[];
  coverId?: string | null;
  onSetCover?: (m: Media) => void;
  emptyText?: string;
}) {
  const [idx, setIdx] = useState<number | null>(null);
  const sorted = [...photos].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!sorted.length)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
        <Camera className="h-4 w-4" /> {emptyText}
      </div>
    );
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {sorted.map((m, i) => (
          <Thumb key={m.id} m={m} onClick={() => setIdx(i)} isCover={m.id === coverId} />
        ))}
      </div>
      {idx != null && sorted[idx] && (
        <Lightbox
          items={sorted}
          index={idx}
          onIndex={setIdx}
          onClose={() => setIdx(null)}
          coverId={coverId}
          onSetCover={onSetCover}
        />
      )}
    </>
  );
}

function Lightbox({
  items,
  index,
  onIndex,
  onClose,
  coverId,
  onSetCover,
}: {
  items: Media[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  coverId?: string | null;
  onSetCover?: (m: Media) => void;
}) {
  const m = items[index];
  const url = useFileUrl(m.path);
  const toast = useToast();
  const prev = () => onIndex((index - 1 + items.length) % items.length);
  const next = () => onIndex((index + 1) % items.length);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex items-center justify-between gap-2 p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 text-sm">
          <div className="truncate">{m.caption || m.name}</div>
          <div className="text-xs text-white/60">
            {fmtDateTime(m.created_at)} {m.created_by && `· ${m.created_by}`} · {index + 1}/{items.length}
          </div>
        </div>
        <div className="flex gap-1">
          {onSetCover && (
            <IconBtn title="Nastavit jako hlavní fotku" onClick={() => (onSetCover(m), toast('Hlavní fotka nastavena'))}>
              <Star className="h-5 w-5" fill={m.id === coverId ? 'currentColor' : 'none'} />
            </IconBtn>
          )}
          <a href={url} download={m.name} className="rounded-lg p-2 hover:bg-white/10" title="Stáhnout">
            <Download className="h-5 w-5" />
          </a>
          <IconBtn
            title="Smazat"
            onClick={async () => {
              if (!confirmDelete('fotku')) return;
              await deleteMedia(m);
              onClose();
            }}
          >
            <Trash2 className="h-5 w-5" />
          </IconBtn>
          <IconBtn title="Zavřít" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconBtn>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-2">
        {url && <img src={url} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />}
        {items.length > 1 && (
          <>
            <button className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={(e) => (e.stopPropagation(), prev())}>
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={(e) => (e.stopPropagation(), next())}>
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const IconBtn = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className="rounded-lg p-2 hover:bg-white/10">
    {children}
  </button>
);

function DocRow({ m }: { m: Media }) {
  const url = useFileUrl(m.path);
  const kb = m.size / 1024;
  return (
    <li className="flex items-center gap-3 py-2">
      <FileText className="h-5 w-5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <a href={url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-800 hover:text-brand-700">
          {m.name}
        </a>
        <div className="text-xs text-slate-500">
          {kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.ceil(kb)} kB`} · {fmtDateTime(m.created_at)}
          {m.created_by && ` · ${m.created_by}`}
        </div>
      </div>
      <a href={url} download={m.name} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Stáhnout">
        <Download className="h-4 w-4" />
      </a>
      <button
        className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
        title="Smazat"
        onClick={async () => confirmDelete(`dokument ${m.name}`) && (await deleteMedia(m))}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

export function DocumentList({ docs }: { docs: Media[] }) {
  if (!docs.length) return <Empty icon={<Upload className="h-8 w-8" />} title="Žádné dokumenty">Technické listy, faktury, revize, návody, smlouvy…</Empty>;
  return (
    <ul className={cls('divide-y divide-slate-100')}>
      {[...docs]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((d) => (
          <DocRow key={d.id} m={d} />
        ))}
    </ul>
  );
}

export function CoverImage({ path, className }: { path?: string | null; className?: string }) {
  const url = useFileUrl(path);
  return (
    <div className={cls('overflow-hidden bg-gradient-to-br from-slate-200 to-slate-300', className)}>
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-400">
          <Camera className="h-8 w-8" />
        </div>
      )}
    </div>
  );
}
