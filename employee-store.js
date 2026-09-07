(function(g){
'use strict';const A=g.Akses;
const columns='*,data_jabatan:jabatan(id,nama,urutan)';
const map=v=>({id:v.id,nik:v.nik,nama:v.nama,jabatan:v.data_jabatan?.nama||v.jabatan,jabatanId:v.jabatan_id,urutan:v.data_jabatan?.urutan??null,golongan:v.golongan,noHp:v.nomor_hp,kamarMess:v.kamar_mess,foto:v.foto,revision:v.versi});
const fields=f=>({nik:f.nik,nama:f.nama,jabatan_id:f.jabatanId,golongan:f.golongan,nomor_hp:f.noHp,kamar_mess:f.kamarMess,foto:f.foto});
const compare=(a,b)=>(a.urutan??Infinity)-(b.urutan??Infinity)||a.nama.localeCompare(b.nama,'id-ID',{sensitivity:'base'})||a.id.localeCompare(b.id);
g.EmployeeStore=Object.freeze({
 compare,
 async list(){return (await A.all('karyawan',columns,{},'nama')).map(map).sort(compare);},
 async get(id){return map(await A.one('karyawan',id,columns));},
 async create(f){if(!A.superAdmin())throw new Error('Hanya Super Admin yang boleh menambah karyawan.');return map(await A.rpc('simpan_karyawan',{p_data:fields(f)},true));},
 async update(id,f){if(!A.superAdmin())throw new Error('Hanya Super Admin yang boleh mengedit karyawan.');return map(await A.rpc('simpan_karyawan',{p_id:id,p_versi:f.expectedRevision,p_data:fields(f)},true));}
});
})(window);
