(function(g){
'use strict';const A=g.Akses,columns='*,karyawan:karyawan(id,nik,nama,jabatan)';
const map=v=>({id:v.id,employeeId:v.karyawan_id,nik:v.karyawan.nik,nama:v.karyawan.nama,jabatan:v.karyawan.jabatan,tanggalCuti:v.tanggal_cuti,formCutiUrl:v.link_form_cuti,exitUrl:v.link_exit,status:v.status,tanggalDiambil:v.tanggal_diambil||'',namaPengambil:v.nama_pengambil,nikPengambil:v.nik_pengambil,namaPetugas:v.nama_petugas_pengambilan,diambilPada:v.diambil_pada,revision:v.versi});
const compare=(a,b)=>a.tanggalCuti.localeCompare(b.tanggalCuti)||a.nama.localeCompare(b.nama,'id-ID')||a.id.localeCompare(b.id);
function driveLink(value){
 const raw=String(value||'').trim();if(!raw)return '';let url;
 try{url=new URL(raw);}catch{throw new Error('Isi link HTTPS Google Drive atau Google Docs yang valid.');}
 if(raw.length>3000||/[\s\\\u0000-\u001f\u007f]/.test(raw)||url.protocol!=='https:'||!['drive.google.com','docs.google.com'].includes(url.hostname)||url.username||url.password||url.port||(url.pathname==='/'&&!url.search))throw new Error('Gunakan link HTTPS Google Drive atau Google Docs yang valid.');
 return url.href;
}
const get=async id=>map(await A.one('pengambilan_skc',id,columns));
g.SkcStore=Object.freeze({
 async list(){await A.ready;if(A.profile?.peran==='crew')return [];return (await A.all('pengambilan_skc',columns,{},'tanggal_cuti')).map(map).sort(compare);},get,
 async create(f){const v=await A.rpc('tambah_skc',{p_data:{karyawan_id:f.employeeId,tanggal_cuti:f.tanggalCuti,link_form_cuti:driveLink(f.formCutiUrl),link_exit:driveLink(f.exitUrl)}},true);return get(v.id);},
 async collect(id,expectedRevision){await A.rpc('ambil_skc',{p_id:id,p_versi:expectedRevision},true);return get(id);}
});
g.SkcDomain=Object.freeze({driveLink,compare});
})(window);
