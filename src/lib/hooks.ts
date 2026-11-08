import { useCallback, useEffect, useMemo, useState } from 'react';
import { backend } from './backend';
import type { Where } from './backend/types';
import type { CompanySettings, TableMap, TableName } from './types';
import { DEFAULT_SETTINGS } from './domain';

/** Načte tabulku a automaticky ji obnoví při změně (i od kolegů v cloudu). */
export function useTable<K extends TableName>(table: K, where?: Where<TableMap[K]>, enabled = true) {
  const [data, setData] = useState<TableMap[K][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(where ?? {});

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const rows = await backend.list(table, where);
      setData(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, key, enabled]);

  useEffect(() => {
    load();
    return backend.subscribe((t) => {
      if (t === table) load();
    });
  }, [load, table]);

  return { data, loading, error, reload: load };
}

export function useRow<K extends TableName>(table: K, id: string | undefined) {
  const [row, setRow] = useState<TableMap[K] | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setRow(await backend.get(table, id));
    setLoading(false);
  }, [table, id]);
  useEffect(() => {
    load();
    return backend.subscribe((t) => {
      if (t === table) load();
    });
  }, [load, table]);
  return { row, loading, reload: load };
}

export const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export function useSettings() {
  const { row, loading } = useRow('settings', SETTINGS_ID);
  const settings: CompanySettings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...(row?.value ?? {}) }),
    [row],
  );
  const save = (value: CompanySettings) => backend.upsert('settings', { id: SETTINGS_ID, value });
  return { settings, loading, save };
}

export function useFileUrl(path: string | null | undefined) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    if (path) backend.fileUrl(path).then((u) => alive && setUrl(u));
    else setUrl('');
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}
