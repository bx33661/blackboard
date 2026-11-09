#!/usr/bin/env node
// Prerenders the built site into static HTML per language, with SEO and social metadata.
//   SITE_URL=https://your.domain npm --prefix site run build
// Writes dist/index.html (中文) and dist/en/index.html (English); with SITE_URL also sitemap.xml and robots.txt.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');
const DIST = path.join(SITE, 'dist');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
const VERSION = JSON.parse(fs.readFileSync(path.join(SITE, '..', 'package.json'), 'utf8')).version;
const REPO = 'https://github.com/Fruit-Guardians/blackboard';

if (!SITE_URL) console.warn('⚠ SITE_URL is not set: canonical, hreflang and og:url fall back to relative paths and no sitemap is written.');
const abs = (p) => (SITE_URL ? SITE_URL + p : p);

const PAGES = {
  zh: {
    path: '/', htmlLang: 'zh-CN', ogLocale: 'zh_CN', image: '/og-zh.png',
    title: 'blackboard 黑板 — Agent 的外置记忆与可视化工作台',
    desc: 'blackboard 把 Agent 的判断、证据和当前位置记在项目本地。上下文压缩、断线或换会话之后，从同一份现场继续。零运行时依赖，MIT 开源。',
  },
  en: {
    path: '/en/', htmlLang: 'en', ogLocale: 'en_US', image: '/og-en.png',
    title: 'blackboard — external memory and a visual workspace for AI agents',
    desc: 'blackboard keeps an agent’s judgments, evidence and current position in your project, so work resumes from the same place after compaction, a dropped connection or a new session. Zero runtime dependencies, MIT licensed.',
  },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function head(lang) {
  const p = PAGES[lang];
  const other = lang === 'zh' ? 'en' : 'zh';
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'blackboard',
    alternateName: '黑板',
    description: p.desc,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux',
    softwareVersion: VERSION,
    softwareRequirements: 'Node.js >= 18',
    license: 'https://opensource.org/licenses/MIT',
    url: abs(p.path),
    sameAs: [REPO],
    image: abs(p.image),
    inLanguage: p.htmlLang,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  return [
    `<link rel="canonical" href="${abs(p.path)}" />`,
    `<link rel="alternate" hreflang="zh-CN" href="${abs(PAGES.zh.path)}" />`,
    `<link rel="alternate" hreflang="en" href="${abs(PAGES.en.path)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${abs(PAGES.zh.path)}" />`,
    `<link rel="alternate" type="text/plain" title="llms.txt" href="/llms.txt" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="blackboard" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.desc)}" />`,
    `<meta property="og:url" content="${abs(p.path)}" />`,
    `<meta property="og:image" content="${abs(p.image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(p.title)}" />`,
    `<meta property="og:locale" content="${p.ogLocale}" />`,
    `<meta property="og:locale:alternate" content="${PAGES[other].ogLocale}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(p.title)}" />`,
    `<meta name="twitter:description" content="${esc(p.desc)}" />`,
    `<meta name="twitter:image" content="${abs(p.image)}" />`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ');
}

const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const server = await preview({ root: SITE, logLevel: 'error', preview: { port: 4317 + 100, strictPort: false, open: false } });
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });

try {
  for (const lang of ['zh', 'en']) {
    const p = PAGES[lang];
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }]);
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('bb-site-theme', 'system'); } catch { /* ignore */ } });
    await page.goto(base + p.path, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#hero-title');
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 600));
    const body = await page.evaluate(() => {
      const root = document.getElementById('root').cloneNode(true);
      root.querySelectorAll('iframe, canvas, .toast').forEach((n) => n.remove());
      // Reveal-on-scroll content stays visible in the static HTML.
      root.querySelectorAll('.rv').forEach((n) => n.classList.add('in'));
      return root.innerHTML;
    });
    await page.close();

    let html = template
      .replace(/<html lang="[^"]*">/, `<html lang="${p.htmlLang}">`)
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(p.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(p.desc)}" />`)
      .replace('</head>', `    ${head(lang)}\n  </head>`)
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    const out = path.join(DIST, p.path, 'index.html');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
    console.log(`prerendered ${path.relative(SITE, out)} (${(html.length / 1024).toFixed(0)} KB)`);
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

if (SITE_URL) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = Object.values(PAGES).map((p) => `  <url>
    <loc>${abs(p.path)}</loc>
    <lastmod>${today}</lastmod>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="${abs(PAGES.zh.path)}" />
    <xhtml:link rel="alternate" hreflang="en" href="${abs(PAGES.en.path)}" />
  </url>`).join('\n');
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`);
  fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  console.log('wrote sitemap.xml and robots.txt');
}
