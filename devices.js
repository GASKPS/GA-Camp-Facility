(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const UI = window.PortalUI, repo = window.DeviceStore, domain = window.DeviceDomain;
  const { icon, escape: e, dateText, showToast, formError, openDialog, closeDialog } = UI;
  // Existing links copied from the user's original Link Kerja HTML.
  const resources = {
    form: 'https://docs.google.com/forms/d/e/1FAIpQLScYHx8hBaEEZ4fhhUmnMtLyWEa6u0nDMGmtmY5YedIvtG0L8w/viewform?usp=header',
    responses: 'https://docs.google.com/spreadsheets/d/1rMtKL27MJ_UP5N3tdgJqOaSMMMbd5JERy0UTrvENBGM/edit?resourcekey=&gid=1928238653#gid=1928238653'
  };
  document.querySelectorAll('[data-device-resource]').forEach(a => { a.href = resources[a.dataset.deviceResource]; });
  let devices = [], historyId = null, handoverId = null, handoverRevision = null, editingDevice = null, afterReturn = null;
  let historyPage = 1, historyDevice = null, historyRequest=0;
  let listRequest=0,editRequest=0,transferRequest=0,deviceWrite=0,transferWrite=0,deviceBusy=false,transferBusy=false;
  const identity=()=>{const p=window.Akses.profile;return p?[p.id,p.peran,p.office_id,p.aktif,p.akses_portal].join('|'):'';};
  let accessKey=identity();
  const readable=()=>!!window.Akses.profile?.aktif&&!!window.Akses.profile?.akses_portal&&window.Akses.profile.peran!=='crew';
  const context=()=>identity()+'|'+location.hash;
  const current=key=>!!identity()&&readable()&&key===context();
  const busy=(id,locked)=>UI.setDialogBusy?.(id,locked);
  function clearContext(){
    listRequest++;editRequest++;transferRequest++;historyRequest++;deviceWrite++;transferWrite++;
    devices=[];historyId=handoverId=handoverRevision=editingDevice=afterReturn=historyDevice=null;deviceBusy=transferBusy=false;
    for(const id of ['device-dialog','handover-dialog','device-history-dialog']){busy(id,false);const dialog=$(id);dialog.querySelectorAll('form').forEach(form=>{form.reset();window.FormGuard?.clean(form);});if(dialog.open)closeDialog(id);}
    for(const id of ['device-history-title','device-history-brand','device-history-holder','device-history-nik','device-history-condition','device-initial-holder','device-history-events','device-history-pagination','handover-title','handover-brand','handover-from-name','handover-from-nik','handover-from-condition'])$(id).replaceChildren();
    renderDevices();
  }
  const pages = window.Paginasi;
  const initialPicker = window.EmployeeUI.createPicker('device-holder', 'Pemegang awal');
  const recipientPicker = window.EmployeeUI.createPicker('handover-recipient', 'Penerima');
  const radioIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="7" width="12" height="15" rx="2"/><path d="M8 7V2M16 7V4M9 11h6M9 15h6M9 18h3"/></svg>';
  const typeName = kind => ({HT:'Handy Talky',HP:'Handphone',PC:'PC',Printer:'Printer'}[kind] || kind);
  const typeIcon = kind => kind === 'HT' ? radioIcon : icon({HP:'phone',PC:'monitor',Printer:'printer'}[kind]);
  const condition = value => `<span class="device-condition ${value === 'Rusak Ringan' ? 'minor' : value === 'Rusak Berat' ? 'major' : ''}">${e(value)}</span>`;
  const personLabel = value => value.kind === 'admin' ? 'Admin/Gudang' : value.nama;
  const personNik = value => value.kind === 'employee' ? `NIK ${value.nik}${value.jabatan ? ' · ' + value.jabatan : ''}` : '';
  function empty(title, caption, action) {
    return `<div class="empty-state"><span class="empty-symbol">${icon('phone')}</span><h2>${e(title)}</h2><p>${e(caption)}</p>${action || ''}</div>`;
  }
  function renderDevices() {
    const q = $('device-search').value.trim().toLocaleLowerCase('id-ID'), kind = $('device-kind-filter').value;
    const rows = devices.filter(d => (d.aktif===($('device-active-filter').value!=='nonaktif'))&&(!kind || d.jenis === kind) && (!q || [d.jenis,d.nomor,d.merek,d.pemegang.nik,d.pemegang.jabatan,personLabel(d.pemegang)].join(' ').toLocaleLowerCase('id-ID').includes(q)));
    $('device-summary').textContent = domain.TYPES.map(kind => `${devices.filter(d => d.jenis === kind).length} ${kind}`).join(' · ');
    $('device-result-count').textContent = rows.length!==devices.length || q || kind ? `${rows.length} dari ${devices.length} perangkat` : `${rows.length} perangkat`;
    if (!rows.length) {
      $('device-results').innerHTML = q || kind
        ? empty('Perangkat tidak ditemukan', 'Coba kata kunci lain atau tampilkan semua perangkat.', '<button class="button button-secondary" type="button" data-device-action="reset">Reset pencarian</button>')
        : empty('Belum ada perangkat', 'Tambahkan perangkat untuk mencatat pemegang dan riwayatnya.', `<button class="button button-secondary" type="button" data-device-action="new">${icon('plus')}Tambah Perangkat</button>`);
      return;
    }
    $('device-results').innerHTML = `<div class="table-scroll"><table class="device-table"><caption class="sr-only">Daftar perangkat beserta pemegang saat ini</caption><thead><tr><th scope="col">Jenis</th><th scope="col">Nomor seri</th><th scope="col">Merek / tipe</th><th scope="col">Kondisi</th><th scope="col">Pemegang saat ini</th><th scope="col">Tindakan</th></tr></thead><tbody>${rows.map(d => `<tr>
      <td data-label="Jenis"><span class="device-type ${e(d.jenis.toLowerCase())}">${typeIcon(d.jenis)}${e(d.jenis)}</span></td>
      <td data-label="Nomor seri"><button class="device-serial" type="button" data-device-action="history" data-device-id="${e(d.id)}" aria-label="Riwayat perangkat ${e(d.nomor)}">${e(d.nomor)}</button></td>
      <td data-label="Merek / tipe">${e(d.merek)}</td><td data-label="Kondisi">${condition(d.kondisi)}</td>
      <td data-label="Pemegang saat ini"><span class="device-owner ${d.pemegang.kind === 'admin' ? 'admin' : ''}">${e(personLabel(d.pemegang))}</span>${d.pemegang.kind === 'employee' ? `<span class="device-owner-nik">${e(personNik(d.pemegang))}</span>` : ''}</td>
      <td data-label="Tindakan"><div class="device-row-actions"><button ${d.aktif ? '' : 'hidden'} class="button button-primary" type="button" data-device-action="transfer" data-device-id="${e(d.id)}" aria-label="Serah terima ${e(d.nomor)}">Serah Terima</button><button class="button button-secondary" type="button" data-device-action="history" data-device-id="${e(d.id)}" aria-label="Riwayat ${e(d.nomor)}">Riwayat</button><button ${d.aktif ? '' : 'hidden'} class="button button-secondary" type="button" data-device-action="edit" data-device-id="${e(d.id)}" aria-label="Edit perangkat ${e(d.nomor)}">Edit</button>${window.DataAdmin?.buttons('perangkat',d.id,d.revision,d.nomor,d.aktif)||''}</div></td>
    </tr>`).join('')}</tbody></table></div>`;
  }
  async function refreshDevices() { if(location.hash!=='#ht-hp')return;const key=context(),seq=++listRequest;if(!readable()){devices=[];renderDevices();return;}const values=await repo.list();if(seq!==listRequest||!current(key))return;devices=values;renderDevices(); }
  $('device-search').addEventListener('input', renderDevices);
  $('device-kind-filter').addEventListener('change', renderDevices);
  $('device-active-filter').addEventListener('change',renderDevices);
  function resetFilters() { $('device-search').value = ''; $('device-kind-filter').value = ''; renderDevices(); }
  async function newDevice() {
    if (!window.Akses.superAdmin()||deviceBusy) return;
    const key=context(),seq=++editRequest;
    editingDevice = null; $('device-form').reset(); formError('device-form-error', '');
    $('device-form-kicker').textContent = 'PERANGKAT BARU'; $('device-form-title').textContent = 'Tambah perangkat'; $('device-save').textContent = 'Simpan Perangkat';
    $('device-holder-picker').hidden = false; initialPicker.setDisabled(false); $('device-edit-hint').hidden = true;
    await initialPicker.load('admin');if(seq!==editRequest||!current(key)||!window.Akses.superAdmin())return;openDialog('device-dialog'); $('device-kind').focus();
  }
  async function editDevice(id) {
    if (!window.Akses.superAdmin()||deviceBusy) return;
    const key=context(),seq=++editRequest,device = await repo.get(id);
    if(seq!==editRequest||!current(key)||!window.Akses.superAdmin())return;
    const form = $('device-form'); form.reset();
    editingDevice = { id, revision: device.revision };
    ['jenis','nomor','merek','kondisi'].forEach(field => { form.elements.namedItem(field).value = device[field]; });
    $('device-form-kicker').textContent = 'DATA PERANGKAT'; $('device-form-title').textContent = 'Edit perangkat'; $('device-save').textContent = 'Simpan Perubahan';
    $('device-holder-picker').hidden = true; initialPicker.setDisabled(true); $('device-edit-hint').hidden = false;
    formError('device-form-error', ''); openDialog('device-dialog'); $('device-serial').focus();
  }
  function fillHolder(prefix, device) {
    $(prefix + '-name').textContent = personLabel(device.pemegang);
    $(prefix + '-nik').textContent = personNik(device.pemegang);
    $(prefix + '-condition').innerHTML = condition(device.kondisi);
  }
  function renderHistory(device) {
    historyDevice = device; historyPage = 1;historyRequest++;
    $('device-history-kind').textContent = typeName(device.jenis).toUpperCase() + ' · RIWAYAT PERANGKAT';
    $('device-history-title').textContent = device.nomor;
    $('device-history-brand').textContent = device.merek;
    $('device-history-holder').textContent = personLabel(device.pemegang);
    $('device-history-nik').textContent = personNik(device.pemegang);
    $('device-history-condition').innerHTML = condition(device.kondisi);
    $('device-initial-holder').textContent = personLabel(device.pemegangAwal) + (device.pemegangAwal.kind === 'employee' ? ` · ${personNik(device.pemegangAwal)}` : '');
    renderHistoryEvents();
  }
  function proofLink(value,date){
    if(!value)return '<span class="device-no-proof">Bukti tidak dilampirkan</span>';
    try{return `<a class="device-proof-button" href="${e(domain.proofUrl(value))}" target="_blank" rel="noopener noreferrer" aria-label="Lihat bukti serah terima ${e(dateText(date))}">${icon('file')}Lihat Bukti <span aria-hidden="true">↗</span></a>`;}
    catch{return '<span class="device-no-proof">Tautan bukti tidak valid</span>';}
  }
  function renderHistoryEvents() {
    const device = historyDevice; if (!device) return;
    const page = pages.range(device.historyTotal||0, historyPage); historyPage = page.page;
    $('device-history-count').textContent = `${device.historyTotal||0} perpindahan`;
    $('device-history-events').innerHTML = device.history.length ? `<ol class="timeline">${device.history.map(event => `<li class="history-event"><div class="event-heading"><strong>Serah terima ${event.urutan}</strong><time datetime="${e(event.tanggal)}">${e(dateText(event.tanggal))}</time></div><div class="device-event-route"><div>${e(personLabel(event.dari))}${event.dari.kind === 'employee' ? `<small>${e(personNik(event.dari))}</small>` : ''}</div>${icon('arrow')}<div>${e(personLabel(event.kepada))}${event.kepada.kind === 'employee' ? `<small>${e(personNik(event.kepada))}</small>` : ''}</div></div><small class="event-actor">Dicatat oleh ${e(event.namaPetugas)} · ${e(new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jayapura',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(event.dicatatPada)))} WIT</small>${event.catatan ? `<p class="event-note">${e(event.catatan)}</p>` : ''}<div class="device-event-footer">${condition(event.kondisi)}${proofLink(event.buktiUrl,event.tanggal)}</div></li>`).join('')}</ol>` : '<p class="history-empty">Belum ada serah terima. Perangkat masih pada pemegang awal yang dicatat.</p>';
    pages.render($('device-history-pagination'), page, async next => { const id=historyId,seq=++historyRequest,key=context();try{const h=await repo.historyPage(id,next);if(historyId!==id||seq!==historyRequest||!current(key))return;historyDevice={...historyDevice,...h};historyPage=h.historyPage;renderHistoryEvents();$('device-history-events').scrollIntoView({block:'start'});}catch(error){if(current(key))showToast(error.message);} });
  }
  async function showHistory(id, success = false) {
    if(!readable())return;
    const key=context(),seq=++historyRequest,device = await repo.get(id);if(seq!==historyRequest||!current(key))return;historyId = id; renderHistory(device); $('device-history-transfer').hidden=!device.aktif;
    $('device-history-success').hidden = !success;
    $('device-history-success').textContent = success ? 'Serah terima dicatat. Pemegang perangkat sudah diperbarui.' : '';
    openDialog('device-history-dialog');
    $('device-history-dialog').scrollTop = 0;
  }
  async function beginTransfer(id, options = {}) {
    if(!window.Akses.canWrite()||transferBusy)return;
    const key=context(),seq=++transferRequest;
    const device = await repo.get(id);
    if(seq!==transferRequest||!current(key)||!window.Akses.canWrite())return;
    if(options.employeeId && device.pemegang.employeeId !== options.employeeId) throw new Error('Pemegang HT sudah berubah. Tekan Periksa lagi pada pemeriksaan SKC.');
    handoverId = id; handoverRevision = device.revision;afterReturn = options.afterReturn || null;
    $('handover-form').reset(); formError('handover-error', '');
    $('handover-kind').textContent = 'SERAH TERIMA ' + typeName(device.jenis).toUpperCase();
    $('handover-title').textContent = device.nomor; $('handover-brand').textContent = device.merek;
    fillHolder('handover-from', device);
    $('handover-date').value = domain.today(); $('handover-date').max = domain.today();
    $('handover-date').min = device.tanggalTerakhir || '';
    $('handover-condition').value = device.kondisi;
    recipientPicker.setDisabled(false);
    await recipientPicker.load(options.returnToAdmin ? 'admin' : '', device.pemegang);
    if(seq!==transferRequest||!current(key)||!window.Akses.canWrite())return;
    recipientPicker.setDisabled(!!options.returnToAdmin);
    openDialog('handover-dialog'); recipientPicker.focus();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-device-action]');
    if (!button) return;
    const action = button.dataset.deviceAction, id = button.dataset.deviceId;
    if (action === 'new') newDevice().catch(error => showToast(error.message));
    if (action === 'reset') resetFilters();
    if (action === 'history') showHistory(id).catch(error => showToast(error.message));
    if (action === 'transfer') beginTransfer(id).catch(error => showToast(error.message));
    if (action === 'edit') editDevice(id).catch(error => showToast(error.message));
  });
  $('device-history-transfer').addEventListener('click', () => beginTransfer(historyId).catch(error => showToast(error.message)));
  $('device-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type=submit]');
    if (!window.Akses.superAdmin() || !form.reportValidity() || button.disabled || deviceBusy) return;
    const key=context(),seq=++deviceWrite,editing=editingDevice,data=Object.fromEntries(new FormData(form));
    let holder;try{if(!editing)holder=initialPicker.read();}catch(error){formError('device-form-error',error.message);return;}
    deviceBusy=true;busy('device-dialog',true);button.disabled = true;
    try {
      if (editing) await repo.update(editing.id, { ...data, expectedRevision: editing.revision });
      else await repo.create({ ...data, pemegang: holder });
      if(seq!==deviceWrite||!current(key))return;
      busy('device-dialog',false);
      window.FormGuard?.clean($('device-form')); closeDialog('device-dialog'); await refreshDevices();
      if(seq!==deviceWrite||!current(key))return;
      resetFilters();
      document.dispatchEvent(new CustomEvent('devices:changed'));
      showToast(editing ? 'Data perangkat diperbarui.' : 'Perangkat ditambahkan dan disimpan.');
    } catch (error) { if(seq===deviceWrite&&current(key))formError('device-form-error', error.message); }
    finally { if(seq===deviceWrite){deviceBusy=false;busy('device-dialog',false);button.disabled = false;} }
  });
  $('handover-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type=submit]');
    if (!window.Akses.canWrite()||!form.reportValidity() || button.disabled||transferBusy||!handoverId) return;
    const key=context(),seq=++transferWrite,id=handoverId,version=handoverRevision,data=Object.fromEntries(new FormData(form)),continuation=afterReturn;
    let recipient;try{recipient=recipientPicker.read();}catch(error){formError('handover-error',error.message);return;}
    transferBusy=true;busy('handover-dialog',true);button.disabled = true;
    try {
      const device = await repo.handover(id, { ...data, penerima: recipient, expectedRevision: version });
      if(seq!==transferWrite||!current(key))return;
      afterReturn = null;busy('handover-dialog',false);
      window.FormGuard?.clean($('handover-form')); closeDialog('handover-dialog'); await refreshDevices();
      if(seq!==transferWrite||!current(key))return;
      document.dispatchEvent(new CustomEvent('devices:changed'));
      if (continuation) await continuation(); else await showHistory(device.id, true);
    } catch (error) { if(seq===transferWrite&&current(key))formError('handover-error', error.message); }
    finally { if(seq===transferWrite){transferBusy=false;busy('handover-dialog',false);button.disabled = false;} }
  });
  document.addEventListener('akses:berubah', () => { const key=identity();if(key!==accessKey){accessKey=key;clearContext();} });
  window.addEventListener('hashchange',clearContext);
  window.DeviceUI = Object.freeze({beginReturn:(id,employeeId,afterReturn)=>beginTransfer(id,{returnToAdmin:true,employeeId,afterReturn})});
  document.addEventListener('employees:changed', () => refreshDevices().catch(error => showToast(error.message)));
  window.addEventListener('hashchange',()=>refreshDevices().catch(error=>showToast(error.message)));
  refreshDevices().catch(error => showToast(error.message));
document.addEventListener('akses:berubah',()=>refreshDevices().catch(error=>showToast(error.message)));
  document.addEventListener('data:muat-ulang',()=>refreshDevices().catch(error=>showToast(error.message)));
})();
