import { Router } from 'express';
import { getMeasurementReport, roiFromUplift, assertNoHoldoutLeak } from '../lib/measurement.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    const report = await getMeasurementReport({ force });
    res.json(report);
  } catch (err) {
    console.error('[measurement]', err);
    res.status(500).json({ error: err.message || 'measurement failed' });
  }
});

router.get('/headline', async (_req, res) => {
  try {
    const report = await getMeasurementReport();
    res.json({
      generated_at: report.generated_at,
      freshness: report.freshness,
      headline: report.headline,
      by_lead_type: report.by_lead_type,
    });
  } catch (err) {
    console.error('[measurement/headline]', err);
    res.status(500).json({ error: err.message || 'measurement failed' });
  }
});

router.post('/roi', async (req, res) => {
  try {
    const report = await getMeasurementReport();
    const treatedRate = report.headline.treated_rate || 0;
    const controlImplied =
      report.headline.leads_contacted > 0
        ? report.headline.bookings_expected / report.headline.leads_contacted
        : 0;
    const liveUpliftPp = (treatedRate - controlImplied) * 100;

    const body = req.body || {};
    const result = roiFromUplift({
      ticketPrice: body.ticket_price ?? body.ticketPrice ?? 89,
      feePerBooking: body.fee_per_booking ?? body.feePerBooking ?? 12,
      monthlyLeadVolume:
        body.monthly_lead_volume ??
        body.monthlyLeadVolume ??
        report.remaining_opportunity.uncontacted_due_soon,
      upliftPp: body.uplift_pp ?? body.upliftPp ?? liveUpliftPp,
      grossBookingRate: body.gross_booking_rate ?? body.grossBookingRate ?? treatedRate,
    });

    res.json({
      ...result,
      live_uplift_pp: Number(liveUpliftPp.toFixed(2)),
      source: 'tj_measurement_live',
    });
  } catch (err) {
    console.error('[measurement/roi]', err);
    res.status(500).json({ error: err.message || 'roi failed' });
  }
});

/** Integration-style guard used by tests / ops. */
router.post('/holdout-check', async (req, res) => {
  try {
    const phones = req.body?.phones || req.body?.numbers || [];
    const result = await assertNoHoldoutLeak(phones);
    res.status(result.ok ? 200 : 409).json(result);
  } catch (err) {
    console.error('[measurement/holdout-check]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
