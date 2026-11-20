-- Atlas Board: contas (Supabase Auth), dono do mapa e compartilhamento.
-- Só mexe nas tabelas e funções do Atlas Board (prefixo atlas_).
-- Os links antigos (?mapa=id#chave) continuam funcionando: mapas sem dono
-- ficam com acesso por link "edit", como antes.

alter table public.atlas_maps
  add column if not exists owner_id uuid references auth.users (id) on delete set null,
  add column if not exists link_access text not null default 'edit';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'atlas_maps_link_access_check') then
    alter table public.atlas_maps
      add constraint atlas_maps_link_access_check check (link_access in ('edit', 'view', 'none'));
  end if;
end $$;

create index if not exists atlas_maps_owner_idx on public.atlas_maps (owner_id);

-- Convites por e-mail. Vale também para quem ainda não tem conta:
-- o acesso aparece quando a pessoa entra com aquele e-mail.
create table if not exists public.atlas_map_shares (
  map_id uuid not null references public.atlas_maps (id) on delete cascade,
  email text not null check (email = lower(email) and length(email) between 3 and 254),
  role text not null check (role in ('view', 'edit')),
  created_at timestamptz not null default now(),
  primary key (map_id, email)
);
create index if not exists atlas_map_shares_email_idx on public.atlas_map_shares (email);
alter table public.atlas_map_shares enable row level security;
-- Sem políticas: só as funções abaixo leem e escrevem.
revoke all on public.atlas_map_shares from anon, authenticated;

