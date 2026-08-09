import { NavLink, useLocation } from 'react-router-dom';
import { Users, Activity, Sun, Moon, SlidersHorizontal, CalendarPlus, GitCompareArrows } from 'lucide-react';
import { useTheme } from '../../lib/useTheme.js';

function NavItem({ to, icon: Icon, children, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] tracking-tight transition-colors',
          'border-b-2 -mb-px',
          isActive
            ? 'border-[color:var(--color-clay)] text-[color:var(--color-ink)]'
            : 'border-transparent text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]',
        ].join(' ')
      }
    >
      <Icon size={14} strokeWidth={1.75} />
      <span className="hidden sm:inline">{children}</span>
    </NavLink>
  );
}

export default function Shell({ children }) {
  const location = useLocation();
  const onDetail = location.pathname.startsWith('/customers/');
  const { isDark, toggle } = useTheme();

  return (
    <div className="relative z-10 min-h-dvh">
      <header className="sticky top-0 z-20 border-b rule backdrop-blur-sm bg-[color:var(--color-canvas)]/80">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="flex h-12 sm:h-14 items-end justify-between pt-2 sm:pt-3">
            <NavLink to="/" className="group flex items-baseline gap-1.5 pb-2.5 sm:pb-3 min-w-0">
              <span className="font-display text-[18px] sm:text-[22px] font-medium leading-none text-[color:var(--color-ink)] truncate">
                TJ Katsastus
              </span>
              <span className="hidden md:inline text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink-4)] pb-0.5">
                WhatsApp Dashboard
              </span>
            </NavLink>
            <div className="flex items-center gap-0.5 sm:gap-1">
              <nav className="flex items-center">
                <NavItem to="/" icon={Users} end>
                  Customers
                </NavItem>
                <NavItem to="/stats" icon={Activity}>
                  Stats
                </NavItem>
                <NavItem to="/measurement" icon={GitCompareArrows}>
                  Value
                </NavItem>
                <NavItem to="/capture" icon={CalendarPlus}>
                  Capture
                </NavItem>
                <NavItem to="/settings" icon={SlidersHorizontal}>
                  Settings
                </NavItem>
              </nav>
              <button
                type="button"
                onClick={toggle}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                className="ml-2 sm:ml-3 mb-1 grid size-8 place-items-center rounded-full border rule text-[color:var(--color-ink-3)] transition-colors hover:border-[color:var(--color-rule-strong)] hover:text-[color:var(--color-ink)]"
              >
                {isDark ? <Sun size={14} strokeWidth={1.75} /> : <Moon size={14} strokeWidth={1.75} />}
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className={onDetail ? '' : 'mx-auto max-w-[1200px] px-4 sm:px-6 py-5 sm:py-8'}>
        {children}
      </main>
    </div>
  );
}
