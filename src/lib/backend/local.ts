import Dexie, { type Table } from 'dexie';
import { TABLES, type TableMap, type TableName } from '../types';
import { getLocalUserName } from '../config';
import type { Backend, CurrentUser, Where } from './types';
import { uuid } from '../util';

interface StoredFile {
  path: string;
  blob: Blob;
  type: string;
}

class LocalDB extends Dexie {
  files!: Table<StoredFile, string>;
  constructor() {
    super('strojpark');
    const schema: Record<string, string> = { files: 'path' };
    for (const t of TABLES) schema[t] = 'id, machine_id, service_order_id';
    this.version(1).stores(schema);
  }
  t<K extends TableName>(name: K): Table<TableMap[K], string> {
    return this.table(name);
  }
}

export class LocalBackend implements Backend {
  readonly mode = 'local' as const;
  private db = new LocalDB();
  private listeners = new Set<(t: TableName) => void>();
  private urlCache = new Map<string, string>();
  private channel: BroadcastChannel | null =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('strojpark') : null;

  constructor() {
    // synchronizace mezi záložkami stejného prohlížeče
    if (this.channel) this.channel.onmessage = (e) => this.emit(e.data as TableName, false);
  }

  private emit(table: TableName, broadcast = true) {
    this.listeners.forEach((l) => l(table));
    if (broadcast) this.channel?.postMessage(table);
  }

  currentUser(): CurrentUser {
    const name = getLocalUserName() || 'Uživatel';
    return { id: 'local', name };
  }

  async list<K extends TableName>(table: K, where?: Where<TableMap[K]>): Promise<TableMap[K][]> {
    let rows = await this.db.t(table).toArray();
    if (where) {
      const entries = Object.entries(where);
      rows = rows.filter((r) => entries.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v));
    }
    return rows;
  }

  async get<K extends TableName>(table: K, id: string) {
    return (await this.db.t(table).get(id)) ?? null;
  }

  async upsert<K extends TableName>(table: K, row: Partial<TableMap[K]> & { id?: string }) {
    const now = new Date().toISOString();
    const user = this.currentUser().name;
    const id = row.id ?? uuid();
    const existing = await this.db.t(table).get(id);
    const next = {
      ...(existing ?? { created_at: now, created_by: user }),
      ...row,
      id,
      updated_at: now,
      updated_by: user,
    } as TableMap[K];
    await this.db.t(table).put(next);
    this.emit(table);
    return next;
  }

  async remove(table: TableName, id: string) {
    await this.db.table(table).delete(id);
    this.emit(table);
  }

  async uploadFile(path: string, file: Blob, contentType: string) {
    await this.db.files.put({ path, blob: file, type: contentType });
  }

  async fileUrl(path: string) {
    const cached = this.urlCache.get(path);
    if (cached) return cached;
    const f = await this.db.files.get(path);
    if (!f) return '';
    const url = URL.createObjectURL(f.blob);
    this.urlCache.set(path, url);
    return url;
  }

  async removeFile(path: string) {
    await this.db.files.delete(path);
    const u = this.urlCache.get(path);
    if (u) URL.revokeObjectURL(u);
    this.urlCache.delete(path);
  }

  subscribe(cb: (t: TableName) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Záloha celé lokální databáze včetně souborů (JSON s base64). */
  async exportAll(): Promise<Blob> {
    const data: Record<string, unknown> = {};
    for (const t of TABLES) data[t] = await this.db.table(t).toArray();
    const files = await this.db.files.toArray();
    data.files = await Promise.all(
      files.map(async (f) => ({ path: f.path, type: f.type, data: await blobToBase64(f.blob) })),
    );
    return new Blob([JSON.stringify(data)], { type: 'application/json' });
  }

  async importAll(json: string) {
    const data = JSON.parse(json) as Record<string, unknown[]>;
    await this.db.transaction('rw', [...TABLES.map((t) => this.db.table(t)), this.db.files], async () => {
      for (const t of TABLES) {
        await this.db.table(t).clear();
        if (Array.isArray(data[t])) await this.db.table(t).bulkPut(data[t]);
      }
      await this.db.files.clear();
      for (const f of (data.files ?? []) as { path: string; type: string; data: string }[]) {
        await this.db.files.put({ path: f.path, type: f.type, blob: base64ToBlob(f.data, f.type) });
      }
    });
    TABLES.forEach((t) => this.emit(t));
  }
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}
function base64ToBlob(b64: string, type: string) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
