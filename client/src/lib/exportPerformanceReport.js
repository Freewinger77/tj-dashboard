import { jsPDF } from 'jspdf';

/** RapidScreen + soft-card snapshot tokens */
const C = {
  ink: [0, 0, 0],
  muted: [120, 120, 120],
  border: [235, 235, 237],
  sunken: [249, 249, 250],
  page: [243, 244, 246],
  indigo: [79, 80, 127],
  blue: [76, 152, 253],
  blueSoft: [230, 241, 253],
  green: [40, 150, 70],
  yellow: [255, 204, 0],
  white: [255, 255, 255],
};

function fmt(n, digits = 0) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function pct(part, whole) {
  if (part == null || !whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

function helsinkiStamp(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Helsinki',
  }).format(date);
}

function shortDate(ts) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Helsinki',
  }).format(new Date(ts));
}

function softCard(doc, x, y, w, h) {
  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, w, h, 10, 10, 'FD');
}

function drawSparkline(doc, x, y, w, h, series, color = C.blue) {
  if (!series?.length) return;
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const span = Math.max(max - min, 1);
  const pts = series.map((v, i) => {
    const px = x + (series.length === 1 ? w / 2 : (i / (series.length - 1)) * w);
    const py = y + h - 4 - ((v - min) / span) * (h - 8);
    return [px, py];
  });
  // soft fill
  doc.setFillColor(...C.blueSoft);
  doc.setDrawColor(...C.blueSoft);
  const fill = pts.map(([px, py], i) => (i === 0 ? [px, py] : [px, py]));
  doc.setLineWidth(0.1);
  // area approx as thin bands
  for (let i = 1; i < fill.length; i++) {
    const [x0, y0] = fill[i - 1];
    const [x1, y1] = fill[i];
    doc.setDrawColor(200, 220, 250);
    doc.setLineWidth(Math.max(1, h - ((y0 + y1) / 2 - y)));
  }
  doc.setDrawColor(...color);
  doc.setLineWidth(1.8);
  for (let i = 1; i < pts.length; i++) {
    doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
}

/**
 * Build + download a Performance snapshot PDF in the soft-card mockup style.
 */
export function exportPerformanceReport(snapshot) {
  const {
    periodLabel,
    periodWindow,
    method,
    attributedCount,
    attributedAllTime,
    incremental,
    multiplier,
    leadsContacted,
    treatedRate,
    sent,
    delivered,
    replied,
    silentBookings,
    byStation = [],
    bestWindow,
    dueSoonRate,
    passedRate,
    bookingDataThrough,
    captureStale,
    bookingSeries = [],
    bookingDeltaPct,
    bookingRate,
    revenueImpact,
    generatedAt = new Date(),
  } = snapshot;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (need) => {
    if (y + need > pageH - 44) {
      doc.addPage();
      // page wash
      doc.setFillColor(...C.page);
      doc.rect(0, 0, pageW, pageH, 'F');
      y = margin;
    }
  };

  const drawFooter = () => {
    const page = doc.internal.getNumberOfPages();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text('TJ WhatsApp outreach · Programme snapshot', margin, pageH - 22);
    doc.text(`Page ${page}`, pageW - margin, pageH - 22, { align: 'right' });
  };

  // Page background
  doc.setFillColor(...C.page);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Header
  doc.setFillColor(...C.indigo);
  doc.roundedRect(margin, y, 26, 26, 7, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.white);
  doc.text('TJ', margin + 13, y + 17, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...C.ink);
  doc.text('Programme snapshot', margin + 36, y + 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text(
    `${periodLabel || 'Period'} · ${method === 'incremental' ? 'Incremental' : 'Overall'} · ${helsinkiStamp(generatedAt)}`,
    margin + 36,
    y + 24
  );
  y += 40;
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text(periodWindow || '', margin, y);
  y += 16;

  // ── Top row: hero sparkline + 2×2 tiles ─────────────────────────────
  const gap = 12;
  const leftW = contentW * 0.55;
  const rightW = contentW - leftW - gap;
  const heroH = 168;
  ensureSpace(heroH + 20);

  softCard(doc, margin, y, leftW, heroH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text('OVERALL BOOKINGS', margin + 16, y + 20);
  drawSparkline(doc, margin + 16, y + 30, leftW - 32, 70, bookingSeries.length ? bookingSeries : [2, 4, 3, 6, 5, 8, 7, attributedCount ? 5 : 2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.setTextColor(...C.ink);
  doc.text(fmt(attributedCount), margin + 16, y + 130);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (bookingDeltaPct != null) {
    doc.setTextColor(...(bookingDeltaPct >= 0 ? C.green : [255, 71, 71]));
    doc.text(
      `${bookingDeltaPct >= 0 ? '+' : ''}${bookingDeltaPct}% from previous period`,
      margin + 16,
      y + 150
    );
  } else {
    doc.setTextColor(...C.muted);
    doc.text(`All-time attributed · ${fmt(attributedAllTime)} total`, margin + 16, y + 150);
  }

  const tileW = (rightW - gap) / 2;
  const tileH = (heroH - gap) / 2;
  const tiles = [
    { label: 'Contacted', value: fmt(leadsContacted), hint: 'All time' },
    {
      label: 'Booking rate',
      value: bookingRate != null ? `${fmt(bookingRate, 1)}%` : dueSoonRate != null ? `${fmt(dueSoonRate * 100, 1)}%` : '—',
      hint: 'Due soon conversion',
    },
    {
      label: 'Incremental',
      value: fmt(incremental, 0),
      hint: multiplier != null ? `${fmt(multiplier, 2)}× control` : 'All time lift',
    },
    {
      label: 'Revenue impact',
      value: revenueImpact != null ? `€${fmt(revenueImpact, 0)}` : '—',
      hint: '€89 × incremental',
    },
  ];
  tiles.forEach((t, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const tx = margin + leftW + gap + col * (tileW + gap);
    const ty = y + row * (tileH + gap);
    softCard(doc, tx, ty, tileW, tileH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(t.label, tx + 12, ty + 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...C.ink);
    doc.text(t.value, tx + 12, ty + 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(t.hint, tx + 12, ty + tileH - 12);
  });
  y += heroH + 16;

  // ── Funnel flow card ────────────────────────────────────────────────
  const funnelH = 110;
  ensureSpace(funnelH + 16);
  softCard(doc, margin, y, contentW, funnelH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text('OUTREACH FLOW', margin + 16, y + 20);

  const funnel = [
    { label: 'Sent', n: sent, color: C.blue },
    { label: 'Delivered', n: delivered, color: [125, 187, 255] },
    { label: 'Replied', n: replied, color: [113, 221, 140] },
    { label: 'Booked', n: attributedCount, color: C.indigo },
  ];
  const fMax = Math.max(...funnel.map((f) => Number(f.n) || 0), 1);
  const fSlot = contentW / 4;
  funnel.forEach((f, i) => {
    const cx = margin + i * fSlot + fSlot / 2;
    const barH = Math.max(10, Math.round(((Number(f.n) || 0) / fMax) * 42));
    const barW = 36;
    doc.setFillColor(...f.color);
    doc.roundedRect(cx - barW / 2, y + 32 + (42 - barH), barW, barH, 5, 5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(f.label, cx, y + 86, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...C.ink);
    doc.text(fmt(f.n), cx, y + 100, { align: 'center' });
    if (i < funnel.length - 1) {
      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(1);
      doc.line(cx + 28, y + 52, cx + fSlot - 28, y + 52);
    }
  });
  y += funnelH + 16;

  // ── Station table card ──────────────────────────────────────────────
  const rows = (Array.isArray(byStation) ? byStation : []).slice(0, 8);
  const tableH = 28 + rows.length * 22 + 16;
  ensureSpace(tableH + 8);
  softCard(doc, margin, y, contentW, tableH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text(
    method === 'incremental' ? 'BY STATION · LIFT' : 'BY STATION · DUE-SOON RATE',
    margin + 16,
    y + 20
  );

  let ty = y + 34;
  doc.setFillColor(...C.sunken);
  doc.rect(margin + 10, ty - 12, contentW - 20, 18, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text('STATION', margin + 18, ty);
  doc.text('SENT', margin + contentW * 0.55, ty, { align: 'right' });
  doc.text(method === 'incremental' ? 'LIFT' : 'RATE', margin + contentW - 18, ty, { align: 'right' });
  ty += 16;

  rows.forEach((row) => {
    const name = row.station_name || row.station || '—';
    const contacted =
      method === 'incremental'
        ? row.leads_contacted || 0
        : row.due_soon_leads_contacted || row.leads_contacted || 0;
    const dueSoonRateRow = row.due_soon_treated_rate;
    const fallbackRate =
      row.leads_contacted > 0 ? row.bookings_observed / row.leads_contacted : null;
    const ratePct =
      dueSoonRateRow != null
        ? (dueSoonRateRow * 100).toFixed(1)
        : fallbackRate != null
          ? (fallbackRate * 100).toFixed(1)
          : '—';
    const lift = row.multiplier != null ? `${Number(row.multiplier).toFixed(1)}×` : '—';

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...C.ink);
    doc.text(name, margin + 18, ty);
    doc.text(fmt(contacted), margin + contentW * 0.55, ty, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(method === 'incremental' ? lift : ratePct, margin + contentW - 18, ty, {
      align: 'right',
    });
    ty += 22;
  });
  y += tableH + 14;

  // ── Freshness + best window ─────────────────────────────────────────
  ensureSpace(70);
  softCard(doc, margin, y, contentW, 58);
  if (captureStale) {
    doc.setFillColor(...C.yellow);
    doc.circle(margin + 18, y + 28, 4, 'F');
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.ink);
  const freshness = captureStale
    ? `Capture is stale. Booking data through ${shortDate(bookingDataThrough)}. Run Capture before treating period zeros as final.`
    : `Booking data through ${shortDate(bookingDataThrough)}. Silent bookings this period: ${fmt(silentBookings)} · treated rate ${treatedRate != null ? `${fmt(treatedRate * 100, 1)}%` : '—'}${passedRate != null ? ` · passed ${fmt(passedRate * 100, 1)}%` : ''}.`;
  doc.text(doc.splitTextToSize(freshness, contentW - 44), margin + 30, y + 22);
  y += 70;

  if (bestWindow) {
    ensureSpace(40);
    softCard(doc, margin, y, contentW, 36);
    const dayNames = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };
    const day = dayNames[bestWindow.day] || bestWindow.day;
    const rate = Math.round((bestWindow.replyRate || 0) * 100);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...C.ink);
    doc.text(
      `Best send window · ${day} ${String(bestWindow.hour).padStart(2, '0')}:00 · ${rate}% reply` +
        (bestWindow.sent ? ` · n=${bestWindow.sent}` : ''),
      margin + 16,
      y + 22
    );
  }

  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter();
  }

  const stamp = new Date(generatedAt);
  const fileDate = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}`;
  const periodKey = (periodLabel || 'report').toLowerCase().replace(/\s+/g, '-');
  doc.save(`tj-performance-${periodKey}-${fileDate}.pdf`);
}
