import clsx from 'clsx';

export default function Skeleton({ className, style }) {
  return (
    <div
      className={clsx(
        'animate-pulse rounded-md bg-[color:var(--color-canvas-sunk)]',
        className
      )}
      style={style}
      aria-hidden
    />
  );
}
