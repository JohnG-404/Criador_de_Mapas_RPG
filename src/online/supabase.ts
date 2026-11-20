import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

/** Onde o Supabase guarda a sessão da conta neste navegador. */
export const AUTH_STORAGE_KEY = 'atlas-board-auth';

let client: Promise<SupabaseClient> | null = null;

/**
 * Cliente do Supabase com a sessão da conta (carregado só quando preciso).
 * Ao voltar de um link de e-mail, ele lê a sessão do endereço (#access_token=…).
 */
export function getSupabase(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: AUTH_STORAGE_KEY },
    }),
  );
  return client;
}
