-- MESS KARYAWAN V7 - keterangan kerusakan sederhana dan kamar rusak berat.
-- Jalankan SETELAH update_v6.sql. Database dan akun yang sama tetap digunakan.
-- Salin SELURUH file ke query baru di Supabase SQL Editor.
-- Pilih Run without RLS; kebijakan RLS V6 tetap digunakan.
-- Untuk proyek baru: supabase_setup.sql -> update_v5.sql -> update_v6.sql -> update_v7.sql.
begin;

do $$
begin
 if not exists(select 1 from information_schema.columns where table_schema='public'
     and table_name='mess_rooms' and column_name='lokasi_mess')
   or to_regprocedure('public.mess_move_employee(text,bigint,integer,bigint)') is null then
   raise exception 'Jalankan update_v6.sql terlebih dahulu, lalu update_v7.sql.';
 end if;
end
$$;

-- Proses perbaikan lama dihentikan; data aslinya tetap tersedia pada cadangan.
drop trigger if exists mess_repair_condition on public.mess_repairs;
revoke all on function public.mess_save_repair(bigint,jsonb) from public,anon,authenticated;

-- Salin keterangan pekerjaan terbuka SATU KALI. Pengulangan migrasi tidak
-- mengaktifkan kembali kerusakan yang sudah dihapus melalui kondisi kamar.
do $$
begin
 if not exists(select 1 from information_schema.columns where table_schema='public'
     and table_name='mess_rooms' and column_name='keterangan_kerusakan') then
   alter table public.mess_rooms add column keterangan_kerusakan text;
   update public.mess_rooms r set rusak=true,keterangan_kerusakan=coalesce(
     (select string_agg(case when p.judul='Kerusakan kamar' then
         coalesce(nullif(btrim(p.catatan),''),p.judul)
       else p.judul||case when nullif(btrim(p.catatan),'') is not null then ': '||p.catatan else '' end end,
       E'\n' order by p.id)
      from public.mess_repairs p where p.kamar_id=r.id and p.status<>'selesai'),
     nullif(btrim(r.catatan),''),'Kerusakan kamar')
   where r.rusak or exists(select 1 from public.mess_repairs p where p.kamar_id=r.id and p.status<>'selesai');
 end if;
end
$$;
alter table public.mess_rooms add column if not exists kerusakan_berat boolean not null default false;
do $$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.mess_rooms'::regclass and conname='mess_heavy_requires_damage') then
   alter table public.mess_rooms add constraint mess_heavy_requires_damage check(not kerusakan_berat or rusak);
 end if;
end
$$;

-- Pertahankan urutan kolom view lama; tambahkan dua kolom baru di akhir.
create or replace view public.mess_room_status with (security_invoker=true) as
 select r.id,r.lokasi_mess,r.blok,r.no_kamar,r.floor,r.gender,r.gol,r.fasilitas,
   r.jumlah_bed,r.rusak,r.catatan,r.kebersihan,r.created_at,r.updated_at,
   coalesce(o.terisi,0)::integer as terisi,
   greatest(r.jumlah_bed-coalesce(o.terisi,0),0)::integer as sisa,
   case when coalesce(o.terisi,0)=0 then 'KOSONG'
        when coalesce(o.terisi,0)>=r.jumlah_bed then 'FULL' else 'TERISI' end as status_kamar,
   r.keterangan_kerusakan,r.kerusakan_berat
 from public.mess_rooms r
 left join (select kamar_id,count(*) as terisi from public.mess_employees
   where status='aktif' and kamar_id is not null group by kamar_id) o on o.kamar_id=r.id;

create or replace function public.mess_schema_version() returns integer
language plpgsql security definer set search_path='' as $$
begin perform public.mess_require(0); return 7; end
$$;

