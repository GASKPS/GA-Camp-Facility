(function(g){
 'use strict';
 const maxRows=100,columns=[{key:'nik',label:'NIK'},{key:'tanggalCuti',label:'Tanggal cuti'},{key:'note',label:'Note'}];
 const clean=v=>String(v??'').trim(),normal=v=>clean(v).normalize('NFC').toLowerCase();
 const blank=()=>({nik:'',tanggalCuti:'',note:''}),empty=r=>!columns.some(c=>clean(r[c.key]));
 function employee(nik,employees){
  if(!clean(nik))return null;
  const list=employees.filter(p=>p.aktif!==false&&normal(p.nik)===normal(nik));return list.length===1?list[0]:null;
 }
 function validate(rows,context){
  if(rows.length>maxRows)throw new Error('Maksimal 100 baris per kiriman.');
  const entries=[],issues=new Map(),seen=new Map();
  const existing=new Set(context.existing.map(r=>r.employeeId+'|'+r.tanggalCuti));
  const duplicate='SKC karyawan dan tanggal ini sudah ada atau berulang.';
  rows.forEach((row,index)=>{
   if(empty(row)&&!Object.keys(row.fileErrors||{}).length)return;
   const errors={},person=employee(row.nik,context.employees),data={nik:clean(row.nik)};
   if(!data.nik||data.nik.length>40)errors.nik='NIK wajib diisi, maksimal 40 karakter.';
   else if(!person)errors.nik='NIK tidak ditemukan, nonaktif, atau lebih dari satu.';
   else data.nik=person.nik;
   try{data.tanggal_cuti=g.TrackingInputDomain.date(row.tanggalCuti);}catch(err){errors.tanggalCuti=err.message;}
   try{data.note=g.SkcDomain.noteText(row.note);}catch(err){errors.note=err.message;}
   if(person&&data.tanggal_cuti&&!row.fileErrors?.nik&&!row.fileErrors?.tanggalCuti){
    const key=person.id+'|'+data.tanggal_cuti;
    if(existing.has(key)||seen.has(key))errors.tanggalCuti=duplicate;
    if(seen.has(key)){const first=seen.get(key);issues.set(first,{...issues.get(first),tanggalCuti:duplicate});}
    else seen.set(key,index);
   }
   Object.assign(errors,row.fileErrors);
   if(Object.keys(errors).length)issues.set(index,errors);
   entries.push({index,data,person});
  });
  return {entries,issues:[...issues].sort(([a],[b])=>a-b).map(([index,errors])=>({index,errors}))};
 }
 const aliases={nik:'nik',nikkaryawan:'nik',tanggalcuti:'tanggalCuti',tglcuti:'tanggalCuti',note:'note',catatan:'note',keterangan:'note',
  nama:null,namakaryawan:null,jabatan:null,namajabatan:null,no:null,nomor:null,
  formcuti:null,linkformcuti:null,linkgoogledriveformcuti:null,exit:null,linkexit:null,linkgoogledriveexit:null};
 const header=v=>normal(v).replace(/[^a-z0-9]/g,'');
 function mappedHeaders(values){
  const keys=values.map(v=>{
   const h=header(v);
   if(!h)return null;
   if(!Object.hasOwn(aliases,h))throw new Error('Kolom "'+clean(v)+'" tidak dikenali. Gunakan template SKC.');
   return aliases[h];
  });
  if(!keys.includes('nik')||!keys.includes('tanggalCuti'))throw new Error('Baris judul harus memuat NIK dan Tanggal Cuti.');
  if(new Set(keys.filter(Boolean)).size!==keys.filter(Boolean).length)throw new Error('Judul kolom tidak boleh berulang.');
  return keys;
 }
 function paste(rows,text,row,col){
  const matrix=g.TrackingInputDomain.tsv(text);if(!matrix.length)return {rows:rows.map(r=>({...r})),count:0};
  let data=matrix,mapping=matrix[0].map((_,i)=>columns[col+i]?.key);
  if(matrix[0].filter(v=>Object.hasOwn(aliases,header(v))).length>=2){
   mapping=mappedHeaders(matrix[0]);data=matrix.slice(1);
   if(data.some(r=>r.length>mapping.length))throw new Error('Ada sel di luar judul kolom.');
  }else if(matrix.some(r=>r.length>columns.length-col))throw new Error('Tempelan melewati batas kolom. Mulai dari NIK atau sertakan judul kolom.');
  if(row<0||row+data.length>maxRows)throw new Error('Maksimal 100 baris per kiriman.');
  const next=rows.map(r=>({...r}));while(next.length<row+data.length)next.push(blank());
  data.forEach((line,i)=>line.forEach((v,j)=>{if(mapping[j])next[row+i][mapping[j]]=v;}));
  return {rows:next,count:data.length};
 }
 function fromWorkbook(book,XLSX){
  const sheet=book.Sheets[book.SheetNames.includes('SKC')?'SKC':book.SheetNames[0]];
  if(!sheet?.['!ref'])throw new Error('Lembar Excel kosong. Gunakan template SKC.');
  const bounds=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']);
  if(bounds.e.r>maxRows||bounds.e.c>=30)throw new Error('Gunakan maksimal 100 baris data dan 30 kolom, dengan judul di baris pertama.');
  const at=(r,c)=>sheet[XLSX.utils.encode_cell({r,c})],head=Array.from({length:bounds.e.c+1},(_,c)=>at(0,c)?.v);
  const mapping=mappedHeaders(head),rows=[],date1904=!!book.Workbook?.WBProps?.date1904;
  for(let r=1;r<=bounds.e.r;r++){
   const row={...blank(),line:r+1,fileErrors:{}};
   for(let c=0;c<mapping.length;c++){
    const key=mapping[c],cell=at(r,c);
    if(!key||!cell||cell.t==='z')continue;
    if(cell.f!==undefined||cell.F!==undefined||cell.t==='e'){
     row.fileErrors[key]='Isi nilai langsung tanpa rumus atau error Excel.';continue;
    }
    if(key==='nik'&&cell.t==='n'){
     if(!Number.isSafeInteger(cell.v)||cell.v<0||String(cell.v).length>15)row.fileErrors.nik='Simpan NIK sebagai teks agar angka tidak berubah.';
     else row.nik=/^\d+$/.test(cell.w||'')?cell.w:String(cell.v);
    }else if(key==='tanggalCuti'&&cell.t==='n'){
     const d=XLSX.SSF.parse_date_code(cell.v,{date1904});
     if(!d)row.fileErrors.tanggalCuti='Isi tanggal yang valid dengan format DD/MM/YYYY.';
     else row.tanggalCuti=[d.y,d.m,d.d].map((v,i)=>String(v).padStart(i===0?4:2,'0')).join('-');
    }else if(typeof cell.v==='string'||typeof cell.v==='number')row[key]=String(cell.v);
    else if(cell.v!=null)row.fileErrors[key]='Isi nilai yang sesuai dengan judul kolom.';
   }
   if(!empty(row)||Object.keys(row.fileErrors).length)rows.push(row);
  }
  if(!rows.length)throw new Error('File belum berisi data SKC.');
  return rows;
 }
 g.SkcInputDomain=Object.freeze({maxRows,columns,blank,empty,employee,validate,paste,fromWorkbook});
})(window);
