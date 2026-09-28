import { jsPDF } from 'jspdf';

const COLORS = {
  ink: [0, 0, 0],
  muted: [102, 102, 102],
  border: [230, 230, 230],
  pale: [249, 249, 250],
};

function fmt(value) {
  return value == null || Number.isNaN(Number(value))
    ? '—'
    : Number(value).toLocaleString('en-US');
}

function dateLabel(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Helsinki',
  }).format(new Date(value));
}

/** Export only tracked bookings, delivery-based rates, and operational context. */
export function exportPerformanceReport(snapshot) {
  const {
    periodLabel, periodWindow, attributedCount, rateBookings, deliveredContacts,
    trackedBookingRate, sent, delivered, replied,
    byStation = [], bestWindow, bookingDataThrough, captureStale,
    generatedAt = new Date(),
  } = snapshot;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = width - margin * 2;
  let y = margin;

  function nextPage(space) {
    if (y + space > height - 58) {
      doc.addPage();
      y = margin;
    }
  }

  function heading(title, subtitle) {
    nextPage(46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.ink);
    doc.text(title, margin, y);
    y += 16;
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.muted);
      doc.text(doc.splitTextToSize(subtitle, contentWidth), margin, y);
      y += 20;
    }
  }

  doc.setFillColor(76, 152, 253);
  doc.roundedRect(margin, y, 32, 32, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('TJ', margin + 16, y + 21, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.ink);
  doc.text('Performance report', margin + 44, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text('TJ-Katsastus · WhatsApp outreach', margin + 44, y + 28);
  y += 52;
  doc.text(`${periodLabel || 'All time'} · ${periodWindow || ''}`, margin, y);
  y += 18;
  doc.setDrawColor(...COLORS.border);
  doc.line(margin, y, width - margin, y);
  y += 24;

  heading('Bookings from outreach', 'Tracked booking rate = tracked bookings / distinct delivered contacts; week and month rates follow the send cohort.');
  nextPage(104);
  doc.setFillColor(...COLORS.pale);
  doc.roundedRect(margin, y, contentWidth, 88, 8, 8, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text('TRACKED BOOKINGS', margin + 16, y + 20);
  doc.text('TRACKED BOOKING RATE', margin + contentWidth / 2, y + 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...COLORS.ink);
  doc.text(fmt(attributedCount), margin + 16, y + 53);
  doc.text(trackedBookingRate == null ? '—' : `${trackedBookingRate}%`, margin + contentWidth / 2, y + 53);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(`${fmt(rateBookings)} bookings / ${fmt(deliveredContacts)} delivered contacts`, margin + contentWidth / 2, y + 73);
  y += 110;

  heading('Outreach funnel', 'Delivered contacts are counted once, including contacts with read receipts or multiple reminders.');
  const metrics = [
    ['Sent conversations', fmt(sent)],
    ['Delivered conversations', fmt(delivered)],
    ['Replied', fmt(replied)],
    ['Tracked bookings', fmt(attributedCount)],
  ];
  nextPage(70);
  const cellWidth = contentWidth / metrics.length;
  metrics.forEach(([label, value], index) => {
    const x = margin + index * cellWidth;
    doc.setFillColor(...COLORS.pale);
    doc.rect(x, y, cellWidth - 2, 60, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text(doc.splitTextToSize(label, cellWidth - 16).slice(0, 2), x + 8, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...COLORS.ink);
    doc.text(value, x + 8, y + 48);
  });
  y += 82;

  heading('By station', 'Tracked bookings by outreach station / distinct delivered contacts in that station.');
  nextPage(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text('STATION', margin + 8, y);
  doc.text('DELIVERED', margin + contentWidth * 0.55, y, { align: 'right' });
  doc.text('BOOKINGS', margin + contentWidth * 0.77, y, { align: 'right' });
  doc.text('RATE', width - margin - 8, y, { align: 'right' });
  y += 12;
  doc.setDrawColor(...COLORS.border);
  doc.line(margin, y, width - margin, y);
  y += 18;
  if (!byStation.length) {
    doc.setFont('helvetica', 'normal');
    doc.text('No station activity in this period.', margin + 8, y);
    y += 18;
  }
  for (const station of byStation) {
    nextPage(29);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.ink);
    const name = String(station.station_name || station.station || '—');
    doc.text(name.slice(0, 36), margin + 8, y);
    doc.text(fmt(station.deliveredContacts), margin + contentWidth * 0.55, y, { align: 'right' });
    doc.text(fmt(station.bookings), margin + contentWidth * 0.77, y, { align: 'right' });
    doc.text(station.deliveredBookingRate == null ? '—' : `${Number(station.deliveredBookingRate).toFixed(1)}%`, width - margin - 8, y, { align: 'right' });
    y += 18;
    doc.setDrawColor(...COLORS.border);
    doc.line(margin, y, width - margin, y);
    y += 10;
  }

  if (bestWindow) {
    heading('Observed send window', 'Best weekday/hour with at least 10 sends; this is historical data and does not configure the sender.');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.ink);
    doc.text(`${bestWindow.day} ${String(bestWindow.hour).padStart(2, '0')}:00 · ${Math.round(bestWindow.replyRate * 100)}% reply rate`, margin, y);
    y += 30;
  }

  heading('Data freshness', 'Booking tracking relies on calendar capture and can miss bookings that have not yet appeared in a snapshot.');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.ink);
  doc.text(doc.splitTextToSize(
    `${captureStale ? 'Capture is stale. ' : ''}Booking data through ${dateLabel(bookingDataThrough)}. Generated ${dateLabel(generatedAt)}.`,
    contentWidth,
  ), margin, y);

  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text('TJ-Katsastus · Performance', margin, height - 24);
    doc.text(`${page} / ${totalPages}`, width - margin, height - 24, { align: 'right' });
  }
  const stamp = new Date(generatedAt).toISOString().slice(0, 10);
  doc.save(`tj-performance-${periodLabel?.toLowerCase().replace(/\s+/g, '-') || 'all'}-${stamp}.pdf`);
}
