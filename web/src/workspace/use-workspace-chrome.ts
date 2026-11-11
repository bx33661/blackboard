import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { EdgeStyle } from '../graph';
import { usePref } from '../use-pref';

const THEME_KEY = 'pinwhy-theme-v3';

const initialTheme = (): 'light' | 'dark' => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* storage can be unavailable in sandboxed exports */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** Browser preferences and transient chrome stay separate from URL and board state. */
export function useWorkspaceChrome() {
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);
  const [direction, setDirection] = usePref<'RIGHT' | 'DOWN'>('direction', 'RIGHT');
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [showMap, setShowMap] = usePref('minimap', false);
  const [showLegend, setShowLegend] = usePref('legend-open', false);
  const [edgeStyle, setEdgeStyle] = usePref<EdgeStyle>('edge-style', 'curve');
  const [follow, setFollow] = usePref('follow', false);
  const [showChanges, setShowChanges] = usePref('timeline-changes', true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const closeSidebar = useCallback(() => { setSidebarOpen(false); }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  return {
    theme, setTheme, direction, setDirection, sidebarOpen, setSidebarOpen, closeSidebar,
    showMap, setShowMap, showLegend, setShowLegend, edgeStyle, setEdgeStyle, follow, setFollow,
    showChanges, setShowChanges, paletteOpen, setPaletteOpen, digestOpen, setDigestOpen,
    newOpen, setNewOpen, shortcutsOpen, setShortcutsOpen,
  };
}

type Toggle = Dispatch<SetStateAction<boolean>>;

/** Global search works on either page; board shortcuts respect editors, dialogs and menus. */
export function useWorkspaceShortcuts(page: 'board' | 'notes', clearSelection: () => void, setPaletteOpen: Toggle, setShortcutsOpen: Toggle, setSidebarOpen: Toggle) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (page === 'board' && !event.metaKey && !event.ctrlKey && !event.altKey && !(event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]') && !document.querySelector('[role="dialog"]') && (event.key === '/' || event.key === '[' || event.key === '?')) {
        event.preventDefault();
        if (event.key === '/') setPaletteOpen(true); else if (event.key === '?') setShortcutsOpen(true); else setSidebarOpen((open) => !open);
      } else if (page === 'board' && event.key === 'Escape' && !document.querySelector('[role="dialog"], [role="menu"]')) clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelection, page, setPaletteOpen, setShortcutsOpen, setSidebarOpen]);
}
