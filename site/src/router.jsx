import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export function parseRoute(pathname = (typeof location !== 'undefined' ? location.pathname : '/')) {
  const isEn = /^\/en(\/|$)/i.test(pathname);
  const clean = pathname.replace(/^\/en/, '').replace(/^\/+|\/+$/g, '');
  let page = 'home';
  if (clean === 'security' || clean.startsWith('security/')) page = 'security';
  else if (clean === 'dsh' || clean.startsWith('dsh/')) page = 'dsh';
  return { lang: isEn ? 'en' : 'zh', page };
}

export function routeUrl(page, lang) {
  const base = lang === 'en' ? '/en' : '';
  if (page === 'home') return base ? `${base}/` : '/';
  return base ? `${base}/${page}/` : `/${page}/`;
}

const RouteCtx = createContext({
  page: 'home',
  lang: 'zh',
  navigate: () => {},
  switchLang: () => {},
});

export function RouteProvider({ children }) {
  const [route, setRoute] = useState(() => parseRoute());

  useEffect(() => {
    const onPop = () => {
      setRoute(parseRoute());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((targetPage, hash = '') => {
    setRoute((prev) => {
      const url = routeUrl(targetPage, prev.lang) + (hash ? `#${hash}` : '');
      if (typeof window !== 'undefined') {
        history.pushState(null, '', url);
        if (!hash) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
      return { ...prev, page: targetPage };
    });
  }, []);

  const switchLang = useCallback((targetLang) => {
    setRoute((prev) => {
      if (prev.lang === targetLang) return prev;
      const hash = typeof location !== 'undefined' ? location.hash : '';
      const url = routeUrl(prev.page, targetLang) + hash;
      if (typeof window !== 'undefined') {
        history.pushState(null, '', url);
      }
      return { ...prev, lang: targetLang };
    });
  }, []);

  return (
    <RouteCtx.Provider value={{ ...route, navigate, switchLang }}>
      {children}
    </RouteCtx.Provider>
  );
}

export const useRoute = () => useContext(RouteCtx);
