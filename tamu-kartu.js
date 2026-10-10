(function(g){
 'use strict';
 const text=value=>String(value??'').trim().replace(/\s+/g,' ');
 const normal=value=>text(value).normalize('NFC').toLocaleLowerCase('id-ID');
 function group(data){
  const groups=new Map();
  for(const person of data){
   const origin=text(person.asal),date=person.tanggal_kedatangan||'',kind=text(person.jenis)||'Tamu',status=text(person.status)||'—';
   const key=JSON.stringify([normal(origin),date,normal(kind),normal(status),origin&&date?'':person.id]);
   if(!groups.has(key))groups.set(key,{key,asal:origin,tanggal:date,jenis:kind,status,members:[]});
   groups.get(key).members.push(person);
  }
  return [...groups.values()].map((value,index)=>({...value,index,members:value.members.slice().sort((a,b)=>String(a.nama||'').localeCompare(String(b.nama||''),'id-ID',{sensitivity:'base',numeric:true}))}));
 }
 async function collect(first,readPage,current=()=>true){
  const total=Number(first.total),size=Number(first.ukuran_halaman)||20;
  if(!Number.isInteger(total)||total<0||!Array.isArray(first.data)||size<1)throw new Error('Daftar tamu belum dapat dimuat. Coba kembali.');
  const data=[...first.data],pages=Math.ceil(total/size);
  for(let start=2;start<=pages;start+=3){
   if(!current())return null;
   const numbers=Array.from({length:Math.min(3,pages-start+1)},(_,i)=>start+i);
   const results=await Promise.all(numbers.map(readPage));
   if(!current())return null;
   for(let i=0;i<results.length;i++){
    const result=results[i];
    if(Number(result.total)!==total||Number(result.halaman)!==numbers[i]||!Array.isArray(result.data))throw new Error('Data tamu berubah saat dimuat. Muat ulang daftar untuk melihat data terbaru.');
    data.push(...result.data);
   }
  }
  if(!current())return null;
  const unique=[...new Map(data.map(person=>[person.id,person])).values()];
  if(unique.length!==total)throw new Error('Data tamu berubah saat dimuat. Muat ulang daftar untuk melihat data terbaru.');
  return unique;
 }
 g.TamuKartu=Object.freeze({group,collect});
})(window);
