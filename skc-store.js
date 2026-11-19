(function(g){
'use strict';const A=g.Akses,columns='id,karyawan_id,tanggal_cuti,note,office_id,status,tanggal_diambil,nama_pengambil,nik_pengambil,nama_petugas_pengambilan,diambil_pada,versi,karyawan:karyawan(id,nik,nama,jabatan)';
const map=v=>({id:v.id,employeeId:v.karyawan_id,nik:v.karyawan.nik,nama:v.karyawan.nama,jabatan:v.karyawan.jabatan,tanggalCuti:v.tanggal_cuti,note:v.note||'',officeId:v.office_id||'',status:v.status,tanggalDiambil:v.tanggal_diambil||'',namaPengambil:v.nama_pengambil,nikPengambil:v.nik_pengambil,namaPetugas:v.nama_petugas_pengambilan,diambilPada:v.diambil_pada,revision:v.versi});
const compare=(a,b)=>a.tanggalCuti.localeCompare(b.tanggalCuti)||a.nama.localeCompare(b.nama,'id-ID')||a.id.localeCompare(b.id);
function noteText(value){const note=String(value??'').trim();if(note.length>1000)throw new Error('Note maksimal 1000 karakter.');return note;}
async function rpc(name,args,write=false){
 try{return await A.rpc(name,args,write);}
 catch(err){if(['PGRST202','PGRST204','PGRST205','42883','42P01','42703'].includes(err.code))err.message='Pembaruan SKC belum terpasang. Jalankan pembaruan35_6_7_skc.sql di Supabase.';throw err;}
}
const get=async id=>map(await A.one('pengambilan_skc',id,columns));
g.SkcStore=Object.freeze({
 async list(){await A.ready;if(A.profile?.peran==='crew')return [];return (await A.all('pengambilan_skc',columns,{},'tanggal_cuti')).map(map).sort(compare);},get,
 async create(f){return rpc('tambah_skc_note35_6_7',{p_office:f.officeId,p_data:{karyawan_id:f.employeeId,tanggal_cuti:g.TrackingInputDomain.date(f.tanggalCuti),note:noteText(f.note)}},true);},
 async assignOffice(id,revision,office){return rpc('tetapkan_office_skc35_6_7',{p_id:id,p_versi:revision,p_office:office},true);},
 async tomorrow(office){
  const v=await rpc('cuti_besok_skc35_6_7',{p_office:office||null}),at=new Date(v?.dicetak_pada||'');
  if(!Number.isFinite(at.getTime())||!Array.isArray(v?.nama)||!v.nama.every(n=>typeof n==='string'))throw new Error('Daftar Cuti Besok belum dapat dibaca.');
  return {at,names:v.nama};
 },
 async collect(id,expectedRevision){await A.rpc('ambil_skc',{p_id:id,p_versi:expectedRevision},true);return get(id);}
});
g.SkcDomain=Object.freeze({noteText,compare});
})(window);
