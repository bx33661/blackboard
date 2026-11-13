import { useCallback, useEffect, useLayoutEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { EdgeStyle } from '../graph';
import { applyEmbedFonts, NO_FONTS, type EmbedAppearance, type EmbedFonts } from '../embedded';
import { usePref } from '../use-pref';

const THEME_KEY = 'pinwhy-theme-v3';

const systemTheme = (): 'light' | 'dark' => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const savedTheme = (): 'light' | 'dark' | null => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* storage can be unavailable in sandboxed exports */ }
  return null;
};

type ChromeOptions = {
  /** A host page frames the board: it owns the surrounding chrome, the starting nav and the appearance. */
  embedded?: boolean;
  /** Appearance the framing URL asked for; only read while embedded. */
  appearance?: EmbedAppearance | null;
  /** Type preferences the framing URL asked for; only applied while embedded. */
  fonts?: EmbedFonts;
};

/** Browser preferences and transient chrome stay separate from URL and board state. */
export function useWorkspaceChrome({ embedded = false, appearance = null, fonts: startingFonts }: ChromeOptions = {}) {
  // A framed board takes the host's appearance; standalone it takes its own stored choice.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => embedded ? appearance ?? systemTheme() : savedTheme() ?? systemTheme());
  const [fonts, setFonts] = useState<EmbedFonts>(() => startingFonts ?? NO_FONTS);
  const [direction, setDirection] = usePref<'RIGHT' | 'DOWN'>('direction', 'RIGHT');
  // An embed usually sits in a narrow panel: the nav would eat the board, so it starts closed and the reader opens it.
  const [sidebarOpen, setSidebarOpen] = useState(() => !embedded && window.matchMedia('(min-width: 1024px)').matches);
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

  // Paint the theme and type scale before the first frame so a framed board matches its host immediately.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (embedded) {
      applyEmbedFonts(fonts);
      // The host owns appearance while embedded; writing here would overwrite the reader's standalone choice.
      return;
    }
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme, fonts, embedded]);

  // A host message is partial: it never clears settings it does not mention.
  const applyFonts = useCallback((update: EmbedFonts) => {
    setFonts((current) => ({
      fontFamily: update.fontFamily ?? current.fontFamily,
      codeFontFamily: update.codeFontFamily ?? current.codeFontFamily,
      fontSize: update.fontSize ?? current.fontSize,
      codeFontSize: update.codeFontSize ?? current.codeFontSize,
    }));
  }, []);

  return {
    theme, setTheme, fonts, setFonts: applyFonts, direction, setDirection, sidebarOpen, setSidebarOpen, closeSidebar,
    showMap, setShowMap, showLegend, setShowLegend, edgeStyle, setEdgeStyle, follow, setFollow,
    showChanges, setShowChanges, paletteOpen, setPaletteOpen, digestOpen, setDigestOpen,
    newOpen, setNewOpen, shortcutsOpen, setShortcutsOpen,
  };
}

type Toggle = Dispatch<SetStateAction<boolean>>;

/** Canvas shortcuts respect editors, dialogs and menus. */
export function useWorkspaceShortcuts(clearSelection: () => void, setPaletteOpen: Toggle, setShortcutsOpen: Toggle, setSidebarOpen: Toggle) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (!event.metaKey && !event.ctrlKey && !event.altKey && !(event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]') && !document.querySelector('[role="dialog"]') && (event.key === '/' || event.key === '[' || event.key === '?')) {
        event.preventDefault();
        if (event.key === '/') setPaletteOpen(true); else if (event.key === '?') setShortcutsOpen(true); else setSidebarOpen((open) => !open);
      } else if (event.key === 'Escape' && !document.querySelector('[role="dialog"], [role="menu"]')) clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelection, setPaletteOpen, setShortcutsOpen, setSidebarOpen]);
}
