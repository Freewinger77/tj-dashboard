import { NavLink, useLocation } from 'react-router-dom';
import { BookOpen, ChartLine, LayoutGrid, MessageCircle, Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchCustomers } from '../../lib/api.js';

const DESKTOP_NAV = [
  { to: '/', end: true, label: 'Today', icon: LayoutGrid, fillWhenActive: true },
  { to: '/conversations', label: 'Conversations', icon: MessageCircle, badge: true },
  { to: '/performance', label: 'Performance', icon: ChartLine },
  { to: '/controls', label: 'Controls', icon: Settings },
  { to: '/capture', label: 'Capture', icon: BookOpen, desktopOnly: true },
];

const MOBILE_NAV = [
  { to: '/', end: true, label: 'Today', icon: LayoutGrid },
  { to: '/conversations', label: 'Chats', icon: MessageCircle, badge: true },
  { to: '/performance', label: 'Stats', icon: ChartLine },
  { to: '/controls', label: 'Controls', icon: Settings },
];

function DesktopNavItem({ to, end, icon: Icon, children, badge, fillWhenActive }) {
  return (
    <NavLink to={to} end={end} style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <div
          className="rs-hover"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: badge != null ? 'space-between' : undefined,
            gap: badge != null ? undefined : 10,
            padding: '9px 10px',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            transition: 'background 120ms',
            background: isActive ? 'rgba(0,0,0,.04)' : 'transparent',
            color: isActive ? '#000' : 'rgba(0,0,0,.55)',
            fontWeight: isActive ? 500 : 400,
            fontSize: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon
              size={18}
              strokeWidth={isActive && fillWhenActive ? 2.25 : 1.75}
              fill={isActive && fillWhenActive ? 'currentColor' : 'none'}
              style={{ flex: 'none' }}
            />
            {children}
          </div>
          {badge != null && badge > 0 && (
            <div
              style={{
                minWidth: 20,
                height: 18,
                padding: '0 6px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--secondary-red)',
                color: '#fff',
                font: '600 10px/18px Inter,sans-serif',
                textAlign: 'center',
              }}
            >
              {badge > 99 ? '99+' : badge}
            </div>
          )}
        </div>
      )}
    </NavLink>
  );
}

function MobileNavItem({ to, end, icon: Icon, children, badge }) {
  return (
    <NavLink to={to} end={end} style={{ textDecoration: 'none', position: 'relative' }}>
      {({ isActive }) => (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            padding: '4px 0',
          }}
        >
          <Icon
            size={22}
            strokeWidth={isActive ? 2.25 : 1.75}
            style={{ color: isActive ? '#000' : 'var(--text-muted)' }}
          />
          <div
            style={{
              fontSize: 10,
              color: isActive ? '#000' : 'var(--text-muted)',
              fontWeight: isActive ? 500 : 400,
            }}
          >
            {children}
          </div>
          {badge != null && badge > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 'calc(50% + 6px)',
                minWidth: 17,
                height: 17,
                padding: '0 4px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--secondary-red)',
                color: '#fff',
                font: '600 10px/17px Inter,sans-serif',
                textAlign: 'center',
              }}
            >
              {badge > 99 ? '99+' : badge}
            </div>
          )}
        </div>
      )}
    </NavLink>
  );
}

export default function Shell({ children }) {
  const location = useLocation();
  const onDetail = location.pathname.startsWith('/customers/');

  const needsQ = useQuery({
    queryKey: ['customers', 'replied', 'badge'],
    queryFn: () => fetchCustomers({ status: 'replied' }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const needsCount = needsQ.data?.customers?.length || 0;

  if (onDetail) {
    return <div style={{ minHeight: '100dvh', background: '#fff' }}>{children}</div>;
  }

  return (
    <div className="rs-shell">
      <aside className="rs-sidebar">
        <NavLink
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 8px',
            textDecoration: 'none',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-pill)',
              background: 'var(--surface-inverse)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              font: '700 9px/1 Inter,sans-serif',
              flex: 'none',
            }}
          >
            TJ
          </div>
          <div style={{ font: '500 13px/1.2 Inter,sans-serif', color: 'rgb(58,58,58)' }}>
            TJ&nbsp;Katsastus
          </div>
        </NavLink>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {DESKTOP_NAV.map((item) => (
            <DesktopNavItem
              key={item.to}
              to={item.to}
              end={item.end}
              icon={item.icon}
              badge={item.badge ? needsCount : undefined}
              fillWhenActive={item.fillWhenActive}
            >
              {item.label}
            </DesktopNavItem>
          ))}
        </nav>
      </aside>

      <div className="rs-main">
        {children}
      </div>

      <nav className="rs-mobile-tabs">
        {MOBILE_NAV.map((item) => (
          <MobileNavItem
            key={item.to}
            to={item.to}
            end={item.end}
            icon={item.icon}
            badge={item.badge ? needsCount : undefined}
          >
            {item.label}
          </MobileNavItem>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, mobileScope }) {
  return (
    <>
      <div className="rs-page-header-desktop">
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{actions}</div>}
      </div>

      <div className="rs-page-header-mobile">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-.01em' }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        {mobileScope !== false && (
          <div
            style={{
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            All stations
            <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>▾</span>
          </div>
        )}
      </div>
    </>
  );
}
