-- Tanggal perpindahan bebas. Izin, versi, audit, dan urutan pencatatan tetap milik RPC dasar.
-- Sumber SQL dasar dapat berbeda antar instalasi. Hanya assignment tanggal dan guard
-- rentang tanggal sederhana yang diadaptasi. Pola lain ditolak secara atomik.
create or replace function internal.tanggal_perpindahan_bebas35_4(p_data jsonb)
returns date language plpgsql immutable set search_path='' as $$
declare v_text text:=p_data->>'tanggal_perpindahan';v_date date;
begin
 if v_text is null or v_text !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then
  raise exception 'Isi tanggal perpindahan yang valid dengan format YYYY-MM-DD.';
 end if;
 begin v_date:=v_text::date;
 exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Tanggal perpindahan tidak valid.';
 end;
 return v_date;
end $$;
revoke all on function internal.tanggal_perpindahan_bebas35_4(jsonb) from public,anon,authenticated,service_role;

do $adapt$
declare v_f record;v_source text;v_next text;v_def text;v_assignment text[];v_guard text[];
 v_variable text;v_condition text;v_rest text;v_found integer:=0;v_changes integer:=0;
 v_assignment_pattern text:='((([a-z_][a-z0-9_]*)[[:space:]]*(?:date[[:space:]]*)?:=)[^;]*''tanggal_perpindahan''[^;]*;)';
 v_guard_pattern text:='(\mif[[:space:]]+([^;]+?)[[:space:]]+then[[:space:]]+raise[[:space:]]+exception[^;]*;[[:space:]]*end[[:space:]]+if[[:space:]]*;)';
begin
 for v_f in
  select p.oid,p.proname,p.prosrc,p.proowner,n.nspname
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname in ('public','internal') and p.proname in ('catat_perpindahan_dokumen','g34_catat_perpindahan_dokumen')
   and p.prokind='f' and l.lanname='plpgsql'
 loop
  -- Jangan mengubah pembungkus izin Crew dari pembaruan 34.
  if position('portal34 guard' in v_f.prosrc)>0 then continue;end if;
  v_found:=v_found+1;
  execute format('grant execute on function internal.tanggal_perpindahan_bebas35_4(jsonb) to %I',pg_get_userbyid(v_f.proowner));
  if position('internal.tanggal_perpindahan_bebas35_4(p_data)' in v_f.prosrc)>0 then continue;end if;
  v_source:=v_f.prosrc;v_next:=v_source;
  select m into v_assignment from regexp_matches(v_source,v_assignment_pattern,'gi') m limit 1;
  if v_assignment is null or (select count(*) from regexp_matches(v_source,v_assignment_pattern,'gi'))<>1 then
   raise exception 'Pembaruan tanggal dihentikan: assignment tanggal pada %.% belum dikenali. Kirim definisi fungsi ini untuk penyesuaian; tidak ada perubahan yang diterapkan.',v_f.nspname,v_f.proname;
  end if;
  v_variable:=lower(v_assignment[3]);
  if v_source !~* ('\m'||v_variable||'\M[[:space:]]+(date\M|(?:public\.)?(?:perpindahan_dokumen\.tanggal_perpindahan|dokumen\.(?:tanggal_masuk|perpindahan_terakhir))%type)') then
   raise exception 'Pembaruan tanggal dihentikan: tipe variabel tanggal pada %.% belum dapat dikonfirmasi.',v_f.nspname,v_f.proname;
  end if;
  for v_guard in select regexp_matches(v_source,v_guard_pattern,'gi') loop
   v_condition:=lower(v_guard[2]);
   if v_condition !~ ('\m'||v_variable||'\M') or v_condition !~ '[<>]|\mbetween\M' then continue;end if;
   v_rest:=regexp_replace(v_condition,'\m[a-z_][a-z0-9_]*\.(tanggal_masuk|perpindahan_terakhir)\M','','g');
   v_rest:=regexp_replace(v_rest,'\m[a-z_][a-z0-9_]*\.hari_ini\(\)|\mcurrent_date\M|\mnow\(\)|at[[:space:]]+time[[:space:]]+zone[[:space:]]+''asia/jayapura''','','g');
   v_rest:=regexp_replace(v_rest,'\m'||v_variable||'\M','','g');
   v_rest:=regexp_replace(v_rest,'\m(coalesce|greatest|least|date|and|or|between|is|null|not)\M','','g');
   if v_rest !~ '^[[:space:](),<>=:]*$' then
    raise exception 'Pembaruan tanggal dihentikan: aturan campuran pada %.% perlu diperiksa. Izin dan validasi lain tidak diubah.',v_f.nspname,v_f.proname;
   end if;
   v_next:=replace(v_next,v_guard[1],E'-- portal35.4: tanggal perpindahan bebas\n null;');
  end loop;
  v_next:=replace(v_next,v_assignment[1],v_assignment[2]||'internal.tanggal_perpindahan_bebas35_4(p_data);');
  -- Guard bertingkat/tindakan selain RAISE tidak ditebak atau dihapus.
  for v_guard in select regexp_matches(v_next,'\mif[[:space:]]+([^;]+?)[[:space:]]+then','gi') loop
   if lower(v_guard[1]) ~ ('\m'||v_variable||'\M') and v_guard[1] ~ '[<>]' then
    raise exception 'Pembaruan tanggal dihentikan: masih ada pembatas tanggal yang belum dikenali pada %.%.',v_f.nspname,v_f.proname;
   end if;
  end loop;
  v_def:=replace(pg_get_functiondef(v_f.oid),v_source,v_next);
  execute v_def;
  v_changes:=v_changes+1;
 end loop;
 if v_found=0 then raise exception 'RPC dasar catat_perpindahan_dokumen belum tersedia. Pasang database dasar Portal GA terlebih dahulu.';end if;
 raise notice 'Tanggal bebas diterapkan pada % implementasi RPC. Hak akses, audit, dan pengecekan versi dipertahankan.',v_changes;
