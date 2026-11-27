-- Invitar a un email sin cuenta es un error esperado, no un fallo del servidor.
-- PostgREST traduce SQLSTATE 'PTxyz' al código HTTP xyz: ahora responde 404
-- en lugar de 500 (P0002). `create or replace` conserva los permisos.
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
    raise exception 'user_not_found' using errcode = 'PT404';
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
