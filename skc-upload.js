(function(g){
 'use strict';
 const A=g.Akses,S=g.SkcInputStore,D=g.SkcInputDomain,U=g.PortalUI,$=id=>document.getElementById(id),e=U.escape;
 const dialog=$('skc-upload-dialog'),form=$('skc-upload-form'),fileInput=$('skc-upload-file'),save=$('skc-upload-save');
 const maxSize=5*1024*1024;
 let xlsxPromise,request=0,busy=false,staged=null,key='';
 const identity=()=>g.Kiriman33.identity();
 const active=()=>A.canWrite()&&A.profile?.akses_portal&&location.hash==='#tracking'&&!$('skc-panel').hidden;
 const current=seq=>seq===request&&key===identity()&&active()&&dialog.open;

 function sheetReader(){
  if(g.XLSX)return Promise.resolve(g.XLSX);
  if(!xlsxPromise)xlsxPromise=new Promise((resolve,reject)=>{
   const s=document.createElement('script');
   s.src='vendor/xlsx.full.min.js';
   s.integrity='sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';
   s.crossOrigin='anonymous';
   s.onload=()=>g.XLSX?resolve(g.XLSX):reject(new Error('Pembaca Excel belum tersedia.'));
   s.onerror=()=>{s.remove();reject(new Error('Pembaca Excel belum dapat dimuat. Coba pilih file lagi.'));};
   document.head.append(s);
  }).catch(err=>{xlsxPromise=null;throw err;});
  return xlsxPromise;
 }
 function message(text='',tone='info'){
  const node=$('skc-upload-message');node.textContent=text;node.hidden=!text;node.dataset.tone=tone;
 }
 function controls(){
  const pending=active()?S.pending:null,ready=!!staged?.result.entries.length&&!staged.result.issues.length;
  fileInput.disabled=busy||!!pending;
  save.hidden=!!pending;
  save.disabled=busy||!ready||!!pending;
  save.textContent=ready?'Simpan '+staged.result.entries.length+' SKC':'Simpan SKC';
  $('skc-upload-check').hidden=!pending;$('skc-upload-check').disabled=busy;
  $('skc-upload-retry').hidden=!pending?.canRetry;$('skc-upload-retry').disabled=busy;
 }
 function preview(){
  const target=$('skc-upload-rows');$('skc-upload-preview').hidden=!staged;
  target.replaceChildren();if(!staged)return;
  const {rows,result}=staged,issues=new Map(result.issues.map(x=>[x.index,x.errors]));
  target.innerHTML=result.entries.map(({index,person,data})=>{
   const row=rows[index],errors=Object.values(issues.get(index)||{}),day=data.tanggal_cuti?g.TanggalInput.format(data.tanggal_cuti):row.tanggalCuti;
   return `<tr><th scope="row">${row.line}</th><td><strong>${e(person?.nama||'—')}</strong><span class="secondary-value">${e(data.nik||'—')}</span></td><td>${e(day||'—')}</td><td class="skc-note">${e(row.note||'—')}</td><td>${errors.length?`<span class="skc-review-error">Periksa</span><ul>${errors.map(err=>'<li>'+e(err)+'</li>').join('')}</ul>`:'<span class="skc-review-ready">Siap</span>'}</td></tr>`;
  }).join('');
 }
 function clear(){
  request++;busy=false;staged=null;fileInput.value='';
  U.setDialogBusy?.('skc-upload-dialog',false);preview();message();controls();g.FormGuard?.clean(form);
 }
 function closeForAccess(){clear();if(dialog.open)U.closeDialog('skc-upload-dialog');}
 function open(){
  if(!active()||dialog.open||$('skc-dialog').open)return;
  if(!S.pending)g.SkcOffice.office();
  key=identity();clear();
  if(S.pending)message('Ada kiriman SKC yang belum dikonfirmasi. Periksa penyimpanan sebelum memilih file baru.');
  U.openDialog('skc-upload-dialog');(S.pending?$('skc-upload-check'):fileInput).focus();
 }
 function checkXlsx(bytes){
  const view=new DataView(bytes),size=view.byteLength;
  if(size<22||view.getUint32(0,true)!==0x04034b50)throw new Error('File bukan Excel .xlsx. Gunakan template SKC.');
  // Restrict expansion work before invoking the spreadsheet parser.
  let end=size-22;
  while(end>=Math.max(0,size-65557)&&(view.getUint32(end,true)!==0x06054b50||end+22+view.getUint16(end+20,true)!==size))end--;
  if(end<Math.max(0,size-65557))throw new Error('File Excel rusak atau belum selesai disalin.');
  const count=view.getUint16(end+10,true);
  let pos=view.getUint32(end+16,true),expanded=0;
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||!count||count>500)throw new Error('Struktur file Excel tidak didukung. Simpan ulang dengan template SKC.');
  for(let i=0;i<count;i++){
   if(pos+46>end||view.getUint32(pos,true)!==0x02014b50)throw new Error('Struktur file Excel tidak dapat dibaca.');
   expanded+=view.getUint32(pos+24,true);
   if(expanded>25*1024*1024)throw new Error('Isi file Excel terlalu besar. Salin hanya data SKC ke template.');
   pos+=46+view.getUint16(pos+28,true)+view.getUint16(pos+30,true)+view.getUint16(pos+32,true);
  }
  if(pos>end)throw new Error('Struktur file Excel tidak dapat dibaca.');
 }
 async function read(){
  if(!dialog.open||!active()||busy||S.pending)return;
  const file=fileInput.files?.[0],seq=++request;staged=null;preview();message();
  if(!file){controls();return;}
  if(!/\.xlsx$/i.test(file.name)||file.size<22||file.size>maxSize){message('Pilih file .xlsx dengan ukuran maksimal 5 MB.','error');controls();return;}
  busy=true;controls();message('Membaca file dan mencocokkan NIK…');
  try{
   const office=g.SkcOffice.office();
   const [XLSX,bytes,employees,existing]=await Promise.all([sheetReader(),file.arrayBuffer(),g.EmployeeStore.list(),g.SkcStore.list()]);
   if(!current(seq))return;
   checkXlsx(bytes);
   const book=XLSX.read(bytes,{type:'array',sheetRows:D.maxRows+2,cellFormula:true,cellDates:false});
   const rows=D.fromWorkbook(book,XLSX),result=D.validate(rows,{employees,existing});
   staged={office,rows,result};preview();
   const issues=result.issues.length,ready=result.entries.length-issues;
   message(issues?`${ready} siap · ${issues} perlu diperbaiki. Perbaiki file lalu pilih kembali.`:`${ready} SKC siap disimpan. Periksa nama dan tanggal cuti.`,issues?'error':'success');
   g.FormGuard?.touch(form);
  }catch(err){if(current(seq))message(err.message||'File Excel belum dapat dibaca.','error');}
  finally{if(current(seq)){busy=false;controls();}}
 }
 async function send(action){
  if(!dialog.open||!active()||busy||S.busy)return;
  if(action==='save'&&(S.pending||!staged?.result.entries.length||staged.result.issues.length))return;
  if(action!=='save'&&!S.pending)return;
  let office;
  try{if(action==='save'){
   office=g.SkcOffice.office();
   if(office!==staged.office)throw new Error('Office berubah. Pilih file kembali sebelum menyimpan.');
  }}catch(err){message(err.message,'error');return;}
  const seq=++request;
  busy=true;U.setDialogBusy?.('skc-upload-dialog',true);controls();message(action==='check'?'Memeriksa penyimpanan…':'Menyimpan SKC…');
  try{
   const value=action==='save'?await S.save(staged.result.entries.map(x=>x.data),office):await S[action]();
   if(!current(seq))return;
   if(value){
    clear();g.FormGuard?.clean(form);U.closeDialog('skc-upload-dialog');
    document.dispatchEvent(new CustomEvent('skc:batch-saved',{detail:{jumlah:value.jumlah}}));
    U.showToast(value.jumlah+' SKC berhasil disimpan.');
   }else message('Kiriman belum tersimpan. Periksa pratinjau atau pilih file kembali.');
  }catch(err){
   if(!current(seq)||err.stale)return;
   let detail=err.message;
   const m=action==='save'&&/^Baris (\d+):/.exec(detail);
   if(m){
    const entry=staged?.result.entries[Number(m[1])-1];
    if(entry)detail=detail.replace(m[0],'Baris Excel '+staged.rows[entry.index].line+':');
   }
   message(S.pending?'Hasil belum dikonfirmasi. Gunakan Periksa penyimpanan. '+detail:detail,'error');
  }finally{if(current(seq)){busy=false;U.setDialogBusy?.('skc-upload-dialog',false);controls();}}
 }
 $('tracking-upload-skc').addEventListener('click',()=>{try{open();}catch(err){U.showToast(err.message);}});
 fileInput.addEventListener('change',read);
 form.addEventListener('submit',event=>{event.preventDefault();send('save');});
 form.addEventListener('reset',()=>queueMicrotask(()=>{if(dialog.open&&!busy&&!S.pending)clear();}));
 $('skc-upload-check').addEventListener('click',()=>send('check'));
 $('skc-upload-retry').addEventListener('click',()=>send('retry'));
 dialog.addEventListener('close',clear);
 dialog.addEventListener('cancel',event=>{if(busy&&S.busy)event.preventDefault();},true);
 document.addEventListener('akses:berubah',()=>{if(key!==identity()||!active())closeForAccess();});
 document.addEventListener('tracking:tab-changed',event=>{if(event.detail?.tab!=='skc'&&dialog.open)closeForAccess();});
 g.addEventListener('hashchange',()=>{if(location.hash!=='#tracking'&&dialog.open)closeForAccess();});
})(window);
