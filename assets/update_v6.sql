-- MESS KARYAWAN V6 — pembaruan database V5 yang sudah terpasang.
-- Salin SELURUH file ke query baru di Supabase SQL Editor.
-- Pilih Run without RLS; skrip ini sudah memasang RLS sendiri.
-- Tabel, akun, NIK, kamar, riwayat, dan data lama tetap dipertahankan.
-- Untuk instalasi baru: supabase_setup.sql → update_v5.sql → update_v6.sql.
begin;

do $$
begin
 if to_regclass('public.mess_repairs') is null then
   raise exception 'Jalankan update_v5.sql terlebih dahulu, lalu update_v6.sql.';
 end if;
end
$$;

-- Rename kolom tanpa membuat salinan data atau mengubah ID.
do $$
declare r record;
begin
 for r in select * from (values
   ('mess_rooms','lokasi_hunian','lokasi_mess'),
   ('mess_rooms','block','blok'),
   ('mess_rooms','golongan','gol'),
   ('mess_employees','tgl_masuk_kerja','tanggal_masuk_kerja'),
   ('mess_employees','tgl_masuk_mess','tanggal_masuk_mess_hunian'),
   ('mess_room_status','lokasi_hunian','lokasi_mess'),
   ('mess_room_status','block','blok'),
   ('mess_room_status','golongan','gol')
 ) as x(tbl,old_name,new_name) loop
   if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.tbl and column_name=r.old_name) then
     execute format('alter table public.%I rename column %I to %I',r.tbl,r.old_name,r.new_name);
   end if;
 end loop;
end
$$;
alter table public.mess_employees add column if not exists placement_version bigint not null default 0;
alter table public.mess_profiles add column if not exists aktif boolean not null default true;
alter table public.mess_profiles add column if not exists updated_at timestamptz not null default now();

-- Versi penempatan berubah hanya ketika kamar, bed, atau status berubah.
create or replace function public.mess_bump_placement() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.kamar_id is distinct from old.kamar_id or new.no_bed is distinct from old.no_bed or new.status is distinct from old.status then
   new.placement_version:=old.placement_version+1;
 else new.placement_version:=old.placement_version; end if;
 return new;
end
$$;
drop trigger if exists mess_placement_version on public.mess_employees;
create trigger mess_placement_version before update on public.mess_employees
for each row execute function public.mess_bump_placement();

create or replace function public.mess_bump_profile() returns trigger
language plpgsql set search_path='' as $$
begin new.updated_at:=clock_timestamp(); return new; end
$$;
drop trigger if exists mess_profile_version on public.mess_profiles;
create trigger mess_profile_version before update on public.mess_profiles for each row execute function public.mess_bump_profile();

create or replace function public.mess_active() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce((select aktif from public.mess_profiles where user_id=auth.uid()),true)
$$;
create or replace function public.mess_level() returns integer
language sql stable security definer set search_path='' as $$
 select case when not public.mess_active() then -1 else coalesce((select case role when 'super_admin' then 2 when 'admin' then 1 else 0 end from public.mess_profiles where user_id=auth.uid()),0) end
