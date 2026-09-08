(function(g){
'use strict';const A=g.Akses;let pending=null,busy=false;
function script(src,test){if(test())return Promise.resolve();return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=()=>test()?resolve():reject(new Error('Komponen unduhan belum tersedia.'));s.onerror=()=>{s.remove();reject(new Error('Komponen unduhan belum dapat dimuat. Coba lagi.'));};document.head.append(s);});}
function ready(){if(!pending)pending=Promise.all([script('vendor/xlsx.full.min.js',()=>!!g.XLSX),script('vendor/jszip.min.js',()=>!!g.JSZip)]).catch(e=>{pending=null;throw e;});return pending;}
const dateName=now=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jayapura',year:'numeric',month:'long',day:'2-digit'}).format(now).replace(/\s+/g,'_');
const person=v=>v?.nama||'Admin/Gudang';
function files(snapshot){
 if(snapshot?.format!=='GA_PORTAL'||snapshot.versi_format!==1||snapshot.versi_skema!==8)throw new Error('Format ekspor belum sesuai. Pasang SQL pembaruan 08.');
 const tables=['jabatan','karyawan','perangkat','serah_terima_perangkat','dokumen','perpindahan_dokumen','pengambilan_skc','tamu','catatan_admin'];
 const d={};for(const key of tables){if(!Array.isArray(snapshot.data?.[key]))throw new Error('Data ekspor belum lengkap: '+key);d[key]=snapshot.data[key];}
 const employees=new Map(d.karyawan.map(k=>[k.id,k])),devices=new Map(d.perangkat.map(p=>[p.id,p])),docs=new Map(d.dokumen.map(v=>[v.id,v]));
 const date=v=>v?{v:new Date(v+'T00:00:00Z'),t:'d',z:'[$-421]d mmmm yyyy'}:'';
 const stamp=v=>v?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jayapura',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v))+' WIT':'';
 const active=v=>v.aktif===false?'Nonaktif':'Aktif';
 const row=(rows,cols)=>[cols.map(c=>c[0]),...rows.map(r=>cols.map(c=>{const v=typeof c[1]==='function'?c[1](r):r[c[1]];return v??'';}))];
 const out={};
 function book(filename,sheets){const wb=g.XLSX.utils.book_new();for(const [name,rows,cols] of sheets){const ws=g.XLSX.utils.aoa_to_sheet(row(rows,cols),{cellDates:true});ws['!cols']=cols.map(([label])=>({wch:/Note|catatan|Keperluan|Link/.test(label)?50:/Nama|oleh|Posisi|Pemegang/.test(label)?28:22}));ws['!autofilter']={ref:ws['!ref']};g.XLSX.utils.book_append_sheet(wb,ws,name);}out[filename]=g.XLSX.write(wb,{type:'array',bookType:'xlsx',compression:true});}
 book('Data_Karyawan.xlsx',[
 ['Karyawan',d.karyawan,[['ID','id'],['NIK','nik'],['Nama','nama'],['Jabatan','jabatan'],['Golongan','golongan'],['Nomor HP','nomor_hp'],['Kamar mess','kamar_mess'],['Status',active],['Dibuat oleh','nama_pembuat']]],
 ['Jabatan',d.jabatan,[['ID','id'],['Nama jabatan','nama'],['Urutan','urutan']]]]);
 book('Data_Perangkat.xlsx',[
 ['Perangkat',d.perangkat,[['ID','id'],['Jenis','jenis'],['Nomor seri','nomor_seri'],['Merek atau tipe','merek'],['Kondisi','kondisi'],['Status',active],['Pemegang awal',v=>person(v.pemegang_awal)],['Pemegang sekarang',v=>employees.get(v.pemegang_id)?.nama||'Admin/Gudang'],['NIK pemegang',v=>employees.get(v.pemegang_id)?.nik||''],['Jumlah perpindahan','jumlah_perpindahan'],['Tanggal terakhir',v=>date(v.tanggal_serah_terima_terakhir)]]],
 ['Riwayat',d.serah_terima_perangkat,[['ID','id'],['ID perangkat','perangkat_id'],['Nomor seri',v=>devices.get(v.perangkat_id)?.nomor_seri||''],['Urutan','urutan'],['Tanggal',v=>date(v.tanggal)],['Dari',v=>person(v.pemegang_asal)],['Kepada',v=>person(v.penerima)],['Kondisi','kondisi'],['Note','catatan'],['Link bukti','link_bukti'],['Dicatat oleh','nama_petugas'],['Waktu input',v=>stamp(v.dicatat_pada)]]]]);
 const docCols=[['ID','id'],['Kode','kode'],['Tanggal masuk',v=>date(v.tanggal_masuk)],['Nama dokumen','nama_dokumen'],['Nomor dokumen','nomor_dokumen'],['Jenis','jenis_dokumen'],['Jenis lainnya','jenis_lainnya'],['Asal dokumen',v=>v.office_asal||'Belum ditentukan'],['Asal dari data lama','asal_dokumen'],['BU','bu'],['Status','status_terakhir'],['Posisi sekarang','posisi_sekarang'],['Tahapan','tahapan_sekarang'],['Keperluan','keperluan'],['Note Dokumen','catatan'],['Note Perpindahan terakhir','catatan_perpindahan_terakhir'],['Dibuat oleh','nama_pembuat']];
 const final=v=>['Sudah Diambil','Selesai','Dibatalkan'].includes(v.status_terakhir);
 book('Tracking_Dokumen.xlsx',[
 ['Aktif',d.dokumen.filter(v=>!final(v)),docCols],['Selesai',d.dokumen.filter(final),docCols],
 ['Riwayat',d.perpindahan_dokumen,[['ID','id'],['ID dokumen','dokumen_id'],['Kode dokumen',v=>docs.get(v.dokumen_id)?.kode||''],['Urutan','urutan'],['Tanggal',v=>date(v.tanggal_perpindahan)],['Tahapan','tahapan'],['Dari','posisi_sebelum'],['Tujuan','tujuan'],['Status','status'],['Note Perpindahan','catatan'],['Dicatat oleh','nama_petugas'],['Waktu input',v=>stamp(v.dicatat_pada)]]]]);
 const skcCols=[['ID','id'],['NIK',v=>employees.get(v.karyawan_id)?.nik||v.nik_pengambil||''],['Nama',v=>employees.get(v.karyawan_id)?.nama||v.nama_pengambil||''],['Tanggal cuti',v=>date(v.tanggal_cuti)],['Status','status'],['Tanggal diambil',v=>date(v.tanggal_diambil)],['Nama pengambil','nama_pengambil'],['Dicatat pengambilan oleh','nama_petugas_pengambilan'],['Link Form Cuti','link_form_cuti'],['Link Exit','link_exit']];
 const skc=[...d.pengambilan_skc].sort((a,b)=>a.tanggal_cuti.localeCompare(b.tanggal_cuti));
 book('Data_SKC.xlsx',[['Belum diambil',skc.filter(v=>v.status==='Belum diambil'),skcCols],['Sudah diambil',skc.filter(v=>v.status==='Sudah diambil'),skcCols]]);
 book('Tamu_dan_Catatan.xlsx',[
 ['Tamu',d.tamu,[['ID','id'],['Nama tamu','nama'],['Tamu dari mana','asal'],['Tanggal kedatangan',v=>date(v.tanggal_kedatangan)],['Status','status'],['Tanggal keluar',v=>date(v.tanggal_keluar)],['Keperluan','keperluan'],['Note','catatan'],['Dibuat oleh','nama_pembuat'],['Terakhir diubah oleh','nama_pengubah']]],
 ['Catatan Admin',d.catatan_admin,[['ID','id'],['Jenis','jenis'],['Nama karyawan',v=>employees.get(v.karyawan_id)?.nama||''],['NIK',v=>employees.get(v.karyawan_id)?.nik||''],['Tanggal pengingat',v=>date(v.tanggal_pengingat)],['Note','catatan'],['Status','status'],['Dibuat oleh','nama_pembuat'],['Waktu input',v=>stamp(v.dibuat_pada)],['Diselesaikan oleh','nama_penyelesai'],['Waktu selesai',v=>stamp(v.diselesaikan_pada)]]]]);
 // Explicit allowlist: housing data, search logs, account profiles and Auth are never exported.
 out['Data_Portal_GA.json']=JSON.stringify({format:'GA_PORTAL',versi_format:1,versi_skema:8,diekspor_pada:snapshot.diekspor_pada,zona_waktu:'Asia/Jayapura',nama_petugas:snapshot.nama_petugas,data:d},null,2);
 out['BACA_DULU.txt']='Data operasional Portal GA, seluruh halaman dan status, pada waktu ekspor.\nData mess, riwayat pencarian, akun Auth dan foto profil akun tidak disertakan.\nJSON mempertahankan ID, relasi, foto master karyawan dan riwayat yang masih tersimpan.\nPemulihan dilakukan melalui Supabase dengan skrip yang sesuai; tidak tersedia impor JSON di web.\nFile Google Drive dan isi bucket foto profil bukan bagian paket ini.\n';return out;
}
async function build(snapshot,now=new Date()){await ready();const zip=new g.JSZip();for(const [name,data] of Object.entries(files(snapshot)))zip.file(name,data);return {blob:await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}}),filename:'Cadangan_Portal_GA_'+dateName(now)+'.zip'};}
function setup(){if(document.body.dataset.area!=='portal')return;const panel=document.getElementById('ga-panel-profile');if(!panel)return;let box=document.getElementById('export-box');if(!box){box=document.createElement('section');box.id='export-box';box.className='export-box';box.innerHTML='<h3>Unduh data Portal</h3><p>Seluruh data operasional dalam Excel dan JSON. Data mess tidak disertakan.</p><button class="ga-profile-button primary" id="export-all" type="button">Unduh Semua</button><p id="export-message" class="export-message" role="status" hidden></p>';panel.append(box);document.getElementById('export-all').onclick=download;}box.hidden=!A.superAdmin();}
async function download(){if(busy||!A.superAdmin())return;busy=true;const b=document.getElementById('export-all'),msg=document.getElementById('export-message');b.disabled=true;b.textContent='Menyiapkan unduhan…';msg.hidden=false;msg.textContent='Mengambil seluruh data terbaru.';
 try{const snap=await A.rpc('ekspor_data_portal',{}),result=await build(snap);const url=URL.createObjectURL(result.blob),a=document.createElement('a');a.href=url;a.download=result.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);msg.textContent='Paket Excel dan JSON siap diunduh.';}
 catch(err){msg.textContent=err.message||'Unduhan belum dapat disiapkan. Coba lagi.';}finally{busy=false;b.disabled=false;b.textContent='Unduh Semua';}}
g.EksporPortal=Object.freeze({files,build,dateName});document.addEventListener('profil:siap',setup);document.addEventListener('akses:berubah',setup);setup();
})(window);