end $adapt$;

-- Perpindahan boleh mendahului tanggal masuk. Guard edit dokumen yang memakai
-- tanggal perpindahan pertama sebagai batas tanggal masuk ikut disesuaikan.
-- Validasi tanggal masuk lainnya, termasuk batas hari ini bila ada, tidak diubah.
do $entry$
declare v_f record;v_source text;v_next text;v_guard text[];v_bound text[];v_bounds text[];
 v_condition text;v_rest text;v_date text;v_name text;v_assignment text[];v_relevant boolean;
 v_pattern text:='(\mif[[:space:]]+([^;]+?)[[:space:]]+then[[:space:]]+raise[[:space:]]+exception[^;]*;[[:space:]]*end[[:space:]]+if[[:space:]]*;)';
begin
 for v_f in select p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_language l on l.oid=p.prolang
  where n.nspname in ('public','internal') and p.proname in ('simpan_dokumen','g34_simpan_dokumen')
   and l.lanname='plpgsql' and p.prokind='f'
 loop
  v_source:=v_f.prosrc;
  if position('portal34 guard' in v_source)>0 or v_source !~* 'tanggal_perpindahan|perpindahan_terakhir' then continue;end if;
  v_bounds:='{}';
  for v_bound in select regexp_matches(v_source,'select[[:space:]]+min\([[:space:]]*(?:[a-z_][a-z0-9_]*\.)?tanggal_perpindahan[[:space:]]*\)[[:space:]]+into[[:space:]]+([a-z_][a-z0-9_]*)','gi') loop
   v_bounds:=array_append(v_bounds,lower(v_bound[1]));
  end loop;
  select m into v_assignment from regexp_matches(v_source,'\m([a-z_][a-z0-9_]*)[[:space:]]*(?:date[[:space:]]*)?:=[^;]*''tanggal_masuk''[^;]*;','gi') m limit 1;
  v_date:=v_assignment[1];v_next:=v_source;
  for v_guard in select regexp_matches(v_source,v_pattern,'gi') loop
   v_condition:=lower(v_guard[2]);v_relevant:=v_condition ~ 'tanggal_perpindahan|perpindahan_terakhir';
   foreach v_rest in array v_bounds loop v_relevant:=v_relevant or v_condition ~ ('\m'||v_rest||'\M');end loop;
   if not v_relevant or v_condition !~ '[<>]|\mbetween\M' then continue;end if;
   if v_date is null or v_condition !~ ('\m'||v_date||'\M') then
    raise exception 'Pembaruan tanggal dihentikan: batas tanggal masuk pada % belum dikenali. Tidak ada perubahan yang diterapkan.',v_f.oid::regprocedure;
   end if;
   -- portal35.6.1: bentuk EXISTS pada definisi simpan_dokumen yang dikirim pemilik.
   -- Hanya satu pemeriksaan tanggal pada dokumen p_id; predicate tambahan ditolak.
   if v_condition ~ ('^[[:space:]]*exists[[:space:]]*\([[:space:]]*select[[:space:]]+1[[:space:]]+from[[:space:]]+public[[:space:]]*\.[[:space:]]*perpindahan_dokumen[[:space:]]+where[[:space:]]+dokumen_id[[:space:]]*=[[:space:]]*p_id[[:space:]]+and[[:space:]]+tanggal_perpindahan[[:space:]]*<[[:space:]]*'||lower(v_date)||'[[:space:]]*\)[[:space:]]*$') then
    if (select count(*) from regexp_matches(v_source,'\m([a-z_][a-z0-9_]*)[[:space:]]*(?:date[[:space:]]*)?:=[^;]*''tanggal_masuk''[^;]*;','gi'))<>1
    or v_source !~* ('\m'||v_date||'\M[[:space:]]+(date\M|(?:public\.)?dokumen\.tanggal_masuk%type)') then
     raise exception 'Pembaruan tanggal dihentikan: tipe atau assignment tanggal masuk pada % belum dapat dikonfirmasi.',v_f.oid::regprocedure;
    end if;
    v_next:=replace(v_next,v_guard[1],E'-- portal35.6.1: perpindahan boleh mendahului tanggal masuk (EXISTS)\n null;');
    continue;
   end if;
   v_rest:=regexp_replace(v_condition,'\m[a-z_][a-z0-9_]*\.perpindahan_terakhir\M','','g');
   v_rest:=regexp_replace(v_rest,'\m'||v_date||'\M','','g');
   foreach v_name in array v_bounds loop v_rest:=regexp_replace(v_rest,'\m'||v_name||'\M','','g');end loop;
   v_rest:=regexp_replace(v_rest,'\m(coalesce|greatest|least|date|and|or|between|is|null|not)\M','','g');
   if v_rest !~ '^[[:space:](),<>=:]*$' then
    raise exception 'Pembaruan tanggal dihentikan: aturan tanggal masuk bercampur dengan validasi lain pada %.',v_f.oid::regprocedure;
   end if;
   v_next:=replace(v_next,v_guard[1],E'-- portal35.4: perpindahan boleh mendahului tanggal masuk\n null;');
  end loop;
  for v_guard in select regexp_matches(v_next,'\mif[[:space:]]+([^;]+?)[[:space:]]+then','gi') loop
   v_condition:=lower(v_guard[1]);v_relevant:=v_condition ~ 'tanggal_perpindahan|perpindahan_terakhir';
   foreach v_name in array v_bounds loop v_relevant:=v_relevant or v_condition ~ ('\m'||v_name||'\M');end loop;
   if v_relevant and v_condition ~ '[<>]' and (v_date is null or v_condition ~ ('\m'||v_date||'\M')) then
    raise exception 'Pembaruan tanggal dihentikan: pembatas edit tanggal masuk pada % perlu diperiksa.',v_f.oid::regprocedure;
   end if;
  end loop;
  if v_next is distinct from v_source then execute replace(pg_get_functiondef(v_f.oid),v_source,v_next);end if;
 end loop;
