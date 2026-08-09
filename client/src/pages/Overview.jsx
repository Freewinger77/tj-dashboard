import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronRight, MessageSquare, Search } from 'lucide-react';
import { fetchCustomers } from '../lib/api.js';
import { relativeTime } from '../lib/format.js';
import StatusPill from '../components/ui/StatusPill.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

const VIEWS = [
  { key: '', label: 'All' },
  { key: 'replied', label: 'Needs reply' },
  { key: 'delivered', label: 'No answer' },
  { key: 'booked', label: 'Booked' },
  { key: 'stopped', label: 'Stopped' },
];

export default function ConversationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const search = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const campaignFilter = searchParams.get('campaign') || '';
  const sortBy = searchParams.get('sort') || 'last_inbound_at';

  const updateParam = (key, val, defaultValue = '') => {
    const next = new URLSearchParams(searchParams);
    if (val && val !== defaultValue) next.set(key, val);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['customers', statusFilter, campaignFilter],
    queryFn: () =>
      fetchCustomers({
        status: statusFilter || undefined,
        campaign: campaignFilter || undefined,
      }),
  });

  const customers = data?.customers || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.number?.includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        String(c.customer_id || '').includes(q) ||
        String(c.registration || c.reg || '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;
      // Oldest wait first for inbound
      if (sortBy === 'last_inbound_at') return new Date(aVal) - new Date(bVal);
      return new Date(bVal) - new Date(aVal);
    });
  }, [filtered, sortBy]);

  const needsReplyCount = statusFilter === 'replied' ? customers.length : null;

  return (
    <div className="space-y-5 animate-fade-up">
      <header>
        <h1 className="font-display text-[28px] font-semibold leading-none tracking-tight sm:text-[32px]">
          Conversations
        </h1>
        <p className="mt-2 text-[13px] text-[color:var(--color-ink-3)]">
          {customers.length > 0
            ? `${customers.length.toLocaleString()} customers contacted over WhatsApp`
            : 'Everyone contacted via WhatsApp.'}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((view) => {
          const active = statusFilter === view.key;
          return (
            <button
              key={view.key || 'all'}
              type="button"
              onClick={() => {
                updateParam('status', view.key);
                if (view.key === 'replied') updateParam('sort', 'last_inbound_at', 'last_inbound_at');
              }}
              className={[
                'rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors',
                active
                  ? 'border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-canvas)]'
                  : 'border-[color:var(--color-rule)] text-[color:var(--color-ink-3)] hover:bg-[color:var(--surface-hover)]',
              ].join(' ')}
            >
              {view.label}
              {view.key === 'replied' && needsReplyCount != null ? ` ${needsReplyCount}` : ''}
            </button>
          );
        })}
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b rule px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--color-ink-4)]"
            />
            <input
              type="text"
              placeholder="Search name, phone, registration…"
              value={search}
              onChange={(e) => updateParam('search', e.target.value)}
              className="w-full rounded-lg border rule bg-[color:var(--color-canvas)] py-2 pl-8 pr-3 text-[13px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:border-[color:var(--brand-logo-blue)] focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={campaignFilter}
              onChange={(e) => updateParam('campaign', e.target.value)}
              className="rounded-lg border rule bg-[color:var(--color-canvas)] px-3 py-2 text-[12px] focus:outline-none"
            >
              <option value="">All campaigns</option>
              <option value="due_soon">Due soon</option>
              <option value="passed">Passed</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => updateParam('sort', e.target.value, 'last_inbound_at')}
              className="rounded-lg border rule bg-[color:var(--color-canvas)] px-3 py-2 text-[12px] focus:outline-none"
            >
              <option value="last_inbound_at">Oldest wait first</option>
              <option value="last_outbound_at">Last sent</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No conversations"
            hint="Trigger a batch from Controls to start contacting leads."
          />
        ) : (
          <div className="divide-y divide-[color:var(--color-rule)]">
            {sorted.map((c) => (
              <Link
                key={c.number}
                to={`/customers/${c.number}`}
                state={{ returnTo: `${location.pathname}${location.search}` }}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[color:var(--surface-hover)] sm:px-5"
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[color:var(--color-canvas-sunk)] text-[11px] font-semibold text-[color:var(--brand-logo-indigo)]">
                  {(c.name || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium">
                      {c.name || 'Customer'}
                    </span>
                    <StatusPill status={c.status} />
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-[color:var(--color-ink-3)]">
                    {c.campaign_type === 'passed' ? 'Passed' : c.campaign_type === 'due_soon' ? 'Due soon' : 'Outreach'}
                    {c.last_inbound_at
                      ? ` · replied ${relativeTime(c.last_inbound_at)}`
                      : c.last_outbound_at
                        ? ` · sent ${relativeTime(c.last_outbound_at)}`
                        : ''}
                  </div>
                </div>
                <div className="hidden text-right text-[11px] text-[color:var(--color-ink-4)] sm:block">
                  {c.last_inbound_at
                    ? relativeTime(c.last_inbound_at)
                    : relativeTime(c.last_outbound_at)}
                </div>
                <ChevronRight size={14} className="text-[color:var(--color-ink-5)]" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
