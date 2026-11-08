// Nastavení připojení. Cloud (Supabase) se bere z proměnných prostředí při
// buildu (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), případně z hodnot
// zadaných v aplikaci v Nastavení (uloženo v localStorage zařízení).

const LS = {
  supaUrl: 'sp.supabase.url',
  supaKey: 'sp.supabase.key',
  aiKey: 'sp.ai.key',
  userName: 'sp.user.name',
};

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignorovat */
  }
}

export function getSupabaseConfig(): { url: string; key: string } | null {
  const url = read(LS.supaUrl) || import.meta.env.VITE_SUPABASE_URL || '';
  const key = read(LS.supaKey) || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  return url && key ? { url, key } : null;
}

export function setSupabaseConfig(url: string, key: string) {
  write(LS.supaUrl, url.trim());
  write(LS.supaKey, key.trim());
}

/** API klíč Anthropic – pouze pro lokální (demo) režim. V cloudu je klíč na serveru. */
export const getLocalAiKey = () => read(LS.aiKey);
export const setLocalAiKey = (v: string) => write(LS.aiKey, v.trim());

export const getLocalUserName = () => read(LS.userName);
export const setLocalUserName = (v: string) => write(LS.userName, v.trim());
