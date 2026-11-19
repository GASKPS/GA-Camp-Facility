(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { icon, escape: e, dateText, showToast, formError, openDialog, closeDialog } = window.PortalUI;
  const repo = window.SkcStore, A=window.Akses;
  const picker = window.EmployeeUI.createPicker('skc-employee', 'Karyawan', { allowAdmin: false });
  let records = [], view = 'pending', collecting = null, assigning=null, collectRequest=0,opening=false,openRequest=0,loadRequest=0,writeRequest=0,officeRequest=0,collectionBusy=false,formBusy=false,assignmentBusy=false;
  const identity=()=>{const p=window.Akses.profile;return p?[p.id,p.peran,p.office_id,p.aktif,p.akses_portal].join('|'):'';};
  let accessKey=identity();
  const readable=()=>!!window.Akses.profile?.aktif&&!!window.Akses.profile?.akses_portal&&window.Akses.profile.peran!=='crew';
  const current=key=>!!key&&key===identity()&&readable();
  const collectingCurrent=(seq,key)=>seq===collectRequest&&current(key)&&window.Akses.canWrite()&&location.hash==='#tracking';
  const inSkc=()=>location.hash==='#tracking'&&!$('skc-panel').hidden;
  const activeOffices=()=>window.OfficeStore?.records?.filter(o=>o.aktif)||[];
  const options=()=>'<option value="">Pilih office</option>'+activeOffices().map(o=>`<option value="${e(o.id)}">${e(o.nama)}</option>`).join('');
  function office(){
    const id=A.administrator()?$('skc-entry-office').value:A.profile?.office_id;
    if(!id)throw new Error(A.administrator()?'Pilih Office pencatatan pada halaman Ambil SKC.':'Office akun belum ditetapkan. Hubungi Administrator.');
    return id;
  }
  window.SkcOffice=Object.freeze({office});
  async function refreshOffice(){
    $('skc-office-options').hidden=!A.administrator();
    if(!A.administrator()||!inSkc()||!window.OfficeStore)return;
    const key=identity(),seq=++officeRequest;
    await window.OfficeStore.list();
    if(seq!==officeRequest||!current(key)||!A.administrator()||!inSkc())return;
    const select=$('skc-entry-office'),previous=select.value||A.profile.office_id;
    select.innerHTML=options();
    if(activeOffices().some(o=>o.id===previous))select.value=previous;
  }
  function clearCollection(){
    collectRequest++;writeRequest++;openRequest++;officeRequest++;collecting=assigning=null;collectionBusy=formBusy=opening=assignmentBusy=false;
    window.SkcInputUI?.setFormBusy(false);
    for(const id of ['skc-dialog','skc-collect-dialog','skc-ht-dialog','skc-assign-dialog']){window.PortalUI.setDialogBusy?.(id,false);const dialog=$(id);dialog.querySelectorAll('form').forEach(form=>{form.reset();window.FormGuard?.clean(form);});if(dialog.open)closeDialog(id);}
    for(const id of ['skc-collect-name','skc-collect-nik','skc-collect-date','skc-ht-person','skc-ht-list'])$(id).replaceChildren();
    formError('skc-collect-error','');formError('skc-ht-error','');
  }
  const taken = record => record.status === 'Sudah diambil';
  const assignButton=record=>A.administrator()&&!record.officeId?`<button type="button" class="button button-secondary skc-assign" data-skc-action="assign" data-skc-id="${e(record.id)}">Tetapkan office</button>`:'';
  function render() {
    const pending = records.filter(record => !taken(record)), completed = records.filter(taken);
    $('skc-count').textContent = records.length; $('skc-pending-count').textContent = pending.length; $('skc-taken-count').textContent = completed.length;
    const rows = view === 'pending' ? pending : completed;
    $('skc-result-count').textContent = `${rows.length} SKC ${view === 'pending' ? 'belum diambil' : 'sudah diambil'}`;
    if (!rows.length) {
      const title = view === 'taken' ? 'Belum ada SKC yang diambil' : records.length ? 'Semua SKC sudah diambil' : 'Belum ada data SKC';
      const caption = view === 'taken' ? 'SKC yang sudah diserahkan kepada karyawan akan tampil di sini.' : records.length ? 'Tidak ada SKC yang menunggu pengambilan.' : 'Tambahkan karyawan dan tanggal cuti untuk mencatat pengambilan SKC.';
      $('skc-results').innerHTML = `<div class="empty-state"><span class="empty-symbol">${icon(view === 'taken' ? 'check-circle' : 'file')}</span><h2>${title}</h2><p>${caption}</p>${view === 'pending' ? `<button class="button button-secondary" type="button" data-skc-action="new">${icon('plus')}Tambah SKC</button>` : ''}</div>`;
      return;
    }
    $('skc-results').innerHTML = `<div class="table-scroll"><table class="skc-table"><caption class="sr-only">SKC ${view === 'pending' ? 'belum' : 'sudah'} diambil</caption><thead><tr><th scope="col">Karyawan</th><th scope="col">Tanggal cuti</th><th scope="col">Note</th><th scope="col">${view === 'pending' ? 'Pengambilan' : 'Sudah diambil'}</th></tr></thead><tbody>${rows.map(record => `<tr><td data-label="Karyawan"><strong class="skc-person-name">${e(record.nama)}</strong><span class="secondary-value">NIK ${e(record.nik)}</span>${assignButton(record)}</td><td data-label="Tanggal cuti" class="date-cell">${e(dateText(record.tanggalCuti))}</td><td data-label="Note" class="skc-note">${e(record.note||'—')}</td><td data-label="Pengambilan">${taken(record) ? `<span class="skc-taken-label">${icon('check-circle')}Sudah diambil</span><span class="secondary-value">${e(dateText(record.tanggalDiambil))}</span><span class="secondary-value">Diambil: ${e(record.namaPengambil)} · ${e(record.nikPengambil)}</span><span class="secondary-value">Dicatat: ${e(record.namaPetugas)}</span>` : `<button class="button button-primary" type="button" data-skc-action="collect" data-tulis data-skc-id="${e(record.id)}" aria-label="Tandai SKC ${e(record.nama)} tanggal cuti ${e(dateText(record.tanggalCuti))} sudah diambil">Tandai Diambil</button>`}${window.DataAdmin?.buttons('skc',record.id,record.revision,record.nama+' · '+dateText(record.tanggalCuti))||''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  async function refresh() { const seq=++loadRequest,key=identity();if(!readable()){records=[];render();return;}const values=await repo.list();if(seq!==loadRequest||!current(key))return;records=values;render(); }
  function selectView(next) {
    view = next;
    document.querySelectorAll('[data-skc-tab]').forEach(button => {
      const selected = button.dataset.skcTab === view;
      button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    $('skc-results').setAttribute('aria-labelledby', 'skc-tab-' + view); render();
  }
  document.querySelectorAll('[data-skc-tab]').forEach(button => {
    button.addEventListener('click', () => selectView(button.dataset.skcTab));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'pending' : event.key === 'End' ? 'taken' : view === 'pending' ? 'taken' : 'pending';
      selectView(next); $('skc-tab-' + next).focus();
    });
  });
  async function resetForm(){$('skc-form').reset();window.TanggalInput?.mount($('skc-leave-date'));formError('skc-form-error','');await picker.load();window.FormGuard?.clean($('skc-form'));}
  window.SkcFormUI=Object.freeze({reset:resetForm,focus:()=>picker.focus()});
  async function newSkc(){
    if(opening||!window.Akses.canWrite()||$('skc-dialog').open)return;opening=true;const owner=window.Kiriman33?.identity();
    const seq=++openRequest;
    try{if(!window.SkcInputStore?.pending)office();await resetForm();if(seq!==openRequest||!inSkc())return;await window.SkcInputUI?.prepare();if(seq!==openRequest||!inSkc()||!window.Akses.canWrite()||owner!==window.Kiriman33?.identity())return;openDialog('skc-dialog');window.SkcInputUI?window.SkcInputUI.focus():picker.focus();}finally{if(seq===openRequest)opening=false;}
  }
  async function beginAssign(id){
    if(!A.administrator()||!inSkc()||assignmentBusy||$('skc-assign-dialog').open)return;
    const key=identity(),seq=++openRequest,record=records.find(r=>r.id===id);
    if(!record||record.officeId)return;
    if(!activeOffices().length)await refreshOffice();
    if(!current(key)||seq!==openRequest||!inSkc()||!A.administrator())return;
    assigning={id,revision:record.revision,key};
    $('skc-assign-person').textContent=record.nama+' · '+dateText(record.tanggalCuti);
    $('skc-assign-office').innerHTML=options();
    formError('skc-assign-error','');
    openDialog('skc-assign-dialog');
  }
  $('skc-assign-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget,target=assigning;
    if(!target||assignmentBusy||!A.administrator()||!current(target.key)||!inSkc()||!form.reportValidity())return;
    const seq=++writeRequest;assignmentBusy=true;window.PortalUI.setDialogBusy?.('skc-assign-dialog',true);
    formError('skc-assign-error','');
    try{await repo.assignOffice(target.id,target.revision,$('skc-assign-office').value);if(seq!==writeRequest||!current(target.key)||!inSkc())return;
      window.PortalUI.setDialogBusy?.('skc-assign-dialog',false);window.FormGuard?.clean(form);closeDialog('skc-assign-dialog');assigning=null;
      await refresh();if(seq===writeRequest&&current(target.key)&&inSkc())showToast('Office SKC sudah ditetapkan.');
    }catch(err){if(seq===writeRequest&&current(target.key))formError('skc-assign-error',err.message);}
    finally{if(seq===writeRequest){assignmentBusy=false;window.PortalUI.setDialogBusy?.('skc-assign-dialog',false);}}
  });
  async function beginCollect(id) {
    if(!window.Akses.canWrite()||collectionBusy||location.hash!=='#tracking')return;
    const key=identity(),seq=++collectRequest,record=await repo.get(id);if(!collectingCurrent(seq,key))return;
    if (taken(record)) { await refresh(); selectView('taken'); return; }
    const held=await window.DeviceStore.heldHt(record.employeeId);if(!collectingCurrent(seq,key))return;
    collecting = { id, revision: record.revision, employeeId: record.employeeId,context:key };
    if(held.length) {
      $('skc-ht-person').textContent = `${record.nama} · NIK ${record.nik} · ${held.length} HT`;
      $('skc-ht-list').innerHTML = held.map(device=>`<div class="skc-ht-item"><div><strong>${e(device.nomor)}</strong><span>${e(device.merek)} · ${e(device.kondisi)}</span></div></div>`).join('');
      formError('skc-ht-error',''); openDialog('skc-ht-dialog'); return;
    }
    if($('skc-ht-dialog').open) closeDialog('skc-ht-dialog');
    $('skc-collect-name').textContent = record.nama; $('skc-collect-nik').textContent = `NIK ${record.nik}`;
    $('skc-collect-date').textContent = dateText(record.tanggalCuti); formError('skc-collect-error', '');
    openDialog('skc-collect-dialog');
  }
  $('skc-ht-continue').addEventListener('click',event=>saveCollection(event.currentTarget,'skc-ht-error','skc-ht-dialog'));
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-skc-action]');
    if (!button) return;
    if (button.dataset.skcAction === 'new') newSkc().catch(error => showToast(error.message));
    if (button.dataset.skcAction === 'collect') beginCollect(button.dataset.skcId).catch(error => showToast(error.message));
    if (button.dataset.skcAction === 'assign') beginAssign(button.dataset.skcId).catch(error => showToast(error.message));
  });
  $('skc-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type=submit]');
    if (!window.Akses.canWrite()||!form.reportValidity() || button.disabled||formBusy) return;
    const key=identity(),seq=++writeRequest;let data;
    try{data={...Object.fromEntries(new FormData(form)),employeeId:picker.read().employeeId,officeId:office()};}catch(error){formError('skc-form-error',error.message);return;}
    formBusy=true;window.PortalUI.setDialogBusy?.('skc-dialog',true);button.disabled = true;window.SkcInputUI?.setFormBusy(true);
    try {
      await repo.create(data);if(seq!==writeRequest||!current(key)||location.hash!=='#tracking')return;
      window.PortalUI.setDialogBusy?.('skc-dialog',false);
      window.FormGuard?.clean($('skc-form')); closeDialog('skc-dialog'); await refresh();if(seq!==writeRequest||!current(key)||location.hash!=='#tracking')return;selectView('pending'); showToast('SKC ditambahkan ke daftar Belum diambil.');
    } catch (error) { if(seq===writeRequest&&current(key))formError('skc-form-error', error.message); }
    finally { if(seq===writeRequest){formBusy=false;window.PortalUI.setDialogBusy?.('skc-dialog',false);button.disabled = false;window.SkcInputUI?.setFormBusy(false);} }
  });
  async function saveCollection(button,errorId,dialogId) {
    if(button.disabled||collectionBusy||!collecting||!current(collecting.context)||!window.Akses.canWrite()||location.hash!=='#tracking')return;
    const target=collecting,seq=++writeRequest;collectionBusy=true;
    window.PortalUI.setDialogBusy?.(dialogId,true);button.disabled=true;formError(errorId,'');
    try {
      await repo.collect(target.id,target.revision);
      if(seq!==writeRequest||!current(target.context)||location.hash!=='#tracking')return;
      window.PortalUI.setDialogBusy?.(dialogId,false);
      window.FormGuard?.clean($('skc-collect-form'));closeDialog(dialogId);await refresh();
      if(seq!==writeRequest||!current(target.context)||location.hash!=='#tracking')return;
      selectView('taken');
      collecting=null;$('skc-tab-taken').focus();showToast('SKC masuk ke daftar Sudah diambil.');
    } catch(error){if(seq===writeRequest&&current(target.context))formError(errorId,error.message);}
    finally{if(seq===writeRequest){collectionBusy=false;window.PortalUI.setDialogBusy?.(dialogId,false);button.disabled=false;}}
  }
  $('skc-collect-form').addEventListener('submit',event=>{
    event.preventDefault();saveCollection(event.currentTarget.querySelector('[type=submit]'),'skc-collect-error','skc-collect-dialog');
  });
  document.addEventListener('skc:batch-saved',()=>{selectView('pending');refresh().catch(error=>showToast(error.message));});
  document.addEventListener('employees:changed', () => refresh().catch(error => showToast(error.message)));
  refresh().catch(error => showToast(error.message));
  document.addEventListener('akses:berubah',()=>{const key=identity();if(key!==accessKey){accessKey=key;clearCollection();loadRequest++;records=[];$('skc-entry-office').replaceChildren();render();}refreshOffice().catch(error=>{if(readable()&&inSkc())showToast(error.message);});refresh().catch(error=>{if(readable())showToast(error.message);});});
  window.addEventListener('hashchange',()=>{if(location.hash!=='#tracking')clearCollection();});
  document.addEventListener('tracking:tab-changed',event=>{if(event.detail?.tab!=='skc')clearCollection();else refreshOffice().catch(error=>{if(readable()&&inSkc())showToast(error.message);});});
  document.addEventListener('data:muat-ulang',()=>refresh().catch(error=>showToast(error.message)));
})();
