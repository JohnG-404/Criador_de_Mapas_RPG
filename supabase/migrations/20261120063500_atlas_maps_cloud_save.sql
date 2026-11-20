-- Atlas Board: mapas salvos na nuvem, acessados só por id + chave secreta.
-- Já aplicada no projeto Supabase. Guardada aqui como registro.
create table if not exists public.atlas_maps (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  name text not null default 'Mapa',
  data text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.atlas_maps enable row level security;
-- Sem políticas: ninguém lê ou escreve a tabela direto, só pelas funções abaixo.
revoke all on public.atlas_maps from anon, authenticated;

create or replace function public.atlas_save_map(p_id uuid, p_token text, p_name text, p_data text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_id uuid;
begin
  if p_token is null or length(p_token) < 24 or length(p_token) > 128 then
    raise exception 'chave inválida';
  end if;
  if p_data is null or length(p_data) > 8000000 then
    raise exception 'mapa grande demais';
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if p_id is null then
    insert into public.atlas_maps (token_hash, name, data)
    values (v_hash, left(coalesce(p_name, 'Mapa'), 120), p_data)
    returning id into v_id;
  else
    update public.atlas_maps
       set name = left(coalesce(p_name, 'Mapa'), 120), data = p_data, updated_at = now()
     where id = p_id and token_hash = v_hash
    returning id into v_id;
    if v_id is null then
      raise exception 'mapa não encontrado';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.atlas_load_map(p_id uuid, p_token text)
returns table (name text, data text, updated_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select m.name, m.data, m.updated_at
    from public.atlas_maps m
   where m.id = p_id
     and m.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

revoke all on function public.atlas_save_map(uuid, text, text, text) from public;
revoke all on function public.atlas_load_map(uuid, text) from public;
grant execute on function public.atlas_save_map(uuid, text, text, text) to anon, authenticated;
grant execute on function public.atlas_load_map(uuid, text) to anon, authenticated;
