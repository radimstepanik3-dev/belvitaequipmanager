import { getSupabaseConfig } from '../config';
import { LocalBackend } from './local';
import { SupabaseBackend } from './supabase';
import type { Backend } from './types';

export type { Backend } from './types';

const cfg = getSupabaseConfig();

/** Jediná instance backendu pro celou aplikaci. */
export const backend: Backend = cfg ? new SupabaseBackend(cfg.url, cfg.key) : new LocalBackend();

export const isCloud = backend.mode === 'cloud';
export const cloud = backend instanceof SupabaseBackend ? backend : null;
export const local = backend instanceof LocalBackend ? backend : null;
