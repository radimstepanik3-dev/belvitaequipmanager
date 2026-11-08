import { format, parseISO, isValid } from 'date-fns';
import { cs } from 'date-fns/locale';

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const czk = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });

export const money = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? '—' : czk.format(v));
export const number = (v: number | null | undefined, suffix = '') =>
  v == null || Number.isNaN(v) ? '—' : `${num.format(v)}${suffix ? ' ' + suffix : ''}`;

export function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = parseISO(v);
  return isValid(d) ? d : null;
}
export const fmtDate = (v: string | null | undefined) => {
  const d = toDate(v);
  return d ? format(d, 'd. M. yyyy', { locale: cs }) : '—';
};
export const fmtDateTime = (v: string | null | undefined) => {
  const d = toDate(v);
  return d ? format(d, 'd. M. yyyy HH:mm', { locale: cs }) : '—';
};
export const today = () => format(new Date(), 'yyyy-MM-dd');
export const isoDay = (d: Date) => format(d, 'yyyy-MM-dd');

/** Převod hodnoty z inputu na číslo nebo null. */
export const numOrNull = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
};

export const machineTitle = (m: { name?: string; brand?: string; model?: string }) =>
  m.name?.trim() || [m.brand, m.model].filter(Boolean).join(' ') || 'Bez názvu';

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export function cls(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** České skloňování podle počtu: plural(3, 'stroj', 'stroje', 'strojů') → "3 stroje" */
export function plural(n: number, one: string, few: string, many: string) {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}
