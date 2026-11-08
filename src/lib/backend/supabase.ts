import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { TABLES, type TableMap, type TableName } from '../types';
import type { Backend, CurrentUser, Where } from './types';

export const BUCKET = 'media';

export class SupabaseBackend implements Backend {
  readonly mode = 'cloud' as const;
  readonly client: SupabaseClient;
  private session: Session | null = null;
  private listeners = new Set<(t: TableName) => void>();
  private urlCache = new Map<string, { url: string; exp: number }>();

  constructor(url: string, key: string) {
    this.client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
    this.client.auth.onAuthStateChange((_e, s) => {
      this.session = s;
    });
    // Realtime – změny od ostatních členů týmu se okamžitě promítnou
    const ch = this.client.channel('db-changes');
    for (const t of TABLES) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => this.emit(t));
    }
    ch.subscribe();
  }

  async init() {
    const { data } = await this.client.auth.getSession();
    this.session = data.session;
    return this.session;
  }

  private emit(t: TableName) {
    this.listeners.forEach((l) => l(t));
  }

  currentUser(): CurrentUser | null {
    const u = this.session?.user;
    if (!u) return null;
    const name = (u.user_metadata?.full_name as string) || u.email || 'Uživatel';
    return { id: u.id, name, email: u.email };
  }

  async list<K extends TableName>(table: K, where?: Where<TableMap[K]>): Promise<TableMap[K][]> {
    let q = this.client.from(table).select('*');
    for (const [k, v] of Object.entries(where ?? {})) {
      q = v === null ? q.is(k, null) : q.eq(k, v as string);
    }
    const { data, error } = await q.limit(10000);
    if (error) throw error;
    return (data ?? []) as TableMap[K][];
  }

  async get<K extends TableName>(table: K, id: string) {
    const { data, error } = await this.client.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as TableMap[K]) ?? null;
  }

  async upsert<K extends TableName>(table: K, row: Partial<TableMap[K]> & { id?: string }) {
    const user = this.currentUser()?.name ?? null;
    const payload: Record<string, unknown> = { ...row, updated_by: user, updated_at: new Date().toISOString() };
    if (!row.id) payload.created_by = user;
    const { data, error } = await this.client.from(table).upsert(payload).select().single();
    if (error) throw error;
    this.emit(table);
    return data as TableMap[K];
  }

  async remove(table: TableName, id: string) {
    const { error } = await this.client.from(table).delete().eq('id', id);
    if (error) throw error;
    this.emit(table);
  }

  async uploadFile(path: string, file: Blob, contentType: string) {
    const { error } = await this.client.storage.from(BUCKET).upload(path, file, { contentType, upsert: true });
    if (error) throw error;
  }

  async fileUrl(path: string) {
    const c = this.urlCache.get(path);
    if (c && c.exp > Date.now()) return c.url;
    const { data, error } = await this.client.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
    if (error || !data) return '';
    this.urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 1000 * 60 * 60 * 5 });
    return data.signedUrl;
  }

  async removeFile(path: string) {
    await this.client.storage.from(BUCKET).remove([path]);
    this.urlCache.delete(path);
  }

  subscribe(cb: (t: TableName) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}
