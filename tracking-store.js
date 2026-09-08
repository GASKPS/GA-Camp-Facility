(function(g){
'use strict';
const A=g.Akses;
const STATUS=['Dititipkan','Menunggu Approval','Sedang Diproses','Perlu Revisi','Siap Diambil','Sudah Diambil','Selesai','Dibatalkan'];
const FINAL=['Sudah Diambil','Selesai','Dibatalkan'];
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jayapura',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function dayNumber(v){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))throw new Error('Tanggal tidak valid.');
 const [y,m,d]=v.split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d));
 if(y<1000||dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)throw new Error('Tanggal tidak valid.');
 return dt.getTime()/86400000;
}
const isFinal=s=>FINAL.includes(s);
const typeText=d=>d.jenisDokumen==='Lainnya'?d.jenisDokumenLainnya||'Lainnya':d.jenisDokumen;
function filterDocuments(records,{query='',bu='',status='',office='',dateFrom='',dateTo=''}={},final=false){
 if(dateFrom)dayNumber(dateFrom);if(dateTo)dayNumber(dateTo);
 if(dateFrom&&dateTo&&dateFrom>dateTo)throw new Error('Tanggal awal tidak boleh setelah tanggal akhir.');
 const q=query.trim().toLocaleLowerCase('id-ID');
 return records.filter(d=>isFinal(d.statusTerakhir)===final&&(!office||d.asalDokumen===office)&&(!dateFrom||d.tanggalMasuk>=dateFrom)&&(!dateTo||d.tanggalMasuk<=dateTo)&&(!bu||d.bu===bu)&&(!status||d.statusTerakhir===status)&&(!q||[d.kode,d.namaDokumen,d.nomorDokumen,typeText(d),d.bu,d.posisiSekarang,d.asalDokumen,d.noteDokumen].join(' ').toLocaleLowerCase('id-ID').includes(q)));
}
const holdDays=(d,t=today())=>!d.perpindahanTerakhir||isFinal(d.statusTerakhir)?null:Math.max(0,dayNumber(t)-dayNumber(d.perpindahanTerakhir));
function map(d){return {id:d.id,kode:d.kode,namaDokumen:d.nama_dokumen,tanggalMasuk:d.tanggal_masuk,jenisDokumen:d.jenis_dokumen,jenisDokumenLainnya:d.jenis_lainnya,nomorDokumen:d.nomor_dokumen,bu:d.bu,asalDokumen:d.office_asal||'',asalDokumenLama:d.asal_dokumen,keperluan:d.keperluan,noteDokumen:d.catatan,notePerpindahanTerakhir:d.catatan_perpindahan_terakhir,statusTerakhir:d.status_terakhir,posisiSekarang:d.posisi_sekarang,tahapanSekarang:d.tahapan_sekarang,perpindahanTerakhir:d.perpindahan_terakhir,revision:d.versi,namaPembuat:d.nama_pembuat,dibuatPada:d.dibuat_pada,jumlahPerpindahan:d.jumlah_perpindahan,history:[]};}
function fields(f){return {nama_dokumen:f.namaDokumen,tanggal_masuk:f.tanggalMasuk,jenis_dokumen:f.jenisDokumen,jenis_lainnya:f.jenisDokumenLainnya,nomor_dokumen:f.nomorDokumen,bu:f.bu,office_asal:f.asalDokumen,keperluan:f.keperluan,catatan:f.noteDokumen};}
async function get(id){
 const [doc,events]=await Promise.all([A.one('dokumen',id),A.all('perpindahan_dokumen','*',{dokumen_id:id},'urutan')]);
 return {...map(doc),history:events.map(v=>({id:v.id,tanggalPerpindahan:v.tanggal_perpindahan,tahapan:v.tahapan,dari:v.nama_petugas,posisiSebelum:v.posisi_sebelum,kepada:v.tujuan,status:v.status,notePerpindahan:v.catatan,namaPetugas:v.nama_petugas,dicatatPada:v.dicatat_pada}))};
}
g.TrackingDomain=Object.freeze({STATUS,FINAL,today,dayNumber,isFinal,holdDays,typeText,filterDocuments});
g.TrackingStore=Object.freeze({
 async list(){return (await A.all('dokumen','*,catatan_perpindahan_terakhir',{},'dibuat_pada')).map(map).reverse();},get,
 async create(f){return map(await A.rpc('simpan_dokumen',{p_data:fields(f)},true));},
 async update(id,f){await A.rpc('simpan_dokumen',{p_id:id,p_versi:f.expectedRevision,p_data:fields(f)},true);return get(id);},
 async move(id,f){await A.rpc('catat_perpindahan_dokumen',{p_id:id,p_versi:f.expectedRevision,p_data:{tanggal_perpindahan:f.tanggalPerpindahan,tahapan:f.tahapan,tujuan:f.kepada,status:f.status,catatan:f.notePerpindahan}},true);return get(id);}
});
})(window);
