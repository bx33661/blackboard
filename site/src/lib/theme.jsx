import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const KEY = 'bb-site-theme';
const ThemeCtx = createContext({ theme: 'system', resolved: 'dark', setTheme: () => {} });

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
function read() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(read);
  const [sys, setSys] = useState(systemDark);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSys(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const resolved = theme === 'system' ? (sys ? 'dark' : 'light') : theme;
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#070a09' : '#f6f7f5');
  }, [resolved]);
  const setTheme = useCallback((t) => {
    setThemeState(t);
    try { localStorage.setItem(KEY, t); } catch { /* storage may be unavailable */ }
  }, []);
  return <ThemeCtx.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useSiteTheme = () => useContext(ThemeCtx);

/** Shim with the next-themes shape that Magic UI components expect. */
export function useTheme() {
  const { theme, resolved } = useContext(ThemeCtx);
  return { theme, systemTheme: resolved, resolvedTheme: resolved };
}