end $entry$;

-- IMPLEMENTASI EXCEL 35.4 (dibangun dari tracking_excel29.sql)
do $$ begin
 if to_regprocedure('internal.g34_simpan_perpindahan_excel29(jsonb,uuid,uuid)') is null
 or not exists(select 1 from pg_proc where oid=to_regprocedure('public.simpan_perpindahan_excel29(jsonb,uuid,uuid)') and position('portal34 guard' in prosrc)>0) then
  raise exception 'Pembaruan ini memerlukan Tracking Excel 29 dan pembungkus akses Portal 34/35.';
 end if;
end $$;
create or replace function internal.g34_simpan_perpindahan_excel29(p_rows jsonb,p_kunci uuid,p_pemilik uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,internal as $$
declare p public.profil_pengguna; prior internal.tracking_requests29; item jsonb; doc public.dokumen; ids uuid[]; docs jsonb:='[]'::jsonb; receipt jsonb; number integer:=0; amount integer; distinct_count integer; move_date date; target text; state text; note text;
begin
 p:=internal.tracking_input_user28();
 if p.id is distinct from p_pemilik then raise exception using errcode='42501',message='Akun berubah. Muat kembali daftar dokumen.';end if;
 if p_kunci is null then raise exception 'Kunci penyimpanan belum tersedia.';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Data harus berupa daftar baris.';end if;
 amount:=jsonb_array_length(p_rows);if amount<1 or amount>500 then raise exception 'Isi 1 sampai 500 perpindahan untuk satu penyimpanan.';end if;
 perform pg_advisory_xact_lock(hashtext('tracking29'),hashtext(p.id::text||':'||p_kunci::text));
 select * into prior from internal.tracking_requests29 where user_id=p.id and request_id=p_kunci;
 if found then
  if prior.kind<>'pindah' or prior.payload is distinct from p_rows then raise exception using errcode='23514',message='Kunci ini sudah digunakan untuk kiriman yang berbeda.';end if;
  return prior.result;
 end if;
 if p.peran<>'administrator' and p.office_id is null then raise exception 'Office akun belum ditetapkan. Hubungi Administrator.';end if;
 select array_agg((value->>'id')::uuid),count(distinct value->>'id') into ids,distinct_count from jsonb_array_elements(p_rows);
 if distinct_count<>amount then raise exception 'Isi ID yang valid. Satu dokumen hanya boleh muncul sekali dalam kiriman.';end if;
 -- Lock all authorized documents in a fixed order before checking revisions.
 perform d.id from public.dokumen d where d.id=any(ids) and (p.peran='administrator' or d.office_id=p.office_id) order by d.id for update;
 insert into internal.tracking_requests29(user_id,request_id,kind,payload) values(p.id,p_kunci,'pindah',p_rows);
 for item in select value from jsonb_array_elements(p_rows) loop
  number:=number+1;
  begin
   if jsonb_typeof(item) is distinct from 'object' then raise exception 'Baris bukan perpindahan yang valid.';end if;
   select * into doc from public.dokumen d where d.id=(item->>'id')::uuid and (p.peran='administrator' or d.office_id=p.office_id);
   if not found then raise exception using errcode='42501',message='Dokumen tidak tersedia atau di luar office akun.';end if;
   if doc.versi is distinct from (item->>'versi')::bigint then raise exception using errcode='PT409',message='Data dokumen berubah. Periksa posisi terbaru sebelum menyimpan.';end if;
   if doc.status_terakhir in ('Sudah Diambil','Selesai','Dibatalkan') then raise exception using errcode='PT409',message='Dokumen sudah selesai. Batalkan isian baris ini.';end if;
   target:=btrim(coalesce(item->>'tujuan',''));state:=btrim(coalesce(item->>'status',''));note:=btrim(coalesce(item->>'catatan',''));
   if target='' or char_length(target)>140 then raise exception 'Isi tujuan, maksimal 140 karakter.';end if;
   if state not in ('Dititipkan','Menunggu Approval','Sedang Diproses','Perlu Revisi','Siap Diambil','Sudah Diambil','Selesai','Dibatalkan') then raise exception 'Pilih status dokumen yang tersedia.';end if;
   if char_length(note)>3000 then raise exception 'Catatan maksimal 3000 karakter.';end if;
   if coalesce(item->>'tanggal_perpindahan','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Isi tanggal perpindahan dengan format YYYY-MM-DD.';end if;
   move_date:=(item->>'tanggal_perpindahan')::date;
   perform public.catat_perpindahan_dokumen(p_id=>doc.id,p_versi=>doc.versi,p_data=>jsonb_build_object('tanggal_perpindahan',move_date,'tujuan',target,'status',state,'catatan',note));
   select * into strict doc from public.dokumen d where d.id=(item->>'id')::uuid;
   docs:=docs||jsonb_build_array(internal.tracking_receipt29(doc));
  exception when others then
   raise exception using errcode=sqlstate,message=format('Baris %s: %s',number,sqlerrm);
  end;
 end loop;
 receipt:=jsonb_build_object('pemilik',p.id,'kunci',p_kunci,'jenis','pindah','jumlah',amount,'dokumen',docs);
 update internal.tracking_requests29 set result=receipt where user_id=p.id and request_id=p_kunci;
 return receipt;
end $$;
revoke all on function internal.g34_simpan_perpindahan_excel29(jsonb,uuid,uuid) from public,anon,authenticated,service_role;
