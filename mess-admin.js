(function(){
  'use strict';
  const $=id=>document.getElementById(id),A=window.Akses,{escape:e,formError,showToast}=window.PortalUI;
  const targets=[['nik','NIK'],['nama','Nama'],['departemen','Departemen'],['jabatan','Jabatan'],['lokasi_hunian','Lokasi Hunian'],['blok','Blok'],['nomor_kamar','Nomor Kamar'],['tanggal_masuk_hunian','Tanggal Masuk Hunian']];
  const normal=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const aliases={nik:['nik','idkaryawan'],nama:['nama','namakaryawan'],departemen:['departemen','department','dept'],jabatan:['jabatan','position'],lokasi_hunian:['lokasihunian','lokasi','mess','hunian'],blok:['blok','block'],nomor_kamar:['nomorkamar','nokamar','kamar','room'],tanggal_masuk_hunian:['tanggalmasukhunian','tglmasukhunian','tanggalmasukmess','tglmasukmess','tanggalmasuk','tglmasuk']};
  let source=[],headers=[],rows=[],settings=null,busy=false,logs=[],logPage=0,logHasMore=false,hasLoadedLogs=false;
  let logRequest=0,logActor=null;
  const identity=()=>{const p=A.profile;return p?[p.id,p.peran,p.office_id,p.aktif,p.akses_portal].join('|'):'';};
  let accessKey=identity(),generation=0,fileRequest=0;
  const current=(seq,key)=>seq===generation&&key===identity()&&A.canWrite();
  function guard(seq,key){if(!current(seq,key))throw Object.assign(new Error('Akses akun berubah. Buka kembali Update Data Mess.'),{stale:true});}
  function time(v){return v?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jayapura',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v))+' WIT':'Belum ada pembaruan';}
  async function metadata(){
    await A.ready;if(!A.profile||A.profile.peran==='crew')return;
    renderMetadata(await A.one('pengaturan_mess',1));
  }
  function renderMetadata(value){
    settings=value;
    $('mess-last-update').textContent=time(settings.diperbarui_pada);$('mess-row-count').textContent=settings.jumlah_data.toLocaleString('id-ID');$('mess-last-actor').textContent=settings.nama_petugas||'—';
  }
  let sheetPromise;
  function sheetJs(){
    if(window.XLSX)return Promise.resolve(window.XLSX);
    if(!sheetPromise)sheetPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/xlsx.full.min.js';s.integrity='sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';s.crossOrigin='anonymous';s.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error('Pembaca Excel belum tersedia.'));s.onerror=()=>{sheetPromise=null;reject(new Error('Pembaca Excel belum dapat dimuat. Muat ulang halaman.'));};document.head.append(s);});
    return sheetPromise;
  }
  function reset(){fileRequest++;source=[];rows=[];headers=[];$('mess-file').value='';$('mess-mapping-panel').hidden=true;$('mess-progress').hidden=true;for(const id of ['mess-mapping','mess-preview','mess-file-summary','mess-validation'])$(id).replaceChildren();$('mess-upload-status').textContent='';formError('mess-upload-error','');}
  function validate(){
    $('mess-confirm').checked=false;rows=[];
    const mapping=Object.fromEntries(targets.map(([key])=>[key,$('map-'+key).value]));
    const {rows:valid,errors,skipped}=window.MessImport.validate(source,mapping);
    $('mess-preview').innerHTML='<table><thead><tr>'+targets.map(([,label])=>'<th>'+e(label)+'</th>').join('')+'</tr></thead><tbody>'+valid.slice(0,5).map(row=>'<tr>'+targets.map(([key,label])=>'<td data-label="'+label+'">'+e(row[key]||'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
    if(errors.length){$('mess-validation').textContent=errors.slice(0,4).join(' ')+' Perbaiki file, lalu unggah kembali.';}
    else if(!valid.length){$('mess-validation').textContent='File belum berisi data.';}
    else{rows=valid;$('mess-validation').textContent=rows.length.toLocaleString('id-ID')+' baris valid.'+(skipped?' '+skipped.toLocaleString('id-ID')+' baris kosong dilewati.':'')+' Pratinjau menampilkan 5 baris pertama.';}
    updateButton();
  }
  function updateButton(){$('mess-publish').disabled=busy||!A.canWrite()||!rows.length||!$('mess-confirm').checked;}
  $('mess-file').addEventListener('change',async()=>{
    const file=$('mess-file').files[0];if(!file||busy)return;
    const seq=generation,key=identity(),request=++fileRequest;
    $('mess-mapping-panel').hidden=true;rows=[];formError('mess-upload-error','');updateButton();
    try{
      if(!A.canWrite())throw new Error('Masuk sebagai admin untuk mengimpor data.');
      if(file.size>20*1024*1024)throw new Error('Ukuran file maksimal 20 MB.');
      if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw new Error('Pilih file Excel atau CSV.');
      $('mess-upload-status').textContent='Membaca file…';
      const XLSX=await sheetJs();guard(seq,key);const bytes=await file.arrayBuffer();guard(seq,key);if(request!==fileRequest)return;
      const book=XLSX.read(bytes,{type:'array',cellText:true,sheetRows:100002}),sheet=book.Sheets[book.SheetNames[0]];
      if(!sheet)throw new Error('File belum memiliki lembar data.');
      const bounds=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
      if(bounds.e.r-bounds.s.r>100000)throw new Error('Maksimal 100.000 baris per impor.');
      const values=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:'',blankrows:true});
      if(values.length<2)throw new Error('File harus memiliki judul kolom dan data.');
      if(values.length>100001)throw new Error('Maksimal 100.000 baris per impor.');
      headers=values[0].map(v=>String(v).trim());source=values.slice(1);
      $('mess-file-summary').textContent=file.name+' · '+book.SheetNames[0];
      $('mess-mapping').innerHTML=targets.map(([key,label])=>'<label for="map-'+key+'">'+label+'<select id="map-'+key+'"><option value="">Tidak ada kolom</option>'+headers.map((header,index)=>'<option value="'+index+'">'+e(header||'Kolom '+(index+1))+'</option>').join('')+'</select></label>').join('');
      targets.forEach(([key])=>{const index=headers.findIndex(h=>aliases[key].includes(normal(h)));$('map-'+key).value=index>=0?String(index):'';$('map-'+key).addEventListener('change',validate);});
      $('mess-mapping-panel').hidden=false;$('mess-upload-status').textContent='';validate();
    }catch(err){if(request===fileRequest&&current(seq,key)){$('mess-upload-status').textContent='';formError('mess-upload-error',err.message);}}
  });
  $('mess-confirm').addEventListener('change',updateButton);$('mess-reset').addEventListener('click',reset);
  function freezeUpload(value){busy=value;$('mess-file').disabled=value;$('mess-reset').disabled=value;$('mess-confirm').disabled=value;targets.forEach(([key])=>{if($('map-'+key))$('map-'+key).disabled=value;});updateButton();}
  $('mess-publish').addEventListener('click',async()=>{
    if(busy||!rows.length||!$('mess-confirm').checked)return;
    const seq=generation,key=identity(),batch=rows.slice(),fileName=$('mess-file').files[0]?.name;
    freezeUpload(true);formError('mess-upload-error','');let importId=null,publishing=false,published=false;
    try{
      if(!settings)await metadata();
      guard(seq,key);
      importId=await A.rpc('mulai_impor_mess',{p_nama_berkas:fileName,p_jumlah:batch.length,p_versi:settings.versi},true);guard(seq,key);
      $('mess-progress').hidden=false;
      for(let i=0;i<batch.length;i+=500){
        guard(seq,key);await A.rpc('isi_impor_mess',{p_id:importId,p_mulai:i,p_baris:batch.slice(i,i+500)},true);guard(seq,key);
        $('mess-progress').value=Math.round(Math.min(i+500,batch.length)/batch.length*95);$('mess-upload-status').textContent='Mengunggah '+Math.min(i+500,batch.length).toLocaleString('id-ID')+' / '+batch.length.toLocaleString('id-ID')+' baris…';
      }
      publishing=true;$('mess-upload-status').textContent='Menerbitkan pembaruan mess…';
      guard(seq,key);const receipt=await A.rpc('terbitkan_impor_mess',{p_id:importId},true);published=true;importId=null;guard(seq,key);
      reset();renderMetadata(receipt);$('mess-upload-status').textContent='Pembaruan tersimpan. Pencarian berikutnya menggunakan data hunian terbaru.';showToast('Data mess berhasil diperbarui.');
    }catch(err){
      if(err.stale||!current(seq,key))return;
      // A database rejection and a lost response require different next steps.
      const failure=window.MessImport.uploadFailure(err,{publishing,published});
      formError('mess-upload-error',failure.message);
      if(importId&&!failure.uncertain)try{await A.rpc('batalkan_impor_mess',{p_id:importId},true);}catch{}
      $('mess-upload-status').textContent='';
      try{await metadata();}catch{}
    }finally{if(seq===generation)freezeUpload(false);}
  });
  function renderLogs(){
    if(!A.administrator())return;
    const recent=logs.filter(r=>new Date(r.dicari_pada).getTime()>=Date.now()-86400000);
    $('mess-log-results').innerHTML=recent.length?'<div class="table-scroll"><table><thead><tr><th>Waktu</th><th>Pengguna</th><th>Pencarian</th><th>Hasil</th></tr></thead><tbody>'+recent.map(r=>'<tr><td>'+e(time(r.dicari_pada))+'</td><td>'+e(r.nama_pengguna)+'<small>'+e(r.email_pengguna)+'</small></td><td>'+e(r.jenis_pencarian==='nama'?r.kata_kunci:[r.lokasi_hunian,r.blok&&'Blok '+r.blok,r.nomor_kamar&&'Kamar '+r.nomor_kamar].filter(Boolean).join(' · '))+'</td><td>'+r.jumlah_hasil+'</td></tr>').join('')+'</tbody></table></div>':'<p class="mess-log-empty">Belum ada pencarian dalam 24 jam terakhir.</p>';
    $('mess-log-count').textContent=recent.length+' pencarian ditampilkan';$('mess-log-more').hidden=!logHasMore;
  }
  async function loadLogs(more=false){
    if(!A.administrator())return;
    const sequence=++logRequest,who=A.profile?.id,client=await A.requireClient(),page=more?logPage+1:0;
    const {data,error}=await client.from('riwayat_pencarian_mess').select('*').gte('dicari_pada',new Date(Date.now()-86400000).toISOString()).order('dicari_pada',{ascending:false}).order('id',{ascending:false}).range(page*100,page*100+99);
    if(sequence!==logRequest||A.profile?.id!==who||!A.administrator())return;
    if(error)throw new Error(A.errorText(error));
    logs=more?[...new Map([...logs,...data].map(r=>[r.id,r])).values()]:data;logPage=page;logHasMore=data.length===100;hasLoadedLogs=true;renderLogs();
  }
  $('mess-log-refresh').addEventListener('click',()=>loadLogs().catch(err=>showToast(err.message)));
  $('mess-log-more').addEventListener('click',async()=>{const b=$('mess-log-more');b.disabled=true;try{await loadLogs(true);}catch(err){showToast(err.message);}finally{b.disabled=false;}});
  async function refresh(){await metadata();if(A.administrator()&&location.hash==='#mess')await loadLogs();}
  document.addEventListener('akses:berubah',()=>{
    const key=identity();if(key!==accessKey){accessKey=key;generation++;fileRequest++;reset();settings=null;freezeUpload(false);$('mess-last-update').textContent='—';$('mess-row-count').textContent='—';$('mess-last-actor').textContent='—';}
    const who=A.profile?.id;
    if(logActor!==who||!A.administrator()){logRequest++;logActor=who;logs=[];logPage=0;logHasMore=false;hasLoadedLogs=false;$('mess-log-results').replaceChildren();$('mess-log-count').textContent='';$('mess-log-more').hidden=true;}
    refresh().catch(err=>showToast(err.message));
  });
  document.addEventListener('data:muat-ulang',()=>refresh().catch(err=>showToast(err.message)));
  window.addEventListener('hashchange',()=>{if(location.hash==='#mess')refresh().catch(err=>showToast(err.message));});
  setInterval(()=>{if(hasLoadedLogs&&A.administrator())renderLogs();},60000);
  refresh().catch(err=>showToast(err.message));
})();
