/**
 * Projeto Supabase do Atlas Board. A chave publicável é feita para ficar no
 * navegador (só dá acesso ao que as regras do projeto liberam).
 * Pode ser trocada no build com VITE_SUPABASE_URL e VITE_SUPABASE_KEY.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://aifyypsdeklifevfronl.supabase.co';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_vOU1W_JdrjMb_aHJt2WPMg_wDMAoOZA';
