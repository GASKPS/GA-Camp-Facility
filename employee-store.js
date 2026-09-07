(function(g){
'use strict';const A=g.Akses;
const map=v=>({id:v.id,nik:v.nik,nama:v.nama,jabatan:v.jabatan,golongan:v.golongan,noHp:v.nomor_hp,kamarMess:v.kamar_mess,foto:v.foto,revision:v.versi});
const fields=f=>({nik:f.nik,nama:f.nama,jabatan:f.jabatan,golongan:f.golongan,nomor_hp:f.noHp,kamar_mess:f.kamarMess,foto:f.foto});
g.EmployeeStore=Object.freeze({
 async list(){return (await A.all('karyawan','*',{},'nama')).map(map);},
 async get(id){return map(await A.one('karyawan',id));},
 async create(f){return map(await A.rpc('simpan_karyawan',{p_data:fields(f)},true));},
 async update(id,f){return map(await A.rpc('simpan_karyawan',{p_id:id,p_versi:f.expectedRevision,p_data:fields(f)},true));}
});
})(window);