-- Hash da chave do link (mesmo formato da migração anterior).
create or replace function public.atlas_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- Papel de quem chama neste mapa: owner, edit, view ou null (sem acesso).
create or replace function public.atlas_role(p_id uuid, p_token text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.atlas_maps%rowtype;
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_share text;
  v_link text;
begin
  select * into m from public.atlas_maps where id = p_id;
  if not found then
    return null;
  end if;
  if v_uid is not null and m.owner_id = v_uid then
    return 'owner';
  end if;
  if v_uid is not null and v_email <> '' then
    select s.role into v_share from public.atlas_map_shares s where s.map_id = p_id and s.email = v_email;
  end if;
  if p_token is not null and length(p_token) >= 24 and m.link_access <> 'none'
     and m.token_hash = public.atlas_token_hash(p_token) then
    v_link := m.link_access;
  end if;
  if v_share = 'edit' or v_link = 'edit' then
    return 'edit';
  end if;
  return coalesce(v_share, v_link);
end;
$$;

-- As funções antigas passam a respeitar o acesso por link (padrão "edit",
-- então nada muda para os mapas sem dono).
create or replace function public.atlas_save_map(p_id uuid, p_token text, p_name text, p_data text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_token is null or length(p_token) < 24 or length(p_token) > 128 then
    raise exception 'chave inválida';
  end if;
  if p_data is null or length(p_data) > 8000000 then
    raise exception 'mapa grande demais';
  end if;
  if p_id is null then
    insert into public.atlas_maps (token_hash, name, data)
    values (public.atlas_token_hash(p_token), left(coalesce(p_name, 'Mapa'), 120), p_data)
    returning id into v_id;
  else
    update public.atlas_maps
       set name = left(coalesce(p_name, 'Mapa'), 120), data = p_data, updated_at = now()
     where id = p_id and token_hash = public.atlas_token_hash(p_token) and link_access = 'edit'
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
     and m.link_access <> 'none'
     and m.token_hash = public.atlas_token_hash(p_token);
$$;

-- Abre um mapa pela conta (dono ou convidado) e/ou pela chave do link.
create or replace function public.atlas_open_map(p_id uuid, p_token text default null)
returns table (name text, data text, updated_at timestamptz, role text, link_access text, owner_email text)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_role text := public.atlas_role(p_id, p_token);
begin
  if v_role is null then
    return;
  end if;
  return query
    select m.name, m.data, m.updated_at, v_role, m.link_access, u.email::text
      from public.atlas_maps m
      left join auth.users u on u.id = m.owner_id
     where m.id = p_id;
end;
$$;

-- Salva: cria (com dono, se houver conta) ou atualiza quem pode editar.
create or replace function public.atlas_put_map(p_id uuid, p_token text, p_name text, p_data text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if p_data is null or length(p_data) > 8000000 then
    raise exception 'mapa grande demais';
  end if;
  if p_id is null then
    if p_token is null or length(p_token) < 24 or length(p_token) > 128 then
      raise exception 'chave inválida';
    end if;
    -- Mapa com dono nasce privado (só o dono e os convidados); sem conta, por link como antes.
    insert into public.atlas_maps (token_hash, name, data, owner_id, link_access)
    values (public.atlas_token_hash(p_token), left(coalesce(p_name, 'Mapa'), 120), p_data, v_uid,
            case when v_uid is null then 'edit' else 'none' end)
    returning id into v_id;
    return v_id;
  end if;
  if coalesce(public.atlas_role(p_id, p_token), '') not in ('owner', 'edit') then
    raise exception 'mapa não encontrado';
  end if;
  update public.atlas_maps
     set name = left(coalesce(p_name, 'Mapa'), 120), data = p_data, updated_at = now()
   where id = p_id
  returning id into v_id;
  return v_id;
end;
$$;

-- Passa um mapa antigo (sem dono) para a conta de quem tem a chave.
create or replace function public.atlas_claim_map(p_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'entre na sua conta';
  end if;
  update public.atlas_maps
     set owner_id = auth.uid()
   where id = p_id and owner_id is null and link_access = 'edit'
     and token_hash = public.atlas_token_hash(p_token)
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- Meus mapas: os que são meus e os compartilhados comigo.
create or replace function public.atlas_my_maps()
returns table (id uuid, name text, updated_at timestamptz, role text, link_access text, owner_email text)
language sql
security definer
set search_path = ''
stable
as $$
  select m.id, m.name, m.updated_at,
         case when m.owner_id = auth.uid() then 'owner' else s.role end,
         m.link_access, u.email::text
    from public.atlas_maps m
    left join public.atlas_map_shares s
      on s.map_id = m.id and s.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    left join auth.users u on u.id = m.owner_id
   where auth.uid() is not null
     and (m.owner_id = auth.uid() or s.email is not null)
   order by m.updated_at desc
   limit 200;
$$;

create or replace function public.atlas_list_shares(p_id uuid)
returns table (email text, role text)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if public.atlas_role(p_id, null) is distinct from 'owner' then
    raise exception 'só o dono vê os convites';
  end if;
  return query select s.email, s.role from public.atlas_map_shares s where s.map_id = p_id order by s.created_at;
end;
$$;

-- Convida (ou muda o papel). p_role nulo tira o convite.
create or replace function public.atlas_share_map(p_id uuid, p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if public.atlas_role(p_id, null) is distinct from 'owner' then
    raise exception 'só o dono compartilha';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'e-mail inválido';
  end if;
  if p_role is null then
    delete from public.atlas_map_shares where map_id = p_id and email = v_email;
    return;
  end if;
  if p_role not in ('view', 'edit') then
    raise exception 'papel inválido';
  end if;
  if (select count(*) from public.atlas_map_shares where map_id = p_id) >= 50
     and not exists (select 1 from public.atlas_map_shares where map_id = p_id and email = v_email) then
    raise exception 'limite de convites';
  end if;
  insert into public.atlas_map_shares (map_id, email, role) values (p_id, v_email, p_role)
  on conflict (map_id, email) do update set role = excluded.role;
end;
$$;

-- Acesso por link: edit, view ou none. Com p_new_token, troca a chave
-- (o link antigo para de funcionar).
create or replace function public.atlas_set_link(p_id uuid, p_access text, p_new_token text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.atlas_role(p_id, null) is distinct from 'owner' then
    raise exception 'só o dono muda o link';
  end if;
  if p_access not in ('edit', 'view', 'none') then
    raise exception 'acesso inválido';
  end if;
  if p_new_token is not null and (length(p_new_token) < 24 or length(p_new_token) > 128) then
    raise exception 'chave inválida';
  end if;
  update public.atlas_maps
     set link_access = p_access,
         token_hash = case when p_new_token is null then token_hash else public.atlas_token_hash(p_new_token) end
   where id = p_id;
end;
$$;

create or replace function public.atlas_delete_map(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.atlas_role(p_id, null) is distinct from 'owner' then
    raise exception 'só o dono apaga';
  end if;
  delete from public.atlas_maps where id = p_id;
end;
$$;

-- Convidado sai de um mapa compartilhado.
create or replace function public.atlas_leave_map(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.atlas_map_shares
   where map_id = p_id and email = lower(coalesce(auth.jwt() ->> 'email', '')) and auth.uid() is not null;
$$;

-- Permissões: as internas não ficam expostas pela API.
revoke all on function public.atlas_token_hash(text) from public, anon, authenticated;
revoke all on function public.atlas_role(uuid, text) from public, anon, authenticated;

revoke all on function public.atlas_open_map(uuid, text) from public;
revoke all on function public.atlas_put_map(uuid, text, text, text) from public;
revoke all on function public.atlas_claim_map(uuid, text) from public, anon;
revoke all on function public.atlas_my_maps() from public, anon;
revoke all on function public.atlas_list_shares(uuid) from public, anon;
revoke all on function public.atlas_share_map(uuid, text, text) from public, anon;
revoke all on function public.atlas_set_link(uuid, text, text) from public, anon;
revoke all on function public.atlas_delete_map(uuid) from public, anon;
revoke all on function public.atlas_leave_map(uuid) from public, anon;

grant execute on function public.atlas_open_map(uuid, text) to anon, authenticated;
grant execute on function public.atlas_put_map(uuid, text, text, text) to anon, authenticated;
grant execute on function public.atlas_claim_map(uuid, text) to authenticated;
grant execute on function public.atlas_my_maps() to authenticated;
grant execute on function public.atlas_list_shares(uuid) to authenticated;
grant execute on function public.atlas_share_map(uuid, text, text) to authenticated;
grant execute on function public.atlas_set_link(uuid, text, text) to authenticated;
grant execute on function public.atlas_delete_map(uuid) to authenticated;
grant execute on function public.atlas_leave_map(uuid) to authenticated;
