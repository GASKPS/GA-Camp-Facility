(function (g) {
  'use strict';
  let dependencies;
  const text = value => String(value ?? '').trim() || '-';
  const dateText = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : '-';
  const printTime = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jayapura', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const columns = [
    { header: 'No.', dataKey: 'no' },
    { header: 'Dokumen', dataKey: 'document' },
    { header: 'Jenis', dataKey: 'type' },
    { header: 'BU', dataKey: 'bu' },
    { header: 'Posisi Sekarang', dataKey: 'position' },
    { header: 'Tgl. Pindah\nTerakhir', dataKey: 'moved' },
    { header: 'Catatan Perpindahan', dataKey: 'note' },
    { header: 'Serah Terima', dataKey: 'handover' }
  ];
  function script(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.integrity={"vendor/jspdf.umd.min.js":"sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3","vendor/jspdf.plugin.autotable.min.js":"sha384-5jk55M0XWoAw7LyhlXJe19ErOr3doBAPzxw9vahPFbvolqWa2yDk4fhHa2zuYeOa"}[src]; el.crossOrigin='anonymous';
      el.onload = resolve;
      el.onerror = () => { el.remove(); reject(new Error('Komponen PDF belum dapat dimuat. Coba lagi.')); };
      document.head.append(el);
    });
  }
  async function base64(path, errorMessage) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(errorMessage);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  function ready() {
    if (!dependencies) dependencies = (async () => {
      if (!g.jspdf?.jsPDF) await script('vendor/jspdf.umd.min.js');
      if (!g.jspdf.jsPDF.API.autoTable) await script('vendor/jspdf.plugin.autotable.min.js');
      const fontError = 'Huruf untuk laporan PDF belum dapat dimuat. Coba lagi.';
      const [regular, bold, logo] = await Promise.all([
        base64('vendor/DejaVuSans.ttf', fontError),
        base64('vendor/DejaVuSans-Bold.ttf', fontError),
        base64('ga-logo.jpg', 'Logo tidak tersedia.').catch(() => null)
      ]);
      return { regular, bold, logo };
    })().catch(error => { dependencies = null; throw error; });
    return dependencies;
  }
  function create(records, filters = {}, fonts, generatedAt = new Date()) {
    const D = g.TrackingDomain, rows = D.filterDocuments(records, filters, false);
    if (!rows.length) throw new Error('Tidak ada dokumen aktif yang sesuai filter untuk diunduh.');
    const doc = new g.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    doc.addFileToVFS('GA-Regular.ttf', fonts.regular); doc.addFont('GA-Regular.ttf', 'GA', 'normal');
    doc.addFileToVFS('GA-Bold.ttf', fonts.bold); doc.addFont('GA-Bold.ttf', 'GA', 'bold');
    doc.setProperties({ title: 'Tracking Dokumen Aktif', subject: 'Lembar serah terima dokumen aktif', creator: 'GA Services', author: 'GA Services' });
    const day = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jayapura', year: 'numeric', month: 'long', day: '2-digit' }).format(generatedAt).replace(/\s+/g, '_');
    const time = Object.fromEntries(printTime.formatToParts(generatedAt).map(({ type, value }) => [type, value]));
    const printed = `${time.day}/${time.month}/${time.year} ${time.hour}:${time.minute} WIT`;
    const office = filters.office
      ? (filters.officeNama && filters.officeNama !== 'Semua office' ? filters.officeNama : rows[0].asalDokumen || 'Office terpilih')
      : 'Semua office';
    const period = filters.dateFrom && filters.dateTo ? `${dateText(filters.dateFrom)} - ${dateText(filters.dateTo)}`
      : filters.dateFrom ? `Mulai ${dateText(filters.dateFrom)}`
      : filters.dateTo ? `Sampai ${dateText(filters.dateTo)}` : 'Semua tanggal';
    // The status still filters the data, without appearing in the printed report.
    const selected = ['Office: ' + office, 'Periode: ' + period, filters.bu && 'BU: ' + filters.bu,
      filters.query && 'Pencarian: ' + filters.query].filter(Boolean).join('  |  ');
    const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = 12;
    const tableWidth = width - margin * 2, right = width - margin;
    const ink = [28, 46, 62], muted = [65, 82, 97], border = [207, 216, 223];
    let logo;
    if (fonts.logo) {
      try {
        const source = 'data:image/jpeg;base64,' + fonts.logo, size = doc.getImageProperties(source);
        const scale = Math.min(31 / size.width, 12 / size.height);
        if (Number.isFinite(scale) && scale > 0) logo = { source, width: size.width * scale, height: size.height * scale };
      } catch { /* A missing or invalid logo must not prevent printing. */ }
    }
    doc.setFont('GA', 'normal').setFontSize(8.5);
    const allFilterLines = doc.splitTextToSize(selected, tableWidth), filterLines = allFilterLines.slice(0, 3);
    if (allFilterLines.length > 3) {
      while (doc.getTextWidth(filterLines[2] + '...') > tableWidth) filterLines[2] = filterLines[2].slice(0, -1);
      filterLines[2] += '...';
    }
    const top = 33 + filterLines.length * 4;
    function header() {
      if (logo) doc.addImage(logo.source, 'JPEG', margin, 17 - logo.height / 2, logo.width, logo.height, 'ga-logo');
      const titleX = logo ? margin + logo.width + 6 : margin;
      doc.setFont('GA', 'bold').setFontSize(15).setTextColor(...ink);
      doc.text('Tracking Dokumen Aktif', titleX, 16);
      doc.setFont('GA', 'normal').setFontSize(8.5).setTextColor(...muted);
      doc.text(logo ? 'Lembar serah terima' : 'GA Services | Lembar serah terima', titleX, 22);
      doc.text('Dicetak: ' + printed, right, 16, { align: 'right' });
      doc.text(rows.length.toLocaleString('id-ID') + ' dokumen aktif', right, 22, { align: 'right' });
      doc.setDrawColor(...border).setLineWidth(0.2).line(margin, 26, right, 26);
      doc.text(filterLines, margin, 31.5, { lineHeightFactor: 1.33 });
    }
    function printFields({ cell, column, row, section }) {
      if (section !== 'body') return;
      const x = cell.x + cell.padding('left');
      // Identify a continued note without repeating the check box or signature lines.
      if (row.index < 0) {
        if (column.dataKey === 'document' && !cell.text.some(Boolean)) {
          doc.setFont('GA', 'normal').setFontSize(7.4).setTextColor(...muted);
          doc.text('Lanjutan catatan | No. ' + row.raw.no, x, cell.y + 5.3);
        }
        return;
      }
      if (column.dataKey === 'position') {
        const lineHeight = cell.styles.fontSize * doc.getLineHeightFactor() / doc.internal.scaleFactor;
        const y = cell.y + cell.padding('top') + lineHeight * cell.text.length + 0.8;
        doc.setDrawColor(...muted).setLineWidth(0.25).rect(x, y, 3.6, 3.6, 'S');
        doc.setFont('GA', 'normal').setFontSize(7.4).setTextColor(...muted);
        doc.text('Sudah diambil', x + 5.1, y + 2.8);
      } else if (column.dataKey === 'handover') {
        doc.setFont('GA', 'normal').setFontSize(7.4).setTextColor(...muted);
        doc.setDrawColor(...muted).setLineWidth(0.16);
        ['Nama:', 'Tanggal:', 'Paraf:'].forEach((label, i) => {
          const y = cell.y + 7 + i * 7.3;
          doc.text(label, x, y);
          doc.line(x + 13.3, y + 0.7, cell.x + cell.width - cell.padding('right'), y + 0.7);
        });
      }
    }
    doc.autoTable({
      startY: top, margin: { top, bottom: 17, left: margin, right: margin },
      tableWidth, showHead: 'everyPage', rowPageBreak: 'avoid', theme: 'grid',
      styles: { font: 'GA', fontSize: 8.4, cellPadding: 2.6, overflow: 'linebreak', valign: 'top', textColor: ink, lineColor: border, lineWidth: 0.15 },
      headStyles: { font: 'GA', fontStyle: 'bold', fillColor: [236, 242, 246], textColor: ink, fontSize: 8 },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columns,
      body: rows.map((d, i) => ({
        no: String(i + 1),
        document: [text(d.namaDokumen), [d.kode, d.nomorDokumen && 'No. ' + d.nomorDokumen].filter(Boolean).join(' | ')].filter(Boolean).join('\n'),
        type: text(D.typeText(d)),
        bu: text(d.bu),
        position: text(d.posisiSekarang).replace(/\s+/g, ' '),
        moved: Number(d.jumlahPerpindahan) === 0 && d.jumlahPerpindahan != null ? '-' : dateText(d.perpindahanTerakhir),
        note: text(d.notePerpindahanTerakhir),
        handover: ''
      })),
      columnStyles: {
        no: { cellWidth: 10, halign: 'center', cellPadding: { top: 2.6, bottom: 2.6, left: 1.4, right: 1.4 } },
        document: { cellWidth: 56 },
        type: { cellWidth: 22 },
        bu: { cellWidth: 15 },
        position: { cellWidth: 37, cellPadding: { top: 2.6, bottom: 7.1, left: 2.6, right: 2.6 } },
        moved: { cellWidth: 26 },
        note: { cellWidth: 58 },
        // Reserve room for all three lines even if a long note splits this row.
        handover: { cellWidth: tableWidth - 224, cellPadding: { top: 24, bottom: 0, left: 2.6, right: 2.6 }, minCellHeight: 26 }
      },
      didParseCell({ section, cell, column }) {
        if (section === 'head' && column.dataKey === 'no') {
          cell.styles.cellPadding = { top: 2.6, bottom: 2.6, left: 1.4, right: 1.4 };
          cell.styles.halign = 'center';
        }
      },
      didDrawCell: printFields, willDrawPage: header
    });
    const total = doc.getNumberOfPages();
    for (let page = 1; page <= total; page++) {
      doc.setPage(page).setFont('GA', 'normal').setFontSize(8).setTextColor(...muted);
      doc.setDrawColor(...border).setLineWidth(0.2).line(margin, height - 12, right, height - 12);
      doc.text('Centang setelah dokumen diambil. Isi Serah Terima pada baris yang sama.', margin, height - 7);
      doc.text('Halaman ' + page + ' dari ' + total, right, height - 7, { align: 'right' });
    }
    return { doc, count: rows.length, filename: 'Tracking_Dokumen_' + day + '.pdf' };
  }
  g.TrackingPDF = Object.freeze({ ready, create });
})(window);
