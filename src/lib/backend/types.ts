import type { TableMap, TableName } from '../types';

export type Where<T> = Partial<Record<keyof T, string | number | boolean | null>>;

export interface CurrentUser {
  id: string;
  name: string;
  email?: string;
}

/**
 * Jednotné rozhraní nad úložištěm dat. Implementace:
 *  - LocalBackend: IndexedDB v zařízení (demo / offline jeden uživatel)
 *  - SupabaseBackend: sdílená cloudová databáze + úložiště souborů pro celý tým
 */
export interface Backend {
  readonly mode: 'local' | 'cloud';
  list<K extends TableName>(table: K, where?: Where<TableMap[K]>): Promise<TableMap[K][]>;
  get<K extends TableName>(table: K, id: string): Promise<TableMap[K] | null>;
  upsert<K extends TableName>(table: K, row: Partial<TableMap[K]> & { id?: string }): Promise<TableMap[K]>;
  remove(table: TableName, id: string): Promise<void>;

  uploadFile(path: string, file: Blob, contentType: string): Promise<void>;
  fileUrl(path: string): Promise<string>;
  removeFile(path: string): Promise<void>;

  /** Zavolá cb při jakékoli změně dat (i od jiných uživatelů v cloudu). */
  subscribe(cb: (table: TableName) => void): () => void;

  currentUser(): CurrentUser | null;
}
