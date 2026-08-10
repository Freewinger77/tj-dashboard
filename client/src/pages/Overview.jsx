import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { fetchCustomers } from '../lib/api.js';
import { relativeTime, formatPhone } from '../lib/format.js';
import { PageHeader } from '../components/layout/Shell.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';

const TABS = [
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
  const sortBy = searchParams.get('sort') || 'last_inbound_at';

  const updateParam = (key, val, defaultValue = '') => {
    const next = new URLSearchParams(searchParams);
    if (val && val !== defaultValue) next.set(key, val);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['customers', statusFilter],
    queryFn: () => fetchCustomers({ status: statusFilter || undefined }),
  });

  const customers = data?.customers || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.number?.includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        String(c.customer_id || '').includes(q)
    );
  }, [customers, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;
      if (sortBy === 'last_inbound_at') return new Date(aVal) - new Date(bVal);
      return new Date(bVal) - new Date(aVal);
    });
  }, [filtered, sortBy]);

  return (
    <>
      <PageHeader
        title="Conversations"
        subtitle={
          customers.length
            ? `${customers.length.toLocaleString()} customers contacted over WhatsApp`
            : 'Everyone contacted via WhatsApp'
        }
        actions={
          <div
            style={{
              width: 280,
              padding: '8px 12px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Search size={16} style={{ color: 'var(--text-muted)', flex: 'none' }} />
            <input
              value={search}
              onChange={(e) => updateParam('search', e.target.value)}
              placeholder="Search name, phone, registration…"
              style={{
                border: 0,
                outline: 0,
                background: 'transparent',
                fontFamily: 'Inter,sans-serif',
                fontSize: 13,
                width: '100%',
                color: '#000',
              }}
            />
          </div>
        }
      />

      {/* Tabs — desktop underline / mobile pills */}
      <div
        className="hidden lg:flex"
        style={{
          alignItems: 'center',
          gap: 0,
          padding: '0 28px',
          borderBottom: '1px solid var(--border-subtle)',
          flex: 'none',
        }}
      >
        {TABS.map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key || 'all'}
              type="button"
              onClick={() => {
                updateParam('status', tab.key);
                if (tab.key === 'replied') updateParam('sort', 'last_inbound_at', 'last_inbound_at');
              }}
              style={{
                padding: '14px 4px 12px',
                marginRight: 18,
                fontSize: 14,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                border: 0,
                borderBottom: `2px solid ${active ? '#000' : 'transparent'}`,
                color: active ? '#000' : 'rgba(0,0,0,.55)',
                fontWeight: active ? 500 : 400,
                background: 'transparent',
                fontFamily: 'inherit',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        className="flex lg:hidden"
        style={{
          flex: 'none',
          gap: 8,
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
        }}
      >
        {TABS.map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key || 'all'}
              type="button"
              onClick={() => updateParam('status', tab.key)}
              style={{
                flex: 'none',
                padding: '6px 13px',
                borderRadius: 'var(--radius-pill)',
                fontSize: 12,
                whiteSpace: 'nowrap',
                border: `1px solid ${active ? '#000' : 'var(--border-default)'}`,
                background: active ? 'rgba(0,0,0,.04)' : 'transparent',
                color: active ? '#000' : 'rgba(0,0,0,.55)',
                fontWeight: active ? 500 : 400,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          className="hidden lg:flex"
          style={{
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 28px 6px 24px',
            background: 'var(--surface-sunken)',
            borderBottom: '1px solid var(--border-subtle)',
            flex: 'none',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={() =>
              updateParam(
                'sort',
                sortBy === 'last_inbound_at' ? 'last_outbound_at' : 'last_inbound_at',
                'last_inbound_at'
              )
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: 'rgba(0,0,0,.55)',
              cursor: 'pointer',
              border: 0,
              background: 'transparent',
              fontFamily: 'inherit',
            }}
          >
            {sortBy === 'last_inbound_at' ? 'Oldest wait first' : 'Last sent'}
          </button>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Showing {sorted.length}
            {customers.length !== sorted.length ? ` of ${customers.length}` : ''}
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: 28, fontSize: 13, color: 'var(--text-muted)' }}>
              No conversations match these filters.
            </div>
          ) : (
            sorted.map((c) => {
              const needs = c.status === 'replied';
              return (
                <Link
                  key={c.number}
                  to={`/customers/${c.number}`}
                  state={{ returnTo: `${location.pathname}${location.search}` }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '8px minmax(0,1fr) auto',
                    gap: 14,
                    alignItems: 'center',
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                  className="rs-hover lg:!px-7"
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 'var(--radius-pill)',
                      background: needs
                        ? 'var(--secondary-red)'
                        : c.status === 'booked'
                          ? 'var(--secondary-green)'
                          : 'rgba(0,0,0,.18)',
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {c.name || formatPhone(c.number)}
                      </span>
                      {needs && c.last_inbound_at && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-pill)',
                            background: 'rgba(255,71,71,.12)',
                            color: 'rgb(190,40,32)',
                          }}
                        >
                          {relativeTime(c.last_inbound_at).replace(' ago', '')}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        marginTop: 3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.campaign_type === 'passed'
                        ? 'Passed'
                        : c.campaign_type === 'due_soon'
                          ? 'Due soon'
                          : 'Outreach'}
                      {c.last_inbound_at
                        ? ` · replied ${relativeTime(c.last_inbound_at)}`
                        : c.last_outbound_at
                          ? ` · sent ${relativeTime(c.last_outbound_at)}`
                          : ''}
                    </div>
                  </div>
                  <div
                    className="hidden sm:block"
                    style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}
                  >
                    {c.last_inbound_at
                      ? relativeTime(c.last_inbound_at)
                      : relativeTime(c.last_outbound_at)}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
