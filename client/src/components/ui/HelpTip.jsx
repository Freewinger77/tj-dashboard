import { useId, useState } from 'react';

/** Small “?” that shows a short explanation on hover / focus / tap. */
export default function HelpTip({ label, children, side = 'top' }) {
  const id = useId();
  const [open, setOpen] = useState(false);

  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label={label || 'More info'}
        aria-describedby={open ? id : undefined}
        onFocus={show}
        onBlur={hide}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') toggle(e);
        }}
        style={{
          width: 16,
          height: 16,
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--border-default)',
          background: 'var(--surface-sunken)',
          color: 'rgba(0,0,0,.55)',
          fontSize: 10,
          fontWeight: 700,
          lineHeight: '14px',
          padding: 0,
          cursor: 'help',
          display: 'inline-grid',
          placeItems: 'center',
          fontFamily: 'Inter,sans-serif',
          userSelect: 'none',
        }}
      >
        ?
      </span>
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 40,
            width: 240,
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            background: '#fff',
            boxShadow: 'var(--shadow-float)',
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.45,
            color: 'rgba(0,0,0,.75)',
            textAlign: 'left',
            whiteSpace: 'normal',
            ...(side === 'bottom'
              ? { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }
              : side === 'left'
                ? { right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' }
                : { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }),
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
}
