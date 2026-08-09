import { jsPDF } from 'jspdf';

/** RapidScreen tokens (light) — match client/src/index.css */
const C = {
  ink: [0, 0, 0],
  ink80: [0, 0, 0],
  muted: [102, 102, 102], // ~40% black
  border: [230, 230, 230],
  sunken: [249, 249, 250],
  indigo: [79, 80, 127],
  blue: [76, 152, 253],
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

/**
 * Build + download a Performance snapshot PDF in the RapidScreen visual language.
 * @param {object} snapshot — live numbers from the Performance page
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
    generatedAt = new Date(),
  } = snapshot;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (need) => {
    if (y + need > pageH - 48) {
      doc.addPage();
      y = margin;
      drawFooter();
    }
  };

  const drawFooter = () => {
    const page = doc.internal.getNumberOfPages();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text('TJ WhatsApp outreach · Performance snapshot', margin, pageH - 24);
    doc.text(`Page ${page}`, pageW - margin, pageH - 24, { align: 'right' });
  };

  const rule = (yy = y) => {
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.75);
    doc.line(margin, yy, pageW - margin, yy);
  };

  const sectionTitle = (title, subtitle) => {
    ensureSpace(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...C.ink);
    doc.text(title, margin, y);
    y += 14;
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.muted);
      doc.text(subtitle, margin, y);
      y += 12;
    }
    y += 4;
  };

  const pill = (text, x, yy) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const w = doc.getTextWidth(text) + 14;
    doc.setFillColor(...C.sunken);
    doc.setDrawColor(...C.border);
    doc.roundedRect(x, yy - 9, w, 14, 3, 3, 'FD');
    doc.setTextColor(...C.ink);
    doc.text(text, x + 7, yy);
    return w;
  };

  // ── Header ──────────────────────────────────────────────────────────
  doc.setFillColor(...C.indigo);
  doc.roundedRect(margin, y, 28, 28, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.white);
  doc.text('TJ', margin + 14, y + 18, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...C.ink);
  doc.text('Performance report', margin + 40, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text('WhatsApp outreach · Europe/Helsinki', margin + 40, y + 26);
  y += 44;

  // Meta chips
  let chipX = margin;
  chipX += pill(periodLabel || 'Period', chipX, y) + 8;
  chipX += pill(method === 'incremental' ? 'Incremental' : 'Attributed', chipX, y) + 8;
  pill(`Generated ${helsinkiStamp(generatedAt)}`, chipX, y);
  y += 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text(periodWindow || '', margin, y);
  y += 16;
  rule();
  y += 20;

  // ── Hero cards ──────────────────────────────────────────────────────
  sectionTitle('Bookings from outreach', 'Latest snapshot from the live dashboard');

  const cardGap = 12;
  const cardW = (contentW - cardGap) / 2;
  const cardH = 108;
  ensureSpace(cardH + 20);

  const drawHeroCard = (x, title, value, blurb, accent) => {
    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.8);
    doc.roundedRect(x, y, cardW, cardH, 8, 8, 'FD');
    doc.setFillColor(...accent);
    doc.rect(x, y, 4, cardH, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(title.toUpperCase(), x + 16, y + 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(32);
    doc.setTextColor(...C.ink);
    doc.text(String(value), x + 16, y + 58);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.muted);
    const lines = doc.splitTextToSize(blurb, cardW - 28);
    doc.text(lines.slice(0, 3), x + 16, y + 74);
  };

  const attributedBlurb =
    method === 'attributed'
      ? `Registration-matched for ${periodLabel?.toLowerCase() || 'period'}. All-time attributed ${fmt(attributedAllTime)}.`
      : `All-time registration matches. Period view does not change this card when Incremental is selected.`;

  const incrementalBlurb = `Lift above control · ${fmt(multiplier, 2)}× · from ${fmt(leadsContacted)} contacted. Always all-time.`;

  drawHeroCard(
    margin,
    'Attributed bookings',
    fmt(attributedCount),
    attributedBlurb,
    C.blue
  );
  drawHeroCard(
    margin + cardW + cardGap,
    'Incremental bookings',
    fmt(incremental, 0),
    incrementalBlurb,
    C.indigo
  );
  y += cardH + 18;

  // ── Funnel ──────────────────────────────────────────────────────────
  sectionTitle('Outreach funnel', periodWindow || periodLabel);

  const funnel = [
    { label: 'Sent', value: fmt(sent), hint: '' },
    {
      label: 'Delivered',
      value: fmt(delivered),
      hint: delivered != null && sent ? pct(delivered, sent) + ' of sent' : '',
    },
    {
      label: 'Replied',
      value: fmt(replied),
      hint: sent ? pct(replied, sent) + ' of sent' : '',
    },
    {
      label: 'Booked w/o reply',
      value: fmt(silentBookings),
      hint: attributedCount ? pct(silentBookings, attributedCount) + ' of attributed' : '',
    },
  ];

  const cellW = contentW / 4;
  ensureSpace(56);
  doc.setFillColor(...C.sunken);
  doc.roundedRect(margin, y, contentW, 52, 8, 8, 'F');
  funnel.forEach((cell, i) => {
    const x = margin + i * cellW;
    if (i > 0) {
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.6);
      doc.line(x, y + 10, x, y + 42);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(cell.label, x + 12, y + 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...C.ink);
    doc.text(cell.value, x + 12, y + 34);
    if (cell.hint) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.muted);
      doc.text(cell.hint, x + 12, y + 45);
    }
  });
  y += 68;

  // ── Programme value ─────────────────────────────────────────────────
  sectionTitle('Value of the programme', 'Standardised uplift · all-time capture cohort');
  ensureSpace(70);
  doc.setFillColor(...C.sunken);
  doc.roundedRect(margin, y, contentW, 64, 8, 8, 'F');

  const valueCols = [
    { label: 'Incremental', value: fmt(incremental, 0) },
    { label: 'Multiplier', value: multiplier != null ? `${fmt(multiplier, 2)}×` : '—' },
    { label: 'Treated rate', value: treatedRate != null ? `${fmt(treatedRate * 100, 1)}%` : '—' },
    { label: 'Contacted', value: fmt(leadsContacted) },
    {
      label: 'Due soon rate',
      value: dueSoonRate != null ? `${fmt(dueSoonRate * 100, 1)}%` : '—',
    },
    {
      label: 'Passed rate',
      value: passedRate != null ? `${fmt(passedRate * 100, 1)}%` : '—',
    },
  ];
  const vW = contentW / 3;
  valueCols.forEach((col, i) => {
    const colX = margin + (i % 3) * vW;
    const colY = y + (i < 3 ? 0 : 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(col.label, colX + 14, colY + 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...C.ink);
    doc.text(col.value, colX + 14, colY + 30);
  });
  y += 80;

  // ── By station ──────────────────────────────────────────────────────
  sectionTitle(
    'By station',
    method === 'incremental'
      ? 'Standardised lift vs control · all-time'
      : 'Due-soon booking rate · booked per 100 contacted'
  );

  const rows = (Array.isArray(byStation) ? byStation : []).slice(0, 12);
  const headerH = 22;
  const rowH = 22;
  ensureSpace(headerH + rowH * Math.max(rows.length, 1) + 16);

  doc.setFillColor(...C.sunken);
  doc.rect(margin, y, contentW, headerH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  const cols = [
    { key: 'station', label: 'STATION', x: margin + 12, align: 'left' },
    { key: 'sent', label: 'SENT', x: margin + contentW * 0.55, align: 'right' },
    { key: 'metric', label: method === 'incremental' ? 'LIFT' : 'RATE', x: margin + contentW - 12, align: 'right' },
  ];
  cols.forEach((c) => {
    doc.text(c.label, c.x, y + 14, { align: c.align });
  });
  y += headerH;

  if (!rows.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.muted);
    doc.text('No station rows in this snapshot.', margin + 12, y + 14);
    y += 28;
  } else {
    rows.forEach((row, i) => {
      ensureSpace(rowH + 4);
      if (i % 2 === 1) {
        doc.setFillColor(252, 252, 253);
        doc.rect(margin, y, contentW, rowH, 'F');
      }
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.4);
      doc.line(margin, y + rowH, pageW - margin, y + rowH);

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
      doc.text(name, margin + 12, y + 15);
      doc.text(fmt(contacted), margin + contentW * 0.55, y + 15, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(method === 'incremental' ? lift : ratePct, margin + contentW - 12, y + 15, {
        align: 'right',
      });
      y += rowH;
    });
  }
  y += 16;

  // ── Best window ─────────────────────────────────────────────────────
  if (bestWindow) {
    sectionTitle('When to send', 'Best reply-rate window from live send analytics');
    ensureSpace(36);
    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.border);
    doc.roundedRect(margin, y, contentW, 32, 6, 6, 'FD');
    const dayNames = {
      Mon: 'Monday',
      Tue: 'Tuesday',
      Wed: 'Wednesday',
      Thu: 'Thursday',
      Fri: 'Friday',
    };
    const day = dayNames[bestWindow.day] || bestWindow.day;
    const rate = Math.round((bestWindow.replyRate || 0) * 100);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...C.ink);
    doc.text(
      `${day} ${String(bestWindow.hour).padStart(2, '0')}:00 · ${rate}% reply` +
        (bestWindow.sent ? ` · n=${bestWindow.sent}` : ''),
      margin + 14,
      y + 20
    );
    y += 48;
  }

  // ── Capture note ────────────────────────────────────────────────────
  sectionTitle('Data freshness', 'Booking attribution depends on calendar capture');
  ensureSpace(50);
  const freshnessFill = captureStale ? [255, 248, 230] : C.sunken;
  doc.setFillColor(...freshnessFill);
  doc.setDrawColor(...C.border);
  doc.roundedRect(margin, y, contentW, 44, 6, 6, 'FD');
  if (captureStale) {
    doc.setFillColor(...C.yellow);
    doc.circle(margin + 16, y + 22, 4, 'F');
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.ink);
  const freshness = captureStale
    ? `Capture is stale. Last booking data through ${shortDate(bookingDataThrough)}. Run Capture before treating period zeros as final.`
    : `Booking data through ${shortDate(bookingDataThrough)}. Live send/reply stats update independently of capture.`;
  doc.text(doc.splitTextToSize(freshness, contentW - 36), margin + 28, y + 18);
  y += 60;

  // Footer on every page
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
