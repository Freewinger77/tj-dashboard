import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export async function fetchStats() {
  const { data } = await api.get('/stats');
  return data;
}

export async function fetchLeadPoolSummary() {
  const { data } = await api.get('/stats/lead-pool');
  return data;
}

export async function fetchAnalytics(period = 'all') {
  const { data } = await api.get('/analytics', {
    params: { period },
  });
  return data;
}

export async function fetchCustomers(params) {
  const { data } = await api.get('/customers', { params });
  return data;
}

export async function fetchCustomer(phone) {
  const { data } = await api.get(`/customers/${phone}`);
  return data;
}

export async function fetchChat(phone) {
  const { data } = await api.get(`/chat/${phone}`);
  return data;
}

export async function stopReminders(phone) {
  const { data } = await api.post(`/customers/${phone}/stop`);
  return data;
}

export async function triggerFeeder(maxLeads, leadType = 'both') {
  const { data } = await api.post('/feeder/trigger', { max_leads_to_send: maxLeads, lead_type: leadType });
  return data;
}

export async function pollMessageStatuses() {
  const { data } = await api.post('/messages/poll');
  return data;
}

export async function getAutoSend() {
  const { data } = await api.get('/feeder/auto-send');
  return data;
}

export async function setAutoSend(type, enabled) {
  const { data } = await api.put('/feeder/auto-send', { type, enabled });
  return data;
}

export async function getStationPause() {
  const { data } = await api.get('/feeder/station-pause');
  return data;
}

export async function setStationPause(stationId, paused) {
  const { data } = await api.put(`/feeder/station-pause/${stationId}`, { paused });
  return data;
}

export async function getFeederProgress(since) {
  const { data } = await api.get('/feeder/progress', { params: { since } });
  return data;
}

export async function extractBookingCapture(payload) {
  const { data } = await api.post('/capture/extract', payload);
  return data;
}

export async function commitBookingCapture(payload) {
  const { data } = await api.post('/capture/commit', payload);
  return data;
}

export async function fetchMeasurement(refresh = false) {
  const { data } = await api.get('/measurement', {
    params: refresh ? { refresh: 1 } : undefined,
  });
  return data;
}

export async function fetchMeasurementRoi(payload) {
  const { data } = await api.post('/measurement/roi', payload);
  return data;
}

export async function expireOverdueReminders(olderThanDays = 14) {
  const { data } = await api.post('/feeder/expire-overdue-reminders', {
    older_than_days: olderThanDays,
  });
  return data;
}