create or replace function public.mess_save_room(p_id bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_room public.mess_rooms; v_gender text; v_beds integer; v_loc text; v_block text; v_no text;
 v_rusak boolean; v_berat boolean; v_keterangan text;
begin
 perform public.mess_require(case when p_id is null then 2 else 1 end);
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Data kamar tidak valid.'; end if;
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
 end if;
 -- Field yang tidak dikirim mempertahankan kondisi lama, termasuk dari impor kamar.
 v_berat:=coalesce((p_data->>'kerusakan_berat')::boolean,v_room.kerusakan_berat,false);
 v_rusak:=coalesce((p_data->>'rusak')::boolean,v_room.rusak,false) or v_berat;
 v_keterangan:=nullif(btrim(coalesce(p_data->>'keterangan_kerusakan',v_room.keterangan_kerusakan)), '');
 if v_rusak and v_keterangan is null then raise exception 'Keterangan kerusakan wajib diisi.'; end if;
 if length(v_keterangan)>4000 and v_keterangan is distinct from v_room.keterangan_kerusakan then
   raise exception 'Keterangan kerusakan maksimal 4.000 karakter.'; end if;
 if not v_rusak then v_berat:=false; v_keterangan:=null; end if;
 if p_id is not null then
   update public.mess_rooms set lokasi_mess=v_loc,blok=v_block,no_kamar=v_no,
     floor=nullif(btrim(p_data->>'floor'),''),gender=v_gender,
     gol=nullif(p_data->>'gol','')::integer,
     fasilitas=nullif(p_data->>'fasilitas',''),jumlah_bed=v_beds,
     rusak=v_rusak,kerusakan_berat=v_berat,keterangan_kerusakan=v_keterangan,
     catatan=nullif(btrim(p_data->>'catatan'),''),updated_at=clock_timestamp()
   where id=p_id returning * into v_room;
 else
   insert into public.mess_rooms(lokasi_mess,blok,no_kamar,floor,gender,gol,fasilitas,jumlah_bed,
     rusak,kerusakan_berat,keterangan_kerusakan,catatan)
   values(v_loc,v_block,v_no,nullif(btrim(p_data->>'floor'),''),v_gender,
     nullif(p_data->>'gol','')::integer,nullif(p_data->>'fasilitas',''),v_beds,
     v_rusak,v_berat,v_keterangan,nullif(btrim(p_data->>'catatan'),''))
   returning * into v_room;
 end if;
 return to_jsonb(v_room);
exception when unique_violation then raise exception 'Kamar dengan lokasi, blok, dan nomor ini sudah terdaftar.';
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
 -- Lock yang sama dengan simpan kondisi: perubahan admin lain selalu diperiksa di server.
 if v_room.kerusakan_berat then
   raise exception 'Kamar tujuan rusak berat dan tidak dapat ditempati. Pilih kamar lain.'; end if;
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
 -- Pengantaran yang belum selesai juga memeriksa kondisi kamar terbaru.
 perform 1 from public.mess_rooms r where r.id in(select ke_kamar_id from public.mess_moves where id=any(p_ids)) order by r.id for update;
 if exists(select 1 from public.mess_moves m join public.mess_rooms r on r.id=m.ke_kamar_id
   where m.id=any(p_ids) and r.kerusakan_berat) then
   raise exception 'Ada pengantaran menuju kamar rusak berat. Pindahkan karyawan ke kamar lain terlebih dahulu.'; end if;
 update public.mess_moves set diantar=true,diantar_oleh=public.mess_actor(),diantar_pada=now() where id=any(p_ids);
 return v_count;
end
$$;
-- Tabel dan view tetap hanya bisa dibaca oleh akun aktif.
-- Impor V6 memanggil mess_save_room dan mess_move_employee di atas sehingga
-- larangan kamar rusak berat juga berlaku untuk Excel, dengan rollback seluruh file.
revoke all on function public.mess_save_room(bigint,jsonb),public.mess_move_employee(text,bigint,integer,bigint),public.mess_schema_version(),public.mess_mark_delivered_many(bigint[]) from public,anon,authenticated;
grant execute on function public.mess_save_room(bigint,jsonb),public.mess_move_employee(text,bigint,integer,bigint),public.mess_schema_version(),public.mess_mark_delivered_many(bigint[]) to authenticated;
revoke all on public.mess_room_status from public,anon;
grant select on public.mess_room_status to authenticated;
notify pgrst,'reload schema';
commit;
