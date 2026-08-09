import { NavLink, useLocation } from 'react-router-dom';
import {
  CalendarPlus,
  LayoutDashboard,
  MessageSquare,
  Moon,
  Settings2,
  Sun,
  TrendingUp,
} from 'lucide-react';
import { useTheme } from '../../lib/useTheme.js';
import { useLocale } from '../../lib/locale.js';

const NAV = [
  { to: '/', end: true, icon: LayoutDashboard, labelKey: 'today' },
  { to: '/conversations', icon: MessageSquare, labelKey: 'conversations' },
  { to: '/performance', icon: TrendingUp, labelKey: 'performance' },
  { to: '/controls', icon: Settings2, labelKey: 'controls' },
  { to: '/capture', icon: CalendarPlus, labelKey: 'capture' },
];

function BrandMark() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--color-brand-mark)] text-[11px] font-bold tracking-tight text-white dark:text-black">
      TJ
    </div>
  );
}

function DesktopNavItem({ to, icon: Icon, children, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
          isActive
            ? 'bg-[color:var(--surface-hover)] text-[color:var(--color-ink)]'
            : 'text-[color:var(--color-sidebar)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--color-ink)]',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={16}
            strokeWidth={isActive ? 2 : 1.75}
            className={isActive ? 'text-[color:var(--brand-logo-indigo)]' : 'opacity-70'}
          />
          <span>{children}</span>
        </>
      )}
    </NavLink>
  );
}

function MobileNavItem({ to, icon: Icon, children, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors',
          isActive ? 'text-[color:var(--brand-logo-indigo)]' : 'text-[color:var(--color-ink-4)]',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={20} strokeWidth={isActive ? 2 : 1.75} />
          <span className="truncate">{children}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Shell({ children }) {
  const location = useLocation();
  const onDetail = location.pathname.startsWith('/customers/');
  const { isDark, toggle } = useTheme();
  const { locale, setLocale, t } = useLocale();

  if (onDetail) {
    return <div className="relative z-10 min-h-dvh bg-[color:var(--color-canvas)]">{children}</div>;
  }

  return (
    <div className="relative z-10 flex min-h-dvh bg-[color:var(--color-canvas)]">
      <aside className="sticky top-0 hidden h-dvh w-[220px] shrink-0 flex-col border-r rule px-3 py-4 lg:flex">
        <NavLink to="/" className="mb-6 flex items-center gap-2.5 px-2">
          <BrandMark />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold tracking-tight text-[color:var(--color-sidebar)]">
              TJ Katsastus
            </div>
            <div className="text-[10px] text-[color:var(--color-ink-4)]">WhatsApp</div>
          </div>
        </NavLink>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
            <DesktopNavItem key={item.to} to={item.to} icon={item.icon} end={item.end}>
              {t(item.labelKey)}
            </DesktopNavItem>
          ))}
        </nav>

        <div className="mt-auto space-y-3 border-t rule pt-3">
          <div className="px-2">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-ink-4)]">
              {t('scope')}
            </div>
            <div className="mt-1 text-[13px] font-medium text-[color:var(--color-ink)]">
              {t('allStations')}
            </div>
          </div>
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-full bg-[color:var(--color-clay-soft)] text-[11px] font-semibold text-[color:var(--brand-logo-indigo)]">
                TJ
              </div>
              <span className="text-[12px] font-medium text-[color:var(--color-ink-2)]">Ops</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setLocale('en')}
                className={[
                  'rounded px-1.5 py-0.5 text-[11px] font-semibold',
                  locale === 'en' ? 'text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-4)]',
                ].join(' ')}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLocale('fi')}
                className={[
                  'rounded px-1.5 py-0.5 text-[11px] font-semibold',
                  locale === 'fi' ? 'text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-4)]',
                ].join(' ')}
              >
                FI
              </button>
              <button
                type="button"
                onClick={toggle}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                className="ml-1 grid size-7 place-items-center rounded-md text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--color-ink)]"
              >
                {isDark ? <Sun size={14} strokeWidth={1.75} /> : <Moon size={14} strokeWidth={1.75} />}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b rule bg-[color:var(--color-canvas)]/90 px-4 backdrop-blur-sm lg:hidden">
          <NavLink to="/" className="flex items-center gap-2">
            <BrandMark />
            <span className="text-[14px] font-semibold tracking-tight">TJ Katsastus</span>
          </NavLink>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLocale(locale === 'en' ? 'fi' : 'en')}
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-[color:var(--color-ink-3)]"
            >
              {locale === 'en' ? 'FI' : 'EN'}
            </button>
            <button
              type="button"
              onClick={toggle}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="grid size-8 place-items-center rounded-md text-[color:var(--color-ink-3)]"
            >
              {isDark ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-5 sm:px-6 sm:py-7 pb-24 lg:pb-7">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t rule bg-[color:var(--color-canvas)]/95 backdrop-blur-sm lg:hidden pb-[env(safe-area-inset-bottom)]">
          {NAV.map((item) => (
            <MobileNavItem key={item.to} to={item.to} icon={item.icon} end={item.end}>
              {t(item.labelKey)}
            </MobileNavItem>
          ))}
        </nav>
      </div>
    </div>
  );
}
