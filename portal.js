(function () {
  'use strict';
  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/>',
    files: '<path d="M8 3h7l4 4v13H8zM15 3v5h4M5 7H3v15h12M11 12h5M11 16h5"/>',
    file: '<path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 19h2"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    printer: '<path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6zM18 12h.01"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 16v5h16v-5"/>',
    building: '<path d="M3 21V7l9-4 9 4v14M9 21v-7h6v7M8 9h1M15 9h1M2 21h20"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="m12 3 10 18H2zM12 9v5M12 17h.01"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="m16 3 5 5M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15zM4 20h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    arrow: '<path d="M4 12h16M14 6l6 6-6 6"/>',
    route: '<path d="M3 7h17M15 2l5 5-5 5M21 17H4M9 12l-5 5 5 5"/>'
  };
  const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.file}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  const $ = id => document.getElementById(id);
  const D = window.TrackingDomain, repository = window.TrackingStore;
  let documents = [], selectedId = null, tab = 'active', toastTimer, editingDocument = null, movementRevision = null;
  let exportingPdf = false, documentPage = 1, historyPage = 1, detailDocument = null;
  const pages = window.Paginasi;
  const e = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateText = value => {
    if (!value) return '—';
    const [y, m, d] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
  };
  const typeText = D.typeText;
  const filters = () => ({query: $('search').value.trim(), bu: $('filter-bu').value, status: $('filter-status').value});
  const statusClass = value => ({'Menunggu Approval':'approval','Sedang Diproses':'process','Perlu Revisi':'revision','Siap Diambil':'ready','Sudah Diambil':'done','Selesai':'done','Dibatalkan':'cancel'}[value] || '');
  const status = value => `<span class="status-badge status-${statusClass(value)}">${e(value)}</span>`;
  function showToast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
  }
  function formError(id, message) { $(id).textContent = message; $(id).hidden = !message; }
  function openDialog(id) { if (!$(id).open) $(id).showModal(); }
  function closeDialog(id) { $(id).close(); }
  window.PortalUI = Object.freeze({ icon, escape: e, dateText, showToast, formError, openDialog, closeDialog });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(button.dataset.close)));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  }));
  function toggleMenu(open) {
    const sidebar = $('sidebar');
    sidebar.classList.toggle('open', open); $('nav-scrim').hidden = !open;
    document.body.classList.toggle('menu-open', open); $('open-menu').setAttribute('aria-expanded', String(open));
    document.querySelector('.workspace').inert = open;
    if (open) { sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true'); $('close-menu').focus(); }
    else { sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal'); }
  }
  $('open-menu').addEventListener('click', () => toggleMenu(true));
  $('close-menu').addEventListener('click', () => { toggleMenu(false); $('open-menu').focus(); });
  $('nav-scrim').addEventListener('click', () => { toggleMenu(false); $('open-menu').focus(); });
  $('sidebar').addEventListener('keydown', event => {
    if (!$('sidebar').classList.contains('open')) return;
    if (event.key === 'Escape') { toggleMenu(false); $('open-menu').focus(); }
    if (event.key !== 'Tab') return;
    const items = [...$('sidebar').querySelectorAll('a[href],button:not(:disabled)')].filter(x => x.offsetParent !== null);
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
  });
  window.matchMedia('(min-width:901px)').addEventListener('change', event => { if (event.matches) toggleMenu(false); });
  function route() {
    const pages = { tracking: ['tracking-page', 'Tracking Dokumen'], 'link-kerja': ['links-page', 'Link Kerja'], karyawan: ['employees-page', 'Data Karyawan'], 'ht-hp': ['devices-page', 'Data Perangkat'], mess: ['mess-admin-page','Update Data Mess'], profil: ['profile-page', 'Profil & Pengaturan'] };
    const requested = window.location.hash.slice(1);
    const routeName = Object.hasOwn(pages, requested) ? requested : 'tracking';
    Object.entries(pages).forEach(([name, page]) => { $(page[0]).hidden = name !== routeName; });
    $('page-label').textContent = pages[routeName][1];
    document.title = `${$('page-label').textContent} · GA Services`;
    document.querySelectorAll('[data-route]').forEach(a => {
      const active = a.dataset.route === routeName;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    toggleMenu(false);
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-route]').forEach(a => a.addEventListener('click', () => {
    toggleMenu(false);
    if (location.hash === a.getAttribute('href')) route();
  }));
  window.addEventListener('hashchange', route);
  function fillStatuses() {
    const filter = $('filter-status'), previous = filter.value;
    const statuses = D.STATUS.filter(s => D.isFinal(s) === (tab === 'done'));
    filter.innerHTML = '<option value="">Semua status</option>' + statuses.map(s => `<option>${e(s)}</option>`).join('');
    if (statuses.includes(previous)) filter.value = previous;
  }
  $('move-status').insertAdjacentHTML('beforeend', D.STATUS.map(s => `<option>${e(s)}</option>`).join(''));
  function selectTab(next) {
    tab = next; documentPage = 1;
    document.querySelectorAll('[data-tab]').forEach(button => {
      const selected = button.dataset.tab === tab;
      button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    const skc = tab === 'skc';
    $('download-active-pdf').hidden = tab !== 'active';
    $('download-pdf-status').hidden = true;
    ['document-filters','document-results','document-footer','document-stats','tracking-add-document'].forEach(id => { $(id).hidden = skc; });
    $('skc-panel').hidden = !skc; $('tracking-add-skc').hidden = !skc;
    $('tracking-description').textContent = skc ? 'Catat pengambilan surat keterangan cuti karyawan.' : 'Pantau posisi dokumen dan setiap perpindahannya.';
    $('tracking-list-caption').textContent = skc ? 'Surat keterangan cuti' : 'Daftar dokumen';
    if (!skc) { $('document-results').setAttribute('aria-labelledby', tab === 'active' ? 'tab-active' : 'tab-done'); fillStatuses(); }
    render();
  }
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click', () => selectTab(button.dataset.tab));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = ['active','done','skc'], current = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 'active' : event.key === 'End' ? 'skc' : tabs[(current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      selectTab(next); $('tab-' + next).focus();
    });
  });
  function empty(title, caption, action) {
    return `<div class="empty-state"><span class="empty-symbol">${icon('files')}</span><h2>${e(title)}</h2><p>${e(caption)}</p>${action || ''}</div>`;
  }
  function render() {
    const active = documents.filter(x => !D.isFinal(x.statusTerakhir)), done = documents.filter(x => D.isFinal(x.statusTerakhir));
    $('stat-active').textContent = active.length; $('stat-approval').textContent = active.filter(x => x.statusTerakhir === 'Menunggu Approval').length;
    $('stat-overdue').textContent = active.filter(x => D.holdDays(x) > 7).length; $('stat-done').textContent = done.length;
    $('active-count').textContent = active.length; $('done-count').textContent = done.length;
    if (tab === 'skc') return;
    const all = tab === 'active' ? active : done, q = $('search').value.trim().toLocaleLowerCase('id-ID'), bu = $('filter-bu').value, st = $('filter-status').value;
    const rows = D.filterDocuments(documents, filters(), tab === 'done');
    $('download-active-pdf').disabled = exportingPdf || tab !== 'active' || !rows.length;
    const page = pages.range(rows.length, documentPage); documentPage = page.page;
    $('result-count').textContent = pages.summary(page) + ((q || bu || st) ? ` · ${all.length} dokumen seluruhnya` : '');
    pages.render($('document-pagination'), page, next => { documentPage = next; render(); $('document-results').scrollIntoView({block:'start'}); }, false);
    if (!rows.length) {
      if (q || bu || st) $('document-results').innerHTML = empty('Dokumen tidak ditemukan', 'Coba kata kunci lain atau tampilkan semua dokumen.', '<button class="button button-secondary" type="button" data-action="reset-filters">Reset pencarian</button>');
      else if (tab === 'done') $('document-results').innerHTML = empty('Belum ada dokumen selesai', 'Dokumen yang selesai, sudah diambil, atau dibatalkan akan tampil di sini.');
      else $('document-results').innerHTML = empty('Belum ada dokumen aktif', 'Tambahkan dokumen untuk mulai mencatat perjalanan approval.', `<button class="button button-secondary" type="button" data-action="new-document">${icon('plus')}Tambah Dokumen</button>`);
      return;
    }
    $('document-results').innerHTML = `<div class="table-scroll"><table><caption class="sr-only">Daftar dokumen ${tab === 'active' ? 'aktif' : 'selesai'}</caption><thead><tr><th scope="col">Dokumen</th><th scope="col">Tanggal masuk</th><th scope="col">BU</th><th scope="col">Status</th><th scope="col">Posisi sekarang</th><th scope="col">Lama tertahan</th><th scope="col"><span class="sr-only">Detail</span></th></tr></thead><tbody>${rows.slice(page.start, page.end).map(doc => {
      const held = D.holdDays(doc);
      return `<tr><td data-label="Dokumen"><button class="document-name" type="button" data-document="${e(doc.id)}">${e(doc.namaDokumen)}</button><span class="document-meta">${e(typeText(doc))}${doc.nomorDokumen ? ' · ' + e(doc.nomorDokumen) : ''}</span><span class="document-meta">${e(doc.kode)}</span></td><td data-label="Tanggal masuk" class="date-cell">${e(dateText(doc.tanggalMasuk))}</td><td data-label="BU"><span class="bu-badge">${e(doc.bu)}</span></td><td data-label="Status">${status(doc.statusTerakhir)}</td><td data-label="Posisi sekarang">${e(doc.posisiSekarang)}<span class="secondary-value">${e(doc.tahapanSekarang)}</span></td><td data-label="Lama tertahan"><span class="hold-value ${held > 7 ? 'overdue' : ''}">${held == null ? '—' : held + ' hari'}</span></td><td><button class="detail-row-button" type="button" data-document="${e(doc.id)}" aria-label="Lihat detail ${e(doc.namaDokumen)}">${icon('chevron')}</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  async function refresh() { documents = await repository.list(); render(); }
  $('download-active-pdf').addEventListener('click', async () => {
    if (exportingPdf || tab !== 'active' || !window.Akses.profile) return;
    const selectedFilters = filters(), label = $('download-pdf-label'), report = $('download-pdf-status');
    exportingPdf = true; label.textContent = 'Menyiapkan PDF…'; report.hidden = true; render();
    try {
      const [fresh, fonts] = await Promise.all([repository.list(), window.TrackingPDF.ready()]);
      documents = fresh;
      const result = window.TrackingPDF.create(fresh, selectedFilters, fonts);
      await result.doc.save(result.filename, { returnPromise: true });
      report.textContent = result.count.toLocaleString('id-ID') + ' dokumen aktif siap diunduh sebagai PDF.';
    } catch (error) { report.textContent = error.message || 'PDF belum dapat dibuat. Coba lagi.'; }
    finally { exportingPdf = false; label.textContent = 'Unduh PDF'; report.hidden = tab !== 'active'; render(); }
  });
  ['search','filter-bu','filter-status'].forEach(id => $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { documentPage = 1; render(); }));
  function resetFilters() { documentPage = 1; $('search').value = ''; $('filter-bu').value = ''; $('filter-status').value = ''; render(); }
  function newDocument() {
    if(!Akses.canWrite()) return showToast('Masuk dengan akun admin untuk menambah dokumen.');
    editingDocument = null;
    $('document-form').reset(); $('doc-date').value = D.today(); $('doc-date').max = '';
    $('document-form-kicker').textContent = 'DOKUMEN BARU'; $('document-dialog-title').textContent = 'Tambah dokumen'; $('document-save').textContent = 'Simpan Dokumen';
    updateOtherType(); formError('document-error', ''); openDialog('document-dialog'); $('doc-name').focus();
  }
  async function editDocument() {
    const doc = await repository.get(selectedId), form = $('document-form'); form.reset();
    editingDocument = { id: doc.id, revision: doc.revision };
    ['namaDokumen','tanggalMasuk','jenisDokumen','nomorDokumen','bu','asalDokumen','keperluan','noteDokumen'].forEach(field => { form.elements.namedItem(field).value = doc[field] || ''; });
    updateOtherType(); $('doc-other-type').value = doc.jenisDokumenLainnya || ''; $('doc-date').max = doc.history[0]?.tanggalPerpindahan || '';
    $('document-form-kicker').textContent = doc.kode; $('document-dialog-title').textContent = 'Edit dokumen'; $('document-save').textContent = 'Simpan Perubahan';
    formError('document-error', ''); openDialog('document-dialog'); $('doc-name').focus();
  }
  $('edit-document').addEventListener('click', () => editDocument().catch(error => showToast(error.message)));
  function updateOtherType() {
    const other = $('doc-type').value === 'Lainnya'; $('other-type-field').hidden = !other; $('doc-other-type').required = other; $('doc-other-type').disabled = !other;
    if (!other) $('doc-other-type').value = '';
  }
  $('doc-type').addEventListener('change', updateOtherType);
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]');
    if (action?.dataset.action === 'new-document') newDocument();
    if (action?.dataset.action === 'reset-filters') resetFilters();
    const doc = event.target.closest('[data-document]');
    if (doc) showDetail(doc.dataset.document).catch(error => showToast(error.message));
  });
  $('document-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type=submit]');
    if (!form.reportValidity() || button.disabled) return;
    button.disabled = true;
    try {
      const editing = editingDocument, data = Object.fromEntries(new FormData(form));
      const doc = editing ? await repository.update(editing.id, { ...data, expectedRevision: editing.revision }) : await repository.create(data);
      closeDialog('document-dialog'); await refresh();
      if (editing) { renderDetail(doc); $('document-edit-success').hidden = false; }
      else { resetFilters(); selectTab('active'); showToast('Dokumen berhasil disimpan.'); }
    } catch (error) { formError('document-error', error.message); }
    finally { button.disabled = false; }
  });
  function renderDetail(doc) {
    detailDocument = doc; historyPage = 1;
    $('document-edit-success').hidden = true;
    $('detail-id').textContent = doc.kode; $('detail-title').textContent = doc.namaDokumen;
    $('detail-status').innerHTML = status(doc.statusTerakhir);
    const held = D.holdDays(doc); $('detail-held').textContent = held == null ? '' : `${held} hari di posisi terakhir`;
    $('detail-position').textContent = doc.posisiSekarang; $('detail-stage').textContent = doc.tahapanSekarang;
    const fields = [['Tanggal masuk', dateText(doc.tanggalMasuk)], ['BU', doc.bu], ['Jenis dokumen', typeText(doc)], ['Nomor dokumen', doc.nomorDokumen || 'Tidak ada nomor'], ['Asal dokumen', doc.asalDokumen], ['Keperluan', doc.keperluan], ['Dibuat oleh', doc.namaPembuat]];
    $('detail-fields').innerHTML = fields.map(([name, value]) => `<dl class="detail-field"><dt>${e(name)}</dt><dd>${e(value)}</dd></dl>`).join('');
    $('detail-note').textContent = doc.noteDokumen || 'Tidak ada catatan.'; $('detail-note').classList.toggle('no-note', !doc.noteDokumen);
    renderHistory();
    $('new-movement').hidden = D.isFinal(doc.statusTerakhir); $('completed-message').hidden = !D.isFinal(doc.statusTerakhir);
  }
  function renderHistory() {
    const doc = detailDocument; if (!doc) return;
    const page = pages.range(doc.history.length, historyPage); historyPage = page.page;
    $('history-count').textContent = `${doc.history.length} perpindahan`;
    $('history').innerHTML = doc.history.length ? `<ol class="timeline">${[...doc.history].reverse().slice(page.start, page.end).map(event => `<li class="history-event"><div class="event-heading"><strong>${e(event.tahapan)}</strong><time datetime="${e(event.tanggalPerpindahan)}">${e(dateText(event.tanggalPerpindahan))}</time></div><div class="event-route"><span>${e(event.posisiSebelum || event.dari)}</span>${icon('arrow')}<span>${e(event.kepada)}</span></div>${status(event.status)}<small class="event-actor">Dicatat oleh ${e(event.namaPetugas)} · ${e(new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jayapura',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(event.dicatatPada)))} WIT</small>${event.notePerpindahan ? `<p class="event-note">${e(event.notePerpindahan)}</p>` : ''}</li>`).join('')}</ol>` : '<p class="history-empty">Dokumen baru diterima. Belum ada perpindahan yang dicatat.</p>';
    pages.render($('history-pagination'), page, next => { historyPage = next; renderHistory(); $('history').scrollIntoView({block:'start'}); });
  }
  async function showDetail(id) { const doc = await repository.get(id); selectedId = id; renderDetail(doc); openDialog('detail-dialog'); }
  $('new-movement').addEventListener('click', async () => {
    try {
      const doc = await repository.get(selectedId); $('movement-form').reset(); formError('movement-error', '');
      movementRevision = doc.revision;
      $('movement-doc-name').textContent = doc.namaDokumen; $('movement-doc-id').textContent = doc.kode;
      $('move-date').min = doc.perpindahanTerakhir || doc.tanggalMasuk;
      $('move-date').value = D.today() < $('move-date').min ? $('move-date').min : D.today();
      $('move-from').value = Akses.profile?.nama || '';
      openDialog('movement-dialog'); $('move-date').focus();
    } catch (error) { showToast(error.message); }
  });
  $('movement-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type=submit]');
    if (!form.reportValidity() || button.disabled) return;
    button.disabled = true;
    try {
      const doc = await repository.move(selectedId, { ...Object.fromEntries(new FormData(form)), expectedRevision: movementRevision });
      closeDialog('movement-dialog'); await refresh(); renderDetail(doc);
      if (D.isFinal(doc.statusTerakhir)) { resetFilters(); selectTab('done'); }
      // A toast outside a modal is not visible above the top layer. The updated
      // history is immediate feedback while the detail dialog remains open.
    } catch (error) { formError('movement-error', error.message); }
    finally { button.disabled = false; }
  });
  function updateDate() { $('today').dateTime = D.today(); $('today').textContent = dateText(D.today()); render(); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateDate(); });
  setInterval(updateDate, 60000);
  document.addEventListener('akses:berubah',()=>refresh().catch(error=>showToast(error.message)));
  document.addEventListener('data:muat-ulang',()=>refresh().catch(error=>showToast(error.message)));
  $('refresh-data').addEventListener('click',()=>document.dispatchEvent(new CustomEvent('data:muat-ulang')));
  route(); fillStatuses(); updateDate(); refresh().catch(error => showToast(error.message));
})();