$$;
create or replace function public.mess_require(p_level integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu.'; end if;
 if not public.mess_active() then raise exception 'Akun Anda dinonaktifkan. Hubungi Administrator.'; end if;
 if public.mess_level()<p_level then raise exception 'Akun Anda tidak memiliki akses untuk tindakan ini.'; end if;
end
$$;
create or replace function public.mess_schema_version() returns integer
language plpgsql security definer set search_path='' as $$
begin perform public.mess_require(0); return 6; end
$$;


create or replace function public.mess_save_room(p_id bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_room public.mess_rooms; v_gender text; v_beds integer; v_loc text; v_block text; v_no text;
begin
 perform public.mess_require(case when p_id is null then 2 else 1 end);
 v_loc:=btrim(coalesce(p_data->>'lokasi_mess',''));
 v_block:=btrim(coalesce(p_data->>'blok','')); v_no:=btrim(coalesce(p_data->>'no_kamar',''));
 v_gender:=nullif(p_data->>'gender',''); v_beds:=(p_data->>'jumlah_bed')::integer;
 if v_loc='' or v_block='' or v_no='' then raise exception 'Lokasi, blok, dan nomor kamar wajib diisi.'; end if;
 if v_beds is null or v_beds<1 or v_beds>100 then raise exception 'Jumlah bed harus 1–100.'; end if;
 if p_id is not null then
   select * into v_room from public.mess_rooms where id=p_id for update;
   if not found then raise exception 'Kamar tidak ditemukan.'; end if;
   if nullif(p_data->>'expected_updated_at','') is not null
      and (p_data->>'expected_updated_at')::timestamptz <> v_room.updated_at then
     raise exception 'Data kamar sudah diubah oleh akun lain. Tutup formulir, perbarui data, lalu edit kembali.';
   end if;
   if exists(select 1 from public.mess_employees where kamar_id=p_id and no_bed>v_beds) then
     raise exception 'Jumlah bed tidak boleh lebih kecil dari nomor bed penghuni yang masih aktif.'; end if;
   if exists(select 1 from public.mess_employees where kamar_id=p_id and gender is distinct from v_gender) then
     raise exception 'Gender kamar harus sesuai dengan penghuni yang masih aktif.'; end if;
   update public.mess_rooms set lokasi_mess=v_loc,blok=v_block,no_kamar=v_no,
     floor=nullif(btrim(p_data->>'floor'),''),gender=v_gender,
     gol=nullif(p_data->>'gol','')::integer,
     fasilitas=nullif(p_data->>'fasilitas',''),jumlah_bed=v_beds,
     rusak=coalesce((p_data->>'rusak')::boolean,false),catatan=nullif(btrim(p_data->>'catatan'),''),
     updated_at=now() where id=p_id returning * into v_room;
 else
   insert into public.mess_rooms(lokasi_mess,blok,no_kamar,floor,gender,gol,fasilitas,jumlah_bed,rusak,catatan)
   values(v_loc,v_block,v_no,nullif(btrim(p_data->>'floor'),''),v_gender,
     nullif(p_data->>'gol','')::integer,nullif(p_data->>'fasilitas',''),v_beds,
     coalesce((p_data->>'rusak')::boolean,false),nullif(btrim(p_data->>'catatan'),''))
   returning * into v_room;
 end if;
 if v_room.rusak then
   if not exists(select 1 from public.mess_repairs where kamar_id=v_room.id and status<>'selesai') then
     insert into public.mess_repairs(kamar_id,judul,catatan,dibuat_oleh,diubah_oleh)
     values(v_room.id,'Kerusakan kamar',v_room.catatan,public.mess_actor(),public.mess_actor());
   end if;
 elsif exists(select 1 from public.mess_repairs where kamar_id=v_room.id and status<>'selesai') then
   raise exception 'Masih ada perbaikan terbuka. Selesaikan melalui daftar Perbaikan kamar.';
 end if;
 select * into v_room from public.mess_rooms where id=v_room.id;
 return to_jsonb(v_room);
exception when unique_violation then raise exception 'Kamar dengan lokasi, blok, dan nomor ini sudah terdaftar.';
end
$$;

create or replace function public.mess_save_employee(p_old_nik text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
 v_old public.mess_employees; v_emp public.mess_employees; v_room public.mess_rooms;
 v_nik text; v_nama text; v_gender text; v_status text; v_pl jsonb:='{}';
 v_key text; v_return jsonb:='[]'; v_snapshot jsonb:='[]'; v_cut numeric:=0;
 v_exit date; v_actor text; v_label text;
begin
 perform public.mess_require(1);
 v_actor:=public.mess_actor();
 v_nik:=btrim(coalesce(p_data->>'nik','')); v_nama:=btrim(coalesce(p_data->>'nama',''));
 v_gender:=nullif(p_data->>'gender',''); v_status:=coalesce(p_data->>'status','aktif');
 if v_nik='' or v_nama='' then raise exception 'NIK dan nama wajib diisi.'; end if;
 if v_status not in ('aktif','resign') then raise exception 'Status karyawan tidak valid.'; end if;
 foreach v_key in array array['selimut','bantal_kepala','bantal_guling','sarung_bantal','seprai'] loop
   v_pl:=v_pl||jsonb_build_object(v_key,coalesce((p_data->'perlengkapan'->>v_key)::boolean,false));
 end loop;
 if coalesce(p_data->>'link_bukti','')<>'' and (p_data->>'link_bukti') !~ '^https?://' then
   raise exception 'Link bukti harus dimulai dengan https:// atau http://.'; end if;
 if p_old_nik is not null then
   select * into v_old from public.mess_employees where nik=p_old_nik for update;
   if not found then raise exception 'Karyawan tidak ditemukan. Muat ulang daftar.'; end if;
   if nullif(p_data->>'expected_updated_at','') is not null
      and (p_data->>'expected_updated_at')::timestamptz <> v_old.updated_at then
     raise exception 'Data karyawan sudah diubah oleh akun lain. Tutup formulir, perbarui data, lalu edit kembali.';
   end if;
 end if;
 if v_old.kamar_id is not null then
   select * into v_room from public.mess_rooms where id=v_old.kamar_id for update;
   if v_status='aktif' and v_gender is distinct from v_room.gender then
     raise exception 'Gender karyawan harus sesuai kamar. Pindahkan penempatannya terlebih dahulu.'; end if;
 end if;
 if v_status='resign' then
   v_exit:=coalesce(nullif(p_data->>'tgl_resign','')::date,(now() at time zone 'Asia/Jayapura')::date);
   v_return:=coalesce(p_data->'aset_kembali','[]'::jsonb);
   if jsonb_typeof(v_return)<>'array' then raise exception 'Daftar aset tidak valid.'; end if;
   -- Pertahankan harga saat resign; perubahan harga master tidak mengubah riwayat.
   if v_old.status='resign' then v_snapshot:=v_old.aset_snapshot;
   else
     select coalesce(jsonb_agg(jsonb_build_object('id',id,'nama',nama,'harga',harga) order by urutan,id),'[]')
       into v_snapshot from public.mess_assets;
   end if;
   if exists(select 1 from jsonb_array_elements(v_return) x where jsonb_typeof(x)<>'number'
      or not exists(select 1 from jsonb_array_elements(v_snapshot) s where s->'id'=x)) then
     raise exception 'Daftar aset pengembalian tidak sesuai.'; end if;
   select coalesce(sum((s->>'harga')::numeric),0) into v_cut
   from jsonb_array_elements(v_snapshot) s where not (v_return @> jsonb_build_array(s->'id'));
 end if;
 if p_old_nik is null then
   insert into public.mess_employees(nik,nama,gender,department,jabatan,gol,fasilitas,perusahaan,
     point_of_hire,tanggal_masuk_kerja,tanggal_masuk_mess_hunian,status,perlengkapan,link_bukti,
     tgl_resign,alasan_resign,resign_oleh,aset_kembali,aset_snapshot,potongan)
   values(v_nik,v_nama,v_gender,nullif(btrim(p_data->>'department'),''),nullif(btrim(p_data->>'jabatan'),''),
     nullif(btrim(p_data->>'gol'),''),nullif(p_data->>'fasilitas',''),nullif(btrim(p_data->>'perusahaan'),''),
     nullif(btrim(p_data->>'point_of_hire'),''),nullif(p_data->>'tanggal_masuk_kerja','')::date,
     nullif(p_data->>'tanggal_masuk_mess_hunian','')::date,v_status,v_pl,nullif(btrim(p_data->>'link_bukti'),''),
     v_exit,case when v_status='resign' then nullif(btrim(p_data->>'alasan_resign'),'') end,
     case when v_status='resign' then v_actor end,v_return,v_snapshot,v_cut) returning * into v_emp;
 else
   update public.mess_employees set nik=v_nik,nama=v_nama,gender=v_gender,
     department=nullif(btrim(p_data->>'department'),''),jabatan=nullif(btrim(p_data->>'jabatan'),''),
     gol=nullif(btrim(p_data->>'gol'),''),fasilitas=nullif(p_data->>'fasilitas',''),
     perusahaan=nullif(btrim(p_data->>'perusahaan'),''),point_of_hire=nullif(btrim(p_data->>'point_of_hire'),''),
     tanggal_masuk_kerja=nullif(p_data->>'tanggal_masuk_kerja','')::date,
     tanggal_masuk_mess_hunian=nullif(p_data->>'tanggal_masuk_mess_hunian','')::date,status=v_status,perlengkapan=v_pl,
     link_bukti=nullif(btrim(p_data->>'link_bukti'),''),tgl_resign=v_exit,
     alasan_resign=case when v_status='resign' then nullif(btrim(p_data->>'alasan_resign'),'') end,
     resign_oleh=case when v_status='resign' then coalesce(v_old.resign_oleh,v_actor) end,
     aset_kembali=v_return,aset_snapshot=v_snapshot,potongan=v_cut,
     kamar_id=case when v_status='resign' then null else kamar_id end,
     no_bed=case when v_status='resign' then null else no_bed end,updated_at=now()
   where nik=p_old_nik returning * into v_emp;
   if v_status='resign' and v_old.status='aktif' then
     update public.mess_moves set dibatalkan=true where nik=v_nik and not diantar;
     if v_old.kamar_id is not null then
       v_label:=v_room.lokasi_mess||' · Blok '||v_room.blok||' · Kamar '||v_room.no_kamar;
       insert into public.mess_moves(nik,tipe,dari_kamar_id,dari_label,dari_no_bed,oleh_email,diantar)
       values(v_nik,'keluar',v_old.kamar_id,v_label,v_old.no_bed,v_actor,true);
     end if;
   end if;
 end if;
 return to_jsonb(v_emp);
exception when unique_violation then raise exception 'NIK ini sudah terdaftar.';
end
$$;

create or replace function public.mess_delete_room(p_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_room public.mess_rooms;
begin
 perform public.mess_require(2);
 select * into v_room from public.mess_rooms where id=p_id for update;
 if not found then raise exception 'Kamar tidak ditemukan.'; end if;
 if exists(select 1 from public.mess_employees where kamar_id=p_id) then
   raise exception 'Kamar masih berpenghuni dan tidak dapat dihapus.'; end if;
 insert into public.mess_deletions(jenis,ref,nama,detail,data_lengkap,oleh_email)
 values('Kamar',p_id::text,v_room.lokasi_mess||' · Blok '||v_room.blok||' · Kamar '||v_room.no_kamar,
   'Kamar kosong dihapus.',to_jsonb(v_room),public.mess_actor());
 delete from public.mess_rooms where id=p_id;
end
$$;

create or replace function public.mess_move_employee(p_nik text,p_kamar_id bigint,p_no_bed integer,p_expected_version bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_emp public.mess_employees; v_room public.mess_rooms; v_from text; v_to text;
begin
 perform public.mess_require(1);
 select * into v_emp from public.mess_employees where nik=p_nik for update;
 if not found then raise exception 'Karyawan tidak ditemukan.'; end if;
 if p_expected_version is null or v_emp.placement_version<>p_expected_version then
   raise exception 'Penempatan sudah berubah. Perbarui data terlebih dahulu.'; end if;
 if v_emp.status<>'aktif' then raise exception 'Karyawan resign tidak dapat ditempatkan.'; end if;
 select * into v_room from public.mess_rooms where id=p_kamar_id for update;
 if not found then raise exception 'Kamar tidak ditemukan.'; end if;
 if v_emp.gender is null or v_room.gender is null or v_emp.gender<>v_room.gender then
   raise exception 'Gender karyawan dan kamar harus diisi dan sama.'; end if;
 if p_no_bed is null or p_no_bed<1 or p_no_bed>v_room.jumlah_bed then
   raise exception 'Nomor bed di luar kapasitas kamar.'; end if;
 if v_emp.kamar_id=p_kamar_id and v_emp.no_bed=p_no_bed then raise exception 'Karyawan sudah berada di bed ini.'; end if;
 if exists(select 1 from public.mess_employees where kamar_id=p_kamar_id and no_bed=p_no_bed and status='aktif') then
   raise exception 'Bed sudah terisi. Pilih bed yang lain.'; end if;
 select lokasi_mess||' · Blok '||blok||' · Kamar '||no_kamar into v_from
 from public.mess_rooms where id=v_emp.kamar_id;
 v_to:=v_room.lokasi_mess||' · Blok '||v_room.blok||' · Kamar '||v_room.no_kamar;
 update public.mess_moves set dibatalkan=true where nik=p_nik and not diantar;
 update public.mess_employees set kamar_id=p_kamar_id,no_bed=p_no_bed,updated_at=now() where nik=p_nik;
 insert into public.mess_moves(nik,tipe,dari_kamar_id,ke_kamar_id,dari_label,ke_label,
   dari_no_bed,ke_no_bed,oleh_email)
 values(p_nik,case when v_emp.kamar_id is null then 'penempatan' else 'pindah' end,
   v_emp.kamar_id,p_kamar_id,v_from,v_to,v_emp.no_bed,p_no_bed,public.mess_actor());
exception when unique_violation then raise exception 'Bed baru saja terisi oleh akun lain. Pilih bed yang lain.';
end
$$;

create or replace function public.mess_move_employee(p_nik text,p_kamar_id bigint,p_no_bed integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Versi web lama. Muat ulang web V6 sebelum melakukan penempatan.';
end
$$;

create or replace function public.mess_import_data(p_kind text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_item jsonb; v_data jsonb; v_saved jsonb; v_old jsonb; v_key text; v_allowed text[];
 v_new integer:=0; v_updated integer:=0; v_line integer; v_state text; v_message text;
begin
 if p_kind not in ('employees','rooms') or p_kind is null then raise exception 'Jenis impor tidak valid.'; end if;
 perform public.mess_require(case when p_kind='rooms' then 2 else 1 end);
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Data impor harus berupa daftar.'; end if;
 if jsonb_array_length(p_rows) not between 1 and 1000 or octet_length(p_rows::text)>3000000 then
   raise exception 'Impor maksimal 1.000 baris dan 3 MB data.'; end if;
 v_allowed:=case when p_kind='employees' then
   array['nik','nama','gender','department','jabatan','gol','fasilitas','perusahaan','point_of_hire','tanggal_masuk_kerja','tanggal_masuk_mess_hunian','expected_updated_at']
   else array['lokasi_mess','blok','no_kamar','gender','jumlah_bed','floor','gol','fasilitas','catatan','expected_updated_at'] end;
 -- Serialisasi impor menghindari dua file bersamaan saling mendahului.
 perform pg_catalog.pg_advisory_xact_lock(519305);
 for v_item in select value from jsonb_array_elements(p_rows) loop
   begin
     v_line:=coalesce((v_item->>'line')::integer,0);
     v_data:=v_item->'data'; v_old:=null; v_key:=nullif(v_item->>'existing_key','');
     if jsonb_typeof(v_data) is distinct from 'object' then raise exception 'Baris tidak valid.'; end if;
     if exists(select 1 from jsonb_object_keys(v_data) k where not k=any(v_allowed)) then raise exception 'Kolom impor tidak didukung.'; end if;
     if p_kind='employees' then
       if v_key is not null then
         select to_jsonb(e) into v_old from public.mess_employees e where e.nik=v_key for update;
         if v_old is null then raise exception 'Karyawan tidak ditemukan.'; end if;
         if v_old->>'status'<>'aktif' then raise exception 'Karyawan sudah keluar kerja. Gunakan formulir karyawan.'; end if;
       end if;
     else
       if v_key is not null then
         select to_jsonb(r) into v_old from public.mess_rooms r where r.id=v_key::bigint for update;
         if v_old is null then raise exception 'Kamar tidak ditemukan.'; end if;
       end if;
     end if;
     if v_key is not null and (nullif(v_data->>'expected_updated_at','') is null
       or (v_data->>'expected_updated_at')::timestamptz<>(v_old->>'updated_at')::timestamptz) then
       raise exception 'Data sudah berubah sejak pratinjau. Baca ulang file dan periksa kembali.'; end if;
     v_data:=coalesce(v_old,'{}'::jsonb)||v_data;
     if p_kind='employees' then
       v_data:=v_data||jsonb_build_object('status','aktif');
       v_saved:=public.mess_save_employee(v_key,v_data);
       if jsonb_typeof(v_item->'placement')='object' then
         if nullif(v_item->'placement'->>'room_id','') is null or nullif(v_item->'placement'->>'bed','') is null then raise exception 'Penempatan tidak lengkap.'; end if;
         perform public.mess_move_employee(v_saved->>'nik',(v_item->'placement'->>'room_id')::bigint,(v_item->'placement'->>'bed')::integer,(v_saved->>'placement_version')::bigint);
       end if;
     else
       v_saved:=public.mess_save_room(v_key::bigint,v_data);
     end if;
     if v_key is null then v_new:=v_new+1; else v_updated:=v_updated+1; end if;
   exception when others then
     get stacked diagnostics v_message=message_text,v_state=returned_sqlstate;
     raise exception using message=format('Baris %s: %s Seluruh impor dibatalkan.',v_line,v_message),errcode=v_state;
   end;
 end loop;
 return jsonb_build_object('created',v_new,'updated',v_updated);
end
$$;

-- Pengantaran atomik: lock karyawan dahulu, sama seperti alur pemindahan.
create or replace function public.mess_mark_delivered_many(p_ids bigint[]) returns integer
language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 perform public.mess_require(1);
 if p_ids is null or cardinality(p_ids) not between 1 and 10000 or array_position(p_ids,null) is not null
   or (select count(distinct x) from unnest(p_ids) x)<>cardinality(p_ids) then
   raise exception 'Pilih 1–10.000 pengantaran yang berbeda.'; end if;
 perform 1 from public.mess_employees e where e.nik in(select nik from public.mess_moves where id=any(p_ids)) order by e.nik for update;
 perform 1 from public.mess_moves where id=any(p_ids) order by id for update;
 select count(*) into v_count from public.mess_moves m join public.mess_employees e on e.nik=m.nik
 where m.id=any(p_ids) and not m.diantar and not m.dibatalkan and e.status='aktif'
   and e.kamar_id=m.ke_kamar_id and e.no_bed=m.ke_no_bed;
 if v_count<>cardinality(p_ids) then raise exception 'Daftar pengantaran sudah berubah. Perbarui data terlebih dahulu.'; end if;
 update public.mess_moves set diantar=true,diantar_oleh=public.mess_actor(),diantar_pada=now() where id=any(p_ids);
 return v_count;
end
$$;
create or replace function public.mess_mark_delivered(p_id bigint) returns void
language plpgsql security definer set search_path='' as $$
begin perform public.mess_mark_delivered_many(array[p_id]); end
$$;

create or replace function public.mess_save_account(p_user_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_old public.mess_profiles; v_new public.mess_profiles; v_role text; v_active boolean; v_name text;
begin
 perform pg_catalog.pg_advisory_xact_lock(49172,1);
 perform public.mess_require(1);
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Data akun tidak valid.'; end if;
 if p_user_id=auth.uid() then raise exception 'Ubah profil sendiri melalui Profil Saya.'; end if;
 select * into v_old from public.mess_profiles where user_id=p_user_id for update;
 if not found then raise exception 'Akun tidak ditemukan.'; end if;
 if nullif(p_data->>'expected_updated_at','') is null or (p_data->>'expected_updated_at')::timestamptz<>v_old.updated_at then
   raise exception 'Data akun sudah berubah. Pilih ulang akun dan perbarui data.'; end if;
 v_role:=p_data->>'role'; v_active:=(p_data->>'aktif')::boolean; v_name:=btrim(coalesce(p_data->>'nama',''));
 if v_role is null or v_role not in ('pengguna','admin','super_admin') or v_active is null then raise exception 'Hak akses atau status akun tidak valid.'; end if;
 if length(v_name) not between 1 and 200 then raise exception 'Nama akun wajib diisi, maksimal 200 karakter.'; end if;
 if public.mess_level()<2 and (v_old.role='super_admin' or v_role='super_admin' or v_active is distinct from v_old.aktif) then
   raise exception 'Hanya Administrator yang dapat mengubah akses Administrator atau status aktif akun.'; end if;
 if v_old.role='super_admin' and v_old.aktif and (v_role<>'super_admin' or not v_active)
    and (select count(*) from public.mess_profiles where role='super_admin' and aktif)<=1 then
   raise exception 'Administrator aktif terakhir tidak dapat dinonaktifkan atau diturunkan.'; end if;
 update public.mess_profiles set nama=v_name,role=v_role,aktif=v_active where user_id=p_user_id returning * into v_new;
 return to_jsonb(v_new);
end
$$;
create or replace function public.mess_set_role(p_email text,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare v_target public.mess_profiles;
begin
 perform pg_catalog.pg_advisory_xact_lock(49172,1);
 perform public.mess_require(1);
 select * into v_target from public.mess_profiles where lower(email)=lower(btrim(p_email)) for update;
 if not found then raise exception 'Akun belum terdaftar di daftar akun Mess.'; end if;
 perform public.mess_save_account(v_target.user_id,jsonb_build_object('nama',coalesce(nullif(v_target.nama,''),v_target.email),'role',p_role,'aktif',v_target.aktif,'expected_updated_at',v_target.updated_at));
end
$$;

-- Akun nonaktif ditolak pada RPC, pembacaan tabel, dan foto privat.
drop policy if exists mess_profile_read on public.mess_profiles;
create policy mess_profile_read on public.mess_profiles for select to authenticated using ((select public.mess_active()) and (user_id=(select auth.uid()) or (select public.mess_level())>=1));

drop policy if exists mess_room_read on public.mess_rooms;
create policy mess_room_read on public.mess_rooms for select to authenticated using ((select public.mess_active()));

drop policy if exists mess_employee_read on public.mess_employees;
create policy mess_employee_read on public.mess_employees for select to authenticated using ((select public.mess_active()));

drop policy if exists mess_asset_read on public.mess_assets;
create policy mess_asset_read on public.mess_assets for select to authenticated using ((select public.mess_active()));

drop policy if exists mess_tool_read on public.mess_tools;
create policy mess_tool_read on public.mess_tools for select to authenticated using ((select public.mess_active()));

drop policy if exists mess_move_read on public.mess_moves;
create policy mess_move_read on public.mess_moves for select to authenticated using ((select public.mess_active()));

drop policy if exists mess_deletion_read on public.mess_deletions;
create policy mess_deletion_read on public.mess_deletions for select to authenticated using ((select public.mess_level())>=1);

drop policy if exists mess_repair_read on public.mess_repairs;
create policy mess_repair_read on public.mess_repairs for select to authenticated using ((select public.mess_active()));

drop policy if exists mess_avatar_read on storage.objects;
create policy mess_avatar_read on storage.objects for select to authenticated using ((select public.mess_active()) and bucket_id='mess-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists mess_avatar_insert on storage.objects;
create policy mess_avatar_insert on storage.objects for insert to authenticated with check ((select public.mess_active()) and bucket_id='mess-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists mess_avatar_update on storage.objects;
create policy mess_avatar_update on storage.objects for update to authenticated using ((select public.mess_active()) and bucket_id='mess-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text) with check ((select public.mess_active()) and bucket_id='mess-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists mess_avatar_delete on storage.objects;
create policy mess_avatar_delete on storage.objects for delete to authenticated using ((select public.mess_active()) and bucket_id='mess-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

revoke all on function public.mess_bump_placement(),public.mess_bump_profile(),public.mess_active(),public.mess_schema_version(),public.mess_move_employee(text,bigint,integer,bigint),public.mess_save_account(uuid,jsonb),public.mess_mark_delivered_many(bigint[]) from public,anon,authenticated;
revoke all on function public.mess_move_employee(text,bigint,integer) from public,anon,authenticated;
grant execute on function public.mess_active(),public.mess_schema_version(),public.mess_move_employee(text,bigint,integer,bigint),public.mess_save_account(uuid,jsonb),public.mess_mark_delivered_many(bigint[]) to authenticated;
notify pgrst,'reload schema';
commit;
