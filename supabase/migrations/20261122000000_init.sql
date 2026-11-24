-- =============================================================================
-- Notas colaborativas en tiempo real — esquema inicial
--
-- Tablas:
--   profiles          datos públicos del usuario (nombre, color de cursor)
--   documents         metadatos del documento (título, vista previa, acceso por enlace)
--   document_members  quién puede abrir cada documento y con qué rol
--   document_states   estado binario Yjs del documento (solo lo toca el servidor WS)
--
-- Seguridad:
--   * RLS activado en todas las tablas.
--   * Los clientes (anon/authenticated) solo tienen los privilegios mínimos;
--     las altas de documentos y miembros pasan por funciones RPC que validan.
--   * document_states no tiene políticas: solo la service role (servidor WS)
--     puede leer/escribir el contenido binario.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.document_role as enum ('owner', 'editor', 'viewer');
create type public.link_access as enum ('none', 'view', 'edit');

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  color        text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at   timestamptz not null default now()
);
create index profiles_email_lower_idx on public.profiles (lower(email));

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  title           text not null default '' check (char_length(title) <= 200),
  content_preview text not null default '',
  link_access     public.link_access not null default 'none',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index documents_owner_id_idx on public.documents (owner_id);

create table public.document_members (
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.document_role not null,
  created_at  timestamptz not null default now(),
  primary key (document_id, user_id)
);
create index document_members_user_id_idx on public.document_members (user_id);
-- Un único propietario por documento.
create unique index document_members_one_owner_idx
  on public.document_members (document_id) where role = 'owner';

create table public.document_states (
  document_id uuid primary key references public.documents (id) on delete cascade,
  state       bytea not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Privilegios: mínimos para los clientes, todo para la service role
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.documents, public.document_members, public.document_states
  from anon, authenticated;
grant all on public.profiles, public.documents, public.document_members, public.document_states
  to service_role;

grant select on public.profiles to authenticated;
grant update (display_name, color) on public.profiles to authenticated;

grant select on public.documents to authenticated;
grant update (link_access) on public.documents to authenticated;
grant delete on public.documents to authenticated;

grant select on public.document_members to authenticated;
grant update (role) on public.document_members to authenticated;
grant delete on public.document_members to authenticated;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares para RLS (security definer → evitan recursión de políticas)
-- ---------------------------------------------------------------------------
create or replace function public.document_role_for(p_document_id uuid)
returns public.document_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.document_members m
  where m.document_id = p_document_id
    and m.user_id = (select auth.uid());
$$;

create or replace function public.shares_document_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.document_members mine
    join public.document_members theirs on theirs.document_id = mine.document_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.documents        enable row level security;
alter table public.document_members enable row level security;
alter table public.document_states  enable row level security;

-- profiles: el propio perfil y los de personas con las que compartes documento
create policy "profiles_select_self_or_collaborators" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_document_with(id));

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- documents: visibles para sus miembros; solo el propietario cambia acceso o borra
create policy "documents_select_members" on public.documents
  for select to authenticated
  using (public.document_role_for(id) is not null);

create policy "documents_update_owner" on public.documents
  for update to authenticated
  using (public.document_role_for(id) = 'owner')
  with check (public.document_role_for(id) = 'owner');

create policy "documents_delete_owner" on public.documents
  for delete to authenticated
  using (public.document_role_for(id) = 'owner');

-- document_members: los miembros ven la lista; el propietario gestiona roles;
-- cualquiera (salvo el propietario) puede abandonar un documento
create policy "members_select_members" on public.document_members
  for select to authenticated
  using (public.document_role_for(document_id) is not null);

create policy "members_update_owner" on public.document_members
  for update to authenticated
  using (public.document_role_for(document_id) = 'owner' and role <> 'owner')
  with check (role in ('editor', 'viewer'));

create policy "members_delete_owner_or_self" on public.document_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (
      user_id = (select auth.uid())
      or public.document_role_for(document_id) = 'owner'
    )
  );

-- document_states: sin políticas → inaccesible para clientes (solo service role)

-- ---------------------------------------------------------------------------
-- Perfil automático al registrarse
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  palette text[] := array[
    '#e11d48', '#db2777', '#9333ea', '#4f46e5', '#2563eb', '#0284c7',
    '#0d9488', '#059669', '#65a30d', '#ca8a04', '#ea580c', '#dc2626'
  ];
  v_name text;
