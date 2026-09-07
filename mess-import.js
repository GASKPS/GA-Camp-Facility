(function (g) {
  'use strict';
  const fields = ['nik', 'nama', 'departemen', 'jabatan', 'lokasi_hunian', 'blok', 'nomor_kamar'];
  const limits = { nik: 40, nama: 150, departemen: 150, jabatan: 150, lokasi_hunian: 150, blok: 100, nomor_kamar: 100 };
  function validate(source, mapping) {
    const selected = fields.map(key => mapping[key]).filter(value => value !== '' && value != null);
    if (!selected.length) return { rows: [], errors: ['Pilih setidaknya satu kolom dari file.'], skipped: 0 };
    if (new Set(selected.map(String)).size !== selected.length) return { rows: [], errors: ['Setiap kolom tujuan harus memakai kolom file yang berbeda.'], skipped: 0 };
    const rows = [], errors = [], used = new Set();
    let skipped = 0;
    source.forEach((values, index) => {
      const row = Object.fromEntries(fields.map(key => [key, mapping[key] === '' || mapping[key] == null ? '' : String(values[Number(mapping[key])] ?? '').trim()]));
      if (fields.every(key => !row[key])) { skipped++; return; }
      const nik = row.nik.replace(/\s/g, '').toUpperCase();
      if (fields.some(key => row[key].length > limits[key])) errors.push('Baris ' + (index + 2) + ': isian terlalu panjang.');
      else if (nik && used.has(nik)) errors.push('Baris ' + (index + 2) + ': NIK ' + row.nik + ' duplikat.');
      if (nik) used.add(nik);
      rows.push(row);
    });
    return { rows, errors, skipped };
  }
  g.MessImport = Object.freeze({ validate });
})(window);
