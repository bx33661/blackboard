import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, CornerDownLeft, Globe, Hash, Monitor, Moon, Search, Sparkles, Sun, Terminal } from 'lucide-react';
import { useLang } from '../i18n.jsx';
import { useRoute } from '../router.jsx';
import { REPO, lenisRef, useCopy, useCopyPrompt } from '../shared.jsx';
import { switchThemeWithReveal } from '../lib/themeReveal.js';
import { useSiteTheme } from '../lib/theme.jsx';

const INSTALL = 'npm install --global pinwhy@0.2.0';
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function useModKey() {
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(isMac()), []);
  return mac ? '⌘' : 'Ctrl';
}

const matches = (item, q) => {
  if (!q) return true;
  const hay = `${item.label} ${item.keywords || ''}`.toLowerCase();
  let i = 0;
  for (const ch of q.toLowerCase().replace(/\s+/g, '')) {
    i = hay.indexOf(ch, i);
    if (i < 0) return false;
    i += 1;
  }
  return true;
};

export default function CommandPalette({ open, setOpen, onNav }) {
  const { t, lang } = useLang();
  const { switchLang } = useRoute();
  const { setTheme } = useSiteTheme();
  const copy = useCopy();
  const copyPrompt = useCopyPrompt();
  const p = t.nav.palette;
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const list = useRef(null);
  const origin = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return undefined;
    origin.current = document.activeElement;
    setQ('');
    setActive(0);
    lenisRef.current?.stop();
    const id = requestAnimationFrame(() => input.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      lenisRef.current?.start();
      origin.current?.focus?.();
    };
  }, [open]);

  const groups = useMemo(() => {
    const fake = { preventDefault() {} };
    const themeIcon = { light: Sun, dark: Moon, system: Monitor };
    return [
      {
        id: 'nav', label: p.groups.nav, items: [
          { id: 'top', label: p.top, icon: ArrowUp, run: () => onNav('home')(fake), keywords: 'home top' },
          ...t.nav.links.map(([id, label, target]) => ({ id: `nav-${id}`, label, icon: Hash, run: () => onNav(target)(fake), keywords: id })),
        ],
      },
      {
        id: 'act', label: p.groups.actions, items: [
          { id: 'prompt', label: t.nav.copy, icon: Sparkles, run: copyPrompt, keywords: 'prompt agent copy' },
          { id: 'install', label: p.copyCmd, icon: Terminal, run: () => copy(INSTALL, t.toast.cmd), hint: INSTALL, keywords: 'npm install cli' },
          { id: 'gh', label: p.github, icon: ArrowUpRight, run: () => window.open(REPO, '_blank', 'noopener'), keywords: 'github repo source' },
        ],
      },
      {
        id: 'pref', label: p.groups.prefs, items: [
          ...['light', 'dark', 'system'].map((k) => ({
            id: `theme-${k}`, label: `${t.nav.theme} · ${t.nav.themes[k]}`, icon: themeIcon[k],
            run: () => switchThemeWithReveal(k, setTheme), keywords: `theme ${k}`,
          })),
          { id: 'lang', label: p.langTo, icon: Globe, run: () => switchLang(lang === 'zh' ? 'en' : 'zh'), keywords: 'language lang 中文 english' },
        ],
      },
    ];
  }, [t, p, lang, onNav, copy, copyPrompt, setTheme, switchLang]);

  const filtered = useMemo(
    () => groups.map((g) => ({ ...g, items: g.items.filter((it) => matches(it, q)) })).filter((g) => g.items.length),
    [groups, q],
  );
  const flat = filtered.flatMap((g) => g.items);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (item) => {
    setOpen(false);
    requestAnimationFrame(() => item.run());
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (flat.length ? (a + 1) % flat.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0)); }
    else if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (flat[active]) run(flat[active]);
    } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  let n = -1;
  return (
    <div className="cmdk-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label={p.open}>
        <div className="cmdk-input">
          <Search size={17} strokeWidth={1.75} aria-hidden="true" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={p.placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={flat[active] ? `cmdk-${flat[active].id}` : undefined}
            aria-label={p.placeholder}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={list}>
          {filtered.length === 0 && <p className="cmdk-empty">{p.empty}</p>}
          {filtered.map((g) => (
            <div key={g.id} role="group" aria-label={g.label} className="cmdk-group">
              <div className="cmdk-group-label">{g.label}</div>
              {g.items.map((item) => {
                n += 1;
                const idx = n;
                const I = item.icon;
                const on = idx === active;
                return (
                  <div
                    key={item.id}
                    id={`cmdk-${item.id}`}
                    role="option"
                    aria-selected={on}
                    data-active={on}
                    className="cmdk-item"
                    onPointerMove={() => { if (!on) setActive(idx); }}
                    onClick={() => run(item)}
                  >
                    <span className="cmdk-ic"><I size={15} strokeWidth={1.75} aria-hidden="true" /></span>
                    <span className="cmdk-label">{item.label}</span>
                    {item.hint && <code className="cmdk-hint">{item.hint}</code>}
                    <CornerDownLeft className="cmdk-enter" size={14} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd>{p.hint.move}</span>
          <span><kbd>↵</kbd>{p.hint.run}</span>
          <span><kbd>Esc</kbd>{p.hint.close}</span>
          <span className="cmdk-brand"><img src="/mark.svg" alt="" />Pinwhy</span>
        </div>
      </div>
    </div>
  );
}
