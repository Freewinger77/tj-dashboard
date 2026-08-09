import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'tj-theme';

function getInitial() {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return 'light';
}

function apply(mode) {
  const root = document.documentElement;
  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function useTheme() {
  const [mode, setMode] = useState(getInitial);

  useEffect(() => {
    apply(mode);
  }, [mode]);

  useEffect(() => {
    apply(getInitial());
  }, []);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { mode, toggle, isDark: mode === 'dark' };
}
