-- Portal GA 35.5: recheck current document scope before returning saved receipts.
-- Install after 35.4. No rows, roles, policies, or historical receipts are removed.
begin;
do $$ begin
 if to_regprocedure('public.status_input_tracking29(text,uuid,uuid)') is null
 or to_regprocedure('public.status_input_dokumen28(uuid,uuid)') is null then
  raise exception 'Pasang pembaruan Tracking 29 dan Portal 35.4 terlebih dahulu.';
 end if;
end $$;

create or replace function internal.portal35_5_tracking_receipt(p_value jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profil_pengguna; item jsonb; target uuid; office uuid;
begin
 if p_value is null then return null;end if;
 select * into p from public.profil_pengguna where id=auth.uid() for share;
 if p.id is null or p.aktif is distinct from true
 or (p.peran::text in ('administrator','super_admin') or (p.peran::text='admin' and p.akses_portal)) is distinct from true
 or p_value->>'pemilik' is distinct from p.id::text then
  raise exception using errcode='42501',message='Bukti penyimpanan tidak tersedia untuk akun ini.';
 end if;
 if jsonb_typeof(p_value->'dokumen') is distinct from 'array' then
  raise exception using errcode='23514',message='Bukti penyimpanan dokumen tidak lengkap.';
 end if;
 for item in select value from jsonb_array_elements(p_value->'dokumen') loop
  begin target:=(item->>'id')::uuid;
  exception when invalid_text_representation then
   raise exception using errcode='23514',message='Bukti penyimpanan dokumen tidak lengkap.';
  end;
  select d.office_id into office from public.dokumen d where d.id=target for share;
  if not found or (p.peran::text<>'administrator' and (p.office_id is null or office is distinct from p.office_id)) then
   raise exception using errcode='42501',message='Akses dokumen pada kiriman ini sudah berubah. Hubungi pengelola office untuk memeriksa hasil penyimpanannya.';
  end if;
 end loop;
 return p_value;
end $$;
revoke all on function internal.portal35_5_tracking_receipt(jsonb) from public,anon,authenticated,service_role;

-- Modify only the five supplied receipt APIs and their Portal 34 internal copies.
-- CREATE OR REPLACE preserves owners, ACLs, signatures, defaults and SET options.
-- Unknown implementations fail atomically instead of weakening access checks.
do $$
declare f record; source text; definition text; updated text; arguments text;
 names text[]:=array['simpan_dokumen_excel28','status_input_dokumen28','simpan_dokumen_excel29','simpan_perpindahan_excel29','status_input_tracking29'];
begin
 for f in select p.*,n.nspname,pg_get_userbyid(p.proowner) owner_name,
  case when n.nspname='internal' then substr(p.proname,5) else p.proname end api
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prokind='f' and
   ((n.nspname='public' and p.proname=any(names))
    or (n.nspname='internal' and p.proname like 'g34_%' and substr(p.proname,5)=any(names)))
 loop
  arguments:=oidvectortypes(f.proargtypes);
  if f.prorettype<>'jsonb'::regtype or f.proretset
   or arguments is distinct from (case f.api
    when 'status_input_dokumen28' then 'uuid, uuid'
    when 'status_input_tracking29' then 'text, uuid, uuid'
    else 'jsonb, uuid, uuid' end) then
   raise exception 'Signature fungsi %.% berbeda. Jalankan diagnostik keamanan sebelum memperbarui.',f.nspname,f.proname;
  end if;
  execute format('grant execute on function internal.portal35_5_tracking_receipt(jsonb) to %I',f.owner_name);
  source:=f.prosrc;
  if position('portal35_5_tracking_receipt(' in source)>0 then continue;end if;
  if f.nspname='public' and position('portal34 guard' in source)>0 then
   if to_regprocedure(format('internal.g34_%I(%s)',f.proname,arguments)) is null then
    raise exception 'Salinan internal %.% tidak ditemukan.',f.nspname,f.proname;
   end if;
   continue;
  end if;
  updated:=replace(replace(replace(source,
   'return old.result;','return internal.portal35_5_tracking_receipt(old.result);'),
   'return prior.result;','return internal.portal35_5_tracking_receipt(prior.result);'),
   'return receipt;','return internal.portal35_5_tracking_receipt(receipt);');
  if updated=source then
   raise exception 'Implementasi %.% tidak dikenali. Tidak ada perubahan diterapkan.',f.nspname,f.proname;
  end if;
  definition:=pg_get_functiondef(f.oid);
  execute replace(definition,source,updated);
 end loop;
end $$;

notify pgrst,'reload schema';
commit;
