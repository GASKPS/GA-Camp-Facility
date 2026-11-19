(function(g){'use strict';const A=g.Akses;
 async function rpc(name,args){try{return await A.rpc(name,args,true);}catch(err){if(['PGRST202','PGRST204','PGRST205','42883','42P01','42703'].includes(err.code))err.message='Impor SKC belum terpasang. Jalankan pembaruan35_6_7_skc.sql melalui SQL Editor Supabase.';throw err;}}
 const legacy=p=>p.kind==='skc';
 const channel=g.Kiriman33.create('skc',{
  valid:(v,p)=>(legacy(p)||v.office===p.office)&&Number.isInteger(v.jumlah)&&v.jumlah===p.count&&Array.isArray(v.skc)&&v.skc.length===p.count&&new Set(v.skc.map(r=>r.id)).size===p.count&&v.skc.every((r,i)=>r.id&&r.karyawan_id&&r.nik&&r.tanggal_cuti&&(!p.payload||r.nik===p.payload[i].nik&&r.tanggal_cuti===p.payload[i].tanggal_cuti)),
  call:(action,p)=>{
   const args={p_kunci:p.key,p_pemilik:p.owner};
   if(action==='check')return rpc(legacy(p)?'status_input_skc32':'status_skc_note35_6_7',args);
   return legacy(p)?rpc('simpan_skc_excel32',{...args,p_rows:p.payload}):rpc('simpan_skc_note35_6_7',{...args,p_rows:p.payload,p_office:p.office});
  }
 });
 g.SkcInputStore=Object.freeze({save:(rows,office)=>channel.save(office,'skc3567',rows),retry:channel.retry,check:channel.check,get pending(){return channel.pending;},get busy(){return channel.busy;}});
})(window);