begin
  v_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if v_name is null then
    v_name := split_part(coalesce(new.email, 'usuario'), '@', 1);
  end if;

  insert into public.profiles (id, email, display_name, color)
  values (
    new.id,
    coalesce(new.email, ''),
    left(v_name, 80),
    palette[1 + floor(random() * array_length(palette, 1))::int]
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- RPC para clientes
-- ---------------------------------------------------------------------------

-- Crea un documento y registra al creador como propietario.
create or replace function public.create_document(p_title text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.documents (owner_id, title)
  values (v_user, left(trim(coalesce(p_title, '')), 200))
  returning id into v_id;

  insert into public.document_members (document_id, user_id, role)
  values (v_id, v_user, 'owner');

  return v_id;
end;
$$;

-- Abre un documento: si el usuario no es miembro pero el documento tiene
-- acceso por enlace, lo añade con el rol correspondiente. Devuelve 0 filas
-- si no hay acceso (o el documento no existe).
create or replace function public.open_document(p_document_id uuid)
returns table (
  id          uuid,
  title       text,
  owner_id    uuid,
  link_access public.link_access,
  role        public.document_role
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role public.document_role;
  v_link public.link_access;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select m.role into v_role
  from public.document_members m
  where m.document_id = p_document_id and m.user_id = v_user;

  if v_role is null then
    select d.link_access into v_link from public.documents d where d.id = p_document_id;
    if v_link is null or v_link = 'none' then
      return;
    end if;
    v_role := case v_link when 'edit' then 'editor' else 'viewer' end;
    insert into public.document_members (document_id, user_id, role)
    values (p_document_id, v_user, v_role)
    on conflict on constraint document_members_pkey do nothing;
  end if;

  return query
    select d.id, d.title, d.owner_id, d.link_access, v_role
    from public.documents d
    where d.id = p_document_id;
end;
$$;

-- Invita a un usuario registrado (por email) a un documento. Solo el propietario.
create or replace function public.add_document_member(
  p_document_id uuid,
  p_email text,
  p_role public.document_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := (select auth.uid());
  v_target uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.document_members m
    where m.document_id = p_document_id and m.user_id = v_user and m.role = 'owner'
  ) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if p_role not in ('editor', 'viewer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select p.id into v_target
  from public.profiles p
  where lower(p.email) = lower(trim(p_email))
  limit 1;

  if v_target is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_target = v_user then
    raise exception 'cannot_invite_self' using errcode = '22023';
  end if;

  insert into public.document_members (document_id, user_id, role)
  values (p_document_id, v_target, p_role)
  on conflict on constraint document_members_pkey
    do update set role = excluded.role
    where public.document_members.role <> 'owner';

  return v_target;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC exclusiva del servidor WebSocket (service role): guarda un snapshot
-- de forma atómica. Devuelve false si el documento ya no existe.
-- ---------------------------------------------------------------------------
create or replace function public.save_document_snapshot(
  p_document_id uuid,
  p_state bytea,
  p_title text,
  p_preview text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents
     set title = left(coalesce(p_title, ''), 200),
         content_preview = left(coalesce(p_preview, ''), 500),
         updated_at = now()
   where id = p_document_id;

  if not found then
    return false;
  end if;

  insert into public.document_states (document_id, state, updated_at)
  values (p_document_id, p_state, now())
  on conflict (document_id)
    do update set state = excluded.state, updated_at = excluded.updated_at;

  return true;
end;
$$;

-- Las funciones son ejecutables por PUBLIC por defecto: lo restringimos.
revoke execute on function public.document_role_for(uuid) from public, anon;
revoke execute on function public.shares_document_with(uuid) from public, anon;
revoke execute on function public.create_document(text) from public, anon;
revoke execute on function public.open_document(uuid) from public, anon;
revoke execute on function public.add_document_member(uuid, text, public.document_role) from public, anon;
revoke execute on function public.save_document_snapshot(uuid, bytea, text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

grant execute on function public.document_role_for(uuid) to authenticated;
grant execute on function public.shares_document_with(uuid) to authenticated;
grant execute on function public.create_document(text) to authenticated;
grant execute on function public.open_document(uuid) to authenticated;
grant execute on function public.add_document_member(uuid, text, public.document_role) to authenticated;
grant execute on function public.save_document_snapshot(uuid, bytea, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Supabase Realtime: el panel de documentos escucha cambios de estas tablas
-- (Realtime aplica las políticas RLS de SELECT a cada suscriptor).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.documents, public.document_members;
  end if;
end;
$$;
