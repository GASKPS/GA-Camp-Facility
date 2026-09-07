(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { icon, escape: e, showToast, formError, openDialog, closeDialog } = window.PortalUI;
  const repo = window.EmployeeStore;
  const lower = value => String(value || '').toLocaleLowerCase('id-ID');
  const initials = nama => nama.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => [...word][0]).join('').toLocaleUpperCase('id-ID');
  const avatar = (person, zoom = false) => {
    const image = `<span class="employee-avatar" aria-hidden="true">${person.foto ? `<img src="${e(person.foto)}" alt="" loading="lazy">` : e(initials(person.nama))}</span>`;
    return zoom && person.foto ? `<button class="employee-photo-zoom" type="button" data-employee-action="photo" data-employee-id="${e(person.id)}" aria-label="Perbesar foto ${e(person.nama)}" aria-haspopup="dialog">${image}</button>` : image;
  };
  let employees = [], photo = '', photoVersion = 0, editingEmployee = null;
  let selectedEmployeeId = null, detailRequest = 0;
  function render() {
    const q = lower($('employee-search').value.trim());
    const results = employees.filter(person => !q || lower([person.nama, person.nik, person.jabatan].join(' ')).includes(q));
    $('employee-result-count').textContent = q ? `${results.length} dari ${employees.length} karyawan` : `${employees.length} karyawan`;
    if (!results.length) {
      $('employee-results').innerHTML = `<div class="empty-state"><span class="empty-symbol">${icon('users')}</span><h2>${q ? 'Karyawan tidak ditemukan' : 'Belum ada karyawan'}</h2><p>${q ? 'Coba cari dengan nama, NIK, atau jabatan lainnya.' : 'Daftarkan karyawan sekali, lalu pilih namanya saat serah terima perangkat.'}</p><button class="button button-secondary" type="button" data-employee-action="${q ? 'reset' : 'new'}">${q ? 'Reset pencarian' : icon('plus') + 'Tambah Karyawan'}</button></div>`;
      return;
    }
    $('employee-results').innerHTML = `<ul class="employee-grid" aria-label="Daftar karyawan">${results.map(person => `<li class="employee-card"><div class="employee-card-head">${avatar(person, true)}<div><h2><button class="employee-name-button" type="button" data-employee-action="detail" data-employee-id="${e(person.id)}" aria-haspopup="dialog" aria-controls="employee-detail-dialog" aria-label="Detail ${e(person.nama)} NIK ${e(person.nik)}">${e(person.nama)}</button></h2><span class="employee-nik">NIK ${e(person.nik)}</span></div></div><dl><dt>Jabatan</dt><dd>${e(person.jabatan)}</dd><dt>Golongan</dt><dd>${e(person.golongan || '—')}</dd><dt>No. HP</dt><dd>${e(person.noHp || '—')}</dd><dt>Kamar mess</dt><dd>${e(person.kamarMess || '—')}</dd></dl></li>`).join('')}</ul>`;
  }
  async function refresh() { employees = await repo.list(); render(); }
  async function showEmployee(id) {
    if (!id) return;
    selectedEmployeeId = id;
    const request = ++detailRequest;
    $('employee-detail-title').textContent = 'Detail karyawan';
    $('employee-detail-edit').hidden = true;
    $('employee-detail-content').innerHTML = '<p class="employee-detail-message">Memuat data karyawan…</p>';
    openDialog('employee-detail-dialog');
    try {
      const [person, assets] = await Promise.all([repo.get(id), window.DeviceStore.heldAssets(id)]);
      if (request !== detailRequest || !$('employee-detail-dialog').open) return;
      $('employee-detail-title').textContent = person.nama;
      $('employee-detail-content').innerHTML = `<div class="employee-profile-head">${avatar(person, true)}<div><strong>NIK ${e(person.nik)}</strong><span>${e(person.jabatan)}</span></div></div><dl class="employee-profile-fields"><dt>Golongan</dt><dd>${e(person.golongan || '—')}</dd><dt>Nomor HP</dt><dd>${e(person.noHp || '—')}</dd><dt>Kamar mess</dt><dd>${e(person.kamarMess || '—')}</dd></dl><section class="employee-assets" aria-labelledby="employee-assets-title"><h3 id="employee-assets-title">Aset yang dipegang</h3>${assets.length ? `<div class="employee-asset-head" aria-hidden="true"><span>Jenis perangkat</span><span>Nomor seri</span></div><ul class="employee-asset-list" aria-label="Jenis perangkat dan nomor seri">${assets.map(asset => `<li><span>${e(asset.jenis)}</span><strong>${e(asset.nomor)}</strong></li>`).join('')}</ul>` : '<p class="employee-detail-message">Belum ada aset yang dipegang.</p>'}</section>`;
      $('employee-detail-edit').hidden = !window.Akses.superAdmin();
    } catch (error) {
      if (request !== detailRequest || !$('employee-detail-dialog').open) return;
      $('employee-detail-content').innerHTML = `<p class="form-error" role="alert">${e(error.message)}</p><button class="button button-secondary" type="button" data-employee-action="retry-detail">Coba lagi</button>`;
    }
  }
  $('employee-detail-dialog').addEventListener('close', () => { selectedEmployeeId = null; detailRequest++; });
  $('employee-detail-edit').addEventListener('click', async () => {
    const button = $('employee-detail-edit');
    if (!selectedEmployeeId || !window.Akses.superAdmin() || button.disabled) return;
    button.disabled = true;
    try { await editEmployee(selectedEmployeeId); } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  });
  function refreshDetail() { if (selectedEmployeeId && $('employee-detail-dialog').open) showEmployee(selectedEmployeeId); }
  document.addEventListener('devices:changed', refreshDetail);
  document.addEventListener('data:muat-ulang', refreshDetail);
  function renderPhoto() {
    $('employee-photo-preview').innerHTML = photo ? `<img src="${e(photo)}" alt="">` : e(initials($('employee-name').value)) || icon('user');
    $('employee-photo-remove').hidden = !photo;
  }
  function clearPhoto() {
    photoVersion += 1; photo = ''; $('employee-photo').value = '';
    $('employee-photo-status').textContent = ''; $('employee-save').disabled = false; renderPhoto();
  }
  async function fillJobs(selected) {
    const current = selected ?? $('employee-job').value;
    const jobs = await window.JabatanStore.list();
    $('employee-job').innerHTML = '<option value="">' + (jobs.length ? 'Pilih jabatan' : 'Tambahkan jabatan terlebih dahulu') + '</option>' + jobs.map(job => `<option value="${e(job.id)}">${e(job.nama)}</option>`).join('');
    $('employee-job').value = jobs.some(job => job.id === current) ? current : '';
  }
  async function newEmployee() {
    if (!window.Akses.superAdmin()) return;
    editingEmployee = null;
    $('employee-form').reset(); clearPhoto(); formError('employee-form-error', '');
    await fillJobs('');
    $('employee-form-kicker').textContent = 'KARYAWAN BARU'; $('employee-form-title').textContent = 'Tambah karyawan'; $('employee-save').textContent = 'Simpan Karyawan';
    openDialog('employee-dialog'); $('employee-nik').focus();
  }
  async function editEmployee(id) {
    if (!window.Akses.superAdmin()) return;
    const employee = await repo.get(id);
    $('employee-form').reset(); clearPhoto(); formError('employee-form-error', '');
    editingEmployee = { id, revision: employee.revision };
    await fillJobs(employee.jabatanId);
    ['nik','nama','golongan','noHp','kamarMess'].forEach(field => { $('employee-form').elements.namedItem(field).value = employee[field] || ''; });
    photo = employee.foto || ''; renderPhoto();
    $('employee-form-kicker').textContent = 'DATA KARYAWAN'; $('employee-form-title').textContent = 'Edit karyawan'; $('employee-save').textContent = 'Simpan Perubahan';
    openDialog('employee-dialog'); $('employee-name').focus();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-employee-action]'), action = button?.dataset.employeeAction;
    if (action === 'new') newEmployee().catch(error => showToast(error.message));
    if (action === 'photo') showPhoto(button.dataset.employeeId).catch(error => showToast(error.message));
    if (action === 'detail') showEmployee(button.dataset.employeeId);
    if (action === 'retry-detail') showEmployee(selectedEmployeeId);
    if (action === 'reset') { $('employee-search').value = ''; render(); $('employee-search').focus(); }
    if (event.target.closest('[data-open-employees]')) document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  });
  $('employee-search').addEventListener('input', render);
  $('employee-name').addEventListener('input', renderPhoto);
  $('employee-photo-remove').addEventListener('click', clearPhoto);
  $('employee-dialog').addEventListener('close', clearPhoto);
  $('employee-photo').addEventListener('change', async event => {
    const file = event.target.files[0], version = ++photoVersion;
    photo = ''; renderPhoto(); formError('employee-form-error', '');
    $('employee-photo-status').textContent = ''; $('employee-save').disabled = false;
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      event.target.value = ''; formError('employee-form-error', 'Pilih foto JPG, PNG, atau WebP maksimal 2 MB.'); return;
    }
    $('employee-save').disabled = true; $('employee-photo-status').textContent = 'Menyiapkan foto…';
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Foto tidak dapat dibaca. Silakan pilih ulang.')); reader.readAsDataURL(file);
      });
      await new Promise((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve();
        image.onerror = () => reject(new Error('Berkas tidak dapat ditampilkan sebagai foto. Pilih foto lain.')); image.src = data;
      });
      if (version !== photoVersion) return;
      photo = data; renderPhoto(); $('employee-photo-status').textContent = 'Foto siap digunakan.';
    } catch (error) {
      if (version !== photoVersion) return;
      event.target.value = ''; formError('employee-form-error', error.message); $('employee-photo-status').textContent = '';
    } finally { if (version === photoVersion) $('employee-save').disabled = false; }
  });
  $('employee-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, button = $('employee-save');
    if (!window.Akses.superAdmin() || !form.reportValidity() || button.disabled) return;
    button.disabled = true;
    try {
      const editing = editingEmployee, data = { ...Object.fromEntries(new FormData(form)), foto: photo };
      const employee = editing ? await repo.update(editing.id, { ...data, expectedRevision: editing.revision }) : await repo.create(data);
      closeDialog('employee-dialog'); $('employee-search').value = ''; await refresh();
      document.dispatchEvent(new CustomEvent('employees:changed'));
      if (editing && selectedEmployeeId === employee.id) refreshDetail();
      showToast(editing ? 'Data karyawan diperbarui.' : `${employee.nama} ditambahkan. Namanya sudah tersedia untuk dipilih.`);
    } catch (error) { formError('employee-form-error', error.message); }
    finally { button.disabled = false; }
  });

  async function showPhoto(id) {
    const person = await repo.get(id);
    if (!person.foto) return;
    $('employee-photo-large-title').textContent = person.nama;
    $('employee-photo-large').src = person.foto;
    $('employee-photo-large').alt = 'Foto ' + person.nama;
    openDialog('employee-photo-dialog');
  }
  $('employee-photo-dialog').addEventListener('close', () => $('employee-photo-large').removeAttribute('src'));
  document.addEventListener('jabatan:berubah', async event => {
    if ($('employee-dialog').open) {
      try { await fillJobs($('employee-job').value || event.detail?.id); } catch (error) { formError('employee-form-error', error.message); }
    }
    refresh().catch(error => showToast(error.message)); refreshDetail();
  });
  document.addEventListener('akses:berubah', () => {
    $('employee-detail-edit').hidden = !window.Akses.superAdmin();
    if (!window.Akses.superAdmin()) $('employee-dialog').close();
  });

  // A single searchable, keyboard-accessible picker shared by both device forms.
  function createPicker(prefix, label, { allowAdmin = true } = {}) {
    const host = $(prefix + '-picker');
    host.innerHTML = `<label for="${prefix}-choice">${e(label)} <span class="required">*</span></label><div class="employee-picker"><div class="employee-picker-input">${icon('search')}<input id="${prefix}-choice" type="text" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="${prefix}-list" aria-describedby="${prefix}-help ${prefix}-detail" autocomplete="off" spellcheck="false" required placeholder="Cari dan pilih nama karyawan…"><button class="icon-button employee-picker-clear" id="${prefix}-clear" type="button" aria-label="Kosongkan pilihan ${e(label.toLowerCase())}" hidden>${icon('close')}</button></div><div class="employee-picker-results" id="${prefix}-results" hidden><ul class="employee-picker-list" role="listbox" id="${prefix}-list" aria-label="${e(label)}"></ul><p class="employee-picker-message" id="${prefix}-message" role="status" hidden></p></div><div class="employee-picker-detail" id="${prefix}-detail" aria-live="polite" hidden></div><p class="employee-picker-help" id="${prefix}-help">Belum terdaftar? Hubungi Super Admin untuk menambah <a href="#karyawan" data-open-employees>Data Karyawan</a>.</p></div>`;
    const input = $(prefix + '-choice'), list = $(prefix + '-list'), panel = $(prefix + '-results');
    let options = [], visible = [], selected = '', active = -1;
    const optionName = person => person.kind === 'admin' ? 'Admin/Gudang' : person.nama;
    const metadata = person => person.kind === 'admin' ? 'Perangkat disimpan di admin atau gudang' : `NIK ${person.nik} · ${person.jabatan}`;
    function close() { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
    function markActive(index) {
      active = index;
      [...list.children].forEach((row, i) => row.classList.toggle('is-active', i === active));
      if (active < 0) { input.removeAttribute('aria-activedescendant'); return; }
      input.setAttribute('aria-activedescendant', `${prefix}-option-${active}`);
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    }
    function displayOptions() {
      const q = selected ? '' : lower(input.value.trim());
      visible = options.filter(person => !q || lower(`${optionName(person)} ${metadata(person)}`).includes(q));
      list.innerHTML = visible.map((person, index) => `<li class="employee-picker-option" id="${prefix}-option-${index}" role="option" aria-selected="${person.id === selected}" data-person-index="${index}">${person.kind === 'admin' ? `<span class="employee-avatar" aria-hidden="true">${icon('building')}</span>` : avatar(person)}<div><strong>${e(optionName(person))}</strong><small>${e(metadata(person))}</small></div></li>`).join('');
      $(prefix + '-message').hidden = visible.length > 0;
      $(prefix + '-message').textContent = options.length ? 'Tidak ada pilihan yang cocok.' : 'Belum ada karyawan yang bisa dipilih. Tambahkan melalui Data Karyawan.';
      panel.hidden = false; input.setAttribute('aria-expanded', 'true'); markActive(-1);
    }
    function select(id) {
      const person = options.find(p => p.id === id);
      selected = person ? person.id : ''; input.value = person ? optionName(person) : '';
      input.setCustomValidity(selected ? '' : 'Cari nama lalu pilih salah satu hasil dari daftar.');
      $(prefix + '-clear').hidden = !selected;
      const detail = $(prefix + '-detail'); detail.hidden = !person;
      detail.innerHTML = person ? `${icon('user')}<div><strong>${e(optionName(person))}</strong><span>${e(metadata(person))}</span></div>` : '';
      close();
    }
    input.addEventListener('focus', displayOptions);
    input.addEventListener('click', () => { if (panel.hidden) displayOptions(); });
    input.addEventListener('input', () => {
      selected = ''; $(prefix + '-detail').hidden = true; $(prefix + '-clear').hidden = !input.value;
      input.setCustomValidity('Cari nama lalu pilih salah satu hasil dari daftar.'); displayOptions();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === 'Tab') { close(); return; }
      if (['ArrowDown','ArrowUp'].includes(event.key)) {
        event.preventDefault(); if (panel.hidden) displayOptions();
        if (visible.length) markActive(active < 0 ? (event.key === 'ArrowDown' ? 0 : visible.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length);
      } else if (event.key === 'Enter' && !panel.hidden) {
        event.preventDefault(); if (active >= 0) select(visible[active].id);
        else if (visible.length === 1) select(visible[0].id);
      }
    });
    input.addEventListener('blur', () => close());
    list.addEventListener('pointerdown', event => { if (event.target.closest('[data-person-index]')) event.preventDefault(); });
    list.addEventListener('click', event => {
      const row = event.target.closest('[data-person-index]'); if (!row) return;
      select(visible[Number(row.dataset.personIndex)].id); input.focus(); close();
    });
    $(prefix + '-clear').addEventListener('click', () => { select(''); input.focus(); displayOptions(); });
    host.closest('dialog').addEventListener('close', close);
    return Object.freeze({
      async load(value = '', exclude = null) {
        const people = await repo.list();
        options = [...(allowAdmin ? [{ id: 'admin', kind: 'admin' }] : []), ...people.map(person => ({ ...person, kind: 'employee' }))].filter(person => !exclude || !(person.kind === exclude.kind && (person.kind === 'admin' || person.id === exclude.employeeId)));
        select(value);
      },
      read() {
        if (!selected || !options.some(person => person.id === selected)) throw new Error(allowAdmin ? 'Pilih karyawan dari daftar atau pilih Admin/Gudang.' : 'Pilih karyawan dari Data Karyawan.');
        return selected === 'admin' ? { kind: 'admin' } : { kind: 'employee', employeeId: selected };
      },
      setDisabled(value) { input.disabled = value; $(prefix + '-clear').disabled = value; if (value) close(); },
      focus() { input.focus(); }
    });
  }
  window.EmployeeUI = Object.freeze({ createPicker });
  refresh().catch(error => showToast(error.message));
document.addEventListener('akses:berubah',()=>refresh().catch(error=>showToast(error.message)));
  document.addEventListener('data:muat-ulang',()=>refresh().catch(error=>showToast(error.message)));
})();
